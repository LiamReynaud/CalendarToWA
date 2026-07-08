/**
 * Diagnostic offline — reproduit la logique v1.7.0 sans Chrome.
 * Usage: node test/diagnostic.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
globalThis.window = globalThis;

const phoneUtilsSrc = readFileSync(join(__dirname, "../lib/phone-utils.js"), "utf8");
eval(phoneUtilsSrc);

const { extractPhones, normalizeForWhatsApp, extractAttendeeNames, extractPipedriveContacts, extractPipedriveDealName } = globalThis.CalendarToWA;

const SAMPLES = {
  ybs_calendly: `Aina Rajaonarivony et Renaud YBS
Numéro :: +33 6 88 04 47 94
Rejoindre par téléphone
(FR) +33 1 87 40 23 94 PIN: 123456789#`,

  alegria: `Jean Ferat
N° de téléphone: +33 6 01 00 45 13
Rejoindre par téléphone
(FR) +33 1 84 88 03 41 PIN: 987654321#`,

  no_phone: `Réunion interne
Sans numéro de contact`,

  pipedrive: `visio 2
Deal: Cris
Participants:
Contact: Cris, Phone: 33613424420`,
};

console.log("=== extractPhones (excludeMeetingDialIn: true) ===\n");

for (const [name, text] of Object.entries(SAMPLES)) {
  const phones = extractPhones(text, {
    excludeMeetingDialIn: true,
    defaultCountryCode: "33",
  });
  const normalized = phones.map((p) => normalizeForWhatsApp(p, "33"));
  console.log(`${name}:`);
  console.log(`  raw: ${JSON.stringify(phones)}`);
  console.log(`  wa:  ${JSON.stringify(normalized)}`);
  console.log(`  widget would show: ${phones.length > 0 ? "YES" : "NO"}`);
  console.log();
}

// isContactPhoneLine edge cases (via extractPhones — contact kept, dial-in excluded)
const contactSamples = {
  calendly: "Numéro :: +33 6 88 04 47 94\n(FR) +33 1 87 40 23 94",
  alegria: "N° de téléphone: +33 6 01 00 45 13\n(FR) +33 1 84 88 03 41",
  simple: "Téléphone: 06 01 00 45 13",
};
console.log("=== contact line detection (via extractPhones) ===\n");
for (const [name, text] of Object.entries(contactSamples)) {
  const phones = extractPhones(text, { excludeMeetingDialIn: true, defaultCountryCode: "33" });
  console.log(`  ${phones.length === 1 ? "OK" : "FAIL"} — ${name}: ${JSON.stringify(phones)}`);
}

// perf: 100 scans like calendar tick()
const bigText = SAMPLES.alegria + "\n" + "x".repeat(7500);
const t0 = Date.now();
for (let i = 0; i < 100; i++) {
  extractPhones(bigText.slice(0, 8000), { excludeMeetingDialIn: true, defaultCountryCode: "33" });
}
console.log(`\n100× extractPhones (8k chars): ${Date.now() - t0}ms`);

console.log("\n=== extractAttendeeNames (titres Alegria / YBS) ===\n");
const titleSamples = {
  alegria_colon: "Karelle Mergez: 📹 Appel de découverte",
  alegria_ferat: "Jean Ferat: 🎦 Appel de découverte",
  ybs_et: "Aina Rajaonarivony et Renaud YBS",
  reunion_only: "Réunion: Point hebdo",
};
for (const [name, title] of Object.entries(titleSamples)) {
  const names = extractAttendeeNames(title, "");
  console.log(`  ${name}: ${JSON.stringify(names)}`);
}

console.log("\n=== Pipedrive sync (Contact / Phone) ===\n");
const pd = SAMPLES.pipedrive;
console.log(`  phones: ${JSON.stringify(extractPhones(pd, { excludeMeetingDialIn: true, defaultCountryCode: "33" }))}`);
console.log(`  names: ${JSON.stringify(extractAttendeeNames("visio 2", pd))}`);
console.log(`  pipedrive: ${JSON.stringify(extractPipedriveContacts(pd))}`);
console.log(`  deal name: ${JSON.stringify(extractPipedriveDealName(pd))}`);
console.log(`  widget would show: ${extractPhones(pd, { excludeMeetingDialIn: true, defaultCountryCode: "33" }).length > 0 ? "YES" : "NO"}`);
