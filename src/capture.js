import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createStaticServer } from "./static-server.js";
import { createZipArchive, writeReports } from "./report.js";
import { rewriteUrls } from "./rewrite.js";
import {
  extractAbsoluteUrls,
  htmlPathForPage,
  makeAssetNamer,
  normalizePageUrl,
  routeAllowed,
  routePathname,
  shouldCaptureAsset,
} from "./url-utils.js";

const DEFAULT_WAIT_MS = 800;

export async function runCapture(config, hooks = {}) {
  const emit = hooks.emit || (() => {});
  const signal = hooks.signal;
  const start = normalizePageUrl(config.startUrl);
  const origin = new URL(start).origin;
  const outDir = path.resolve(config.outDir);
  const siteDir = path.join(outDir, "site");
  const localPathForAsset = makeAssetNamer();
  const assetMap = new Map();
  const assetQueue = [];
  const pageHtml = new Map();
  const pageMeta = [];
  const routeSources = new Map([[start, ["start"]]]);
  const queue = [{ url: start, depth: 0 }];
  const queued = new Set([start]);
  const failed = [];

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(siteDir, "assets"), { recursive: true });
  emit({ type: "start", message: `Starting ${start}` });

  await discoverSeedRoutes({ start, origin, config, queued, queue, routeSources, emit });

  const browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({ viewport: config.viewports[0], deviceScaleFactor: 1 });
  const page = await context.newPage();
  wireResponseCapture(page, assetMap, assetQueue, localPathForAsset, config);

  while (queue.length && pageHtml.size < config.maxPages) {
    throwIfCancelled(signal);
    const current = queue.shift();
    if (current.depth > config.maxDepth) continue;
    try {
      emit({ type: "route:start", route: routePathname(current.url), message: `Opening ${routePathname(current.url)}` });
      await openRenderedPage(page, current.url);
      await scrollThroughPage(page);
      if (config.interactionExplorer) await exploreSafeInteractions(page, emit);
      const html = await page.content();
      pageHtml.set(current.url, html);

      const links = await discoverLinksFromPage(page, html, origin, config);
      const nextRoutes = [];
      for (const link of links) {
        const normalized = normalizePageUrl(link);
        if (queued.has(normalized)) continue;
        queued.add(normalized);
        nextRoutes.push({ url: normalized, depth: current.depth + 1 });
        routeSources.set(normalized, ["page"]);
      }
      queue.unshift(...nextRoutes.reverse());

      const meta = await page.evaluate(() => ({
        title: document.title,
        images: document.images.length,
        links: document.querySelectorAll("a[href]").length,
        height: document.documentElement.scrollHeight,
      }));
      pageMeta.push({ url: current.url, path: routePathname(current.url), status: "captured", sources: routeSources.get(current.url) || [], ...meta });
      emit({ type: "route:done", route: routePathname(current.url), message: `Captured ${routePathname(current.url)}` });
    } catch (error) {
      const failure = { url: current.url, path: routePathname(current.url), error: error.message };
      failed.push(failure);
      emit({ type: "route:failed", route: failure.path, message: error.message });
    }
  }

  emit({ type: "assets:start", message: `Saving assets ${assetQueue.length}` });
  while (assetQueue.length && assetMap.size < config.maxAssets) {
    throwIfCancelled(signal);
    await captureAsset(assetQueue.shift(), assetMap, assetQueue, localPathForAsset, config.maxAssets);
  }

  const pageUrls = Array.from(pageHtml.keys());
  for (const [rawUrl, html] of pageHtml) {
    const htmlPath = htmlPathForPage(rawUrl);
    const outputHtml = rewriteUrls(html, htmlPath, assetMap, pageUrls);
    const target = path.join(siteDir, htmlPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, outputHtml, "utf8");
  }

  for (const [rawUrl, asset] of assetMap) {
    let body = asset.body;
    if (asset.contentType.includes("javascript") || asset.contentType.includes("text/css") || asset.contentType.includes("json")) {
      body = Buffer.from(rewriteUrls(body.toString("utf8"), asset.localPath, assetMap, pageUrls), "utf8");
    }
    const target = path.join(siteDir, asset.localPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  let server;
  let offlineQa = { status: "skipped" };
  let visualDiff = { status: "skipped" };
  if (config.offlineQa || config.visualDiff || config.keepBrowser) {
    const staticServer = createStaticServer(siteDir, config.port);
    await staticServer.listen();
    server = staticServer;
    if (config.offlineQa) offlineQa = await runOfflineQa({ browser, baseUrl: staticServer.url, routes: pageUrls.map(routePathname), emit });
    if (config.visualDiff) visualDiff = await runVisualDiff({ browser, liveOrigin: origin, baseUrl: staticServer.url, routes: pageUrls.map(routePathname), outDir, emit });
    if (config.keepBrowser) {
      const testPage = await context.newPage();
      await testPage.goto(`${staticServer.url}/`, { waitUntil: "domcontentloaded" });
    } else {
      await staticServer.close();
      server = undefined;
    }
  }

  if (!config.keepBrowser) await browser.close();

  const remoteLeaks = [...assetMap.keys()].filter((url) => !shouldCaptureAsset(url, assetMap.get(url)?.contentType));
  const report = {
    config: { ...config, outDir },
    state: { status: "completed", startedAt: new Date().toISOString(), pages: pageUrls, failed },
    routes: pageMeta.map((route) => ({ ...route, failedRequests: offlineQa.routes?.find((item) => item.path === route.path)?.failedRequests?.length || 0 })),
    assets: [...assetMap.entries()].map(([url, asset]) => ({
      url,
      localPath: asset.localPath,
      contentType: asset.contentType,
      bytes: asset.body.length,
      status: "saved",
      usedBy: asset.usedBy ? [...asset.usedBy] : [],
    })),
    failures: failed,
    remoteLeaks,
    offlineQa,
    visualDiff,
    servedAt: server ? `${server.url}/` : undefined,
  };

  await writeReports({ outDir, report });
  if (config.zipExport) await createZipArchive(siteDir, path.join(outDir, "export.zip"));
  emit({ type: "complete", message: "Capture complete", report });
  return report;
}

async function discoverSeedRoutes({ start, origin, config, queued, queue, routeSources, emit }) {
  if (!config.deepCrawl) return;
  const root = new URL(start);
  const candidates = [`${root.origin}/robots.txt`, `${root.origin}/sitemap.xml`];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;
      const text = await response.text();
      const urls = [...extractAbsoluteUrls(text)];
      for (const rawUrl of urls) {
        if (!routeAllowed(rawUrl, config, origin)) continue;
        const normalized = normalizePageUrl(rawUrl);
        if (queued.has(normalized)) continue;
        queued.add(normalized);
        queue.push({ url: normalized, depth: 0 });
        routeSources.set(normalized, [candidate.endsWith("robots.txt") ? "robots" : "sitemap"]);
      }
      emit({ type: "discover", message: `Discovered ${urls.length} urls from ${candidate}` });
    } catch {}
  }
}

function wireResponseCapture(page, assetMap, assetQueue, localPathForAsset, config) {
  page.on("response", async (response) => {
    try {
      const rawUrl = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (response.status() >= 400 || assetMap.size >= config.maxAssets || assetMap.has(rawUrl) || !shouldCaptureAsset(rawUrl, contentType)) return;
      const body = await response.body();
      if (!body.length) return;
      const localPath = localPathForAsset(rawUrl, contentType);
      assetMap.set(rawUrl, { localPath, body, contentType, usedBy: new Set([routePathname(page.url())]) });
      if (contentType.includes("javascript") || contentType.includes("text/css") || contentType.includes("json")) {
        for (const nestedUrl of extractAbsoluteUrls(body.toString("utf8"))) {
          if (!assetMap.has(nestedUrl) && shouldCaptureAsset(nestedUrl)) assetQueue.push(nestedUrl);
        }
      }
    } catch {}
  });
}

async function openRenderedPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(DEFAULT_WAIT_MS);
}

async function scrollThroughPage(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height + 1200; y += 900) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(180);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(DEFAULT_WAIT_MS);
}

async function discoverLinksFromPage(page, html, origin, config) {
  const links = await page.evaluate(() => {
    const fromAnchors = Array.from(document.querySelectorAll("a[href]"), (anchor) => anchor.href);
    const meta = Array.from(document.querySelectorAll("link[rel='canonical'], meta[property='og:url']"), (node) => node.href || node.content).filter(Boolean);
    return [...fromAnchors, ...meta];
  });
  for (const absoluteUrl of extractAbsoluteUrls(html)) links.push(absoluteUrl);
  return [...new Set(links)].filter((link) => routeAllowed(link, config, origin));
}

async function exploreSafeInteractions(page, emit) {
  const selectors = [
    "button",
    "[role='button']",
    "[aria-expanded='false']",
    "[data-framer-name*='Menu' i]",
    "[data-framer-name*='Accordion' i]",
    "[data-framer-name*='Tab' i]",
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (!(await locator.count())) continue;
      const text = (await locator.innerText({ timeout: 1000 }).catch(() => "")).toLowerCase();
      if (/submit|buy|checkout|delete|sign in|login|pay/.test(text)) continue;
      await locator.click({ timeout: 1500 });
      await page.waitForTimeout(400);
      emit({ type: "interaction", message: `Explored ${selector}` });
    } catch {}
  }
}

async function captureAsset(rawUrl, assetMap, assetQueue, localPathForAsset, maxAssets) {
  if (assetMap.size >= maxAssets || assetMap.has(rawUrl) || !shouldCaptureAsset(rawUrl)) return;
  try {
    const response = await fetch(rawUrl);
    if (!response.ok) return;
    const contentType = response.headers.get("content-type") || "";
    if (!shouldCaptureAsset(rawUrl, contentType)) return;
    const body = Buffer.from(await response.arrayBuffer());
    const localPath = localPathForAsset(rawUrl, contentType);
    assetMap.set(rawUrl, { localPath, body, contentType, usedBy: new Set() });
    if (contentType.includes("javascript") || contentType.includes("text/css") || contentType.includes("json")) {
      for (const nestedUrl of extractAbsoluteUrls(body.toString("utf8"))) {
        if (!assetMap.has(nestedUrl) && shouldCaptureAsset(nestedUrl)) assetQueue.push(nestedUrl);
      }
    }
  } catch {}
}

async function runOfflineQa({ browser, baseUrl, routes, emit }) {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(baseUrl)) return route.continue();
    return route.abort();
  });
  const results = [];
  for (const routePath of routes) {
    const page = await context.newPage();
    const failedRequests = [];
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (!url.startsWith(baseUrl)) failedRequests.push({ url, error: request.failure()?.errorText || "blocked" });
    });
    try {
      await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => ({
        title: document.title,
        textLength: document.body.innerText.length,
        images: document.images.length,
        canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      results.push({ path: routePath, status: "pass", failedRequests, ...info });
      emit({ type: "qa:route", route: routePath, message: `Offline QA ${routePath}` });
    } catch (error) {
      results.push({ path: routePath, status: "fail", error: error.message, failedRequests });
    } finally {
      await page.close();
    }
  }
  await context.close();
  const blockingFailures = results.filter((item) => item.status !== "pass");
  return { status: blockingFailures.length ? "fail" : "pass", routes: results };
}

async function runVisualDiff({ browser, liveOrigin, baseUrl, routes, outDir, emit }) {
  const screenshotDir = path.join(outDir, "report", "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const results = [];
  for (const routePath of routes) {
    const live = await context.newPage();
    const local = await context.newPage();
    try {
      await live.goto(`${liveOrigin}${routePath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await local.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await live.waitForTimeout(700);
      await local.waitForTimeout(700);
      const name = routePath === "/" ? "home" : routePath.slice(1).replace(/[^a-z0-9]+/gi, "-");
      const livePath = path.join(screenshotDir, `${name}-live.png`);
      const localPath = path.join(screenshotDir, `${name}-local.png`);
      await live.screenshot({ path: livePath, fullPage: false });
      await local.screenshot({ path: localPath, fullPage: false });
      const liveMetric = await live.evaluate(() => ({ h: document.documentElement.scrollHeight, text: document.body.innerText.length, images: document.images.length }));
      const localMetric = await local.evaluate(() => ({ h: document.documentElement.scrollHeight, text: document.body.innerText.length, images: document.images.length }));
      const mismatch = Math.min(100, Math.round((Math.abs(liveMetric.h - localMetric.h) / Math.max(liveMetric.h, 1)) * 100));
      results.push({ path: routePath, status: "captured", mismatchPercent: mismatch, livePath, localPath, liveMetric, localMetric });
      emit({ type: "visual:route", route: routePath, message: `Visual diff ${routePath}: ${mismatch}%` });
    } catch (error) {
      results.push({ path: routePath, status: "fail", error: error.message });
    } finally {
      await live.close();
      await local.close();
    }
  }
  await context.close();
  return { status: results.some((item) => item.status === "fail") ? "fail" : "pass", routes: results };
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Error("Capture cancelled");
}
