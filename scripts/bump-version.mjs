/**
 * Bump semver A.B.C — source de vérité : manifest.json
 *
 *   node scripts/bump-version.mjs patch   → +C (local)
 *   node scripts/bump-version.mjs cws     → +B, C=0 (déploiement store)
 *   node scripts/bump-version.mjs major   → +A (sur demande explicite)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2] || "patch";

function bump(v, which) {
  const parts = v.split(".").map((n) => parseInt(n, 10) || 0);
  if (which === "major") return [parts[0] + 1, 0, 0].join(".");
  if (which === "minor") return [parts[0], parts[1] + 1, 0].join(".");
  return [parts[0], parts[1], parts[2] + 1].join(".");
}

const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const prev = manifest.version;

const which =
  kind === "cws" ? "minor" : kind === "major" ? "major" : "patch";
if (!["patch", "cws", "major"].includes(kind)) {
  console.error("Usage: bump-version.mjs patch|cws|major");
  process.exit(1);
}

const next = bump(prev, which);
manifest.version = next;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const waPath = path.join(root, "content/whatsapp.js");
let waJs = fs.readFileSync(waPath, "utf8");
waJs = waJs.replace(
  /const SCRIPT_ID = "[^"]+";/,
  `const SCRIPT_ID = "${next}-wa";`
);
fs.writeFileSync(waPath, waJs, "utf8");

console.log(`version: ${prev} → ${next} (${kind})`);
execSync("node scripts/check-versions.mjs", { cwd: root, stdio: "inherit" });
