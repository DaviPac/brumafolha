# Dev server that tells the browser not to cache, so a reload always runs the latest code.
# Usage: python3 tools/serve.py [port]   (default 5173)
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
