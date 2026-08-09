// Tiny static dev server: node serve.js → http://localhost:8642 (serves src/calculator.html at /)
const http = require("http"), fs = require("fs"), path = require("path");
const root = __dirname;
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "src/calculator.html";
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain" });
  fs.createReadStream(f).pipe(res);
}).listen(8642, () => console.log("serving on 8642"));
