// Builds the published GitHub Pages file (index.html, titled "The Mamdani Exit")
// from the working source (src/calculator.html). Run: node build.js
const fs = require("fs");
const path = require("path");
let src = fs.readFileSync(path.join(__dirname, "src", "calculator.html"), "utf8");
src = src.replace("<title>NYC Exit Calculator — 2026</title>", "").trimStart();
src = src.replace("<h1>NYC Exit Calculator</h1>", "<h1>The Mamdani Exit</h1>");
if (src.includes("NYC Exit Calculator</h1>")) throw new Error("h1 replacement failed");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Mamdani Exit</title>
<meta name="description" content="NYC exit math: real 2026 tax brackets and cost-of-living, fully editable.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗽</text></svg>">
</head>
<body>
${src}
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, "index.html"), page);
console.log("built index.html,", Buffer.byteLength(page), "bytes");
