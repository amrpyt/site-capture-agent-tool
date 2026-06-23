import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReports({ outDir, report }) {
  const reportDir = path.join(outDir, "report");
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(outDir, "capture-state.json"), JSON.stringify(report.state, null, 2), "utf8");
  await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(path.join(reportDir, "index.html"), renderReportHtml(report), "utf8");
}

export function renderReportHtml(report) {
  const routeRows = report.routes
    .map((route) => `<tr><td>${escapeHtml(route.path)}</td><td>${escapeHtml(route.status)}</td><td>${route.images ?? ""}</td><td>${route.failedRequests ?? 0}</td></tr>`)
    .join("");
  const leakRows = report.remoteLeaks
    .slice(0, 100)
    .map((url) => `<li>${escapeHtml(url)}</li>`)
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Capture Report</title>
<style>
body{font-family:Inter,Arial,sans-serif;background:#101214;color:#f4f6f8;margin:0;padding:32px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{border:1px solid #2b3036;border-radius:8px;padding:16px;background:#171b20}
table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #2b3036;padding:10px;text-align:left}code{color:#9ee493}
</style></head><body>
<h1>Capture Report</h1>
<div class="grid">
<div class="card"><strong>Routes</strong><div>${report.routes.length}</div></div>
<div class="card"><strong>Assets</strong><div>${report.assets.length}</div></div>
<div class="card"><strong>Offline</strong><div>${escapeHtml(report.offlineQa?.status || "skipped")}</div></div>
<div class="card"><strong>Visual Diff</strong><div>${escapeHtml(report.visualDiff?.status || "skipped")}</div></div>
</div>
<h2>Routes</h2><table><thead><tr><th>Route</th><th>Status</th><th>Images</th><th>Failed Requests</th></tr></thead><tbody>${routeRows}</tbody></table>
<h2>Remote Leaks</h2><ul>${leakRows || "<li>None detected in QA</li>"}</ul>
</body></html>`;
}

export async function createZipArchive(sourceDir, zipPath) {
  const files = await listFiles(sourceDir);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = path.relative(sourceDir, file).replaceAll("\\", "/");
    const data = await readFile(file);
    const nameBuffer = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);

    const centralRecord = Buffer.alloc(46);
    centralRecord.writeUInt32LE(0x02014b50, 0);
    centralRecord.writeUInt16LE(20, 4);
    centralRecord.writeUInt16LE(20, 6);
    centralRecord.writeUInt16LE(0, 8);
    centralRecord.writeUInt16LE(0, 10);
    centralRecord.writeUInt16LE(0, 12);
    centralRecord.writeUInt16LE(0, 14);
    centralRecord.writeUInt32LE(crc, 16);
    centralRecord.writeUInt32LE(data.length, 20);
    centralRecord.writeUInt32LE(data.length, 24);
    centralRecord.writeUInt16LE(nameBuffer.length, 28);
    centralRecord.writeUInt16LE(0, 30);
    centralRecord.writeUInt16LE(0, 32);
    centralRecord.writeUInt16LE(0, 34);
    centralRecord.writeUInt16LE(0, 36);
    centralRecord.writeUInt32LE(0, 38);
    centralRecord.writeUInt32LE(offset, 42);
    central.push(centralRecord, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(zipPath, Buffer.concat([...chunks, ...central, end]));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    if (entry.isFile() && (await stat(full)).size >= 0) files.push(full);
  }
  return files;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
