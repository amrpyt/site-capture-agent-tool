#!/usr/bin/env node
import path from "node:path";
import { createCaptureConfig, runCapture } from "../src/index.js";

function parseArgs(argv) {
  const input = {
    startUrl: "",
    outDir: ".artifacts/site-capture",
    maxPages: 40,
    maxAssets: 350,
    maxDepth: 4,
    sameOriginOnly: true,
    includePatterns: [],
    excludePatterns: [],
    deepCrawl: true,
    interactionExplorer: false,
    offlineQa: true,
    visualDiff: false,
    zipExport: false,
    port: 4177,
    headed: false,
    keepBrowser: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (!arg.startsWith("--") && !input.startUrl) input.startUrl = arg;
    else if (arg === "--out" && next) input.outDir = next, index += 1;
    else if (arg === "--max-pages" && next) input.maxPages = Number(next), index += 1;
    else if (arg === "--max-assets" && next) input.maxAssets = Number(next), index += 1;
    else if (arg === "--max-depth" && next) input.maxDepth = Number(next), index += 1;
    else if (arg === "--include" && next) input.includePatterns = next.split(",").filter(Boolean), index += 1;
    else if (arg === "--exclude" && next) input.excludePatterns = next.split(",").filter(Boolean), index += 1;
    else if (arg === "--port" && next) input.port = Number(next), index += 1;
    else if (arg === "--all-origins") input.sameOriginOnly = false;
    else if (arg === "--shallow") input.deepCrawl = false;
    else if (arg === "--explore-interactions") input.interactionExplorer = true;
    else if (arg === "--offline-qa") input.offlineQa = true;
    else if (arg === "--no-offline-qa") input.offlineQa = false;
    else if (arg === "--visual-diff") input.visualDiff = true;
    else if (arg === "--zip") input.zipExport = true;
    else if (arg === "--headed") input.headed = true;
    else if (arg === "--keep-browser" || arg === "--serve") input.keepBrowser = true;
    else if (arg === "--help" || arg === "-h") printHelp(), process.exit(0);
  }

  if (!input.startUrl) {
    printHelp();
    process.exit(1);
  }

  input.outDir = path.resolve(input.outDir);
  return createCaptureConfig(input);
}

function printHelp() {
  console.log(`Usage:
  site-capture <url> [options]

Options:
  --out <dir>                 Output directory
  --max-pages <n>             Max pages to capture
  --max-assets <n>            Max assets to save
  --max-depth <n>             Max crawl depth
  --include <regex,regex>     Include route patterns
  --exclude <regex,regex>     Exclude route patterns
  --all-origins               Allow non same-origin pages
  --shallow                   Disable robots/sitemap discovery
  --explore-interactions      Click safe UI controls during capture
  --offline-qa                Run local offline verification
  --no-offline-qa             Skip local offline verification
  --visual-diff               Capture live/local screenshots and metrics
  --zip                       Write export.zip
  --serve                     Keep local preview browser/server open
  --port <n>                  Local preview port`);
}

const report = await runCapture(parseArgs(process.argv.slice(2)), {
  emit(event) {
    if (event.type !== "complete") console.log(event.message || event.type);
  },
});

console.log(JSON.stringify({
  outDir: report.config.outDir,
  pages: report.routes.map((route) => route.path),
  assets: report.assets.length,
  offlineQa: report.offlineQa?.status,
  visualDiff: report.visualDiff?.status,
  servedAt: report.servedAt,
}, null, 2));
