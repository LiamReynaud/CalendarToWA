(function () {
  const SCRIPT_ID = "1.10.0-wa";
  if (window.__CTWA_WA_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_WA_SCRIPT__ = SCRIPT_ID;

  const MAX_AGE_MS = 5 * 60 * 1000;
  const POLL_INTERVAL_MS = 400;
  const MAX_READY_ATTEMPTS = 80;

  let overlayEl = null;
  let overlayPosition = null;
  let automationDone = false;
  let automationRunning = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function phoneDigits(str) {
    return (str || "").replace(/\D/g, "");
  }

  function phonesMatch(a, b) {
    const da = phoneDigits(a);
    const db = phoneDigits(b);
    if (!da || !db) return false;
    return da === db || da.endsWith(db) || db.endsWith(da);
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }

  function simulateClick(element) {
    if (!element) return false;
    const target =
      element.closest('button, [role="button"], [tabindex="0"]') || element;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    target.focus?.({ preventScroll: true });

    const rect = target.getBoundingClientRect();
    const cx = rect.left + Math.min(rect.width / 2, rect.width - 2);
    const cy = rect.top + Math.min(rect.height / 2, rect.height - 2);
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
    };
    for (const type of [
      "pointerover",
      "mouseover",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ]) {
      const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ctor(type, opts));
    }
    if (typeof target.click === "function") target.click();
    return true;
  }

  async function withOverlayPassthrough(fn) {
    return fn();
  }

  async function userClick(element) {
    return withOverlayPassthrough(async () => {
      await sleep(80);
      return simulateClick(element);
    });
  }

  function findByExactText(texts, maxLen = 60, root = document) {
    const nodes = root.querySelectorAll(
      'div, span, button, li, [role="button"], [role="listitem"], [role="menuitem"]'
    );
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const t = (el.textContent || "").trim();
      if (!t || t.length > maxLen) continue;
      for (const search of texts) {
        if (t.toLowerCase() === search.toLowerCase()) {
          return (
            el.closest('[role="button"], button, [tabindex="0"], li') || el
          );
        }
      }
    }
    return null;
  }

  function isButtonEnabled(btn) {
    if (!btn) return false;
    return !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
  }

  function findNewChatButton() {
    const byTestId = document.querySelector('[data-testid="new-chat-outline"]');
    if (byTestId && isVisible(byTestId)) {
      const btn =
        byTestId.closest("button, [role='button'], header") ||
        byTestId.parentElement;
      if (btn && isButtonEnabled(btn)) return btn;
    }

    const byIcon = document.querySelector('[data-icon="new-chat-outline"]');
    if (byIcon && isVisible(byIcon)) {
      const btn =
        byIcon.closest("button, div[role='button'], div[tabindex]") || byIcon;
      if (btn && isButtonEnabled(btn)) return btn;
    }

    return null;
  }

  function findNavButton(label) {
    for (const sel of [`button[aria-label="${label}"]`, `button[title="${label}"]`]) {
      const btn = document.querySelector(sel);
      if (btn && isVisible(btn)) return btn;
    }
    return (
      [...document.querySelectorAll("button")].find(
        (btn) =>
          isVisible(btn) &&
          (btn.getAttribute("aria-label") === label ||
            btn.textContent?.trim() === label)
      ) || null
    );
  }

  async function ensureDiscussionsView() {
    const discussionsBtn =
      findNavButton("Discussions") || findNavButton("Chats");
    if (
      discussionsBtn?.getAttribute("aria-pressed") === "true" &&
      findNewChatButton()
    ) {
      return true;
    }

    if (
      discussionsBtn &&
      discussionsBtn.getAttribute("aria-pressed") !== "true"
    ) {
      await userClick(discussionsBtn);
      await sleep(700);
    }

    for (let i = 0; i < 20; i++) {
      if (findNewChatButton()) return true;
      await sleep(250);
    }
    return !!findNewChatButton();
  }

  function phoneMatchesContact(text, contact) {
    if (!text || !contact) return false;
    const candidates = [
      contact.phone,
      contact.rawPhone,
      contact.nationalNumber,
      contact.phone ? "+" + contact.phone : "",
    ].filter(Boolean);
    return candidates.some((candidate) => phonesMatch(text, candidate));
  }

  function findChatSearchInput(preferredQuery) {
    const selectors = [
      'input[aria-label="Rechercher un nom ou un numéro"]',
      'input[aria-label="Search name or number"]',
      'input[placeholder="Rechercher un nom ou un numéro"]',
      'input[placeholder="Search name or number"]',
      '[data-testid="new-chat-drawer"] input[type="text"]',
      '[data-testid="new-chat-drawer"] [contenteditable="true"]',
    ];
    const inputs = [];
    const drawer = getNewChatDrawer();
    const roots = drawer ? [drawer, document] : [document];

    for (const root of roots) {
      for (const sel of selectors) {
        root.querySelectorAll(sel).forEach((el) => {
          if (isVisible(el) && !inputs.includes(el)) inputs.push(el);
        });
      }
    }
    if (!inputs.length) return null;

    if (preferredQuery) {
      const queryDigits = phoneDigits(preferredQuery);
      const matching = inputs.find((input) => {
        const valueDigits = phoneDigits(getSearchInputDisplayValue(input));
        return (
          valueDigits &&
          (valueDigits === queryDigits ||
            valueDigits.endsWith(queryDigits) ||
            queryDigits.endsWith(valueDigits))
        );
      });
      if (matching) return matching;
    }

    const withValue = inputs.find((input) =>
      getSearchInputDisplayValue(input)
    );
    if (withValue) return withValue;

    return inputs[inputs.length - 1];
  }

  async function clearInputField(input) {
    if (!input) return;
    input.focus();
    await sleep(50);

    const editable =
      input.isContentEditable || input.getAttribute?.("contenteditable") === "true"
        ? input
        : input.closest?.('[contenteditable="true"]');

    if (editable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editable);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
    } else {
      input.select?.();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(input, "");
      else input.value = "";
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(80);
  }

  async function clearAndSetInputValue(input, value) {
    if (!input) return;
    await clearInputField(input);
    document.execCommand("insertText", false, value);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (!input.isContentEditable && !input.closest?.('[contenteditable="true"]')) {
      if (nativeSetter) nativeSetter.call(input, value);
      else input.value = value;
    }
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText",
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillChatSearchInput(input, query) {
    if (!input || !query) return;
    input.focus();
    await sleep(100);
    await clearInputField(input);
    document.execCommand("insertText", false, query);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (!input.isContentEditable && !input.closest?.('[contenteditable="true"]')) {
      if (nativeSetter) nativeSetter.call(input, query);
      else input.value = query;
    }
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: query,
        inputType: "insertText",
      })
    );
    await sleep(400);
  }

  function getSearchInputDisplayValue(input) {
    if (!input) return "";
    const direct = (input.value || input.getAttribute("value") || "").trim();
    if (direct) return direct;
    if (input.isContentEditable) return (input.textContent || "").trim();
    const editable = input.closest('[contenteditable="true"]');
    if (editable) return (editable.textContent || "").trim();
    const drawer = input.closest('[data-testid="new-chat-drawer"]');
    if (drawer) {
      const drawerInput = drawer.querySelector("input");
      if (drawerInput?.value?.trim()) return drawerInput.value.trim();
    }
    return "";
  }

  function normalizeName(str) {
    return (str || "").toLowerCase().replace(/[\[\]]/g, "").trim();
  }

  function nameMatchesContact(text, contact) {
    const hay = normalizeName(text);
    if (!hay) return false;

    for (const name of contact.searchNames || []) {
      const candidate = normalizeName(name);
      if (!candidate) continue;
      if (
        hay === candidate ||
        hay.includes(candidate) ||
        candidate.includes(hay)
      ) {
        return true;
      }
    }

    const first = normalizeName(contact.firstName);
    const last = normalizeName(contact.lastName);
    if (!first && !last) return false;
    if (first && first.length >= 2 && !hay.includes(first)) return false;
    if (last && last.length >= 2 && !hay.includes(last)) return false;
    return !!(first || last);
  }

  function looksLikePhone(text) {
    return phoneDigits(text).length >= 9;
  }

  function getSearchResultTitleText(container) {
    const title = container.querySelector('[data-testid="cell-frame-title"]');
    if (title) {
      const span =
        title.querySelector("span[title]") ||
        title.querySelector("span") ||
        title;
      const fromTitle = (
        span.getAttribute("title") ||
        span.textContent ||
        ""
      ).trim();
      if (fromTitle) return fromTitle;
    }

    const lines = (container.textContent || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.find((line) => phoneDigits(line).length >= 9) || lines[0] || "";
  }

  function getNewChatSearchInput(contact) {
    const phoneQuery = contact.rawPhone || "+" + contact.phone;
    return findChatSearchInput(phoneQuery);
  }

  function getNewChatDrawer() {
    return document.querySelector('[data-testid="new-chat-drawer"]');
  }

  function isNewChatSearchActive(contact) {
    const queryDigits = phoneDigits(contact.phone || contact.rawPhone);
    if (queryDigits.length < 9) return false;

    const drawer = getNewChatDrawer();
    if (
      drawer &&
      (findPhoneRowInDrawer(drawer, contact) ||
        findNameRowInDrawer(drawer, contact))
    ) {
      return true;
    }

    const input = getNewChatSearchInput(contact);
    if (!input) return false;
    const inputDigits = phoneDigits(getSearchInputDisplayValue(input));
    if (!inputDigits) return false;
    return (
      inputDigits === queryDigits ||
      inputDigits.endsWith(queryDigits) ||
      queryDigits.endsWith(inputDigits)
    );
  }

  function getDrawerSearchRows(drawer) {
    if (!drawer) return [];
    return [...drawer.querySelectorAll('[data-testid="cell-frame-container"]')].filter(
      isVisible
    );
  }

  function findPhoneRowInDrawer(drawer, contact) {
    if (!drawer || !contact) return null;
    for (const row of getDrawerSearchRows(drawer)) {
      const text = getSearchResultTitleText(row);
      if (phoneMatchesContact(text, contact)) return row;
    }
    return null;
  }

  function findNameRowInDrawer(drawer, contact) {
    if (!drawer || !contact) return null;
    for (const row of getDrawerSearchRows(drawer)) {
      const text = getSearchResultTitleText(row);
      if (
        !looksLikePhone(text) &&
        text.length >= 2 &&
        nameMatchesContact(text, contact)
      ) {
        return row;
      }
    }
    return null;
  }

  function findExistingNameRowForPhoneSearch(drawer, contact) {
    if (!drawer || !contact || !isNewChatSearchActive(contact)) return null;

    const rows = getDrawerSearchRows(drawer);
    if (!rows.length || rows.length > 4) return null;

    for (const row of rows) {
      const text = getSearchResultTitleText(row);
      if (!looksLikePhone(text) && text.length >= 2) {
        return row;
      }
    }
    return null;
  }

  function isDrawerSearchFiltered(drawer, contact) {
    if (!drawer) return false;
    if (
      findPhoneRowInDrawer(drawer, contact) ||
      findNameRowInDrawer(drawer, contact) ||
      findExistingNameRowForPhoneSearch(drawer, contact)
    ) {
      return true;
    }

    const rows = getDrawerSearchRows(drawer);
    if (!rows.length) return false;
    if (rows.length <= 4) return isNewChatSearchActive(contact);

    const drawerText = (drawer.textContent || "").toLowerCase();
    return (
      drawerText.includes("ne sont pas dans vos contacts") ||
      drawerText.includes("not in your contacts") ||
      drawerText.includes("aucun résultat") ||
      drawerText.includes("no results")
    );
  }

  function findContactSearchRow(contact, options = {}) {
    const { requireFiltered = true } = options;
    const targetDigits = phoneDigits(contact.phone || contact.rawPhone);
    if (targetDigits.length < 9) return null;

    const drawer = getNewChatDrawer();
    if (!drawer || !isNewChatSearchActive(contact)) return null;
    if (requireFiltered && !isDrawerSearchFiltered(drawer, contact)) return null;

    const phoneRow = findPhoneRowInDrawer(drawer, contact);
    if (phoneRow) return { row: phoneRow, existing: false };

    const nameRow = findNameRowInDrawer(drawer, contact);
    if (nameRow) return { row: nameRow, existing: true };

    const existingByPhone = findExistingNameRowForPhoneSearch(drawer, contact);
    if (existingByPhone) return { row: existingByPhone, existing: true };

    return null;
  }

  async function clickPhoneSearchRow(row) {
    const target = row?.matches?.('[data-testid="cell-frame-container"]')
      ? row
      : row?.closest?.('[data-testid="cell-frame-container"]');
    if (!target?.isConnected || !isVisible(target)) return false;

    target.scrollIntoView({ block: "center", behavior: "instant" });
    await sleep(150);
    target.focus?.({ preventScroll: true });

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
    };

    for (const type of ["mousedown", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, opts));
    }
    if (typeof target.click === "function") target.click();

    return true;
  }

  async function openSearchResultViaKeyboard(contact) {
    const searchInput = getNewChatSearchInput(contact);
    if (!searchInput) return false;

    searchInput.focus();
    await sleep(150);

    for (const key of ["ArrowDown", "Enter"]) {
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
        })
      );
      await sleep(250);
    }
    return true;
  }

  async function openNewContactChatFromSearch(contact, initialRow = null) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const found = initialRow
        ? { row: initialRow, existing: false }
        : findContactSearchRow(contact);
      const row = found?.existing ? null : found?.row;
      if (row) {
        showOverlay(
          contact,
          `Clic sur ${getSearchResultTitleText(row)} (tentative ${attempt + 1}/5)…`,
          { step: "Étape 3/6 — Ouverture" }
        );
        await clickPhoneSearchRow(row);
        await sleep(900);
        if (await waitForPhoneChatHeader(contact, 8)) return true;
        initialRow = null;
      }
      await sleep(400);
    }

    showOverlay(contact, "Tentative clavier (↓ + Entrée)…", {
      step: "Étape 3/6 — Ouverture",
    });
    const drawer = getNewChatDrawer();
    if (!drawer || !isDrawerSearchFiltered(drawer, contact)) {
      return false;
    }
    await openSearchResultViaKeyboard(contact);
    await sleep(1200);
    return !!(await waitForPhoneChatHeader(contact, 15));
  }

  async function openExistingContactChat(row) {
    const label = getSearchResultTitleText(row);
    await clickPhoneSearchRow(row);
    await sleep(900);
    return waitForChatOpened(label);
  }

  async function searchPhoneInNewChat(contact) {
    const phoneQuery = contact.rawPhone || "+" + contact.phone;
    const newChatBtn = findNewChatButton();
    if (!newChatBtn) return null;

    await userClick(newChatBtn);
    await sleep(800);

    const searchInput = findChatSearchInput(phoneQuery);
    if (!searchInput) return null;

    await fillChatSearchInput(searchInput, phoneQuery);

    for (let i = 0; i < 30; i++) {
      const found = findContactSearchRow(contact);
      if (found) return found;
      await sleep(400);
    }
    return null;
  }

  function getOpenChatTitle() {
    const header = document.querySelector(
      '[data-testid="conversation-info-header-chat-title"]'
    );
    if (!header || !isVisible(header)) return "";
    return getChatHeaderTitleText(header);
  }

  function headerShowsPhone(contact) {
    return phoneMatchesContact(getOpenChatTitle(), contact);
  }

  async function waitForPhoneChatHeader(contact, maxAttempts = 25) {
    for (let i = 0; i < maxAttempts; i++) {
      if (headerShowsPhone(contact)) {
        return document.querySelector(
          '[data-testid="conversation-info-header-chat-title"]'
        );
      }
      await sleep(300);
    }
    return null;
  }

  async function waitForChatOpened(expectedTitle = "", maxAttempts = 25) {
    const expected = normalizeName(expectedTitle);
    for (let i = 0; i < maxAttempts; i++) {
      const title = getOpenChatTitle();
      if (!title) {
        await sleep(300);
        continue;
      }
      if (!expected) return true;
      const normalized = normalizeName(title);
      if (
        normalized === expected ||
        normalized.startsWith(expected) ||
        expected.startsWith(normalized)
      ) {
        return true;
      }
      await sleep(300);
    }
    return !!getOpenChatTitle();
  }

  async function openContactInfoDrawer() {
    const header = document.querySelector(
      '[data-testid="conversation-info-header"]'
    );
    if (!header || !isVisible(header)) return false;
    await userClick(header);
    await sleep(900);
    return true;
  }

  async function waitForAddToContactsButton() {
    for (let i = 0; i < 20; i++) {
      await openContactInfoDrawer();
      const drawer =
        document.querySelector('[data-testid="drawer-right"]') || document;
      const btn = findAddToContactsButton(drawer);
      if (btn) return btn;
      await sleep(350);
    }
    return null;
  }

  function assertCorrectChat(contact) {
    return headerShowsPhone(contact);
  }

  function findFirstNameField() {
    return document.querySelector(
      '[contenteditable="true"][aria-label="Prénom"], [contenteditable="true"][aria-label="First name"]'
    );
  }

  function findLastNameField() {
    return document.querySelector(
      '[contenteditable="true"][aria-label="Nom"], [contenteditable="true"][aria-label="Last name"]'
    );
  }

  function getLexicalEditableRoot(el) {
    if (!el) return null;
    if (el.getAttribute?.("contenteditable") === "true") return el;
    return el.querySelector?.('[contenteditable="true"]') || el;
  }

  function getLexicalFieldText(el) {
    const root = getLexicalEditableRoot(el);
    return (root?.textContent || "").replace(/\u200B/g, "").trim();
  }

  function selectAllInElement(el) {
    const root = getLexicalEditableRoot(el);
    if (!root) return;
    root.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("selectAll", false, null);
  }

  async function dispatchSelectAll(el) {
    const root = getLexicalEditableRoot(el);
    if (!root) return;
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
    for (const type of ["keydown", "keyup"]) {
      root.dispatchEvent(
        new KeyboardEvent(type, {
          key: "a",
          code: "KeyA",
          bubbles: true,
          cancelable: true,
          ctrlKey: !isMac,
          metaKey: isMac,
        })
      );
    }
  }

  async function dispatchBackspace(el) {
    const root = getLexicalEditableRoot(el);
    if (!root) return;
    for (const type of ["keydown", "keyup"]) {
      root.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Backspace",
          code: "Backspace",
          bubbles: true,
          cancelable: true,
        })
      );
    }
  }

  async function clearLexicalField(el) {
    const root = getLexicalEditableRoot(el);
    if (!root) return;

    simulateClick(root);
    root.focus();
    await sleep(80);

    for (let pass = 0; pass < 4; pass++) {
      selectAllInElement(root);
      document.execCommand("insertText", false, "");
      await sleep(40);
      if (!getLexicalFieldText(root)) break;

      selectAllInElement(root);
      document.execCommand("delete", false, null);
      await sleep(40);
      if (!getLexicalFieldText(root)) break;

      await dispatchSelectAll(root);
      await dispatchBackspace(root);
      await sleep(40);
      if (!getLexicalFieldText(root)) break;
    }

    for (let i = 0; i < 80 && getLexicalFieldText(root); i++) {
      selectAllInElement(root);
      document.execCommand("delete", false, null);
      await dispatchBackspace(root);
      await sleep(20);
    }

    root.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })
    );
    await sleep(60);
  }

  async function fillLexicalField(el, text) {
    if (!el || !text) return false;

    const expected = text.trim();
    const root = getLexicalEditableRoot(el);

    for (let attempt = 0; attempt < 2; attempt++) {
      simulateClick(root);
      root.focus();
      await sleep(100);
      await clearLexicalField(root);

      if (getLexicalFieldText(root)) {
        await sleep(80);
        continue;
      }

      selectAllInElement(root);
      document.execCommand("insertText", false, expected);
      await sleep(120);
      root.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      const actual = getLexicalFieldText(root);
      if (actual === expected) return true;
      if (actual.endsWith(expected) && actual.length > expected.length) {
        await clearLexicalField(root);
        continue;
      }
    }

    return getLexicalFieldText(root) === expected;
  }

  async function waitForContactForm() {
    for (let i = 0; i < 40; i++) {
      let firstNameField = findFirstNameField();
      let lastNameField = findLastNameField();

      if (!firstNameField || !lastNameField) {
        const editables = [
          ...document.querySelectorAll(
            '[contenteditable="true"][role="textbox"], [data-testid="text-input"]'
          ),
        ].filter(isVisible);
        if (editables.length >= 2) {
          firstNameField = firstNameField || editables[0];
          lastNameField = lastNameField || editables[1];
        }
      }

      if (firstNameField && lastNameField) {
        return {
          firstNameField,
          lastNameField,
          phoneInput: document.querySelector(
            '[data-testid="phone-number-input"]'
          ),
        };
      }
      await sleep(200);
    }
    return {
      firstNameField: findFirstNameField(),
      lastNameField: findLastNameField(),
      phoneInput: document.querySelector('[data-testid="phone-number-input"]'),
    };
  }

  async function selectCountry(countryCode) {
    const countryBtn = [...document.querySelectorAll("div, button, span")].find(
      (el) => {
        if (!isVisible(el)) return false;
        const label = el.getAttribute("aria-label") || "";
        return /^Pays\s*:/i.test(label) || /^Country\s*:/i.test(label);
      }
    );

    if (!countryBtn) return false;

    simulateClick(countryBtn);
    await sleep(700);

    const countrySearch = [...document.querySelectorAll('input[type="text"]')].find(
      (inp) => {
        if (!isVisible(inp)) return false;
        if (inp.matches('[data-testid="phone-number-input"]')) return false;
        const label = (
          inp.getAttribute("aria-label") ||
          inp.placeholder ||
          ""
        ).toLowerCase();
        return (
          !label.includes("rechercher un nom") &&
          !label.includes("search name or number")
        );
      }
    );

    if (countrySearch) {
      await clearAndSetInputValue(countrySearch, countryCode);
      await sleep(600);
    }

    const option = [...document.querySelectorAll(
      '[role="option"], [role="listitem"], li, div[tabindex="0"], span'
    )].find((el) => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      return t.includes("+" + countryCode);
    });

    if (option) {
      simulateClick(option);
      await sleep(500);
      return true;
    }

    return !!countrySearch;
  }

  async function fillContactForm(contact) {
    const firstName = contact.firstName || "";
    const lastName = contact.lastName || "";
    const { firstNameField, lastNameField, phoneInput } =
      await waitForContactForm();

    let filled = false;

    if (firstNameField && firstName) {
      await fillLexicalField(firstNameField, firstName);
      filled = true;
      await sleep(200);
    }

    if (lastNameField && lastName) {
      await fillLexicalField(lastNameField, lastName);
      filled = true;
      await sleep(200);
    }

    const countryCode = contact.countryCode || "33";
    await selectCountry(countryCode);

    const phoneField = phoneInput ||
      document.querySelector('[data-testid="phone-number-input"]');

    const nationalNumber =
      contact.nationalNumber ||
      String(contact.phone || "").replace(new RegExp("^" + countryCode), "");

    if (phoneField && nationalNumber) {
      await clearAndSetInputValue(phoneField, nationalNumber);
      filled = true;
    }

    return { filled };
  }

  async function fillNameFieldsOnly(contact) {
    const firstName = contact.firstName || "";
    const lastName = contact.lastName || "";
    const { firstNameField, lastNameField } = await waitForContactForm();

    let filled = false;

    if (firstNameField && firstName) {
      await fillLexicalField(firstNameField, firstName);
      filled = true;
      await sleep(200);
    }

    if (lastNameField && lastName) {
      await fillLexicalField(lastNameField, lastName);
      filled = true;
      await sleep(200);
    }

    return { filled };
  }

  function findIconButton(iconTitle) {
    const names = new Set([iconTitle]);
    if (iconTitle.startsWith("ic-")) names.add(iconTitle.slice(3));
    else names.add("ic-" + iconTitle);

    for (const name of names) {
      for (const titleEl of document.querySelectorAll("svg title")) {
        if (titleEl.textContent !== name) continue;
        const svg = titleEl.closest("svg");
        if (!svg || !isVisible(svg)) continue;
        const btn =
          svg.closest('button, [role="button"]') ||
          svg.closest("span")?.parentElement ||
          svg.parentElement;
        if (btn && isVisible(btn)) return btn;
      }

      const byDataIcon = document.querySelector(`[data-icon="${name}"]`);
      if (byDataIcon && isVisible(byDataIcon)) {
        return (
          byDataIcon.closest('button, [role="button"], [tabindex="0"]') ||
          byDataIcon.parentElement
        );
      }
    }

    for (const el of document.querySelectorAll("[data-icon]")) {
      const icon = el.getAttribute("data-icon") || "";
      if (!/person-add|add-person|user-plus|contact-add/i.test(icon)) continue;
      if (!isVisible(el)) continue;
      return (
        el.closest('button, [role="button"], [tabindex="0"]') || el.parentElement
      );
    }

    return null;
  }

  function getChatHeaderTitleText(header) {
    return (
      header?.getAttribute("title") ||
      header?.textContent ||
      ""
    ).trim();
  }

  async function clickSaveButton() {
    const saveBtn = document.querySelector('[data-testid="save-contact-btn"]');
    if (saveBtn && isVisible(saveBtn)) {
      await userClick(saveBtn);
      await sleep(1000);
      return true;
    }

    const btn =
      findIconButton("ic-check") ||
      findByExactText(["Enregistrer", "Save", "Done", "Terminé"]);
    if (!btn) return false;
    await userClick(btn);
    await sleep(800);
    return true;
  }

  async function clickCloseButton() {
    for (let i = 0; i < 15; i++) {
      const btn = findIconButton("ic-close");
      if (btn && isVisible(btn)) {
        await userClick(btn);
        await sleep(500);
        return true;
      }
      await sleep(300);
    }
    return false;
  }

  function getSearchResultClickTarget(el) {
    if (!el) return null;
    if (el.matches?.('[data-testid="cell-frame-container"]')) return el;
    return el.closest('[data-testid="cell-frame-container"]');
  }

  function findAddToContactsButton(root = document) {
    if (!root) return null;

    const saveBtn = root.querySelector?.('[data-testid="save-contact-btn"]');
    if (saveBtn) return null;

    const addExact = findByExactText(["Ajouter", "Add"], 24, root);
    if (addExact) return addExact;

    const labels = [
      "ajouter aux contacts",
      "add to contacts",
      "enregistrer le contact",
      "save contact",
      "add contact",
      "ajouter le contact",
    ];

    const exact = findByExactText(
      [
        "Ajouter aux contacts",
        "Add to contacts",
        "Enregistrer le contact",
        "Save contact",
        "Add contact",
        "Ajouter le contact",
      ],
      80,
      root
    );
    if (exact) return exact;

    const btn = [...root.querySelectorAll("[aria-label], button, [role='button']")].find(
      (el) => {
        if (!isVisible(el)) return false;
        const l = (el.getAttribute("aria-label") || el.textContent || "")
          .toLowerCase()
          .trim();
        return labels.some((label) => l.includes(label));
      }
    );
    if (btn) return btn;

    return findIconButton("ic-person-add") || findIconButton("person-add");
  }

  function contactSummary(contact) {
    const parts = [];
    if (contact.firstName) parts.push(contact.firstName);
    if (contact.lastName) parts.push(contact.lastName);
    parts.push(contact.rawPhone || "+" + contact.phone);
    return parts.join(" — ");
  }

  function contactEventDateLabel(contact) {
    return contact.eventDate ? `RDV : ${contact.eventDate}` : "";
  }

  function applyOverlayPosition(card) {
    card.classList.add("ctwa-overlay__card--floating");
    if (overlayPosition) {
      card.style.left = `${overlayPosition.left}px`;
      card.style.top = `${overlayPosition.top}px`;
      card.style.right = "auto";
    } else {
      card.style.left = "auto";
      card.style.top = "24px";
      card.style.right = "24px";
    }
  }

  function attachOverlayDrag(card, handle) {
    if (handle.dataset.ctwaDrag) return;
    handle.dataset.ctwaDrag = "1";
    let drag = null;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a, input, textarea, select")) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      drag = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      };
      card.style.left = `${rect.left}px`;
      card.style.top = `${rect.top}px`;
      card.style.right = "auto";
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const left = Math.max(8, e.clientX - drag.offsetX);
      const top = Math.max(8, e.clientY - drag.offsetY);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      overlayPosition = { left, top };
    });

    const endDrag = (e) => {
      if (drag?.pointerId === e.pointerId) drag = null;
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function showOverlay(contact, status, options = {}) {
    const { isError = false, step = "", showRetry = false } = options;

    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "ctwa-overlay";
      overlayEl.innerHTML = `
        <div class="ctwa-overlay__card">
          <div class="ctwa-overlay__header">
            <span class="ctwa-overlay__icon">📱</span>
            <strong>Calendar to WhatsApp</strong>
          </div>
          <p class="ctwa-overlay__step"></p>
          <p class="ctwa-overlay__status"></p>
          <p class="ctwa-overlay__event-date"></p>
          <p class="ctwa-overlay__details"></p>
          <div class="ctwa-overlay__actions">
            <button type="button" class="ctwa-overlay__btn ctwa-overlay__btn--primary" data-action="retry">
              Réessayer
            </button>
            <button type="button" class="ctwa-overlay__btn" data-action="dismiss">
              Fermer
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlayEl);

      const card = overlayEl.querySelector(".ctwa-overlay__card");
      applyOverlayPosition(card);
      attachOverlayDrag(card, card);

      overlayEl
        .querySelector('[data-action="dismiss"]')
        .addEventListener("click", () => {
          overlayEl.remove();
          overlayEl = null;
          chrome.runtime.sendMessage({ type: "CLEAR_PENDING_CONTACT" });
        });

      overlayEl
        .querySelector('[data-action="retry"]')
        .addEventListener("click", async () => {
          automationDone = false;
          await runAutomation(contact);
        });
    }

    overlayEl.querySelector(".ctwa-overlay__step").textContent = step;
    overlayEl.querySelector(".ctwa-overlay__status").textContent = status;
    let eventDateEl = overlayEl.querySelector(".ctwa-overlay__event-date");
    if (!eventDateEl) {
      eventDateEl = document.createElement("p");
      eventDateEl.className = "ctwa-overlay__event-date";
      overlayEl
        .querySelector(".ctwa-overlay__status")
        .insertAdjacentElement("afterend", eventDateEl);
    }
    const eventDateLabel = contactEventDateLabel(contact);
    eventDateEl.textContent = eventDateLabel;
    eventDateEl.hidden = !eventDateLabel;
    overlayEl.querySelector(".ctwa-overlay__details").textContent =
      contactSummary(contact);
    overlayEl.classList.toggle("ctwa-overlay--error", isError);
    overlayEl.querySelector('[data-action="retry"]').style.display = showRetry
      ? "inline-block"
      : "none";

    const card = overlayEl.querySelector(".ctwa-overlay__card");
    if (card) applyOverlayPosition(card);
  }

  async function waitForWhatsAppReady() {
    for (let i = 0; i < MAX_READY_ATTEMPTS; i++) {
      const ready =
        document.querySelector("#pane-side") ||
        document.querySelector('[data-testid="new-chat-outline"]') ||
        document.querySelector('[data-icon="new-chat-outline"]');
      if (ready) return true;
      await sleep(POLL_INTERVAL_MS);
    }
    return false;
  }

  async function runAutomation(contact) {
    if (automationDone || automationRunning) return;
    automationRunning = true;

    try {
    showOverlay(contact, "Connexion à WhatsApp Web…", {
      step: "Étape 1/6 — Chargement",
    });

    const ready = await waitForWhatsAppReady();
    if (!ready) {
      showOverlay(
        contact,
        "WhatsApp Web met du temps à charger. Attendez vos discussions, puis cliquez « Réessayer ».",
        { isError: true, step: "Échec", showRetry: true }
      );
      return;
    }

    showOverlay(contact, "Retour aux discussions…", {
      step: "Étape 1/6 — Navigation",
    });

    const onDiscussions = await ensureDiscussionsView();
    if (!onDiscussions) {
      showOverlay(
        contact,
        "Cliquez sur « Discussions » dans la barre latérale WhatsApp, puis « Réessayer ».",
        { isError: true, step: "Navigation requise", showRetry: true }
      );
      return;
    }

    showOverlay(contact, "Recherche du numéro…", {
      step: "Étape 2/6 — Recherche",
    });

    const searchResult = await searchPhoneInNewChat(contact);
    if (!searchResult) {
      automationDone = true;
      const searchInput = getNewChatSearchInput(contact);
      const drawer = getNewChatDrawer();
      const drawerRows = drawer ? getDrawerSearchRows(drawer) : [];
      const visibleRows = drawerRows.length;
      const preview = drawerRows
        .slice(0, 3)
        .map((row) => getSearchResultTitleText(row))
        .filter(Boolean)
        .join(" · ");
      showOverlay(
        contact,
        `Numéro introuvable dans la recherche (lignes tiroir: ${visibleRows}, champ: « ${getSearchInputDisplayValue(searchInput) || "?"} »${preview ? `, résultats: « ${preview} »` : ""}).`,
        { isError: true, step: "Numéro introuvable", showRetry: true }
      );
      return;
    }

    if (searchResult.existing) {
      const label = getSearchResultTitleText(searchResult.row);
      showOverlay(contact, `Contact existant — ouverture de « ${label} »…`, {
        step: "Étape 3/3 — Discussion",
      });

      const opened = await openExistingContactChat(searchResult.row);
      if (!opened) {
        showOverlay(
          contact,
          `Impossible d'ouvrir la discussion. Discussion active : « ${getOpenChatTitle() || "?"} ».`,
          { isError: true, step: "Échec", showRetry: true }
        );
        return;
      }

      chrome.runtime.sendMessage({ type: "ACK_PENDING_TRIGGER" });
      automationDone = true;
      showOverlay(contact, "Contact existant.", {
        step: "Terminé",
        showRetry: false,
      });
      return;
    }

    const opened = await openNewContactChatFromSearch(contact, searchResult.row);
    if (!opened) {
      showOverlay(
        contact,
        `Impossible d'ouvrir le numéro. Discussion active : « ${getOpenChatTitle() || "?"} ».`,
        { isError: true, step: "Mauvais chat", showRetry: true }
      );
      return;
    }

    chrome.runtime.sendMessage({ type: "ACK_PENDING_TRIGGER" });

    showOverlay(contact, "Ouverture des infos contact…", {
      step: "Étape 4/6 — Infos contact",
    });

    const addBtn = await waitForAddToContactsButton();
    if (!addBtn) {
      showOverlay(
        contact,
        "Cliquez sur le numéro en haut, puis « Ajouter » dans le panneau de droite.",
        { isError: true, step: "Action manuelle", showRetry: true }
      );
      return;
    }

    await userClick(addBtn);
    await sleep(1200);

    const form = await waitForContactForm();
    if (!form.firstNameField || !form.lastNameField) {
      showOverlay(
        contact,
        "Formulaire « Nouveau contact » non détecté.",
        { isError: true, step: "Action manuelle", showRetry: true }
      );
      return;
    }

    showOverlay(contact, "Remplissage du Prénom et du Nom…", {
      step: "Étape 5/6 — Saisie",
    });

    const result = await fillNameFieldsOnly(contact);
    if (!result.filled) {
      showOverlay(
        contact,
        "Impossible de remplir le formulaire en toute sécurité.",
        { isError: true, step: "Action manuelle", showRetry: true }
      );
      return;
    }

    showOverlay(contact, "Enregistrement du contact…", {
      step: "Étape 6/6 — Validation",
    });

    const saved = await clickSaveButton();
    if (!saved) {
      showOverlay(
        contact,
        "Prénom et Nom remplis. Cliquez sur ✓ pour enregistrer.",
        { isError: true, step: "Action manuelle", showRetry: true }
      );
      return;
    }

    await clickCloseButton();
    automationDone = true;
    showOverlay(contact, "Contact enregistré.", {
      step: "Terminé",
      showRetry: false,
    });
    return;
    } finally {
      automationRunning = false;
    }
  }

  async function processPendingContact(options = {}) {
    const { immediate = false, contact: contactOverride = null } = options;
    let contact = contactOverride;

    if (!contact) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_PENDING_CONTACT",
        });
        contact = response?.contact;
      } catch {
        return;
      }
    }

    if (!contact) return;

    const age = Date.now() - (contact.createdAt || 0);
    if (age > MAX_AGE_MS) {
      chrome.runtime.sendMessage({ type: "CLEAR_PENDING_CONTACT" });
      return;
    }

    await sleep(immediate ? 400 : 1500);
    await runAutomation(contact);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CTWA_PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === "RUN_PENDING_CONTACT") {
      if (automationRunning) {
        sendResponse({ ok: true, status: "already_running" });
        return true;
      }
      automationDone = false;
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
      processPendingContact({ immediate: true, contact: message.contact });
      sendResponse({ ok: true });
      return true;
    }
  });

  setTimeout(async () => {
    if (automationRunning || automationDone) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_PENDING_CONTACT",
      });
      const contact = response?.contact;
      if (!contact?.awaitingTrigger) return;
      const age = Date.now() - (contact.createdAt || 0);
      if (age > MAX_AGE_MS) return;
      await processPendingContact({ immediate: true, contact });
    } catch {
      /* background unavailable */
    }
  }, 600);
})();
