/**
 * Test Playwright — recherche lead Meridian (simule le flux extension).
 * Usage: npx playwright install chrome && node test/meridian-search-playwright.mjs [phoneDigits]
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(__dirname, ".mer-profile");
mkdirSync(PROFILE, { recursive: true });

const PHONE = process.argv[2] || "33757535343";
const RDV_URL =
  "https://studio.meridian-partner.net/closing/rdv/01KZCB6XQ58KNR7Q0V4GVDP7HG";

function digits(s) {
  return (s || "").replace(/\D/g, "");
}

async function runSearchFlow(page, label) {
  console.log(`\n=== ${label} ===`);

  const hasInput = await page.evaluate(() => {
    const match = (input) => {
      if (!input || input.type === "hidden" || input.type === "checkbox") return false;
      const ph = (input.placeholder || input.getAttribute("aria-label") || "").toLowerCase();
      return /nom ou t[eé]l[eé]phone|nom ou telephone/.test(ph);
    };
    return [...document.querySelectorAll("input")].some((input) => {
      const visible = input.offsetWidth > 0 && input.offsetHeight > 0;
      return visible && match(input);
    });
  });

  if (!hasInput) {
    console.log("Pas de champ visible → clic « Rechercher un lead… »");
    await page.getByRole("button", { name: /Rechercher un lead/i }).click();
    await page.waitForTimeout(400);
  }

  const search = page.getByRole("searchbox", { name: /Nom ou téléphone/i });
  await search.waitFor({ state: "visible", timeout: 10000 });
  await search.fill(PHONE);
  await page.waitForTimeout(1200);

  const result = page.locator('[role="dialog"] li, table tbody tr').filter({
    hasText: PHONE.slice(-6),
  });
  const count = await result.count();
  console.log(`Résultats: ${count}`);

  const openLink = page
    .locator('[role="dialog"] a[href*="/closing/leads/"], table tbody tr a[href*="/closing/leads/"]')
    .first();
  if (await openLink.count()) {
    const href = await openLink.getAttribute("href");
    await openLink.click();
    await page.waitForTimeout(1500);
    console.log(`Fiche ouverte: ${page.url()}`);
    return { ok: true, opened: /\/closing\/leads\//.test(page.url()), href };
  }

  return { ok: count > 0, opened: false };
}

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto(RDV_URL, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    console.log("Connecte-toi à Meridian dans la fenêtre, puis relance le script.");
    await page.waitForTimeout(60000);
    await context.close();
    return;
  }

  const rdv = await runSearchFlow(page, "Page RDV (onglet réutilisé)");
  console.log("Résultat RDV:", rdv);

  await page.goto("https://studio.meridian-partner.net/closing/leads", {
    waitUntil: "domcontentloaded",
  });
  const leads = await runSearchFlow(page, "Page leads");
  console.log("Résultat leads:", leads);

  const success = rdv.opened && leads.opened;
  console.log(success ? "\nOK — recherche Meridian validée" : "\nÉCHEC — voir logs");
  await page.waitForTimeout(5000);
  await context.close();
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
