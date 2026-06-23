/**
 * @typedef {"queued" | "running" | "completed" | "failed" | "cancelled"} CaptureStatus
 * @typedef {"desktop" | "tablet" | "mobile"} ViewportName
 *
 * @typedef {Object} CaptureViewport
 * @property {ViewportName} name
 * @property {number} width
 * @property {number} height
 * @property {boolean=} isMobile
 *
 * @typedef {Object} CaptureConfig
 * @property {string} startUrl
 * @property {string} outDir
 * @property {number} maxPages
 * @property {number} maxAssets
 * @property {number} maxDepth
 * @property {boolean} sameOriginOnly
 * @property {string[]} includePatterns
 * @property {string[]} excludePatterns
 * @property {CaptureViewport[]} viewports
 * @property {boolean} deepCrawl
 * @property {boolean} interactionExplorer
 * @property {boolean} offlineQa
 * @property {boolean} visualDiff
 * @property {boolean} zipExport
 * @property {boolean=} headed
 * @property {boolean=} keepBrowser
 * @property {number=} port
 */

export const defaultViewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 900, height: 1100 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

export function createCaptureConfig(input) {
  const startUrl = new URL(input.startUrl).toString();
  return {
    startUrl,
    outDir: input.outDir || ".artifacts/captures/site",
    maxPages: Number.isFinite(Number(input.maxPages)) ? Number(input.maxPages) : 40,
    maxAssets: Number.isFinite(Number(input.maxAssets)) ? Number(input.maxAssets) : 350,
    maxDepth: Number.isFinite(Number(input.maxDepth)) ? Number(input.maxDepth) : 4,
    sameOriginOnly: input.sameOriginOnly !== false,
    includePatterns: Array.isArray(input.includePatterns) ? input.includePatterns : [],
    excludePatterns: Array.isArray(input.excludePatterns) ? input.excludePatterns : [],
    viewports: Array.isArray(input.viewports) && input.viewports.length ? input.viewports : defaultViewports,
    deepCrawl: input.deepCrawl !== false,
    interactionExplorer: Boolean(input.interactionExplorer),
    offlineQa: input.offlineQa !== false,
    visualDiff: Boolean(input.visualDiff),
    zipExport: Boolean(input.zipExport),
    headed: Boolean(input.headed || input.keepBrowser),
    keepBrowser: Boolean(input.keepBrowser),
    port: Number.isFinite(Number(input.port)) ? Number(input.port) : 4177,
  };
}
