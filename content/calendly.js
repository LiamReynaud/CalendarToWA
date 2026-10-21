(function () {
  const SCRIPT_ID = "1.16.0-cal";
  if (window.__CTWA_CALENDLY_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_CALENDLY_SCRIPT__ = SCRIPT_ID;

  const WIDGET_CLASS = "ctwa-widget";
  const BANNER_CLASS = "ctwa-banner";
  const WA_BANNER_CLASS = "ctwa-banner--wa";
  const HIDDEN_CLASS = "ctwa-banner--hidden";

  const PHONE_LABELS = [
    "Numéro de téléphone",
    "Phone number",
    "Téléphone",
    "Phone",
  ];
  const NAME_LABELS = ["Nom", "Name"];
  const PHONE_TEXT_REGEX = /(?:\+?\d[\d\s().-]{7,}\d)/;

  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .609.609l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.592-.832-6.323-2.22l-.448-.372-2.605.872.872-2.538-.39-.453A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>`;

  let enableCalendlyWhatsApp = null;
  let settingsLoaded = false;
  let defaultCountryCode = "33";
  let cachedSuffixes = { suffixes: [], lastSuffix: "" };
  let waWidget = null;
  let lastKey = "";

  const phoneUtils = window.CalendarToWA;
  const {
    normalizeForWhatsApp,
    formatDisplay,
    parsePhoneParts,
    extractMeetUrl,
    extractSuffixFromEvent,
    formatSuffixForWhatsApp,
    extractEventDateFromScopes,
  } = phoneUtils || {};

  chrome.storage.sync.get(
    {
      defaultCountryCode: "33",
      enableWhatsApp: true,
      suffixes: [],
      lastSuffix: "",
    },
    (data) => {
      chrome.storage.sync.get("enableCalendlyWhatsApp", (calWa) => {
        const hasSetting = "enableCalendlyWhatsApp" in calWa;
        enableCalendlyWhatsApp = hasSetting
          ? calWa.enableCalendlyWhatsApp === true
          : data.enableWhatsApp !== false;
        defaultCountryCode = data.defaultCountryCode || "33";
        cachedSuffixes = {
          suffixes: data.suffixes || [],
          lastSuffix: data.lastSuffix || "",
        };
        settingsLoaded = true;
        tickMeetingWhatsApp();
      });
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableCalendlyWhatsApp) {
      enableCalendlyWhatsApp = changes.enableCalendlyWhatsApp.newValue === true;
      tickMeetingWhatsApp();
    }
    if (changes.defaultCountryCode) {
      defaultCountryCode = changes.defaultCountryCode.newValue || "33";
      lastKey = "";
      tickMeetingWhatsApp();
    }
    if (changes.suffixes || changes.lastSuffix) {
      chrome.storage.sync.get({ suffixes: [], lastSuffix: "" }, (data) => {
        cachedSuffixes = {
          suffixes: data.suffixes || [],
          lastSuffix: data.lastSuffix || "",
        };
        lastKey = "";
        tickMeetingWhatsApp();
      });
    }
  });

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isMeetingDetailOpen() {
    const params = new URLSearchParams(location.search);
    return (
      params.get("pane") === "meeting_details" ||
      params.has("paneState") ||
      params.has("selected")
    );
  }

  function findMeetingDetailRoot() {
    if (!isMeetingDetailOpen()) return null;

    const closeBtn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Fermer"
    );
    if (closeBtn) {
      return (
        closeBtn.closest('[role="dialog"]') ||
        closeBtn.closest("aside") ||
        closeBtn.closest("[class*='pane']") ||
        closeBtn.parentElement?.parentElement
      );
    }

    const detailsTab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
      /détails|details/i.test(t.textContent || "")
    );
    return detailsTab?.closest("aside, [role='dialog'], main") || null;
  }

  function directText(el) {
    if (!el) return "";
    return [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || "")
      .join("")
      .trim();
  }

  function extractFieldValue(root, labelTexts) {
    const wanted = new Set(labelTexts.map((l) => l.toLowerCase()));
    const nodes = [...root.querySelectorAll("p, span, div, dt, label, h4, h5, strong")];

    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const label = directText(el) || el.textContent?.trim() || "";
      if (!label || label.length > 80) continue;
      if (!wanted.has(label.toLowerCase())) continue;

      let sibling = el.nextElementSibling;
      while (sibling) {
        const value = sibling.textContent?.trim() || "";
        if (value && value !== label && value.length < 120) return value;
        sibling = sibling.nextElementSibling;
      }

      const parent = el.parentElement;
      if (parent) {
        const children = [...parent.children];
        const idx = children.indexOf(el);
        if (idx >= 0 && idx + 1 < children.length) {
          const value = children[idx + 1].textContent?.trim() || "";
          if (value && value !== label) return value;
        }
      }
    }
    return "";
  }

  function phoneResultFromRaw(raw) {
    if (!phoneUtils || !raw) return null;
    const normalized = normalizeForWhatsApp(raw, defaultCountryCode);
    if (!normalized) return null;
    const parts = parsePhoneParts(normalized, defaultCountryCode);
    return {
      raw,
      normalized,
      display: formatDisplay(raw),
      countryCode: parts.countryCode,
      nationalNumber: parts.nationalNumber,
    };
  }

  function splitGuestName(fullName) {
    const trimmed = (fullName || "").trim();
    if (!trimmed) return { firstName: "", lastName: "", searchNames: [] };
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    const searchNames = lastName ? [trimmed, firstName] : [firstName];
    return { firstName, lastName, searchNames };
  }

  function extractEventDate(root) {
    if (!root || !extractEventDateFromScopes) return "";
    // Uniquement le panneau RDV — pas document (grille Calendly = mauvais jour).
    return extractEventDateFromScopes([root]);
  }

  function extractEventTitle(root) {
    for (const sel of ["h1", "h2", "h3"]) {
      for (const heading of root.querySelectorAll(sel)) {
        const title = heading.textContent?.trim() || "";
        if (title.length < 6) continue;
        if (/^invités$|^questions$|^lieu$|^organisateurs$|^chronologie$/i.test(title)) {
          continue;
        }
        return title;
      }
    }

    const titleLink = [...root.querySelectorAll("a")].find((a) => {
      const t = a.textContent?.trim() || "";
      return t.length > 8 && (t.includes(" - ") || /candidature|call|meeting|rdv/i.test(t));
    });
    return titleLink?.textContent?.trim() || "";
  }

  function buildSelect(options, selectedValue, customOptionLabel) {
    const select = document.createElement("select");
    select.className = "ctwa-banner__select";
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === selectedValue) option.selected = true;
      select.appendChild(option);
    }
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = customOptionLabel;
    if (selectedValue === "__custom__") custom.selected = true;
    select.appendChild(custom);
    return select;
  }

  function saveSuffix(suffix) {
    const trimmed = (suffix || "").trim();
    if (!trimmed) return;

    chrome.storage.sync.get({ suffixes: [], lastSuffix: "" }, (data) => {
      const suffixes = [...(data.suffixes || [])];
      if (!suffixes.includes(trimmed)) suffixes.unshift(trimmed);
      chrome.storage.sync.set(
        {
          suffixes: suffixes.slice(0, 20),
          lastSuffix: trimmed,
        },
        () => {
          cachedSuffixes = { suffixes: suffixes.slice(0, 20), lastSuffix: trimmed };
        }
      );
    });
  }

  function appendMeetLinkField(form, meetUrl) {
    if (!meetUrl) return;

    const meetLabel = document.createElement("span");
    meetLabel.className = "ctwa-banner__label";
    meetLabel.textContent = "Visio Meet";
    form.appendChild(meetLabel);

    const meetLink = document.createElement("a");
    meetLink.className = "ctwa-banner__meet-link";
    meetLink.href = meetUrl;
    meetLink.target = "_blank";
    meetLink.rel = "noopener noreferrer";
    meetLink.textContent = meetUrl.replace(/^https:\/\//, "");
    form.appendChild(meetLink);
  }

  function extractMeetingData() {
    const root = findMeetingDetailRoot();
    if (!root) return null;

    let rawPhone =
      extractFieldValue(root, PHONE_LABELS) ||
      root.querySelector('a[href^="tel:"]')?.textContent?.trim() ||
      "";

    if (!rawPhone) {
      const match = root.textContent?.match(PHONE_TEXT_REGEX);
      rawPhone = match ? match[0].trim() : "";
    }

    const phone = phoneResultFromRaw(rawPhone);
    if (!phone) return null;

    const guestName = extractFieldValue(root, NAME_LABELS);
    const { firstName, lastName, searchNames } = splitGuestName(guestName);

    const emailBtn = [...root.querySelectorAll("button")].find((b) =>
      /^E-mail$|^Email$/i.test(b.textContent?.trim() || "")
    );
    if (!emailBtn) return null;

    const eventTitle = extractEventTitle(root);
    const detectedSuffix = extractSuffixFromEvent
      ? extractSuffixFromEvent(eventTitle, root.textContent || "", cachedSuffixes.suffixes)
      : "";

    const meetLink = root.querySelector('a[href*="meet.google"], a[href*="zoom.us"]');
    const meetUrl = meetLink ? extractMeetUrl(meetLink.getAttribute("href") || "") : "";

    return {
      mountAnchor: emailBtn.parentElement || emailBtn,
      phone,
      firstName,
      lastName,
      searchNames,
      detectedSuffix,
      eventDate: extractEventDate(root),
      meetUrl: meetUrl || "",
      key: `${location.search}|${phone.normalized}|${guestName}|${detectedSuffix || "full"}`,
    };
  }

  function buildWhatsAppPayload(data, overrides = {}) {
    return {
      phone: data.phone.normalized,
      rawPhone: data.phone.raw,
      countryCode: data.phone.countryCode,
      nationalNumber: data.phone.nationalNumber,
      firstName: overrides.firstName ?? data.firstName,
      lastName: overrides.lastName ?? data.lastName,
      searchNames: data.searchNames,
      eventDate: data.eventDate || "",
      meetUrl: data.meetUrl || "",
    };
  }

  function openWhatsAppContact(contact, btn) {
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "Ouverture…";

    try {
      chrome.runtime.sendMessage({
        type: "OPEN_WHATSAPP_CONTACT",
        payload: contact,
      });
    } catch {
      btn.disabled = false;
      btn.textContent = "Erreur — réessayer";
      return;
    }

    btn.textContent = "WhatsApp ouvert ✓";
    const widget = btn.closest(`.${WIDGET_CLASS}`);
    widget?.querySelector(`.${WA_BANNER_CLASS}`)?.classList.add(HIDDEN_CLASS);
    widget?.querySelector(".ctwa-trigger--wa")?.setAttribute("aria-expanded", "false");

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = prevText;
    }, 1500);
  }

  function createPhoneRow(data) {
    const { phone, searchNames, firstName, detectedSuffix, meetUrl } = data;
    const names = searchNames?.length ? searchNames : firstName ? [firstName] : [];

    const row = document.createElement("div");
    row.className = "ctwa-banner__row";

    const phoneEl = document.createElement("span");
    phoneEl.className = "ctwa-banner__phone";
    phoneEl.textContent = phone.display;
    row.appendChild(phoneEl);

    const form = document.createElement("div");
    form.className = "ctwa-banner__form";

    const nameLabel = document.createElement("label");
    nameLabel.className = "ctwa-banner__label";
    nameLabel.textContent = "Prénom (WhatsApp)";
    form.appendChild(nameLabel);

    const nameOptions = names.map((n) => ({ value: n, label: n }));
    if (nameOptions.length === 0) {
      nameOptions.push({ value: "", label: "— Saisir ci-dessous —" });
    }
    const nameSelect = buildSelect(nameOptions, nameOptions[0]?.value || "", "Autre…");
    form.appendChild(nameSelect);

    const nameCustom = document.createElement("input");
    nameCustom.type = "text";
    nameCustom.className = "ctwa-banner__input";
    nameCustom.placeholder = "Prénom personnalisé";
    nameCustom.hidden = nameSelect.value !== "__custom__";
    form.appendChild(nameCustom);
    nameSelect.addEventListener("change", () => {
      nameCustom.hidden = nameSelect.value !== "__custom__";
    });

    const suffixLabel = document.createElement("label");
    suffixLabel.className = "ctwa-banner__label";
    suffixLabel.textContent = "Suffixe → nom WhatsApp";
    form.appendChild(suffixLabel);

    const suffixList = [
      ...new Set(
        [detectedSuffix, ...(cachedSuffixes.suffixes || []), cachedSuffixes.lastSuffix].filter(
          Boolean
        )
      ),
    ];
    const suffixOptions = [
      { value: "", label: "— Aucun —" },
      ...suffixList.map((s) => ({ value: s, label: s })),
    ];
    const defaultSuffix =
      (detectedSuffix && suffixList.includes(detectedSuffix) && detectedSuffix) ||
      (cachedSuffixes.lastSuffix && suffixList.includes(cachedSuffixes.lastSuffix)
        ? cachedSuffixes.lastSuffix
        : "");
    const suffixSelect = buildSelect(suffixOptions, defaultSuffix, "Autre…");
    form.appendChild(suffixSelect);

    const suffixCustom = document.createElement("input");
    suffixCustom.type = "text";
    suffixCustom.className = "ctwa-banner__input";
    suffixCustom.placeholder = "Suffixe personnalisé (ex. Alegria)";
    suffixCustom.hidden = suffixSelect.value !== "__custom__";
    form.appendChild(suffixCustom);
    suffixSelect.addEventListener("change", () => {
      suffixCustom.hidden = suffixSelect.value !== "__custom__";
    });

    appendMeetLinkField(form, meetUrl);

    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "ctwa-banner__btn";
    waBtn.textContent = "Créer ou ouvrir le contact";
    waBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const selectedName =
        nameSelect.value === "__custom__" ? nameCustom.value.trim() : nameSelect.value.trim();
      const suffixRaw =
        suffixSelect.value === "__custom__" ? suffixCustom.value.trim() : suffixSelect.value.trim();

      if (!selectedName) {
        nameCustom.hidden = false;
        nameCustom.focus();
        nameCustom.placeholder = "Prénom requis";
        return;
      }

      if (suffixRaw) saveSuffix(suffixRaw);

      openWhatsAppContact(
        buildWhatsAppPayload(data, {
          firstName: selectedName,
          lastName: formatSuffixForWhatsApp(suffixRaw),
        }),
        waBtn
      );
    });
    form.appendChild(waBtn);

    row.appendChild(form);
    return row;
  }

  function toggleWaOverlay(widget) {
    const banner = widget.querySelector(`.${WA_BANNER_CLASS}`);
    const trigger = widget.querySelector(".ctwa-trigger--wa");
    if (!banner || !trigger) return;

    const willOpen = banner.classList.contains(HIDDEN_CLASS);
    if (willOpen) {
      banner.classList.remove(HIDDEN_CLASS);
      trigger.setAttribute("aria-expanded", "true");
    } else {
      banner.classList.add(HIDDEN_CLASS);
      trigger.setAttribute("aria-expanded", "false");
    }
  }

  function createWhatsAppWidget(data) {
    const widget = document.createElement("div");
    widget.className = WIDGET_CLASS;

    const triggers = document.createElement("div");
    triggers.className = "ctwa-triggers";

    const waTrigger = document.createElement("button");
    waTrigger.type = "button";
    waTrigger.className = "ctwa-trigger ctwa-trigger--wa";
    waTrigger.setAttribute("aria-label", "Ajouter le contact sur WhatsApp");
    waTrigger.setAttribute("aria-expanded", "false");
    waTrigger.title = "Ajouter sur WhatsApp";
    waTrigger.innerHTML = WA_ICON_SVG;
    triggers.appendChild(waTrigger);
    widget.appendChild(triggers);

    const banner = document.createElement("div");
    banner.className = `${BANNER_CLASS} ${WA_BANNER_CLASS} ${HIDDEN_CLASS}`;
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Contacts WhatsApp détectés");

    const header = document.createElement("div");
    header.className = "ctwa-banner__header";
    header.innerHTML = `
      <span class="ctwa-banner__title">Ajouter sur WhatsApp</span>
      <button type="button" class="ctwa-banner__close" aria-label="Fermer">×</button>
    `;
    banner.appendChild(header);

    header.querySelector(".ctwa-banner__close").addEventListener("click", (e) => {
      e.stopPropagation();
      banner.classList.add(HIDDEN_CLASS);
      waTrigger.setAttribute("aria-expanded", "false");
    });

    const names = data.searchNames?.length
      ? data.searchNames
      : data.firstName
        ? [data.firstName]
        : [];
    if (names.length > 0) {
      const hint = document.createElement("p");
      hint.className = "ctwa-banner__hint";
      hint.textContent = `${names.length} nom(s) détecté(s) dans le RDV`;
      banner.appendChild(hint);
    }

    const list = document.createElement("div");
    list.className = "ctwa-banner__list";
    list.appendChild(createPhoneRow(data));
    banner.appendChild(list);
    widget.appendChild(banner);

    waTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWaOverlay(widget);
    });

    return widget;
  }

  function mountWidget(anchor, widget) {
    if (!anchor?.isConnected || !widget) return;
    if (widget.previousElementSibling === anchor) return;
    anchor.insertAdjacentElement("afterend", widget);
  }

  function removeWidget() {
    waWidget?.remove();
    waWidget = null;
    lastKey = "";
  }

  function tickMeetingWhatsApp() {
    if (!settingsLoaded || !enableCalendlyWhatsApp || !phoneUtils) {
      removeWidget();
      return;
    }
    if (!isMeetingDetailOpen()) {
      removeWidget();
      return;
    }

    const data = extractMeetingData();
    if (!data?.mountAnchor) {
      removeWidget();
      return;
    }

    if (waWidget?.isConnected && lastKey === data.key) {
      mountWidget(data.mountAnchor, waWidget);
      return;
    }

    removeWidget();
    waWidget = createWhatsAppWidget(data);
    mountWidget(data.mountAnchor, waWidget);
    lastKey = data.key;
  }

  let tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      tickMeetingWhatsApp();
    });
  }

  function hookSpaNavigation() {
    window.addEventListener("popstate", scheduleTick);
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        scheduleTick();
        return result;
      };
    }
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      lastKey = "";
    }
    tickMeetingWhatsApp();
  }, 900);

  hookSpaNavigation();
  new MutationObserver(() => scheduleTick()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  setTimeout(tickMeetingWhatsApp, 400);
  setTimeout(tickMeetingWhatsApp, 1200);
})();
