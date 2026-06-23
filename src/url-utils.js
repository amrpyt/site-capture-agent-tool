import crypto from "node:crypto";
import path from "node:path";

export function normalizePageUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";
  let pathname = url.pathname.replace(/\/+/g, "/");
  if (pathname.length > 1) pathname = pathname.replace(/\/$/, "");
  url.pathname = pathname || "/";
  return url.toString();
}

export function routePathname(rawUrl) {
  const pathname = new URL(rawUrl).pathname.replace(/\/+/g, "/");
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
}

export function htmlPathForPage(rawUrl) {
  const pathname = routePathname(rawUrl);
  if (pathname === "/") return "index.html";
  return `${pathname.slice(1)}/index.html`;
}

export function isStaticPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return /\.(png|jpe?g|webp|gif|svg|css|mjs|js|json|xml|txt|woff2?|mp4|webm|pdf|framercms)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function routeAllowed(rawUrl, config, origin) {
  try {
    const url = new URL(rawUrl);
    if (config.sameOriginOnly && url.origin !== origin) return false;
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (isStaticPath(url.toString())) return false;
    const pathname = routePathname(url.toString());
    if (config.excludePatterns.some((pattern) => new RegExp(pattern).test(pathname))) return false;
    if (config.includePatterns.length && !config.includePatterns.some((pattern) => new RegExp(pattern).test(pathname))) return false;
    return true;
  } catch {
    return false;
  }
}

export function extFromContentType(contentType = "") {
  const clean = contentType.split(";")[0].trim();
  return {
    "text/css": ".css",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "application/json": ".json",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
    "application/font-woff2": ".woff2",
    "application/font-woff": ".woff",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  }[clean] || "";
}

export function shouldCaptureAsset(rawUrl, contentType = "") {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const type = contentType.split(";")[0].trim();
  return (
    isStaticPath(rawUrl) ||
    type.startsWith("text/css") ||
    type.includes("javascript") ||
    type.startsWith("image/") ||
    type.startsWith("font/") ||
    type.startsWith("video/") ||
    type === "application/json" ||
    type === "application/font-woff2" ||
    type === "application/font-woff"
  );
}

export function makeAssetNamer() {
  const used = new Set();
  return (rawUrl, contentType = "") => {
    const url = new URL(rawUrl);
    let filename = path.basename(url.pathname);
    if (!filename || !path.extname(filename)) {
      filename = `${filename || "asset"}${extFromContentType(contentType) || ".bin"}`;
    }
    filename = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 140);
    let localPath = `assets/${filename}`;
    if (used.has(localPath)) {
      const ext = path.extname(filename);
      const stem = path.basename(filename, ext);
      const hash = crypto.createHash("sha1").update(rawUrl).digest("hex").slice(0, 8);
      localPath = `assets/${stem}-${hash}${ext}`;
    }
    used.add(localPath);
    return localPath;
  };
}

export function extractAbsoluteUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(/https?:\\?\/\\?\/[^"'\\)\s<>]+/g)) {
    const cleaned = match[0]
      .replaceAll("\\/", "/")
      .replace(/&amp;/g, "&")
      .replace(/[),.;]+$/, "");
    urls.add(cleaned);
  }
  return urls;
}

export function relativeUrl(fromHtmlPath, toLocalPath) {
  const fromDir = path.posix.dirname(fromHtmlPath.replaceAll(path.sep, "/"));
  const relative = path.posix.relative(fromDir === "." ? "" : fromDir, toLocalPath.replaceAll(path.sep, "/"));
  return relative.startsWith(".") ? relative : `./${relative}`;
}
