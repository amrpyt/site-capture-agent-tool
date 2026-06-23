import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export function createStaticServer(root, port = 4177) {
  const resolvedRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const candidates = [pathname === "/" ? "/index.html" : pathname, `${pathname.replace(/\/$/, "")}/index.html`];
      for (const candidate of candidates) {
        const file = path.resolve(resolvedRoot, `.${candidate}`);
        if (!file.startsWith(resolvedRoot)) continue;
        try {
          const body = await readFile(file);
          response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
          response.end(body);
          return;
        } catch {}
      }
    } catch {}
    response.writeHead(404);
    response.end("not found");
  });

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server))),
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${port}`,
  };
}
