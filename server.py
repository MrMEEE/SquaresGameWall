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
import urllib.request
import urllib.error
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class GameWallHandler(SimpleHTTPRequestHandler):
    log_message = lambda self, *a: None  # quiet

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            self._handle_proxy("GET", parsed.query, body=None)
        elif parsed.path == "/localip":
            self._handle_localip()
        elif parsed.path == "/scan":
            self._handle_scan(parsed.query)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else None
            self._handle_proxy("POST", parsed.query, body=body)
        else:
            self.send_error(405)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")

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


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("0.0.0.0", port), GameWallHandler)
    print(f"GameWall server running at http://localhost:{port}/")
    print("  Static files served from current directory.")
    print("  Twinkly proxy available at /proxy?url=http://DEVICE_IP/...")
    print("  Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
