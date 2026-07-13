(function () {
  const SCRIPT_ID = "1.11.3-mer";
  if (window.__CTWA_MERIDIAN_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_MERIDIAN_SCRIPT__ = SCRIPT_ID;

  let fillInFlight = null;

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

  function isAlreadyFilled(input, query) {
    const want = digitsOnly(query);
    if (!want || !input) return false;
    const have = digitsOnly(input.value);
    if (!have) return false;
    return phoneMatches(want, have);
  }

  function findLeadsSearchInput() {
    const selectors = [
      'input[placeholder*="Nom ou téléphone"]',
      'input[placeholder*="nom ou téléphone"]',
      'input[placeholder*="Rechercher"]',
      'input[placeholder*="rechercher"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="téléphone"]',
      'input[placeholder*="Téléphone"]',
      'input[placeholder*="phone"]',
      'input[placeholder*="Phone"]',
      'input[aria-label*="Rechercher"]',
      'input[aria-label*="rechercher"]',
      'input[aria-label*="Search"]',
      'input[type="search"]',
      'input[name="search"]',
      'input[name="query"]',
      'input[name="q"]',
    ];

    for (const sel of selectors) {
      const input = document.querySelector(sel);
      if (input && isVisible(input)) return input;
    }

    let best = null;
    let bestTop = Infinity;
    for (const input of document.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type])'
    )) {
      if (!isVisible(input)) continue;
      if (input.type === "password" || input.type === "email") continue;
      const top = input.getBoundingClientRect().top;
      if (top < bestTop && top < 260) {
        bestTop = top;
        best = input;
      }
    }
    return best;
  }

  async function waitForLeadsSearchInput(maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i++) {
      const input = findLeadsSearchInput();
      if (input) return input;
      await sleep(250);
    }
    return null;
  }

  function findLeadRows() {
    return [...document.querySelectorAll("table tbody tr")].filter((row) =>
      row.querySelector('a[href*="/closing/leads/"]')
    );
  }

  function rowMatchesQuery(row, query) {
    const want = digitsOnly(query);
    if (!want) return false;

    const telLink = row.querySelector('a[href^="tel:"]');
    const telDigits = digitsOnly(telLink?.textContent || telLink?.getAttribute("href"));
    if (phoneMatches(want, telDigits)) return true;

    const rowDigits = digitsOnly(row.textContent || "");
    return phoneMatches(want, rowDigits);
  }

  async function clickMatchingLead(query) {
    const want = digitsOnly(query);
    if (!want) return false;

    for (let attempt = 0; attempt < 25; attempt++) {
      const rows = findLeadRows();
      const matching = rows.filter((row) => rowMatchesQuery(row, query));

      if (matching.length === 1) {
        const leadLink = matching[0].querySelector('a[href*="/closing/leads/"]');
        if (leadLink) {
          leadLink.click();
          return true;
        }
      }

      if (matching.length > 1) {
        const exact = matching.find((row) => {
          const telLink = row.querySelector('a[href^="tel:"]');
          return phoneMatches(want, digitsOnly(telLink?.textContent || ""));
        });
        const target = exact || matching[0];
        const leadLink = target.querySelector('a[href*="/closing/leads/"]');
        if (leadLink) {
          leadLink.click();
          return true;
        }
      }

      if (rows.length === 1 && rowMatchesQuery(rows[0], query)) {
        const leadLink = rows[0].querySelector('a[href*="/closing/leads/"]');
        if (leadLink) {
          leadLink.click();
          return true;
        }
      }

      await sleep(200);
    }

    return false;
  }

  async function fillLeadsSearchOnce(query) {
    const text = (query || "").trim();
    if (!text) return { ok: false, opened: false };

    const input = await waitForLeadsSearchInput();
    if (!input) return { ok: false, opened: false };

    if (!isAlreadyFilled(input, text)) {
      input.focus();

      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(input, text);
      else input.value = text;

      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        })
      );

      await sleep(150);
      if (!isAlreadyFilled(input, text)) return { ok: false, opened: false };
    }

    await sleep(400);
    const opened = await clickMatchingLead(text);
    return { ok: true, opened };
  }

  async function fillLeadsSearch(query) {
    if (fillInFlight) {
      try {
        return await fillInFlight;
      } catch {
        /* ignore */
      }
    }

    fillInFlight = fillLeadsSearchOnce(query);
    try {
      return await fillInFlight;
    } finally {
      fillInFlight = null;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CTWA_MERIDIAN_PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === "FILL_MERIDIAN_SEARCH") {
      fillLeadsSearch(message.query)
        .then((result) =>
          sendResponse({
            ok: result?.ok === true,
            opened: result?.opened === true,
          })
        )
        .catch(() => sendResponse({ ok: false, opened: false }));
      return true;
    }
  });
})();
