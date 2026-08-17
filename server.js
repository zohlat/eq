// Zero-dependency static file server for local development.
// Usage: node server.js [port]   (defaults to 8080)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(__dirname, safePath === "/" ? "/index.html" : safePath);

    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Daily Equipment List app running at http://localhost:${PORT}`);
});
