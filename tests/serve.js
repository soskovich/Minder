// Minimale statische server voor de Playwright-persona's (geen dependencies).
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.webmanifest':'application/manifest+json', '.css':'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(5599, () => console.log('serve op http://localhost:5599'));
