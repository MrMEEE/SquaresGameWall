#!/usr/bin/env python3
"""
GameWall local dev server.
Serves static files and proxies /proxy?url=<url> to local LAN devices
so the browser can reach Twinkly squares without CORS issues.

Usage:
    python3 server.py          # serves on http://localhost:8080
    python3 server.py 9000     # custom port
"""
import sys
import json
import base64
import re
import os
import time
import threading
from datetime import datetime, timezone
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


CLIENT_LOG_FILE = Path("/tmp/gamewall-clientlog.txt")
WORKSPACE_ROOT = Path(__file__).resolve().parent
CHARACTERS_ROOT = WORKSPACE_ROOT / "characters"


class MirrorRuntime:
    class _MasterWorker:
        def __init__(self, runtime, ip):
            self.runtime = runtime
            self.ip = ip
            self._lock = threading.Lock()
            self._event = threading.Event()
            self._stop_event = threading.Event()
            self._pending = None
            self._thread = None
            self._target_fps = 20.0
            self._min_interval_s = 1.0 / 20.0
            self._next_allowed_at = 0.0
            self.push_ok = 0
            self.push_err = 0
            self.last_push_at = ""
            self.last_error = ""

        def start(self):
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

        def stop(self, join_timeout=1.0):
            self._stop_event.set()
            self._event.set()
            thread = self._thread
            self._thread = None
            if thread:
                thread.join(timeout=join_timeout)

        def submit(self, frame_bytes, target_at=None, frame_seq=0):
            if not isinstance(frame_bytes, (bytes, bytearray)) or len(frame_bytes) < 3:
                return
            with self._lock:
                # Latest-frame wins: overwrite stale pending frame to avoid queue lag.
                self._pending = {
                    "frameBytes": bytes(frame_bytes),
                    "targetAt": float(target_at) if target_at is not None else None,
                    "frameSeq": int(frame_seq),
                }
            self._event.set()

        def set_target_fps(self, fps):
            try:
                value = float(fps)
            except Exception:
                value = 20.0
            value = max(1.0, min(60.0, value))
            with self._lock:
                self._target_fps = value
                self._min_interval_s = 1.0 / value

        def snapshot(self):
            with self._lock:
                return {
                    "ip": self.ip,
                    "targetFps": round(self._target_fps, 2),
                    "pushOk": self.push_ok,
                    "pushErr": self.push_err,
                    "lastPushAt": self.last_push_at,
                    "lastError": self.last_error,
                }

        def _take_pending(self):
            with self._lock:
                payload = self._pending
                self._pending = None
                return payload

        def _record_ok(self):
            stamp = _now_iso()
            with self._lock:
                self.push_ok += 1
                self.last_push_at = stamp
                self.last_error = ""
            self.runtime._record_push(stamp)

        def _record_err(self, message):
            with self._lock:
                self.push_err += 1
                self.last_error = message
            self.runtime._record_error(message)

        def _run(self):
            while not self._stop_event.is_set():
                self._event.wait(timeout=0.5)
                self._event.clear()
                if self._stop_event.is_set():
                    return

                pending = self._take_pending()
                if not pending:
                    continue

                target_at = pending.get("targetAt")
                if target_at is not None:
                    while True:
                        if self._stop_event.is_set():
                            return
                        wait_s = target_at - time.perf_counter()
                        if wait_s <= 0:
                            break
                        self._stop_event.wait(min(wait_s, 0.002))
                        if self._stop_event.is_set():
                            return

                # If a newer frame arrived while waiting for the sync target,
                # swap to it immediately rather than dropping this cycle.
                latest = self._take_pending()
                if latest:
                    pending = latest

                while True:
                    with self._lock:
                        wait_s = self._next_allowed_at - time.perf_counter()
                    if wait_s <= 0:
                        break
                    self._stop_event.wait(min(wait_s, 0.002))
                    if self._stop_event.is_set():
                        return
                    latest = self._take_pending()
                    if latest:
                        pending = latest

                try:
                    self.runtime._push_rt_frame(self.ip, pending["frameBytes"])
                    with self._lock:
                        self._next_allowed_at = time.perf_counter() + self._min_interval_s
                    self._record_ok()
                except Exception as exc:
                    self._record_err(str(exc))

    def __init__(self):
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None
        self._running = False
        self._fps = 20
        self._frames = []
        self._frame_index = 0
        self._workers = {}
        self._tokens = {}
        self._rt_mode_at = {}
        self._rt_frame_format = {}
        self._last_push_at = ""
        self._last_error = ""
        self._push_ok = 0
        self._push_err = 0
        self._dispatch_lead_s = 0.012
        self._dispatch_seq = 0

    def status(self):
        with self._lock:
            worker_snaps = {ip: w.snapshot() for ip, w in self._workers.items()}
            return {
                "running": self._running,
                "fps": self._fps,
                "frames": len(self._frames),
                "frameIndex": self._frame_index,
                "dispatchLeadMs": int(round(self._dispatch_lead_s * 1000.0)),
                "workers": worker_snaps,
                "lastPushAt": self._last_push_at,
                "lastError": self._last_error,
                "pushOk": self._push_ok,
                "pushErr": self._push_err,
            }

    def set_tuning(self, dispatch_lead_ms=None):
        if dispatch_lead_ms is None:
            return
        lead = int(dispatch_lead_ms)
        lead = max(0, min(30, lead))
        with self._lock:
            self._dispatch_lead_s = lead / 1000.0

    def _probe_target_fps(self, ip, fallback_fps):
        target = float(max(1, min(60, int(fallback_fps or 20))))
        try:
            status, raw, _headers = self._twinkly_fetch(
                ip,
                "/xled/v1/gestalt",
                method="GET",
                timeout=4,
            )
            if status < 200 or status >= 300:
                return target
            payload = json.loads(raw.decode("utf-8") or "{}")
            measured = payload.get("measured_frame_rate", payload.get("frame_rate"))
            measured_fps = float(measured)
            if measured_fps <= 0:
                return target
            return min(target, max(1.0, min(60.0, measured_fps)))
        except Exception:
            return target

    def start(self, frames, fps=20):
        safe_fps = max(1, min(60, int(fps or 20)))
        if not isinstance(frames, list) or not frames:
            raise ValueError("frames must be a non-empty list")

        normalized = []
        active_ips = set()
        for item in frames:
            masters = item.get("masters") if isinstance(item, dict) else None
            if not isinstance(masters, list) or not masters:
                continue
            packed = []
            for m in masters:
                ip = str(m.get("ip") or "").strip()
                data = m.get("frameBytes")
                if not ip or not isinstance(data, (bytes, bytearray)) or len(data) < 3:
                    continue
                packed.append({"ip": ip, "frameBytes": bytes(data)})
                active_ips.add(ip)
            if packed:
                normalized.append({"masters": packed})

        if not normalized:
            raise ValueError("no valid frames to run")

        worker_fps = {ip: self._probe_target_fps(ip, safe_fps) for ip in active_ips}

        self.stop(join_timeout=1.5)
        workers_to_stop = []
        with self._lock:
            self._frames = normalized
            self._fps = safe_fps
            self._frame_index = 0
            self._last_error = ""
            self._last_push_at = ""
            self._push_ok = 0
            self._push_err = 0
            self._dispatch_seq = 0

            current_ips = set(self._workers.keys())
            for ip in (current_ips - active_ips):
                worker = self._workers.pop(ip, None)
                if worker:
                    workers_to_stop.append(worker)
                self._tokens.pop(ip, None)
                self._rt_mode_at.pop(ip, None)
                self._rt_frame_format.pop(ip, None)

            for ip in (active_ips - current_ips):
                worker = MirrorRuntime._MasterWorker(self, ip)
                worker.set_target_fps(worker_fps.get(ip, safe_fps))
                self._workers[ip] = worker
                worker.start()

            for ip in (active_ips & current_ips):
                worker = self._workers.get(ip)
                if worker:
                    worker.set_target_fps(worker_fps.get(ip, safe_fps))

            self._stop_event = threading.Event()
            self._running = True
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

        for worker in workers_to_stop:
            worker.stop(join_timeout=1.0)

    def stop(self, join_timeout=1.0):
        thread = None
        workers = []
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop_event.set()
            thread = self._thread
            self._thread = None
            workers = list(self._workers.values())
            self._workers = {}
        if thread:
            thread.join(timeout=join_timeout)
        for worker in workers:
            worker.stop(join_timeout=join_timeout)

    def _run(self):
        while True:
            with self._lock:
                if not self._running or self._stop_event.is_set():
                    return
                fps = self._fps
                frames = self._frames
                idx = self._frame_index % len(frames)
                frame = frames[idx]
                self._frame_index = (idx + 1) % len(frames)
                workers = dict(self._workers)
                frame_seq = self._dispatch_seq
                self._dispatch_seq += 1

            started = time.perf_counter()
            target_at = started + self._dispatch_lead_s
            for master in frame.get("masters", []):
                ip = master.get("ip")
                frame_bytes = master.get("frameBytes")
                if not ip or not frame_bytes:
                    continue
                worker = workers.get(ip)
                if worker:
                    worker.submit(frame_bytes, target_at=target_at, frame_seq=frame_seq)

            interval = 1.0 / max(1, fps)
            elapsed = time.perf_counter() - started
            sleep_s = max(0.0, interval - elapsed)
            if self._stop_event.wait(sleep_s):
                return

    def _record_push(self, stamp):
        with self._lock:
            self._push_ok += 1
            self._last_push_at = stamp

    def _record_error(self, message):
        with self._lock:
            self._push_err += 1
            self._last_error = str(message)

    def _twinkly_fetch(self, ip, path, method="GET", body=None, headers=None, timeout=8):
        url = f"http://{ip}{path}"
        req_headers = headers.copy() if isinstance(headers, dict) else {}
        req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers.items())

    def _login(self, ip):
        challenge = base64.b64encode(os.urandom(32)).decode("ascii")
        body = json.dumps({"challenge": challenge}, ensure_ascii=True).encode("utf-8")
        status, raw, _headers = self._twinkly_fetch(
            ip,
            "/xled/v1/login",
            method="POST",
            body=body,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"login failed ({status})")
        data = json.loads(raw.decode("utf-8") or "{}")
        token = data.get("authentication_token")
        challenge_response = data.get("challenge-response")
        if not token or not challenge_response:
            raise RuntimeError("login payload missing token or challenge-response")

        verify_body = json.dumps({"challenge-response": challenge_response}, ensure_ascii=True).encode("utf-8")
        v_status, _v_raw, _v_headers = self._twinkly_fetch(
            ip,
            "/xled/v1/verify",
            method="POST",
            body=verify_body,
            headers={"Content-Type": "application/json", "X-Auth-Token": token},
            timeout=10,
        )
        if v_status < 200 or v_status >= 300:
            raise RuntimeError(f"verify failed ({v_status})")

        self._tokens[ip] = {"token": token, "expiresAt": time.time() + (14 * 60)}
        return token

    def _token(self, ip):
        cached = self._tokens.get(ip)
        if cached and cached.get("expiresAt", 0) > (time.time() + 5):
            return cached.get("token")
        return self._login(ip)

    def _set_rt_mode(self, ip, token):
        body = json.dumps({"mode": "rt"}, ensure_ascii=True).encode("utf-8")
        status, _raw, _headers = self._twinkly_fetch(
            ip,
            "/xled/v1/led/mode",
            method="POST",
            body=body,
            headers={"Content-Type": "application/json", "X-Auth-Token": token},
            timeout=8,
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"set rt mode failed ({status})")

    def _assert_api_ok(self, raw, headers, path):
        content_type = str(headers.get("Content-Type", "")).lower()
        if "application/json" not in content_type:
            return
        try:
            payload = json.loads((raw or b"").decode("utf-8") or "{}")
        except Exception:
            return
        code = int(payload.get("code")) if str(payload.get("code", "")).isdigit() else None
        if code is None or code == 1000:
            return
        msg = payload.get("error") or payload.get("message") or payload.get("detail") or "unknown error"
        raise RuntimeError(f"twinkly api rejected {path}: code {code} ({msg})")

    def _send_rt_frame_payload(self, ip, token, payload, tag):
        status, raw, headers = self._twinkly_fetch(
            ip,
            "/xled/v1/led/rt/frame",
            method="POST",
            body=payload,
            headers={"Content-Type": "application/octet-stream", "X-Auth-Token": token},
            timeout=8,
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"rt frame {tag} failed ({status})")
        self._assert_api_ok(raw, headers, f"/xled/v1/led/rt/frame({tag})")

    def _push_rt_frame(self, ip, frame_bytes):
        token = self._token(ip)
        refresh = (time.time() - float(self._rt_mode_at.get(ip, 0) or 0)) > 20
        if refresh:
            self._set_rt_mode(ip, token)
            self._rt_mode_at[ip] = time.time()

        prefixed = bytes([1]) + bytes(frame_bytes)
        cached = self._rt_frame_format.get(ip, "")

        def send_with_format(fmt):
            if fmt == "v1":
                self._send_rt_frame_payload(ip, token, prefixed, "v1")
                return "v1"
            self._send_rt_frame_payload(ip, token, frame_bytes, "raw")
            return "raw"

        try:
            if cached in ("v1", "raw"):
                used = send_with_format(cached)
                self._rt_frame_format[ip] = used
                return

            try:
                used = send_with_format("v1")
                self._rt_frame_format[ip] = used
                return
            except Exception:
                used = send_with_format("raw")
                self._rt_frame_format[ip] = used
                return
        except Exception as first_exc:
            # Retry once with fresh auth and RT mode.
            self._tokens.pop(ip, None)
            self._rt_frame_format.pop(ip, None)
            token = self._token(ip)
            self._set_rt_mode(ip, token)
            self._rt_mode_at[ip] = time.time()
            try:
                send_with_format("v1")
                self._rt_frame_format[ip] = "v1"
                return
            except Exception:
                try:
                    send_with_format("raw")
                    self._rt_frame_format[ip] = "raw"
                    return
                except Exception as retry_exc:
                    raise RuntimeError(f"rt frame failed ({first_exc}; retry: {retry_exc})")


MIRROR_RUNTIME = MirrorRuntime()


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class GameWallHandler(SimpleHTTPRequestHandler):
    log_message = lambda self, *a: None  # quiet

    def end_headers(self):
        # Prevent stale HTML/JS/CSS from persisting during rapid iteration.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            self._handle_proxy("GET", parsed.query, body=None)
        elif parsed.path == "/api/mirror/status":
            self._json_response(200, MIRROR_RUNTIME.status())
        elif parsed.path == "/webproxy":
            self._handle_webproxy(parsed.query)
        elif parsed.path == "/sdbsearch":
            self._handle_sdbsearch(parsed.query)
        elif parsed.path == "/localip":
            self._handle_localip()
        elif parsed.path == "/scan":
            self._handle_scan(parsed.query)
        elif parsed.path.startswith("/api/characters/"):
            self._handle_character_api("GET", parsed.path, parsed.query, body=None)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else None
            self._handle_proxy("POST", parsed.query, body=body)
        elif parsed.path == "/api/mirror/start":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._handle_mirror_start(body)
        elif parsed.path == "/api/mirror/tuning":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._handle_mirror_tuning(body)
        elif parsed.path == "/api/mirror/stop":
            MIRROR_RUNTIME.stop()
            self._json_response(200, {"ok": True, "status": MIRROR_RUNTIME.status()})
        elif parsed.path == "/clientlog":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._handle_clientlog(body)
        elif parsed.path.startswith("/api/characters/"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._handle_character_api("POST", parsed.path, parsed.query, body=body)
        else:
            self.send_error(405)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/characters/"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._handle_character_api("DELETE", parsed.path, parsed.query, body=body)
        else:
            self.send_error(405)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token, X-GameWall-Build")

    def _handle_scan(self, query_string):
        """Scan an entire subnet for Twinkly devices using Python threads."""
        import concurrent.futures
        params = urllib.parse.parse_qs(query_string)
        subnet = params.get("subnet", [None])[0]
        if not subnet or not subnet.replace(".", "").isdigit():
            self.send_error(400, "Missing or invalid ?subnet= (e.g. 192.168.60)")
            return

        def probe(ip):
            url = f"http://{ip}/xled/v1/gestalt"
            for timeout in (0.9, 1.8):
                try:
                    req = urllib.request.Request(url, method="GET")
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        raw = resp.read()
                        data = json.loads(raw)
                        if data.get("product_name"):
                            return {
                                "ip": ip,
                                "name": data.get("device_name") or data.get("product_name") or ip,
                                "leds": data.get("number_of_led", 0),
                                "product": data.get("product_name", ""),
                            }
                except Exception:
                    continue
            return None

        ips = [f"{subnet}.{i}" for i in range(1, 255)]
        found = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=96) as pool:
            for result in pool.map(probe, ips):
                if result:
                    found.append(result)

        body = json.dumps({"found": found, "subnet": subnet}).encode()
        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _handle_localip(self):
        import socket
        primary_ip = None
        try:
            # UDP connect trick: no data is sent; we just need the OS to
            # pick the outbound interface for a public address.
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                primary_ip = s.getsockname()[0]
        except Exception:
            pass
        ips = [primary_ip] if primary_ip and primary_ip != "0.0.0.0" else []
        body = json.dumps({"ips": ips}).encode()
        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_clientlog(self, body):
        try:
            payload = json.loads(body.decode("utf-8") if body else "{}")
        except Exception:
            payload = {"message": "invalid json payload", "raw": str(body[:200])}

        level = str(payload.get("level", "info")).upper()
        source = str(payload.get("source", "client"))
        message = str(payload.get("message", ""))
        details = payload.get("details", None)
        build = str(payload.get("build", "unknown"))
        stamp = _now_iso()

        line = f"[{stamp}] [{level}] [{source}] [build:{build}] {message}"
        if details is not None:
            try:
                line += " " + json.dumps(details, separators=(",", ":"), ensure_ascii=True)
            except Exception:
                line += f" {details}"
        print(line, flush=True)
        try:
            with CLIENT_LOG_FILE.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass

        out = b'{"ok":true}'
        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def _json_response(self, status_code, payload):
        out = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status_code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def _read_json_body(self, body):
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            raise ValueError("Invalid JSON body")

    def _safe_slug(self, raw):
        value = str(raw or "").strip().lower()
        value = re.sub(r"[^a-z0-9\-]+", "-", value)
        value = re.sub(r"\-+", "-", value).strip("-")
        if not value or len(value) > 64:
            return None
        return value

    def _safe_file_name(self, raw):
        name = str(raw or "").strip()
        if not name or len(name) > 120:
            return None
        if "/" in name or "\\" in name or ".." in name:
            return None
        if not re.match(r"^[a-zA-Z0-9_\-.]+$", name):
            return None
        return name

    def _character_dir(self, slug):
        safe = self._safe_slug(slug)
        if not safe:
            return None
        root = CHARACTERS_ROOT.resolve()
        path = (root / safe).resolve()
        if root not in path.parents and path != root:
            return None
        return path

    def _character_json_path(self, slug):
        char_dir = self._character_dir(slug)
        if not char_dir:
            return None
        return char_dir / "character.json"

    def _decode_data_url(self, data_url):
        text = str(data_url or "")
        if not text.startswith("data:image/") or ";base64," not in text:
            raise ValueError("Expected image data URL")
        b64 = text.split(",", 1)[1]
        try:
            return base64.b64decode(b64, validate=True)
        except Exception:
            raise ValueError("Invalid image payload")

    def _png_dimensions(self, png_bytes):
        if len(png_bytes) < 24:
            return None, None
        if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
            return None, None
        width = int.from_bytes(png_bytes[16:20], "big")
        height = int.from_bytes(png_bytes[20:24], "big")
        return width, height

    def _write_atomic(self, path, data_bytes):
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(path.suffix + ".tmp")
        with temp_path.open("wb") as fh:
            fh.write(data_bytes)
        temp_path.replace(path)

    def _write_json_atomic(self, path, payload):
        self._write_atomic(path, json.dumps(payload, ensure_ascii=True, indent=2).encode("utf-8"))

    def _load_character_json(self, slug):
        path = self._character_json_path(slug)
        if not path or not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _handle_character_api(self, method, path, query, body):
        CHARACTERS_ROOT.mkdir(parents=True, exist_ok=True)
        parts = [p for p in path.split("/") if p]
        # /api/characters/...
        if len(parts) < 3 or parts[0] != "api" or parts[1] != "characters":
            self._json_response(404, {"error": "Unknown endpoint"})
            return

        tail = parts[2:]

        if method == "GET" and tail == ["list"]:
            items = []
            for d in sorted(CHARACTERS_ROOT.iterdir() if CHARACTERS_ROOT.exists() else [], key=lambda x: x.name):
                if not d.is_dir():
                    continue
                meta = d / "character.json"
                if not meta.exists():
                    continue
                try:
                    data = json.loads(meta.read_text(encoding="utf-8"))
                except Exception:
                    continue
                items.append({
                    "slug": d.name,
                    "name": data.get("name") or d.name,
                    "updatedAt": data.get("updatedAt") or data.get("createdAt") or "",
                })
            self._json_response(200, {"characters": items})
            return

        if method == "POST" and tail == ["create"]:
            payload = self._read_json_body(body)
            display_name = str(payload.get("name") or "").strip()
            slug = self._safe_slug(display_name)
            if not display_name or not slug:
                self._json_response(400, {"error": "Invalid character name"})
                return
            char_dir = self._character_dir(slug)
            if not char_dir:
                self._json_response(400, {"error": "Invalid character slug"})
                return
            if char_dir.exists():
                self._json_response(409, {"error": "Character already exists", "slug": slug})
                return

            (char_dir / "sprites").mkdir(parents=True, exist_ok=True)
            (char_dir / "sheets").mkdir(parents=True, exist_ok=True)
            now = _now_iso()
            initial = {
                "version": 2,
                "slug": slug,
                "name": display_name,
                "createdAt": now,
                "updatedAt": now,
                "detectStrictness": 0.65,
                "selectedAction": "run",
                "source": {
                    "assetUrl": None,
                    "sheetUrl": None,
                    "sheetFile": None,
                },
                "sprites": [],
                "actions": {
                    "run": {"name": "run", "frames": []}
                },
            }
            self._write_json_atomic(char_dir / "character.json", initial)
            self._json_response(201, {"ok": True, "slug": slug, "character": initial})
            return

        if len(tail) >= 2:
            slug = self._safe_slug(tail[0])
            action = tail[1]
            if not slug:
                self._json_response(400, {"error": "Invalid character slug"})
                return
            char_dir = self._character_dir(slug)
            if not char_dir or not char_dir.exists():
                self._json_response(404, {"error": "Character not found"})
                return

            if method == "GET" and action == "load":
                data = self._load_character_json(slug)
                if data is None:
                    self._json_response(404, {"error": "character.json not found"})
                    return
                self._json_response(200, {"character": data})
                return

            if method == "GET" and action == "sprites":
                data = self._load_character_json(slug) or {}
                sprites = data.get("sprites") if isinstance(data.get("sprites"), list) else []
                self._json_response(200, {"sprites": sprites})
                return

            if method == "POST" and action == "save":
                payload = self._read_json_body(body)
                if not isinstance(payload, dict):
                    self._json_response(400, {"error": "Invalid character payload"})
                    return
                payload["slug"] = slug
                payload["updatedAt"] = _now_iso()
                self._write_json_atomic(char_dir / "character.json", payload)
                self._json_response(200, {"ok": True, "updatedAt": payload["updatedAt"]})
                return

            if method == "POST" and action == "sheet":
                payload = self._read_json_body(body)
                file_name = self._safe_file_name(payload.get("fileName") or "sheet.png")
                if not file_name:
                    self._json_response(400, {"error": "Invalid sheet file name"})
                    return
                image_bytes = self._decode_data_url(payload.get("dataUrl"))
                width, height = self._png_dimensions(image_bytes)
                if not width or not height:
                    self._json_response(400, {"error": "Only PNG uploads are supported for sheets"})
                    return
                out_path = char_dir / "sheets" / file_name
                self._write_atomic(out_path, image_bytes)

                data = self._load_character_json(slug) or {}
                source = data.get("source") if isinstance(data.get("source"), dict) else {}
                source["sheetFile"] = file_name
                source["sheetUrl"] = payload.get("sheetUrl")
                source["assetUrl"] = payload.get("assetUrl")
                source["width"] = width
                source["height"] = height
                data["source"] = source
                data["updatedAt"] = _now_iso()
                self._write_json_atomic(char_dir / "character.json", data)
                self._json_response(200, {"ok": True, "fileName": file_name, "width": width, "height": height})
                return

            if method == "POST" and action == "sprite":
                payload = self._read_json_body(body)
                file_name = self._safe_file_name(payload.get("fileName"))
                if not file_name:
                    self._json_response(400, {"error": "Invalid sprite file name"})
                    return
                image_bytes = self._decode_data_url(payload.get("dataUrl"))
                width, height = self._png_dimensions(image_bytes)
                if not width or not height:
                    self._json_response(400, {"error": "Only PNG uploads are supported for sprites"})
                    return
                out_path = char_dir / "sprites" / file_name
                self._write_atomic(out_path, image_bytes)

                data = self._load_character_json(slug) or {}
                sprites = data.get("sprites") if isinstance(data.get("sprites"), list) else []
                actions = data.get("actions") if isinstance(data.get("actions"), dict) else {}
                meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}

                existing = None
                for rec in sprites:
                    if rec.get("fileName") == file_name:
                        existing = rec
                        break

                if existing:
                    sprite_id = int(existing.get("spriteId") or 0)
                    existing.update({
                        "fileName": file_name,
                        "width": width,
                        "height": height,
                        "sourceType": meta.get("sourceType") or existing.get("sourceType") or "imported",
                        "x": meta.get("x"),
                        "y": meta.get("y"),
                        "w": meta.get("w") or width,
                        "h": meta.get("h") or height,
                    })
                else:
                    max_id = max([int(s.get("spriteId") or 0) for s in sprites] + [0])
                    sprite_id = max_id + 1
                    sprites.append({
                        "spriteId": sprite_id,
                        "fileName": file_name,
                        "width": width,
                        "height": height,
                        "sourceType": meta.get("sourceType") or "imported",
                        "x": meta.get("x"),
                        "y": meta.get("y"),
                        "w": meta.get("w") or width,
                        "h": meta.get("h") or height,
                    })

                data["sprites"] = sprites
                data["actions"] = actions
                data["updatedAt"] = _now_iso()
                self._write_json_atomic(char_dir / "character.json", data)
                self._json_response(200, {
                    "ok": True,
                    "sprite": {
                        "spriteId": sprite_id,
                        "fileName": file_name,
                        "width": width,
                        "height": height,
                    },
                })
                return

            if method == "POST" and action == "sprites-delete":
                payload = self._read_json_body(body)
                file_names = payload.get("fileNames") if isinstance(payload.get("fileNames"), list) else []
                safe_names = []
                for name in file_names:
                    safe = self._safe_file_name(name)
                    if safe:
                        safe_names.append(safe)
                if not safe_names:
                    self._json_response(400, {"error": "No valid sprite names provided"})
                    return

                data = self._load_character_json(slug) or {}
                sprites = data.get("sprites") if isinstance(data.get("sprites"), list) else []
                actions = data.get("actions") if isinstance(data.get("actions"), dict) else {}

                removed_ids = set()
                removed_files = set()
                next_sprites = []
                for rec in sprites:
                    rec_name = rec.get("fileName")
                    if rec_name in safe_names:
                        removed_files.add(rec_name)
                        sid = int(rec.get("spriteId") or 0)
                        if sid > 0:
                            removed_ids.add(sid)
                    else:
                        next_sprites.append(rec)

                for name in removed_files:
                    file_path = char_dir / "sprites" / name
                    try:
                        file_path.unlink(missing_ok=True)
                    except Exception:
                        pass

                for action_key, action_data in list(actions.items()):
                    if not isinstance(action_data, dict):
                        continue
                    frames = action_data.get("frames") if isinstance(action_data.get("frames"), list) else []
                    action_data["frames"] = [f for f in frames if int(f.get("spriteId") or 0) not in removed_ids]
                    actions[action_key] = action_data

                data["sprites"] = next_sprites
                data["actions"] = actions
                data["updatedAt"] = _now_iso()
                self._write_json_atomic(char_dir / "character.json", data)
                self._json_response(200, {
                    "ok": True,
                    "removedFiles": sorted(list(removed_files)),
                    "removedSpriteIds": sorted(list(removed_ids)),
                })
                return

        self._json_response(404, {"error": "Unknown character endpoint"})

    def _handle_proxy(self, method, query_string, body):
        params = urllib.parse.parse_qs(query_string)
        target = params.get("url", [None])[0]
        if not target:
            self.send_error(400, "Missing ?url= parameter")
            return

        # Only allow local/private addresses as a security measure.
        host = urllib.parse.urlparse(target).hostname or ""
        if not (
            host.startswith("192.168.")
            or host.startswith("10.")
            or host.startswith("172.")
            or host in ("localhost", "127.0.0.1", "::1")
        ):
            self.send_error(403, "Only local addresses allowed")
            return

        parsed_target = urllib.parse.urlparse(target)
        target_path = parsed_target.path or ""
        requires_build = target_path in ("/xled/v1/led/mode", "/xled/v1/led/rt/frame")
        if requires_build:
            build = self.headers.get("X-GameWall-Build", "")
            if not build:
                stamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
                print(
                    f"[{stamp}] [WARN] [proxy] missing X-GameWall-Build for {target_path}; allowing request",
                    flush=True,
                )

        headers = {
            "Content-Type": self.headers.get("Content-Type", "application/json"),
        }
        auth_token = self.headers.get("X-Auth-Token")
        if auth_token:
            headers["X-Auth-Token"] = auth_token

        try:
            req = urllib.request.Request(target, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self._cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            try:
                data = e.read()
                self.send_response(e.code)
                self._cors_headers()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except BrokenPipeError:
                pass
        except Exception as exc:
            try:
                msg = json.dumps({"error": str(exc)}).encode()
                self.send_response(502)
                self._cors_headers()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            except BrokenPipeError:
                pass

    def _is_allowed_webproxy_target(self, target):
        parsed = urllib.parse.urlparse(target)
        if parsed.scheme not in ("http", "https"):
            return False

        host = (parsed.hostname or "").lower()
        if not host:
            return False

        allowed_exact = {
            "duckduckgo.com",
            "www.duckduckgo.com",
            "html.duckduckgo.com",
            "links.duckduckgo.com",
            "spriters-resource.com",
            "www.spriters-resource.com",
            "spritedatabase.net",
            "www.spritedatabase.net",
            "r.jina.ai",
        }
        if host in allowed_exact:
            return True

        if host.endswith(".duckduckgo.com"):
            return True
        if host.endswith(".spriters-resource.com"):
            return True
        if host.endswith(".spritedatabase.net"):
            return True
        return False

    def _handle_sdbsearch(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        query = (params.get("query", [""])[0] or "").strip()
        if not query:
            self._json_response(400, {"error": "Missing ?query= parameter"})
            return

        payload = urllib.parse.urlencode({"q": query}).encode("utf-8")
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
            ),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8",
        }

        try:
            req = urllib.request.Request(
                "https://spritedatabase.net/search.php",
                data=payload,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self._cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "text/html; charset=utf-8"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self._cors_headers()
            self.send_header("Content-Type", e.headers.get("Content-Type", "text/plain; charset=utf-8"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self._json_response(502, {"error": str(exc)})

    def _handle_mirror_start(self, body):
        try:
            payload = self._read_json_body(body)
        except Exception as exc:
            self._json_response(400, {"error": str(exc)})
            return

        fps = payload.get("fps", 20)
        dispatch_lead_ms = payload.get("dispatchLeadMs", None)
        frames = payload.get("frames") if isinstance(payload, dict) else None
        if not isinstance(frames, list) or not frames:
            self._json_response(400, {"error": "frames[] is required"})
            return

        parsed_frames = []
        try:
            for frame in frames:
                masters = frame.get("masters") if isinstance(frame, dict) else None
                if not isinstance(masters, list) or not masters:
                    continue
                out_masters = []
                for master in masters:
                    ip = str(master.get("ip") or "").strip()
                    frame_b64 = master.get("frameBase64")
                    if not ip or not isinstance(frame_b64, str) or not frame_b64:
                        continue
                    raw = base64.b64decode(frame_b64.encode("ascii"), validate=True)
                    if len(raw) < 3 or (len(raw) % 3) != 0:
                        continue
                    out_masters.append({"ip": ip, "frameBytes": raw})
                if out_masters:
                    parsed_frames.append({"masters": out_masters})
        except Exception:
            self._json_response(400, {"error": "Invalid frameBase64 payload"})
            return

        if not parsed_frames:
            self._json_response(400, {"error": "No valid mirror frames were provided"})
            return

        try:
            MIRROR_RUNTIME.set_tuning(dispatch_lead_ms=dispatch_lead_ms)
            MIRROR_RUNTIME.start(parsed_frames, fps=fps)
        except Exception as exc:
            self._json_response(400, {"error": str(exc)})
            return

        self._json_response(200, {"ok": True, "status": MIRROR_RUNTIME.status()})

    def _handle_mirror_tuning(self, body):
        try:
            payload = self._read_json_body(body)
        except Exception as exc:
            self._json_response(400, {"error": str(exc)})
            return

        dispatch_lead_ms = payload.get("dispatchLeadMs", None) if isinstance(payload, dict) else None
        try:
            MIRROR_RUNTIME.set_tuning(dispatch_lead_ms=dispatch_lead_ms)
        except Exception as exc:
            self._json_response(400, {"error": str(exc)})
            return
        self._json_response(200, {"ok": True, "status": MIRROR_RUNTIME.status()})

    def _handle_webproxy(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        target = params.get("url", [None])[0]
        if not target:
            self._json_response(400, {"error": "Missing ?url= parameter"})
            return

        if not self._is_allowed_webproxy_target(target):
            self._json_response(403, {"error": "Target host is not allowed"})
            return

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }

        try:
            req = urllib.request.Request(target, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self._cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "text/plain; charset=utf-8"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            try:
                data = e.read()
                self.send_response(e.code)
                self._cors_headers()
                self.send_header("Content-Type", e.headers.get("Content-Type", "text/plain; charset=utf-8"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except BrokenPipeError:
                pass
        except Exception as exc:
            self._json_response(502, {"error": str(exc)})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("0.0.0.0", port), GameWallHandler)
    print(f"GameWall server running at http://localhost:{port}/")
    print("  Static files served from current directory.")
    print("  Twinkly proxy available at /proxy?url=http://DEVICE_IP/...")
    print(f"  Client telemetry log file: {CLIENT_LOG_FILE}")
    print("  Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
