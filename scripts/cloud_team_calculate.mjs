import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBOOK_PATH = path.join(ROOT_DIR, "static", "workbooks", "异环云配队.xlsx");
const XLSX_VENDOR_PATH = path.join(ROOT_DIR, "static", "vendor", "xlsx.full.min.js");
const HYPERFORMULA_VENDOR_PATH = path.join(ROOT_DIR, "static", "vendor", "hyperformula.full.min.js");
const CLOUD_WORKBOOK_PATH = path.join(ROOT_DIR, "static", "cloud", "cloudWorkbook.js");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function installBrowserLikeGlobals() {
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.global = globalThis;
  globalThis.fetch = async () => {
    const buf = fs.readFileSync(WORKBOOK_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => ab,
    };
  };
}

async function main() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    throw new Error(`Workbook not found: ${WORKBOOK_PATH}`);
  }

  const raw = await readStdin();
  const state = raw.trim() ? JSON.parse(raw) : {};

  installBrowserLikeGlobals();
  vm.runInThisContext(fs.readFileSync(XLSX_VENDOR_PATH, "utf8"), { filename: XLSX_VENDOR_PATH });
  vm.runInThisContext(fs.readFileSync(HYPERFORMULA_VENDOR_PATH, "utf8"), { filename: HYPERFORMULA_VENDOR_PATH });

  const { CloudWorkbook } = await import(pathToFileURL(CLOUD_WORKBOOK_PATH).href);
  const wb = await CloudWorkbook.load();
  if (state && typeof state === "object" && Object.keys(state).length) {
    wb.importState(state);
  } else {
    wb.recalc();
  }

  process.stdout.write(`${JSON.stringify(wb.exportResults())}\n`);
}

main().catch((err) => {
  const message = err && typeof err === "object" && "stack" in err ? err.stack : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
