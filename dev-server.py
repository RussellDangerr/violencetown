#!/usr/bin/env python
"""
Dev server for Violencetown — serves /game with aggressive no-cache headers.

The browser's disk + module caches make iterative front-end work painful:
edit a JS file, reload, and the browser still runs the previous version
because python -m http.server emits no Cache-Control headers (so the
browser caches heuristically — sometimes for minutes). This wrapper
flips Cache-Control to no-store so every reload pulls fresh bytes.

For production (Cloudflare Pages) this script isn't used — Cloudflare
sets sensible cache headers automatically.

Usage:
    python dev-server.py [port]    # defaults to 3001
"""

import http.server
import sys
from functools import partial


import re
import time

# Per-process unique cache-bust token. Rewrites every served HTML's script
# tags to append `?dev=<token>`. The token changes each server start, so a
# browser reload after restart always hits fresh module URLs (which in turn
# cascade fresh imports because their resolved URLs differ).
_TOKEN = str(int(time.time()))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_head(self):
        """For HTML: inject `?dev=<token>` into <script src="...js"> URLs.
        For JS: inject the same query into every `import ... from './x.js'`
        specifier. Together this cascades fresh module URLs across the whole
        import graph on each server restart, bypassing the browser's
        per-realm module cache that ignores Cache-Control once a module
        URL is already mapped."""
        import os, io
        clean_path = self.path.split('?')[0]
        path = self.translate_path(clean_path)
        # Resolve dir → index.html for HTML detection
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        is_html = path.endswith(('.html', '.htm')) or clean_path.rstrip('/') in ('', '/')
        is_js = path.endswith('.js')
        if not (is_html or is_js):
            return super().send_head()
        if not os.path.isfile(path):
            return super().send_head()
        try:
            with open(path, 'rb') as f:
                body = f.read()
        except OSError:
            return super().send_head()
        text = body.decode('utf-8', errors='replace')
        if is_html:
            text = re.sub(
                r'(<script\b[^>]*\bsrc=")([^"#?]+\.js)([#?][^"]*)?(")',
                lambda m: m.group(1) + m.group(2) + '?dev=' + _TOKEN + (m.group(3) or '').replace('?', '&') + m.group(4),
                text,
                flags=re.IGNORECASE,
            )
            ctype = 'text/html; charset=utf-8'
        else:
            # Static + dynamic imports: from './x.js', from "../x.js",
            # import('./x.js'). Skip ones that already have a query (avoid
            # double-stamping). Only rewrite relative paths starting with
            # ./ or ../ — leave absolute and bare specifiers alone.
            def stamp_js(m):
                quote = m.group(1)
                spec = m.group(2)
                if '?' in spec:
                    return m.group(0)
                return f'{quote}{spec}?dev={_TOKEN}{quote}'
            text = re.sub(
                r"""(['"])(\.\.?\/[^'"]+\.js)\1""",
                stamp_js,
                text,
            )
            ctype = 'text/javascript; charset=utf-8'
        encoded = text.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        return io.BytesIO(encoded)


if __name__ == '__main__':
    import os
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3001
    # Serve from the `game/` directory next to this script, regardless of
    # where the script is invoked from. Lets launch.json / external tools
    # reference this script by absolute path without caring about cwd.
    here = os.path.dirname(os.path.abspath(__file__))
    game_dir = os.path.join(here, 'game')
    print(f'[dev-server] serving  = {game_dir}', flush=True)
    print(f'[dev-server] cache-bust token = {_TOKEN}', flush=True)
    handler = partial(NoCacheHandler, directory=game_dir)
    http.server.test(HandlerClass=handler, port=port, bind='127.0.0.1')
