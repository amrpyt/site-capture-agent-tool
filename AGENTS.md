# AGENTS.md

Use this repo when you need to copy/capture a public rendered website into local static files before review, migration, QA, or redesign work.

## Command

```bash
npm install
npm run capture -- <url> --out .artifacts/site-capture --max-pages 40 --offline-qa
```

If capture fails because Playwright cannot find Chromium, then run:

```bash
npx playwright install chromium
```

## Read These Outputs

- `.artifacts/site-capture/site/` is the captured static website.
- `.artifacts/site-capture/report.json` is the machine-readable result.
- `.artifacts/site-capture/report/index.html` is the readable report.

## Rules

- Capture only sites you are allowed to inspect.
- Do not use this as a private data scraper.
- Check what is already installed before downloading browsers or packages.
- Never run `npx playwright install chromium` unless the local capture fails with a missing-browser error.
- Prefer small limits first: `--max-pages 10`.
- Increase limits only when the first capture proves useful.
