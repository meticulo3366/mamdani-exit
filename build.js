// Builds the GitHub Pages site from src/. Run: node build.js
// Outputs:
//   index.html — the calculator page with engine.js inlined (self-contained for humans)
//   engine.js  — the shared engine, fetchable by agents (Pages serves CORS *)
//   api.html   — JSON endpoint page (JS-computed from URL params; references ./engine.js)
//   data.json  — the verified tax dataset alone, for clients that can't run JS
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");
const write = (f, s) => { fs.writeFileSync(path.join(__dirname, f), s); console.log("built", f + ",", Buffer.byteLength(s), "bytes"); };

const engine = read("src/engine.js");

// index.html: retitle + wrap + inline the engine
let src = read("src/calculator.html");
src = src.replace("<title>NYC Exit Calculator — 2026</title>", "").trimStart();
src = src.replace("<h1>NYC Exit Calculator</h1>", "<h1>The Mamdani Exit</h1>");
if (src.includes("NYC Exit Calculator</h1>")) throw new Error("h1 replacement failed");
src = src.replace('<script src="engine.js"></script>', "<script>\n" + engine + "\n</script>");
if (src.includes('<script src="engine.js"></script>')) throw new Error("engine inline failed");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Mamdani Exit</title>
<meta name="description" content="NYC exit math: real 2026 tax brackets and cost-of-living, fully editable. Agent API: /api.html, /engine.js, /llms.txt">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗽</text></svg>">
</head>
<body>
${src}
</body>
</html>
`;
write("index.html", page);

// agent-facing files
write("engine.js", engine);
write("api.html", read("src/api.html"));

// data.json for non-JS clients: extract DEFAULT_DATA by evaluating the engine in-process
const E = require(path.join(__dirname, "src", "engine.js"));
write("data.json", JSON.stringify({ version: E.VERSION, taxYear: E.DEFAULT_DATA.meta.taxYear,
  defaults: { inputs: E.DEFAULT_INPUTS, rvo: E.DEFAULT_RVO, activeCities: E.DEFAULT_ACTIVE }, data: E.DEFAULT_DATA }, null, 2));
