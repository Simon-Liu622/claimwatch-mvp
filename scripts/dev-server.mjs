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
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  let normalized = path.posix
    .normalize(decoded.replace(/\\/g, "/"))
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\/+/, "");
  if (normalized === "" || normalized === ".") return "index.html";
  if (normalized.endsWith("/")) return `${normalized}index.html`;
  return normalized;
}

const server = http.createServer(async (req, res) => {
  try {
    const relative = safePath(req.url || "/");
    const segments = relative.split("/").filter(Boolean);
    let target = path.join(publicDir, ...segments);
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

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other process or run: PORT=5178 npm run dev`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`ClaimWatch MVP running at http://127.0.0.1:${port}`);
  console.log(`  Home: http://127.0.0.1:${port}/`);
  console.log(`  Search Console observability: http://127.0.0.1:${port}/seo-console/`);
  console.log(`  (If localhost fails in your browser, use 127.0.0.1 — and run npm run build once so public/ exists.)`);
});
