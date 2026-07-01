/**
 * Vérifie manifest.json ↔ package.json ↔ content/whatsapp.js SCRIPT_ID
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const waJs = fs.readFileSync(path.join(root, "content/whatsapp.js"), "utf8");

const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`manifest.json version invalide: ${version}`);
}
if (pkg.version !== version) {
  fail(`package.json v${pkg.version} ≠ manifest v${version}`);
}

const scriptMatch = waJs.match(/const SCRIPT_ID = "([^"]+)"/);
const expectedScriptId = `${version}-wa`;
if (!scriptMatch || scriptMatch[1] !== expectedScriptId) {
  fail(
    `whatsapp.js SCRIPT_ID "${scriptMatch?.[1] || "?"}" ≠ "${expectedScriptId}"`
  );
}

console.log(`OK versions — extension v${version}`);
