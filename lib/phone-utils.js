/**
 * Détection et normalisation de numéros de téléphone (FR + international).
 * Exposé sur window.CalendarToWA pour les content scripts.
 */
(function () {
  const PHONE_PATTERNS = [
    /\+(?:\d[\s.\-]?){8,14}\d/g,
    /\b0[1-9](?:[\s.\-]?\d{2}){4}\b/g,
    /\b0[1-9]\d{8}\b/g,
  ];

  const DIAL_IN_LINE_PATTERNS = [
    /rejoindre\s+par\s+t[ée]l[ée]phone/i,
    /join\s+by\s+phone/i,
    /dial[- ]?in/i,
    /composer\s+(le\s+|un\s+)?[\d\s]/i,
    /\(\s*(FR|US|BE|UK|DE|CH)\s*\)\s*\+?\d/i,
    /pin\s*[:#]\s*\d/i,
    /#\s*\d[\d\s]{3,}#?$/,
  ];

  const DIAL_IN_PREVIOUS_LINE = [
    /^rejoindre\s+par\s+t[ée]l[ée]phone/i,
    /^join\s+by\s+phone/i,
    /^num[ée]ro\s+(de\s+)?t[ée]l[ée]phone/i,
    /^phone\s+numbers?$/i,
  ];

  function getLineAt(text, index, length) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const lineEnd = text.indexOf("\n", index + length);
    return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  }

  function getPreviousLine(text, index) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    if (lineStart <= 0) return "";
    const prevEnd = lineStart - 1;
    const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1;
    return text.slice(prevStart, prevEnd);
  }

  function countPhonesInText(text) {
    let count = 0;
    for (const source of PHONE_PATTERNS) {
      const pattern = new RegExp(source.source, source.flags);
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }

  function isContactPhoneLine(line) {
    const trimmed = line.trim();
    return (
      (/^(num[ée]ro|t[ée]l[ée]phone|phone|mobile|tel\.?|whatsapp|contact)\s*:+/i.test(
        trimmed
      ) ||
        /n[°º]?\s*(de\s+)?t[ée]l[ée]phone\s*:/i.test(trimmed)) &&
      /\d/.test(trimmed)
    );
  }

  function isFrenchLandline(rawPhone, defaultCountryCode = "33") {
    if (defaultCountryCode !== "33") return false;
    const digits = rawPhone.replace(/\D/g, "");
    let national = digits;
    if (digits.startsWith("0033")) national = "0" + digits.slice(4);
    else if (digits.startsWith("33") && digits.length >= 11)
      national = "0" + digits.slice(2);
    return /^0[1-59]\d{8}$/.test(national);
  }

  function isMeetingDialInContext(text, index, length) {
    const line = getLineAt(text, index, length);
    const prevLine = getPreviousLine(text, index);

    if (isContactPhoneLine(line)) return false;

    if (DIAL_IN_LINE_PATTERNS.some((re) => re.test(line))) return true;

    if (DIAL_IN_PREVIOUS_LINE.some((re) => re.test(prevLine.trim()))) return true;

    if (countPhonesInText(line) >= 2) return true;

    return false;
  }

  function extractPhones(text, options = {}) {
    const { excludeMeetingDialIn = true, defaultCountryCode = "33" } = options;
    if (!text || typeof text !== "string") return [];

    const found = new Set();
    for (const pattern of PHONE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = match[0].trim();
        const digits = raw.replace(/\D/g, "");
        if (digits.length < 9 || digits.length > 15) continue;

        const line = getLineAt(text, match.index, match[0].length);

        if (excludeMeetingDialIn) {
          if (isMeetingDialInContext(text, match.index, match[0].length)) continue;
          if (isFrenchLandline(raw, defaultCountryCode) && !isContactPhoneLine(line))
            continue;
        }

        found.add(raw);
      }
    }
    return [...found];
  }

  function normalizeForWhatsApp(rawPhone, defaultCountryCode = "33") {
    let digits = rawPhone.replace(/\D/g, "");
    if (!digits) return null;

    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length === 10) {
      digits = defaultCountryCode + digits.slice(1);
    } else if (digits.length === 9 && /^[67]/.test(digits)) {
      digits = defaultCountryCode + digits;
    }

    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
  }

  function formatDisplay(rawPhone) {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10 && digits.startsWith("0")) {
      return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    }
    if (rawPhone.startsWith("+")) return rawPhone;
    return "+" + digits;
  }

  const COUNTRY_CODES = [
    "998", "996", "995", "994", "993", "992", "977", "976", "975", "974",
    "973", "972", "971", "970", "968", "967", "966", "965", "964", "963",
    "962", "961", "960", "886", "880", "856", "855", "853", "852", "850",
    "692", "691", "690", "689", "688", "687", "686", "685", "683", "682",
    "681", "680", "679", "678", "677", "676", "675", "674", "673", "672",
    "670", "599", "598", "597", "596", "595", "594", "593", "592", "591",
    "590", "509", "508", "507", "506", "505", "504", "503", "502", "501",
    "423", "421", "420", "389", "387", "386", "385", "383", "382", "381",
    "380", "378", "377", "376", "375", "374", "373", "372", "371", "370",
    "359", "358", "357", "356", "355", "354", "353", "352", "351", "49",
    "48", "47", "46", "45", "44", "43", "41", "40", "39", "36", "34", "33",
    "32", "31", "30", "27", "20", "7", "1",
  ];

  function parsePhoneParts(normalized, defaultCountryCode = "33") {
    const digits = String(normalized).replace(/\D/g, "");
    if (!digits) return { countryCode: defaultCountryCode, nationalNumber: "" };

    for (const code of COUNTRY_CODES) {
      if (digits.startsWith(code)) {
        const national = digits.slice(code.length);
        if (national.length >= 6 && national.length <= 12) {
          return { countryCode: code, nationalNumber: national };
        }
      }
    }

    if (digits.startsWith(defaultCountryCode)) {
      return {
        countryCode: defaultCountryCode,
        nationalNumber: digits.slice(defaultCountryCode.length),
      };
    }

    return { countryCode: defaultCountryCode, nationalNumber: digits };
  }

  const SKIP_NAME_LINE =
    /^(organisateur|organizer|invités?|\d+\s+(invités?|oui|en attente)|nom d['']?événement|lieu:|http|www\.|@|\d+$|prendre des notes|participer|créer un|définir votre|alimenté par|annuler:|replanifier:|synchroniser)/i;

  function looksLikePersonName(str) {
    const s = str.trim();
    if (s.length < 3 || s.length > 50) return false;
    if (SKIP_NAME_LINE.test(s)) return false;
    if (/https?:\/\//.test(s) || /@/.test(s)) return false;
    if (/^\d/.test(s)) return false;
    if (!/[A-Za-zÀ-ÿ]/.test(s)) return false;
    if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.test(s))
      return false;
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\-'\s]{0,48}[A-Za-zÀ-ÿ.]?$/.test(s);
  }

  function splitCompoundTitle(title) {
    if (!title) return [];
    return title
      .split(/\s+et\s+|\s*,\s*|\s+\/\s+|\s+&\s+/i)
      .map((s) => s.trim())
      .filter(looksLikePersonName);
  }

  function stripEmojis(str) {
    return str
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const MEETING_TITLE_PREFIX =
    /^(réunion|reunion|meeting|appel|visio|call|sync|rdv|rendez-vous|entretien)$/i;

  function extractNamesFromTitle(title) {
    if (!title) return [];
    const cleaned = stripEmojis(title);

    const colonParts = cleaned.match(/^([^:]+):\s*(.+)$/);
    if (colonParts) {
      const prefix = colonParts[1].trim();
      if (looksLikePersonName(prefix) && !MEETING_TITLE_PREFIX.test(prefix)) {
        const fromPrefix = splitCompoundTitle(prefix);
        if (fromPrefix.length) return fromPrefix;
      }
    }

    const dashParts = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dashParts) {
      const prefix = dashParts[1].trim();
      if (looksLikePersonName(prefix) && !MEETING_TITLE_PREFIX.test(prefix)) {
        const fromPrefix = splitCompoundTitle(prefix);
        if (fromPrefix.length) return fromPrefix;
      }
    }

    return splitCompoundTitle(cleaned);
  }

  function extractNamesFromText(text) {
    const names = new Set();
    const lines = text.split("\n");
    let inGuestSection = false;

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;

      if (/\d+\s+invités?/i.test(t)) {
        inGuestSection = true;
        continue;
      }

      if (inGuestSection) {
        if (/^(lieu:|nom d['']?événement|http|participer|prendre|num[ée]ro|peux-tu|qu[''])/i.test(t))
          break;
        if (/^\d+\s+(oui|en attente)/i.test(t)) continue;
        if (/^(organisateur|organizer)$/i.test(t)) continue;
        if (looksLikePersonName(t)) names.add(t);
      }
    }

    return [...names];
  }

  function extractAttendeeNames(title, text) {
    const names = new Set();
    extractNamesFromTitle(title).forEach((n) => names.add(n));
    extractNamesFromText(text).forEach((n) => names.add(n));
    return [...names];
  }

  function formatSuffixForWhatsApp(suffix) {
    const s = (suffix || "").trim();
    if (!s) return "";
    if (s.startsWith("[") && s.endsWith("]")) return s;
    return `[${s}]`;
  }

  window.CalendarToWA = {
    extractPhones,
    normalizeForWhatsApp,
    formatDisplay,
    parsePhoneParts,
    extractAttendeeNames,
    formatSuffixForWhatsApp,
    isMeetingDialInContext,
    isFrenchLandline,
    isContactPhoneLine,
  };
})();
