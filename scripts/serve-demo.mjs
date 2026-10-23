import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist-static/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.mp4':'video/mp4','.json':'application/json'};
const server=http.createServer(async (req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const name=pathname==='/'?'/index.html':pathname;
    const full=path.resolve(root,`.${name}`);
    if(!full.startsWith(root)||!types[path.extname(full)]||!(await stat(full)).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(full)],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':name.endsWith('.html')?'no-cache':'public, max-age=3600'});
    if(req.method==='HEAD')res.end();else createReadStream(full).pipe(res);
  }catch{res.writeHead(404).end();}
});
server.listen(5188,'127.0.0.1',()=>console.log('Independent static demo: http://localhost:5188/?channelId=8650753'));
