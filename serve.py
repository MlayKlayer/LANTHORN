# Minimal static server for local play: `python3 serve.py` then open http://localhost:8741
import os
import sys

ROOT = os.path.dirname(os.path.abspath(sys.argv[0])) or '.'
try:
    os.chdir(ROOT)
except OSError:
    pass

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write(fmt % args + "\n")
        sys.stdout.flush()


PORT = int(os.environ.get('PORT', '8741'))
print(f"LANTHORN serving on http://localhost:{PORT}", flush=True)
ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
