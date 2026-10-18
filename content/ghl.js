(function () {
  const SCRIPT_ID = "1.15.0-ghl";
  if (window.__CTWA_GHL_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_GHL_SCRIPT__ = SCRIPT_ID;

  let fillInFlight = null;

  const LOCATION_ID_RE = /\/v2\/location\/([A-Za-z0-9]+)/;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function phoneMatches(want, have) {
    if (!want || !have) return false;
    return have === want || have.endsWith(want) || want.endsWith(have);
  }

  function getLocationIdFromUrl(url) {
    const m = String(url || location.href).match(LOCATION_ID_RE);
    return m ? m[1] : null;
  }

  function persistLocationId(locationId) {
    if (!locationId) return;
    try {
      chrome.storage.local.set({ ghlLastLocationId: locationId });
    } catch {
      /* extension context */
    }
  }

  function isGhlLocationAppPage() {
    return LOCATION_ID_RE.test(location.pathname);
  }

  function isContactsListPage() {
    return /\/contacts\/smart_list\//.test(location.pathname);
  }

  function isContactDetailPage() {
    return /\/contacts\/detail\//.test(location.pathname);
  }

  /** Pas de navigation : le champ « Rechercher leads » est dispo sur les pages location. */
  async function ensureReadyForSearch() {
    const locationId = getLocationIdFromUrl(location.href);
    if (!locationId) {
      return { ok: false, reason: "no_location_id" };
    }
    persistLocationId(locationId);

    if (!isGhlLocationAppPage()) {
      return { ok: false, reason: "not_in_location_app" };
    }
    return { ok: true, reason: "ready" };
  }

  function isInlineLeadsSearchInput(input) {
    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
    return /rechercher leads|search leads/.test(label);
  }

  function isGlobalLeadSearchInput(input) {
    if (!input || input.getAttribute("role") !== "combobox") return false;
    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
    if (/search for lead|rechercher.*lead|lead search/.test(label)) return true;
    const dialog = input.closest('[role="dialog"]');
    if (!dialog) return false;
    return /recherche g[eé]n[eé]rale|general search/.test(dialog.textContent || "");
  }

  function isContactsSearchInput(input) {
    if (!input || input.disabled || input.readOnly) return false;
    if (input.type === "password" || input.type === "email" || input.type === "hidden") {
      return false;
    }

    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""} ${input.name || ""}`.toLowerCase();

    if (/login|e-mail|email|mot de passe|password/.test(label)) return false;
    if (/rechercher des champs|fields and folders|dossiers/.test(label)) return false;
    if (/rechercher pipelines|search pipelines|pipeline/.test(label)) return false;

    if (isInlineLeadsSearchInput(input) || isGlobalLeadSearchInput(input)) return true;

    if (
      /search|recherch|contact|phone|t[eé]l[eé]phone|name|nom|quick/.test(label)
    ) {
      return true;
    }

    if (input.closest('[role="dialog"]')) {
      return /search|recherch|contact|phone|nom/.test(label);
    }

    if (input.closest("table thead, table tfoot")) return false;

    const rect = input.getBoundingClientRect();
    if (rect.top > window.innerHeight) return false;

    if (/rechercher leads|search leads/.test(label)) return true;

    return isGhlLocationAppPage() && isContactsListPage() && rect.top < 420;
  }

  function scoreContactsSearchInput(input) {
    const rect = input.getBoundingClientRect();
    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
    let score = rect.top * 2 + rect.left;

    if (/rechercher leads|search leads/.test(label)) score -= 8000;
    else if (/quick search|recherche rapide/.test(label)) score -= 6000;
    else if (/search contacts|rechercher des contacts|contacts/.test(label)) score -= 5000;
    else if (/search|recherch|phone|t[eé]l/.test(label)) score -= 3000;
    if (input.closest("header, nav, [role='banner'], aside")) score -= 500;
    if (input.closest("table thead, table tfoot")) score += 8000;

    return score;
  }

  function findGlobalSearchDialog() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (!isVisible(dialog)) continue;
      const text = (dialog.textContent || "").toLowerCase();
      if (!/recherche g[eé]n[eé]rale|general search/.test(text)) continue;
      if (dialog.querySelector('input[role="combobox"], input[placeholder*="Lead" i]')) {
        return dialog;
      }
    }
    return null;
  }

  function findGlobalLeadSearchInput() {
    const dialog = findGlobalSearchDialog();
    if (dialog) {
      for (const input of dialog.querySelectorAll('input[role="combobox"], input[type="text"], input[type="search"]')) {
        if (!isVisible(input)) continue;
        if (isGlobalLeadSearchInput(input)) return input;
      }
      const combo = dialog.querySelector('input[role="combobox"]');
      if (combo && isVisible(combo)) return combo;
    }

    for (const input of document.querySelectorAll(
      'input[role="combobox"][placeholder*="Lead" i], input[placeholder*="Search for Lead" i]'
    )) {
      if (isVisible(input) && isGlobalLeadSearchInput(input)) return input;
    }
    return null;
  }

  function findSidebarSearchTrigger() {
    const shortcutHint = document.querySelector(
      '[aria-label*="⌘"], [aria-label*="Ctrl"], [title*="⌘"], [title*="Ctrl"]'
    );
    if (shortcutHint) {
      const clickTarget =
        shortcutHint.closest("[class*='cursor'], button, a, div") ||
        shortcutHint.parentElement;
      if (clickTarget && isVisible(clickTarget)) return clickTarget;
    }

    const root =
      document.querySelector('[role="complementary"]') ||
      document.querySelector("aside") ||
      document.querySelector("complementary");
    if (!root) return null;

    for (const el of root.querySelectorAll("div, button, span")) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Rechercher/i.test(text)) continue;
      if (text.includes("⌘") || text.includes("Ctrl") || text.includes("K")) {
        return el.closest("div[class], button") || el;
      }
    }

    for (const el of root.querySelectorAll("*")) {
      if (!isVisible(el)) continue;
      if ((el.textContent || "").trim() === "Rechercher") {
        const block = el.parentElement;
        if (block && (block.textContent || "").includes("K")) return block;
      }
    }
    return null;
  }

  function dispatchGlobalSearchShortcut() {
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || "");
    const eventInit = {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    };
    for (const target of [window, document, document.body]) {
      if (!target) continue;
      target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    }
  }

  async function openGlobalLeadSearch() {
    if (findGlobalLeadSearchInput()) return true;

    const trigger = findSidebarSearchTrigger();
    if (trigger) {
      trigger.click();
      for (let i = 0; i < 25; i++) {
        if (findGlobalLeadSearchInput()) return true;
        await sleep(100);
      }
    }

    dispatchGlobalSearchShortcut();
    for (let i = 0; i < 20; i++) {
      if (findGlobalLeadSearchInput()) return true;
      await sleep(100);
    }
    return !!findGlobalLeadSearchInput();
  }

  function findInlineLeadsSearchInput() {
    for (const sel of [
      'input[placeholder*="Rechercher leads"]',
      'input[placeholder*="Search leads"]',
    ]) {
      for (const input of document.querySelectorAll(sel)) {
        if (isInlineLeadsSearchInput(input) && isVisible(input)) return input;
      }
    }
    return null;
  }

  function findContactsSearchInput() {
    const inline = findInlineLeadsSearchInput();
    if (inline) return inline;

    const global = findGlobalLeadSearchInput();
    if (global) return global;

    const specificSelectors = [
      'input[placeholder*="Rechercher leads"]',
      'input[placeholder*="Search leads"]',
      'input[placeholder*="Quick search"]',
      'input[placeholder*="quick search"]',
      'input[placeholder*="Search Contacts"]',
      'input[placeholder*="Search contacts"]',
      'input[placeholder*="Rechercher"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="Search"]',
      'input[aria-label*="Rechercher"]',
      'input[aria-label*="contact"]',
      'input[aria-label*="Contact"]',
      'input[type="search"]',
      'input[name="search"]',
      'input[name="query"]',
    ];

    let best = null;
    let bestScore = Infinity;

    for (const sel of specificSelectors) {
      for (const input of document.querySelectorAll(sel)) {
        if (!isContactsSearchInput(input)) continue;
        const score = scoreContactsSearchInput(input);
        if (score < bestScore) {
          bestScore = score;
          best = input;
        }
      }
    }

    if (best) return best;

    for (const input of document.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type])'
    )) {
      if (!isContactsSearchInput(input)) continue;
      const score = scoreContactsSearchInput(input);
      if (score < bestScore) {
        bestScore = score;
        best = input;
      }
    }

    return best;
  }

  function getSearchInputDisplayValue(input) {
    return input?.value || input?.getAttribute("value") || "";
  }

  function isAlreadyFilled(input, query) {
    const want = digitsOnly(query);
    if (!want || !input) return false;
    return phoneMatches(want, digitsOnly(getSearchInputDisplayValue(input)));
  }

  async function clearSearchInput(input) {
    if (!input) return;
    input.focus();
    input.select?.();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeSetter) nativeSetter.call(input, "");
    else input.value = "";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillSearchInput(input, text) {
    if (!input || !text) return false;
    input.focus();
    input.click?.();
    await clearSearchInput(input);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    if (input.getAttribute("role") === "combobox") {
      for (const ch of text) {
        const next = `${getSearchInputDisplayValue(input)}${ch}`;
        if (nativeSetter) nativeSetter.call(input, next);
        else input.value = next;
        input.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: ch,
            inputType: "insertText",
          })
        );
        await sleep(25);
      }
    } else {
      try {
        document.execCommand("insertText", false, text);
      } catch {
        /* execCommand may be unavailable */
      }
      if (nativeSetter) nativeSetter.call(input, text);
      else input.value = text;
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        })
      );
    }

    input.dispatchEvent(new Event("change", { bubbles: true }));
    return isAlreadyFilled(input, text);
  }

  function rowMatchesQuery(row, query) {
    const want = digitsOnly(query);
    if (!want) return false;

    const telLink = row.querySelector('a[href^="tel:"]');
    const telDigits = digitsOnly(telLink?.textContent || telLink?.getAttribute("href"));
    if (phoneMatches(want, telDigits)) return true;

    return phoneMatches(want, digitsOnly(row.textContent || ""));
  }

  function collectContactSearchTargets(query) {
    const targets = [];

    for (const row of document.querySelectorAll(
      "table tbody tr, [role='grid'] [role='row']:not([role='columnheader'])"
    )) {
      if (!isVisible(row) || !rowMatchesQuery(row, query)) continue;
      targets.push(row);
    }

    const resultSelectors = [
      '[role="listbox"] [role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[class*="autocomplete"] li',
      '[class*="typeahead"] li',
      '[class*="search-result"]',
    ];

    for (const sel of resultSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el) || !rowMatchesQuery(el, query)) continue;
        if (targets.some((target) => target.contains(el))) continue;
        targets.push(el);
      }
    }

    if (targets.length === 0) {
      for (const link of document.querySelectorAll('a[href*="/contacts/detail/"]')) {
        if (!isVisible(link)) continue;
        const container =
          link.closest(
            'tr, [role="row"], li, [role="option"], [role="menuitem"], [role="gridcell"], [class*="result"], [class*="search"]'
          ) || link.parentElement;
        if (!container || !rowMatchesQuery(container, query)) continue;
        if (targets.some((target) => target.contains(link))) continue;
        targets.push(container);
      }
    }

    return targets;
  }

  async function submitContactSearch(input) {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      })
    );
    await sleep(120);
  }

  async function clickGlobalSearchResult(query, input) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const options = [...document.querySelectorAll('[role="listbox"] [role="option"], [role="dialog"] [role="option"]')].filter(
        (el) => isVisible(el) && rowMatchesQuery(el, query)
      );

      if (options.length >= 1) {
        const want = digitsOnly(query);
        const leadOption =
          options.find((el) => {
            const t = digitsOnly(el.textContent || "");
            return want && phoneMatches(want, t);
          }) ||
          options.find((el) => /\+?\d/.test(el.textContent || "")) ||
          options[0];
        leadOption.click();
        await sleep(350);

        if (input) {
          input.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
            })
          );
        }

        for (const btn of document.querySelectorAll('[role="dialog"] button, [role="option"] button')) {
          if (!isVisible(btn)) continue;
          if (/ouvrir|^open$/i.test((btn.textContent || "").trim())) {
            btn.click();
            break;
          }
        }

        await sleep(1200);
        if (isContactDetailPage()) return true;
      }

      await sleep(attempt < 8 ? 120 : 200);
    }
    return isContactDetailPage();
  }

  async function clickMatchingContact(query, input) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const matching = collectContactSearchTargets(query);

      if (matching.length >= 1) {
        const exact =
          matching.find((row) => {
            const telLink = row.querySelector('a[href^="tel:"]');
            return phoneMatches(
              digitsOnly(query),
              digitsOnly(telLink?.textContent || "")
            );
          }) || matching[0];

        const detailLink =
          exact.querySelector('a[href*="/contacts/detail/"]') ||
          [...exact.querySelectorAll("a[href*='/contacts/detail/']")].find(isVisible);
        if (detailLink) {
          detailLink.click();
          return true;
        }

        if (
          exact.matches('[role="option"], [role="menuitem"], li, tr, [role="row"], [role="gridcell"]')
        ) {
          exact.click();
          return true;
        }
      }

      if (attempt === 5 && input) {
        await submitContactSearch(input);
      }

      await sleep(attempt < 6 ? 100 : 180);
    }

    return false;
  }

  async function waitForContactsSearchInput() {
    for (let i = 0; i < 8; i++) {
      const input = findInlineLeadsSearchInput();
      if (input) return { input, mode: "inline" };
      await sleep(100);
    }

    const opened = await openGlobalLeadSearch();
    if (!opened) return { input: null, mode: "none" };

    for (let i = 0; i < 25; i++) {
      const input = findGlobalLeadSearchInput();
      if (input) return { input, mode: "global" };
      await sleep(100);
    }
    return { input: null, mode: "none" };
  }

  async function fillContactsSearchOnce(query) {
    const text = (query || "").trim();
    if (!text) return { ok: false, opened: false, reason: "empty_query" };

    const nav = await ensureReadyForSearch();
    if (!nav.ok) return { ok: false, opened: false, reason: nav.reason };

    await sleep(200);
    const { input, mode } = await waitForContactsSearchInput();
    if (!input) return { ok: false, opened: false, reason: "input_not_found" };

    if (!isAlreadyFilled(input, text)) {
      const filled = await fillSearchInput(input, text);
      const display = getSearchInputDisplayValue(input);
      if (!filled && !phoneMatches(digitsOnly(text), digitsOnly(display))) {
        return { ok: false, opened: false, reason: "fill_failed" };
      }
    }

    await sleep(mode === "global" ? 2000 : 400);
    const opened =
      mode === "global"
        ? await clickGlobalSearchResult(text, input)
        : await clickMatchingContact(text, input);
    return { ok: true, opened, reason: opened ? "opened" : "search_only" };
  }

  async function fillContactsSearch(query) {
    if (fillInFlight) {
      try {
        return await fillInFlight;
      } catch {
        /* ignore */
      }
    }

    fillInFlight = fillContactsSearchOnce(query);
    try {
      return await fillInFlight;
    } finally {
      fillInFlight = null;
    }
  }

  const initialLocationId = getLocationIdFromUrl(location.href);
  if (initialLocationId) persistLocationId(initialLocationId);

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      const id = getLocationIdFromUrl(location.href);
      if (id) persistLocationId(id);
    }
  }, 1500);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CTWA_GHL_PING") {
      sendResponse({
        pong: true,
        locationId: getLocationIdFromUrl(location.href),
        onContacts: isContactsListPage(),
        onDetail: isContactDetailPage(),
      });
      return true;
    }

    if (message.type === "FILL_GHL_SEARCH") {
      fillContactsSearch(message.query)
        .then((result) =>
          sendResponse({
            ok: result?.ok === true,
            opened: result?.opened === true,
            reason: result?.reason || "",
          })
        )
        .catch(() => sendResponse({ ok: false, opened: false, reason: "error" }));
      return true;
    }
  });
})();
