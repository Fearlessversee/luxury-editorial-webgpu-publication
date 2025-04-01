import http.server
import os
import urllib.parse
import urllib.request
import mimetypes
import posixpath
import sys

PORT = 8872
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
REMOTE_BASE = "https://www.nocturnaldream.com"

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("application/json", ".json")

class AutoCacheCloneHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def translate_path(self, path):
        clean_path = urllib.parse.urlparse(path).path
        clean_path = posixpath.normpath(urllib.parse.unquote(clean_path))
        words = clean_path.split('/')
        words = filter(None, words)
        path = DIRECTORY
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                continue
            path = os.path.join(path, word)
        return path

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Handle Next.js image endpoint: /_next/image?url=...
        if path == "/_next/image":
            query = urllib.parse.parse_qs(parsed.query)
            if "url" in query:
                img_url = urllib.parse.unquote(query["url"][0])
                self.path = img_url
                parsed = urllib.parse.urlparse(self.path)
                path = parsed.path

        local_path = self.translate_path(self.path)

        # Check clean URL routing (e.g. /about -> /about/index.html)
        if not os.path.exists(local_path):
            dir_index = os.path.join(local_path, "index.html")
            if os.path.exists(dir_index):
                self.path = posixpath.join(path, "index.html")
                return super().do_GET()

            alt_path = os.path.join(DIRECTORY, path.strip("/"), "index.html")
            if os.path.exists(alt_path):
                self.path = "/" + path.strip("/") + "/index.html"
                return super().do_GET()

            # Fallback auto-cache proxy if remote origin is provided
            if REMOTE_BASE:
                remote_url = REMOTE_BASE + self.path
                try:
                    req = urllib.request.Request(remote_url, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    })
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = resp.read()
                        os.makedirs(os.path.dirname(local_path), exist_ok=True)
                        with open(local_path, "wb") as f:
                            f.write(data)
                        print(f"[Auto-Cached]: {self.path} ({len(data)} bytes)")
                except Exception as e:
                    pass

        return super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    server = http.server.ThreadingHTTPServer(("", PORT), AutoCacheCloneHandler)
    print("=" * 60)
    print(f" Cloned Site Live: http://localhost:{PORT}")
    print(f" Directory: {DIRECTORY}")
    print("=" * 60)
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
