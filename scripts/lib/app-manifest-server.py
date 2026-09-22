#!/usr/bin/env python3
"""Local one-shot listener for GitHub's App Manifest flow.

Two jobs, both of which need a real HTTP origin rather than a file:// page:

  GET /          an auto-submitting form that POSTs the manifest to GitHub. The
                 manifest has to arrive as a form POST — there is no query-string
                 form of this endpoint — so a page that posts itself is the only
                 way to go from a shell script to a pre-filled GitHub page.
  GET /callback  receives ?code=...&state=..., writes the code where the shell can
                 read it, and shows the user something other than a blank tab.

Invoked by scripts/provision-cross-repo-app.sh with MANIFEST, STATE, PORT, ORG and
APP_NAME in the environment, and the output path as argv[1]. Exits after the callback.
"""
import http.server
import html
import json
import os
import sys
import urllib.parse

OUT = sys.argv[1]
MANIFEST = os.environ["MANIFEST"]
STATE = os.environ["STATE"]
PORT = int(os.environ["PORT"])
ORG = os.environ["ORG"]
APP_NAME = os.environ["APP_NAME"]

POST_URL = f"https://github.com/organizations/{ORG}/settings/apps/new?state={urllib.parse.quote(STATE)}"

PAGE = """<!doctype html><meta charset="utf-8"><title>Creating {name}</title>
<style>
 body{{font:15px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;max-width:32rem;
      margin:22vh auto;padding:0 1.5rem;color:#1c1c1e;background:#f6f6f7}}
 @media(prefers-color-scheme:dark){{body{{background:#0f1011;color:#e8e8ea}}}}
 h1{{font-size:17px;margin:0 0 .4rem}} p{{color:#8a8a8e;margin:.3rem 0}}
 button{{margin-top:1rem;font:inherit;padding:.5rem 1rem;border-radius:7px;
        border:1px solid #8a8a8e55;background:transparent;color:inherit;cursor:pointer}}
</style>
<h1>Redirecting to GitHub…</h1>
<p>{name} will be created in <strong>{org}</strong> with its permissions already set.</p>
<p>Review the page and press <strong>Create GitHub App</strong>.</p>
<form id="f" action="{action}" method="post">
  <input type="hidden" name="manifest" value="{manifest}">
  <button type="submit">Continue to GitHub</button>
</form>
<script>document.getElementById('f').submit();</script>
"""

DONE = """<!doctype html><meta charset="utf-8"><title>App created</title>
<style>
 body{{font:15px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;max-width:32rem;
      margin:22vh auto;padding:0 1.5rem;color:#1c1c1e;background:#f6f6f7}}
 @media(prefers-color-scheme:dark){{body{{background:#0f1011;color:#e8e8ea}}}}
 h1{{font-size:17px;margin:0 0 .4rem}} p{{color:#8a8a8e}}
 code{{font:13px ui-monospace,monospace}}
</style>
<h1>{title}</h1>
<p>{body}</p>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body):
        raw = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parts = urllib.parse.urlparse(self.path)

        if parts.path == "/":
            # html.escape with quote=True: the manifest is JSON full of double quotes
            # going into an HTML attribute, so unescaped it would close the attribute
            # and drop the rest of the manifest silently.
            self._send(200, PAGE.format(
                name=html.escape(APP_NAME), org=html.escape(ORG),
                action=html.escape(POST_URL),
                manifest=html.escape(MANIFEST, quote=True)))
            return

        if parts.path == "/callback":
            q = urllib.parse.parse_qs(parts.query)
            code = (q.get("code") or [""])[0]
            state = (q.get("state") or [""])[0]

            # The state check is the whole reason this is not just a netcat one-liner:
            # without it any page the browser happens to load could POST a code here
            # and have the script exchange it for someone else's App.
            if state != STATE:
                self._send(400, DONE.format(
                    title="State mismatch",
                    body="This callback did not come from the request this script "
                         "started. Nothing was exchanged. Re-run the script."))
                return
            if not code:
                self._send(400, DONE.format(
                    title="No code returned",
                    body="GitHub called back without a code. Re-run the script."))
                return

            with open(OUT, "w") as fh:
                fh.write(code)
            self._send(200, DONE.format(
                title="App created.",
                body="Return to the terminal — it is setting the org secrets and will "
                     "give you the install link."))
            # Flush before the process exits, or the browser shows a connection reset
            # in place of the page above.
            try:
                self.wfile.flush()
            except Exception:
                pass
            raise SystemExit(0)

        self._send(404, DONE.format(title="Not found", body="Nothing is served here."))

    def log_message(self, *_args):
        pass  # the shell script owns the console


if __name__ == "__main__":
    # 127.0.0.1, never 0.0.0.0: this briefly brokers a credential exchange and has no
    # business being reachable from the network.
    http.server.HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
