// Tiny static server for testing on this computer: node tools/dev-server.js  →  http://localhost:8642
const http=require("http"), fs=require("fs"), path=require("path");
const root=path.join(__dirname, ".."), port=+process.env.PORT||8642;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,"http://x").pathname);
  if (p.endsWith("/")) p+="index.html";
  const f=path.join(root, path.normalize(p));
  if (!f.startsWith(root)){ res.writeHead(403); return res.end(); }
  fs.readFile(f,(err,data)=>{
    if (err){ res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200,{"Content-Type":types[path.extname(f)]||"application/octet-stream","Cache-Control":"no-cache"});
    res.end(data);
  });
}).listen(port,()=>console.log("Calorie Log on http://localhost:"+port));
