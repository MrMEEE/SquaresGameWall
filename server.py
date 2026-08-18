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
from datetime import datetime, timezone
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


CLIENT_LOG_FILE = Path("/tmp/gamewall-clientlog.txt")
WORKSPACE_ROOT = Path(__file__).resolve().parent
CHARACTERS_ROOT = WORKSPACE_ROOT / "characters"


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
