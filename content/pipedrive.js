(function () {
  const SCRIPT_ID = "1.11.0-pd";
  if (window.__CTWA_PIPEDRIVE_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_PIPEDRIVE_SCRIPT__ = SCRIPT_ID;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findGlobalSearchInput() {
    const root = document.getElementById("froot-global-search");
    if (root) {
      const input = root.querySelector("input");
      if (input) return input;
    }

    const selectors = [
      'input[placeholder="Rechercher dans Pipedrive"]',
      'input[placeholder*="Rechercher dans Pipedrive"]',
      'input[placeholder*="Search in Pipedrive"]',
    ];
    for (const sel of selectors) {
      const input = document.querySelector(sel);
      if (input) return input;
    }

    return null;
  }

  async function waitForGlobalSearchInput(maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i++) {
      const input = findGlobalSearchInput();
      if (input) return input;
      await sleep(250);
    }
    return null;
  }

  async function clearInputField(input) {
    if (!input) return;
    input.focus();
    await sleep(50);
    input.select?.();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeSetter) nativeSetter.call(input, "");
    else input.value = "";

    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(80);
  }

  async function fillGlobalSearch(query) {
    const text = (query || "").trim();
    if (!text) return false;

    const input = await waitForGlobalSearchInput();
    if (!input) return false;

    await clearInputField(input);
    document.execCommand("insertText", false, text);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    const current = (input.value || "").trim();
    if (current !== text) {
      if (nativeSetter) nativeSetter.call(input, text);
      else input.value = text;
    }

    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const finalValue = (input.value || "").trim();
    return finalValue === text || finalValue.includes(text);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CTWA_PIPEDRIVE_PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === "FILL_PIPEDRIVE_SEARCH") {
      fillGlobalSearch(message.query)
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
})();
