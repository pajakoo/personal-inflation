#!/usr/bin/env node

/**
 * Minimal static server for dist/ so we can run selenium tests without Node >=18.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

function mime(filePath){
  const ext = path.extname(filePath).toLowerCase();
  switch(ext){
    case '.html': return 'text/html';
    case '.js': return 'application/javascript';
    case '.css': return 'text/css';
    case '.json': return 'application/json';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.webmanifest': return 'application/manifest+json';
    default: return 'application/octet-stream';
  }
}

const server = http.createServer((req, res)=>{
  const urlPath = req.url ? req.url.split('?')[0] : '/';
  const safePath = path.normalize(urlPath).replace(/^\/+/, '');
  let filePath = path.join(DIST, safePath);
  if(!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()){
    filePath = path.join(DIST, 'index.html');
  }
  fs.readFile(filePath, (err, data)=>{
    if(err){
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {'Content-Type': mime(filePath)});
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', ()=>{
  console.log(`Static preview running at http://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', ()=> server.close(()=> process.exit(0)));
process.on('SIGINT', ()=> server.close(()=> process.exit(0)));
