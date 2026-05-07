import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const port = Number(process.env.PORT || 5177);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return normalized === "/" ? "/index.html" : normalized.endsWith("/") ? `${normalized}index.html` : normalized;
}

const server = http.createServer(async (req, res) => {
  try {
    const relative = safePath(req.url || "/");
    let target = path.join(publicDir, relative);
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) target = path.join(target, "index.html");
    } catch {
      if (!path.extname(target)) target = path.join(target, "index.html");
    }
    const body = await fs.readFile(target);
    res.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`ClaimWatch MVP running at http://localhost:${port}`);
});
