// DELTA POST — tiny static server for local playtesting only.
// Node 22, standard library only. Serves this directory on :8080 with the
// right MIME types for ES modules and import maps. Not part of the entry;
// the grader never runs it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') {
      // Redirect so relative paths in game/index.html resolve under /game/.
      // Keep the query string: ?shot=... staging depends on it.
      res.writeHead(302, { location: '/game/index.html' + url.search });
      res.end();
      return;
    }
    const file = normalize(join(here, path));
    if (!file.startsWith(here)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`DELTA POST at http://localhost:${port} (try ?shot=approach&seed=1)`);
});
