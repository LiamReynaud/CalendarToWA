/**
 * Test Playwright — recherche contact GHL par téléphone.
 * Usage: npx playwright install chrome && node test/ghl-search-playwright.mjs [phone]
 *
 * Profil persistant : test/.ghl-profile/ (connexion Google OK dans Chrome).
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(__dirname, ".ghl-profile");
mkdirSync(PROFILE, { recursive: true });

const PHONE_RAW = process.argv[2] || "+33750346615";
const PHONE = PHONE_RAW.replace(/\s/g, "");
const TAIL = PHONE.replace(/\D/g, "").slice(-6);

function digits(s) {
  return (s || "").replace(/\D/g, "");
}

function locationIdFromUrl(url) {
  const m = String(url || "").match(/\/v2\/location\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function locationHomeUrl(locationId) {
  return `https://app.gohighlevel.com/v2/location/${locationId}/dashboard`;
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function isLoginPage(page) {
  return page
    .getByRole("heading", { name: /Connectez-vous|Sign into your account/i })
    .isVisible()
    .catch(() => false);
}

async function waitForSession(page, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    const loc = locationIdFromUrl(url);
    if (loc) return loc;
    if (!(await isLoginPage(page)) && url.includes("app.gohighlevel.com")) {
      const loc2 = locationIdFromUrl(url);
      if (loc2) return loc2;
    }
    await page.waitForTimeout(800);
  }
  return null;
}

async function findContactsSearch(page) {
  const selectors = [
    'input[placeholder*="Rechercher leads" i]',
    'input[placeholder*="Search leads" i]',
    'input[placeholder*="Quick search" i]',
    'input[placeholder*="Search Contacts" i]',
    'input[placeholder*="Search contacts" i]',
    'input[placeholder*="Rechercher" i]',
    'input[aria-label*="Search" i]',
    'input[aria-label*="Rechercher" i]',
    'input[type="search"]',
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }

  const scored = await page.evaluate(() => {
    let best = null;
    let bestScore = Infinity;
    for (const input of document.querySelectorAll("input")) {
      if (input.type === "password" || input.type === "hidden" || input.type === "email")
        continue;
      const r = input.getBoundingClientRect();
      if (r.width < 40 || r.height < 10) continue;
      const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
      if (/login|mot de passe|password|e-mail|email/.test(label)) continue;
      if (!/search|recherch|contact|phone|quick|nom|name/.test(label) && r.top > 280) continue;
      const score = r.top * 2 + r.left;
      if (score < bestScore) {
        bestScore = score;
        best = input;
      }
    }
    if (!best) return null;
    best.setAttribute("data-ctwa-ghl-search", "1");
    return true;
  });

  if (scored) return page.locator('[data-ctwa-ghl-search="1"]');

  return null;
}

async function runSearch(page) {
  console.log(`\nRecherche: ${PHONE} (suffixe ${TAIL})`);
  console.log(`URL: ${page.url()}`);

  const search = await findContactsSearch(page);
  if (!search) {
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll("input")]
        .filter((i) => i.offsetWidth > 0)
        .slice(0, 15)
        .map((i) => ({
          ph: i.placeholder,
          aria: i.getAttribute("aria-label"),
          type: i.type,
        }))
    );
    console.log("Champs input visibles:", JSON.stringify(inputs, null, 2));
    throw new Error("Champ de recherche contacts introuvable");
  }

  await search.click();
  await search.fill(PHONE);
  await page.waitForTimeout(1500);

  const row = page
    .locator("table tbody tr, [role='listbox'] [role='option'], li")
    .filter({ hasText: TAIL })
    .first();

  if (await row.count()) {
    const link = row.locator('a[href*="/contacts/detail/"]').first();
    if (await link.count()) {
      await link.click();
    } else {
      await row.click();
    }
    await page.waitForTimeout(2000);
    const opened = /\/contacts\/detail\//.test(page.url());
    console.log(opened ? `Fiche ouverte: ${page.url()}` : `Clic effectué, URL: ${page.url()}`);
    return { ok: true, opened, url: page.url() };
  }

  await search.press("Enter");
  await page.waitForTimeout(2000);
  const opened = /\/contacts\/detail\//.test(page.url());
  console.log(`Entrée — URL: ${page.url()}`);
  return { ok: true, opened, url: page.url() };
}

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://app.gohighlevel.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  let locationId = locationIdFromUrl(page.url());

  if (await isLoginPage(page)) {
    console.log(
      "GHL — connecte-toi dans la fenêtre Chrome (Google ou email), puis appuie Entrée ici…"
    );
    await waitForEnter("");
    locationId = await waitForSession(page, 120_000);
  } else {
    locationId = locationId || (await waitForSession(page, 30_000));
  }

  if (!locationId) {
    console.log(
      "Location ID introuvable. Ouvre un sub-account (URL avec /v2/location/…/), puis Entrée…"
    );
    await waitForEnter("");
    locationId = locationIdFromUrl(page.url()) || (await waitForSession(page, 120_000));
  }

  if (!locationId) {
    console.error("Échec: pas de location ID dans l’URL.");
    await context.close();
    process.exit(1);
  }

  console.log(`Location ID: ${locationId}`);
  if (!locationIdFromUrl(page.url())) {
    await page.goto(locationHomeUrl(locationId), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
  }

  const result = await runSearch(page);
  console.log("Résultat:", result);
  console.log("\nFenêtre laissée ouverte 15 s…");
  await page.waitForTimeout(15000);
  await context.close();
  process.exit(result.opened ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
