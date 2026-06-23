import { htmlPathForPage, relativeUrl, routePathname } from "./url-utils.js";

export function rewriteUrls(text, fromHtmlPath, assetMap, pageUrls) {
  let output = text;

  for (const [rawUrl, asset] of assetMap) {
    const local = relativeUrl(fromHtmlPath, asset.localPath);
    output = output.split(rawUrl).join(local);
    output = output.split(rawUrl.replace(/&/g, "&amp;")).join(local.replace(/&/g, "&amp;"));
    output = output.split(rawUrl.replaceAll("/", "\\/")).join(local.replaceAll("/", "\\/"));
  }

  const sortedPageUrls = [...pageUrls].sort((left, right) => new URL(right).pathname.length - new URL(left).pathname.length);
  for (const pageUrl of sortedPageUrls) {
    const url = new URL(pageUrl);
    const fromDir = fromHtmlPath.includes("/") ? fromHtmlPath.split("/").slice(0, -1).join("/") : "";
    const targetPath = htmlPathForPage(pageUrl);
    const targetDir = targetPath.includes("/") ? targetPath.split("/").slice(0, -1).join("/") : "";
    let local = relativePath(fromDir, targetDir);
    if (!local) local = ".";
    if (!local.startsWith(".")) local = `./${local}`;
    if (routePathname(pageUrl) === "/" && !local.endsWith("/")) local = `${local}/`;
    output = output.split(url.toString()).join(local);
    output = output.split(url.origin + url.pathname).join(local);
  }

  return output;
}

function relativePath(fromDir, targetDir) {
  const fromParts = fromDir ? fromDir.split("/") : [];
  const targetParts = targetDir ? targetDir.split("/") : [];
  while (fromParts.length && targetParts.length && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  return [...fromParts.map(() => ".."), ...targetParts].join("/");
}
