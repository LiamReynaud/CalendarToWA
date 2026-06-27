/**
 * Test manuel Playwright — flux recherche WA (sans extension).
 * Usage: npx playwright install chrome && node test/wa-playwright.mjs
 *
 * Connecte-toi à WA Web au premier lancement (QR code).
 * Le profil est sauvegardé dans test/.wa-profile/
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(__dirname, ".wa-profile");
mkdirSync(PROFILE, { recursive: true });

const PHONE = process.argv[2] || "+33 7 51 56 03 20";

function digits(s) {
  return (s || "").replace(/\D/g, "");
}

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
  console.log("WA Web ouvert — connecte-toi si besoin, puis appuie Entrée…");
  await page.waitForTimeout(3000);

  const newChat = page.locator('[data-testid="new-chat-outline"]').first();
  await newChat.waitFor({ state: "visible", timeout: 120000 });
  await newChat.click();
  await page.waitForTimeout(800);

  const search = page.locator(
    'input[aria-label="Rechercher un nom ou un numéro"], input[aria-label="Search name or number"]'
  ).last();
  await search.fill(PHONE);
  await page.waitForTimeout(2000);

  const targetDigits = digits(PHONE);
  const row = page.locator('#pane-side [data-testid="cell-frame-container"]').filter({
    has: page.locator('[data-testid="cell-frame-title"]'),
  });

  let clicked = false;
  const count = await row.count();
  console.log(`Lignes trouvées: ${count}`);

  for (let i = 0; i < count; i++) {
    const el = row.nth(i);
    const text = await el.locator('[data-testid="cell-frame-title"]').innerText();
    const d = digits(text);
    if (d === targetDigits || d.endsWith(targetDigits) || targetDigits.endsWith(d)) {
      console.log(`Clic sur: ${text.trim()}`);
      await el.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    console.log("Clic clavier ↓ + Entrée…");
    await search.press("ArrowDown");
    await page.waitForTimeout(300);
    await search.press("Enter");
  }

  await page.waitForTimeout(2000);
  const header = await page
    .locator('[data-testid="conversation-info-header-chat-title"]')
    .innerText()
    .catch(() => "?");
  console.log("Header après ouverture:", header.trim());
  console.log("Match numéro:", digits(header).includes(targetDigits.slice(-9)));

  console.log("\nFenêtre laissée ouverte 30s pour inspection…");
  await page.waitForTimeout(30000);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
