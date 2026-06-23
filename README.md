# site-capture-agent-tool

Standalone Playwright CLI that captures a rendered website into static files for agent review, migration, or backup.

## Use

```bash
npx site-capture-agent-tool https://example.com --out .artifacts/example --max-pages 20
```

Local repo use:

```bash
npm install
npm run capture -- https://example.com --out .artifacts/example
```

If Playwright says Chromium is missing, then run:

```bash
npx playwright install chromium
```

## For AI agents

Use this when you need a local static copy of a rendered website before editing, auditing, or migrating it.

Before downloading anything, check the local machine first. Do not install Chromium unless capture fails with a missing-browser error.

Recommended command:

```bash
npx site-capture-agent-tool <url> --out .artifacts/site-capture --max-pages 40 --offline-qa
```

Important outputs:

- `.artifacts/site-capture/site/` - captured static website
- `.artifacts/site-capture/report.json` - machine-readable capture report
- `.artifacts/site-capture/report/index.html` - human-readable report
- `.artifacts/site-capture/capture-state.json` - crawl state

## Options

```text
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
--port <n>                  Local preview port
```

## Notes

This tool captures public rendered pages and static assets. It is not a login/session scraper and should not be used on private data without permission.
