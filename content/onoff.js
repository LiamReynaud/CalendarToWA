(function () {
  const SCRIPT_ID = "1.15.0-onoff";
  if (window.__CTWA_ONOFF_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_ONOFF_SCRIPT__ = SCRIPT_ID;

  const MESSAGES_URL = "https://phone.onoffbusiness.com/messages";
  const CONTACTS_URL = "https://phone.onoffbusiness.com/contacts";
  const MAX_AGE_MS = 5 * 60 * 1000;

  let overlayEl = null;
  let overlayPosition = null;
  let overlayContact = null;
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

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function resolveClickTarget(element) {
    if (!element) return null;
    return (
      element.closest(
        'button, a, [role="button"], [role="menuitemradio"], [role="menuitem"], [tabindex="0"]'
      ) || element
    );
  }

  function simulateClick(element) {
    const target = resolveClickTarget(element);
    if (!target) return false;
    target.scrollIntoView({ block: "center", behavior: "instant" });
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

  async function userClick(element) {
    await sleep(80);
    return simulateClick(element);
  }

  function findClickableByText(patterns, root = document, maxLen = 80) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const nodes = root.querySelectorAll(
      "button, a, [role='button'], [role='menuitem'], [role='menuitemradio'], li, span, div"
    );
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const text = normalizeText(el.textContent);
      if (!text || text.length > maxLen) continue;
      for (const pattern of list) {
        const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
        if (re.test(text)) {
          return resolveClickTarget(el);
        }
      }
    }
    return null;
  }

  function findByTestId(testId, root = document) {
    return root.querySelector(`[data-testid="${testId}"]`);
  }

  async function openAddContactMenu() {
    const addBtn =
      findByTestId("contacts-new-contact-button") ||
      findClickableByText([/ajouter un contact/i]);
    if (!addBtn) return false;

    await userClick(addBtn);

    for (let i = 0; i < 24; i++) {
      const manualRoot = findByTestId("contacts-new-contact-button-add-manually");
      const menuBtn = manualRoot?.closest('button[role="menuitemradio"]');
      if (manualRoot && menuBtn && isVisible(menuBtn)) return true;
      await sleep(150);
    }

    return Boolean(findByTestId("contacts-new-contact-button-add-manually"));
  }

  async function clickAddManuallyOption() {
    const manualRoot = findByTestId("contacts-new-contact-button-add-manually");
    if (!manualRoot) {
      const fallback = findClickableByText([/ajouter manuellement/i]);
      if (!fallback) return null;
      await userClick(fallback);
      return fallback;
    }

    const clickTarget =
      manualRoot.closest('button[role="menuitemradio"]') ||
      manualRoot.closest("button") ||
      manualRoot;
    await userClick(clickTarget);
    return clickTarget;
  }

  async function ensureMessagesPage() {
    if (/\/messages(?:\/|$|\?|#)/i.test(location.pathname)) return true;

    const navLink =
      document.querySelector('a[href="/messages"]') ||
      findClickableByText([/^messages$/i]);
    if (navLink) {
      await userClick(navLink);
      await sleep(1200);
      if (/\/messages/i.test(location.pathname)) return true;
    }

    window.location.href = MESSAGES_URL;
    for (let i = 0; i < 40; i++) {
      if (/\/messages/i.test(location.pathname)) return true;
      await sleep(300);
    }
    return /\/messages/i.test(location.pathname);
  }

  async function ensureContactsPage() {
    if (/\/contacts(?:\/|$|\?|#)/i.test(location.pathname)) return true;

    const navLink =
      document.querySelector('a[href="/contacts"]') ||
      findClickableByText([/^contacts$/i]);
    if (navLink) {
      await userClick(navLink);
      await sleep(1200);
      if (/\/contacts/i.test(location.pathname)) return true;
    }

    window.location.href = CONTACTS_URL;
    for (let i = 0; i < 40; i++) {
      if (/\/contacts/i.test(location.pathname)) return true;
      await sleep(300);
    }
    return /\/contacts/i.test(location.pathname);
  }

  function buildSearchQuery(contact) {
    return (
      contact.rawPhone ||
      (contact.phone ? "+" + contact.phone : "") ||
      contact.nationalNumber ||
      ""
    );
  }

  function getMessageThreadEntries() {
    const listRoot =
      document.querySelector('[data-testid="virtuoso-item-list"]') ||
      document.querySelector('[class*="MessagesList_root"]') ||
      document.querySelector('[class*="ThreadsList"]');
    if (!listRoot) return [];

    const seen = new Set();
    const entries = [];

    listRoot
      .querySelectorAll('[class*="ListItem"], [class*="Thread"], [data-testid*="threads-list"]')
      .forEach((el) => {
        if (!isVisible(el)) return;
        const row = el.closest('[class*="ListItem"]') || el;
        if (seen.has(row)) return;
        const text = (row.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length < 3 || text.length > 280) return;
        seen.add(row);
        entries.push({
          row,
          text: normalizeText(text),
          digits: phoneDigits(text),
        });
      });

    return entries;
  }

  function pickMessageThreadEntry(entries, contact) {
    if (!entries.length) return null;

    const queryDigits = phoneDigits(buildSearchQuery(contact));
    const expectedName = contactExpectedFullName(contact);

    if (queryDigits) {
      const byPhone = entries.filter((entry) => phonesMatch(entry.digits, queryDigits));
      if (byPhone.length === 1) return byPhone[0];
      if (byPhone.length > 1 && expectedName) {
        const named = byPhone.find((entry) => entry.text.includes(expectedName));
        if (named) return named;
      }
    }

    if (expectedName) {
      const byName = entries.find((entry) => entry.text.includes(expectedName));
      if (byName) return byName;
      const parts = expectedName.split(/\s+/).filter((p) => p.length > 1);
      if (parts.length) {
        const partial = entries.find((entry) =>
          parts.every((part) => entry.text.includes(part))
        );
        if (partial) return partial;
      }
    }

    if (entries.length === 1) return entries[0];
    return null;
  }

  async function waitForListSearchResults(contact, searchInput, getEntries) {
    const queryDigits = phoneDigits(buildSearchQuery(contact));
    let prevCount = null;

    for (let i = 0; i < 36; i++) {
      await sleep(i === 0 ? 450 : 250);

      const inputDigits = phoneDigits(getInputValue(searchInput));
      const inputReady =
        !queryDigits ||
        inputDigits === queryDigits ||
        inputDigits.endsWith(queryDigits) ||
        queryDigits.endsWith(inputDigits);
      if (!inputReady) continue;

      const entries = getEntries();
      const count = entries.length;

      if (prevCount === count) {
        if (count === 0) {
          return { entries: [], empty: true };
        }
        if (queryDigits.length >= 10 && count > 2 && i < 12) {
          prevCount = count;
          continue;
        }
        return { entries, empty: false };
      }

      prevCount = count;
    }

    const entries = getEntries();
    return { entries, empty: entries.length === 0 };
  }

  async function waitForMessageSearchResults(contact, searchInput) {
    return waitForListSearchResults(contact, searchInput, getMessageThreadEntries);
  }

  function collectSearchInputs(root = document) {
    const found = [];
    const candidates = root.querySelectorAll(
      'input[type="search"], input[type="text"], input:not([type]), [role="searchbox"], [contenteditable="true"]'
    );
    candidates.forEach((el) => {
      if (!isVisible(el)) return;
      const label = normalizeText(
        el.getAttribute("aria-label") ||
          el.placeholder ||
          el.getAttribute("aria-placeholder") ||
          ""
      );
      if (
        /recherch|search|contact|num|t[eé]l|phone/.test(label) ||
        el.closest('[class*="contact"], [data-testid*="contact"]')
      ) {
        if (!found.includes(el)) found.push(el);
      }
    });
    if (!found.length) {
      root.querySelectorAll('input[type="search"], input[type="text"]').forEach((el) => {
        if (isVisible(el) && !found.includes(el)) found.push(el);
      });
    }
    return found;
  }

  function getInputValue(input) {
    if (!input) return "";
    if (input.value != null && String(input.value).trim()) return String(input.value).trim();
    if (input.isContentEditable) return (input.textContent || "").trim();
    const editable = input.closest('[contenteditable="true"]');
    if (editable) return (editable.textContent || "").trim();
    return "";
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
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
    } else {
      input.select?.();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      if (setter) setter.call(input, "");
      else input.value = "";
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(80);
  }

  async function fillInputField(input, value) {
    if (!input || value == null) return;
    await clearInputField(input);
    input.focus();
    document.execCommand("insertText", false, value);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (!input.isContentEditable && !input.closest?.('[contenteditable="true"]')) {
      if (setter) setter.call(input, value);
      else input.value = value;
    }
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(400);
  }

  function findContactsSearchInput() {
    return (
      document.querySelector('input[name="SideBarSearch"]') ||
      document.querySelector('input[placeholder="Rechercher"]') ||
      collectSearchInputs(document)[0] ||
      null
    );
  }

  function getOnoffContactListEntries() {
    const listRoot =
      document.querySelector('[data-testid="virtuoso-item-list"]') ||
      document.querySelector('[class*="ContactsList_root"]');
    const scope = listRoot || document;

    return [...scope.querySelectorAll('[data-testid="contacts-contact-list-display-name"]')]
      .filter(isVisible)
      .map((nameEl) => {
        const row =
          nameEl.closest('[class*="ContactsListItemContact_root"]') || nameEl.parentElement;
        return {
          nameEl,
          row,
          name: normalizeText(nameEl.textContent),
        };
      });
  }

  function contactExpectedFullName(contact) {
    return normalizeText(
      [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    );
  }

  function pickContactListEntry(entries, contact) {
    if (!entries.length) return null;

    const expectedName = contactExpectedFullName(contact);
    if (expectedName) {
      const byName = entries.find((entry) => entry.name === expectedName);
      if (byName) return byName;
      const partial = entries.find(
        (entry) => entry.name.includes(expectedName) || expectedName.includes(entry.name)
      );
      if (partial) return partial;
    }

    if (entries.length === 1) return entries[0];
    return null;
  }

  async function waitForContactSearchResults(contact, searchInput) {
    return waitForListSearchResults(contact, searchInput, getOnoffContactListEntries);
  }

  function findContactRowByPhone(contact) {
    const entries = getOnoffContactListEntries();
    return pickContactListEntry(entries, contact)?.row || null;
  }

  function findFieldByLabels(labels, root = document) {
    const wanted = labels.map((l) => normalizeText(l));

    for (const labelEl of root.querySelectorAll("label")) {
      const labelText = normalizeText(labelEl.textContent);
      if (!wanted.some((w) => labelText.includes(w))) continue;
      const forId = labelEl.getAttribute("for");
      if (forId) {
        const input = root.getElementById(forId);
        if (input && isVisible(input)) return input;
      }
      const nested = labelEl.querySelector("input, textarea, [contenteditable='true']");
      if (nested && isVisible(nested)) return nested;
      const next = labelEl.parentElement?.querySelector(
        "input, textarea, [contenteditable='true']"
      );
      if (next && isVisible(next)) return next;
    }

    for (const input of root.querySelectorAll(
      "input, textarea, [contenteditable='true']"
    )) {
      if (!isVisible(input)) continue;
      const aria = normalizeText(input.getAttribute("aria-label") || input.placeholder || "");
      if (wanted.some((w) => aria.includes(w))) return input;
    }

    return null;
  }

  async function fillManualContactForm(contact) {
    const root =
      document.querySelector(".ModalCore_root") ||
      document.querySelector('[role="dialog"]') ||
      document;

    const firstNameField =
      findByTestId("modal-add-edit-contact-input-name-first", root) ||
      findFieldByLabels(["prénom", "prenom", "first name", "first"], root);
    const lastNameField =
      findByTestId("modal-add-edit-contact-input-name-last", root) ||
      findFieldByLabels(["nom", "last name", "last"], root);
    const companyField =
      findByTestId("modal-add-edit-contact-input-company", root) ||
      findFieldByLabels(["entreprise", "société", "company", "organization"], root);
    const phoneField =
      findByTestId("modal-add-edit-contact-input-phone", root) ||
      findFieldByLabels(["téléphone", "telephone", "phone", "mobile", "numéro"], root);

    if (contact.firstName && firstNameField) {
      await fillInputField(firstNameField, contact.firstName);
    }
    if (contact.lastName && lastNameField) {
      await fillInputField(lastNameField, contact.lastName);
    }
    if (contact.companyName && companyField) {
      await fillInputField(companyField, contact.companyName);
    }

    const phoneValue =
      contact.rawPhone ||
      (contact.phone ? "+" + contact.phone : "") ||
      contact.nationalNumber ||
      "";
    if (phoneValue && phoneField) {
      await fillInputField(phoneField, phoneValue);
    }

    return {
      filled: Boolean(firstNameField || lastNameField || phoneField),
      hasCompany: Boolean(companyField && contact.companyName),
    };
  }

  async function clickSaveContact(root = document) {
    const saveBtn =
      findByTestId("modal-add-edit-contact-button-confirm", root) ||
      findClickableByText(
        [/enregistrer/i, /save/i, /cr[eé]er le contact/i, /valider/i],
        root,
        40
      ) ||
      root.querySelector('[type="submit"]');
    if (!saveBtn) return false;
    await userClick(saveBtn);
    await sleep(1000);
    return true;
  }

  function contactSummary(contact) {
    const parts = [];
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    if (fullName) parts.push(fullName);
    else if (contact.firstName) parts.push(contact.firstName);
    if (contact.companyName) parts.push(contact.companyName);
    parts.push(contact.rawPhone || "+" + contact.phone);
    return parts.filter(Boolean).join(" — ");
  }

  function contactEventDateLabel(contact) {
    const normalized = window.CalendarToWA?.normalizeEventDateLabel?.(
      contact.eventDate || ""
    );
    return normalized ? `RDV : ${normalized}` : "";
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
    overlayContact = contact;

    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "ctwa-overlay";
      overlayEl.className = "ctwa-overlay ctwa-overlay--onoff";
      overlayEl.innerHTML = `
        <div class="ctwa-overlay__card">
          <div class="ctwa-overlay__header">
            <span class="ctwa-overlay__icon">📞</span>
            <strong>Calendar → Onoff</strong>
          </div>
          <p class="ctwa-overlay__step"></p>
          <p class="ctwa-overlay__status"></p>
          <p class="ctwa-overlay__event-date"></p>
          <p class="ctwa-overlay__meet-link"></p>
          <p class="ctwa-overlay__details"></p>
          <div class="ctwa-overlay__actions">
            <button type="button" class="ctwa-overlay__btn ctwa-overlay__btn--primary" data-action="retry">
              Réessayer
            </button>
            <button type="button" class="ctwa-overlay__btn" data-action="dismiss">
              Fermer
            </button>
          </div>
        </div>`;
      document.body.appendChild(overlayEl);

      const card = overlayEl.querySelector(".ctwa-overlay__card");
      applyOverlayPosition(card);
      attachOverlayDrag(card, card);

      overlayEl.querySelector('[data-action="dismiss"]').addEventListener("click", () => {
        overlayEl.remove();
        overlayEl = null;
        overlayContact = null;
        chrome.runtime.sendMessage({ type: "CLEAR_PENDING_CONTACT" });
      });

      overlayEl.querySelector('[data-action="retry"]').addEventListener("click", () => {
        if (!overlayContact) return;
        automationDone = false;
        runAutomation(overlayContact);
      });
    }

    overlayEl.querySelector(".ctwa-overlay__step").textContent = step;
    overlayEl.querySelector(".ctwa-overlay__status").textContent = status;

    const eventDateEl = overlayEl.querySelector(".ctwa-overlay__event-date");
    const eventDateLabel = contactEventDateLabel(contact);
    eventDateEl.textContent = eventDateLabel;
    eventDateEl.hidden = !eventDateLabel;

    const meetEl = overlayEl.querySelector(".ctwa-overlay__meet-link");
    if (contact.meetUrl) {
      meetEl.innerHTML = `Visio : <a href="${contact.meetUrl}" target="_blank" rel="noopener noreferrer">${contact.meetUrl.replace(/^https:\/\//, "")}</a>`;
      meetEl.hidden = false;
    } else {
      meetEl.textContent = "";
      meetEl.hidden = true;
    }

    overlayEl.querySelector(".ctwa-overlay__details").textContent =
      contactSummary(contact);
    overlayEl.classList.toggle("ctwa-overlay--error", isError);

    const retryBtn = overlayEl.querySelector('[data-action="retry"]');
    retryBtn.style.display = showRetry ? "inline-block" : "none";

    const card = overlayEl.querySelector(".ctwa-overlay__card");
    if (card) applyOverlayPosition(card);
  }

  async function runAutomation(contact) {
    if (automationDone || automationRunning) return;
    automationRunning = true;

    try {
      const alreadyOnMessages = /\/messages(?:\/|$|\?|#)/i.test(location.pathname);

      if (!alreadyOnMessages) {
        showOverlay(contact, "Ouverture de la page Messages…", {
          step: "Étape 1/6 — Messages",
        });
      }

      const onMessages = alreadyOnMessages || (await ensureMessagesPage());
      if (!onMessages) {
        showOverlay(
          contact,
          "Connectez-vous à Onoff, puis ouvrez Messages et cliquez « Réessayer ».",
          { isError: true, step: "Connexion requise", showRetry: true }
        );
        return;
      }

      showOverlay(contact, "Recherche dans les discussions…", {
        step: "Étape 2/6 — Messages",
      });

      const query = buildSearchQuery(contact);
      const searchInput = findContactsSearchInput();
      if (!searchInput) {
        showOverlay(
          contact,
          "Champ de recherche introuvable sur Messages.",
          { isError: true, step: "Recherche Messages", showRetry: true }
        );
        return;
      }

      await fillInputField(searchInput, query);

      const messageSearch = await waitForMessageSearchResults(contact, searchInput);
      const messageEntry = pickMessageThreadEntry(messageSearch.entries, contact);

      if (messageEntry?.row) {
        await userClick(messageEntry.row);
        chrome.runtime.sendMessage({ type: "ACK_PENDING_TRIGGER" });
        automationDone = true;
        showOverlay(contact, "Discussion ouverte.", {
          step: "Terminé",
          showRetry: false,
        });
        return;
      }

      showOverlay(contact, "Discussion absente — ouverture Contacts…", {
        step: "Étape 3/6 — Contacts",
      });

      const onContacts = await ensureContactsPage();
      if (!onContacts) {
        showOverlay(
          contact,
          "Impossible d’ouvrir la page Contacts.",
          { isError: true, step: "Contacts", showRetry: true }
        );
        return;
      }

      showOverlay(contact, "Recherche dans l’annuaire…", {
        step: "Étape 4/6 — Annuaire",
      });

      const contactsSearchInput = findContactsSearchInput();
      if (!contactsSearchInput) {
        showOverlay(
          contact,
          "Champ de recherche Contacts introuvable.",
          { isError: true, step: "Annuaire", showRetry: true }
        );
        return;
      }

      await fillInputField(contactsSearchInput, query);

      const contactSearch = await waitForContactSearchResults(contact, contactsSearchInput);
      const listEntry = pickContactListEntry(contactSearch.entries, contact);
      const existingRow = listEntry?.row || null;

      if (existingRow) {
        await userClick(existingRow);
        chrome.runtime.sendMessage({ type: "ACK_PENDING_TRIGGER" });
        automationDone = true;
        showOverlay(contact, "Contact existant ouvert.", {
          step: "Terminé",
          showRetry: false,
        });
        return;
      }

      showOverlay(contact, "Contact absent — ajout manuel…", {
        step: "Étape 5/6 — Ajout",
      });

      const menuOpen = await openAddContactMenu();
      if (!menuOpen) {
        showOverlay(
          contact,
          "Bouton « Ajouter un contact » introuvable ou menu non ouvert.",
          { isError: true, step: "Ajout", showRetry: true }
        );
        return;
      }

      const manualClicked = await clickAddManuallyOption();
      if (!manualClicked) {
        showOverlay(
          contact,
          "Option « Ajouter manuellement » introuvable.",
          { isError: true, step: "Ajout", showRetry: true }
        );
        return;
      }

      let formReady = false;
      for (let i = 0; i < 30; i++) {
        const firstNameField =
          findByTestId("modal-add-edit-contact-input-name-first") ||
          findFieldByLabels(["prénom", "prenom", "first name", "first"], document);
        if (firstNameField) {
          formReady = true;
          break;
        }
        await sleep(200);
      }
      if (!formReady) await sleep(400);

      showOverlay(contact, "Remplissage du formulaire…", {
        step: "Étape 6/6 — Saisie",
      });

      const fillResult = await fillManualContactForm(contact);
      if (!fillResult.filled) {
        showOverlay(
          contact,
          "Formulaire de contact non détecté ou champs introuvables.",
          { isError: true, step: "Saisie", showRetry: true }
        );
        return;
      }

      showOverlay(contact, "Enregistrement…", { step: "Étape 6/6 — Validation" });

      const saved = await clickSaveContact(
        document.querySelector(".ModalCore_root") || document
      );
      if (!saved) {
        showOverlay(
          contact,
          "Champs remplis — validez l’enregistrement manuellement si besoin.",
          { isError: true, step: "Validation", showRetry: true }
        );
        return;
      }

      chrome.runtime.sendMessage({ type: "ACK_PENDING_TRIGGER" });
      automationDone = true;
      showOverlay(contact, "Contact Onoff enregistré.", {
        step: "Terminé",
        showRetry: false,
      });
    } finally {
      automationRunning = false;
    }
  }

  async function processPendingContact(options = {}) {
    const { contact: contactOverride = null } = options;
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

    if (!contact || contact.destination !== "onoff") return;

    const age = Date.now() - (contact.createdAt || 0);
    if (age > MAX_AGE_MS) {
      chrome.runtime.sendMessage({ type: "CLEAR_PENDING_CONTACT" });
      return;
    }

    await sleep(800);
    await runAutomation(contact);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CTWA_ONOFF_PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === "RUN_PENDING_ONOFF_CONTACT") {
      if (automationRunning) {
        sendResponse({ ok: true, status: "already_running" });
        return true;
      }
      automationDone = false;
      processPendingContact({ contact: message.contact });
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
      if (!contact?.awaitingTrigger || contact.destination !== "onoff") return;
      const age = Date.now() - (contact.createdAt || 0);
      if (age > MAX_AGE_MS) return;
      await processPendingContact({ contact });
    } catch {
      /* background unavailable */
    }
  }, 600);
})();
