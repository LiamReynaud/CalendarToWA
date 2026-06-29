/**
 * ZIP Chrome Web Store : fichiers extension à la racine de l'archive.
 *
 * Usage :
 *   npm run package:chrome-store
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const prefix = "CalendarToWA-chrome-store";
const maxKept = 3;

const INCLUDE = [
  "manifest.json",
  "background.js",
  "lib",
  "content",
  "popup",
  "icons",
];

const STORE_EXCLUDE = [".DS_Store", "Thumbs.db"];

function log(step, msg) {
  console.log(step + " " + msg);
}

function readExtensionVersion() {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  return manifest.version;
}

function assertManifest() {
  const manifestPath = join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

  if (manifest.manifest_version !== 3) {
    throw new Error("manifest_version doit être 3 pour le Chrome Web Store.");
  }
  if (manifest.version !== pkgVersion) {
    throw new Error(
      `Version désalignée : package.json=${pkgVersion}, manifest.json=${manifest.version}.`
    );
  }

  for (const size of ["16", "48", "128"]) {
    const icon = manifest.icons?.[size];
    if (!icon || !existsSync(join(root, icon))) {
      throw new Error(`Icône manquante : ${icon || "icons/icon" + size + ".png"}`);
    }
  }

  for (const rel of ["manifest.json", "background.js", "lib/phone-utils.js"]) {
    if (!existsSync(join(root, rel))) {
      throw new Error(`Fichier requis manquant : ${rel}`);
    }
  }
}

function buildZip() {
  const version = readExtensionVersion();
  const zipName = `${prefix}-${version}.zip`;
  const zipPath = join(distDir, zipName);

  log("→", "Vérification manifest et fichiers…");
  assertManifest();

  mkdirSync(distDir, { recursive: true });
  if (existsSync(zipPath)) unlinkSync(zipPath);

  const missing = INCLUDE.filter((rel) => !existsSync(join(root, rel)));
  if (missing.length) {
    throw new Error(`Chemins manquants pour le zip : ${missing.join(", ")}`);
  }

  const excludeArgs = STORE_EXCLUDE.flatMap((name) => [
    "-x",
    JSON.stringify(name),
    "-x",
    JSON.stringify("*/" + name),
  ]);

  log("→", "Création " + zipName + " (manifest à la racine)…");
  execSync(
    `zip -r -q ${JSON.stringify(zipPath)} ${INCLUDE.map((p) => JSON.stringify(p)).join(" ")} ${excludeArgs.join(" ")}`,
    { cwd: root, stdio: "inherit" }
  );

  const sizeKb = Math.round(statSync(zipPath).size / 1024);
  const ciZipPath = join(distDir, "extension.zip");
  copyFileSync(zipPath, ciZipPath);

  const releaseDir = join(root, "store", "release", version);
  mkdirSync(releaseDir, { recursive: true });
  const releaseZip = join(releaseDir, zipName);
  copyFileSync(zipPath, releaseZip);

  log("✅", `Archive Chrome Web Store : ${zipPath} (${sizeKb} Ko)`);
  log("✅", `Copie CI : ${ciZipPath}`);
  log("✅", `Copie première release : ${releaseZip}`);
  log("ℹ️", "Upload manuel : store/release/" + version + "/ — ou npm run publish:chrome-store");
}

function pruneLocalZips() {
  if (!existsSync(distDir)) return;
  const zipNameRe = new RegExp(
    "^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d+\\.\\d+\\.\\d+\\.zip$"
  );
  const zips = readdirSync(distDir)
    .filter((name) => zipNameRe.test(name))
    .map((name) => ({
      name,
      path: join(distDir, name),
      mtime: statSync(join(distDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of zips.slice(maxKept)) {
    unlinkSync(f.path);
    log("🗑️", "Local supprimé : " + f.name);
  }
}

buildZip();
pruneLocalZips();
