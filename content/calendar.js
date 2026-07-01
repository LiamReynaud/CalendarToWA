(function () {
  if (!window.CalendarToWA) return;

  const {
    extractPhones,
    normalizeForWhatsApp,
    formatDisplay,
    parsePhoneParts,
    extractAttendeeNames,
    formatSuffixForWhatsApp,
  } = window.CalendarToWA;

  const WIDGET_CLASS = "ctwa-widget";
  const BANNER_CLASS = "ctwa-banner";
  const HIDDEN_CLASS = "ctwa-banner--hidden";
  let defaultCountryCode = "33";
  let openWidget = null;
  let scanPaused = false;
  let cachedSuffixes = { suffixes: [], lastSuffix: "" };

  chrome.storage.sync.get(
    { defaultCountryCode: "33", suffixes: [], lastSuffix: "" },
    (data) => {
      defaultCountryCode = data.defaultCountryCode || "33";
      cachedSuffixes = {
        suffixes: data.suffixes || [],
        lastSuffix: data.lastSuffix || "",
      };
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.defaultCountryCode) {
      defaultCountryCode = changes.defaultCountryCode.newValue || "33";
      rescanAll();
    }
    if (changes.suffixes || changes.lastSuffix) {
      chrome.storage.sync.get({ suffixes: [], lastSuffix: "" }, (data) => {
        cachedSuffixes = {
          suffixes: data.suffixes || [],
          lastSuffix: data.lastSuffix || "",
        };
      });
    }
  });

  function getOpenPanel() {
    for (const el of document.querySelectorAll('[role="dialog"]')) {
      const r = el.getBoundingClientRect();
      if (r.height >= 150 && r.width >= 200) return el;
    }
    if (location.pathname.includes("/eventedit/")) {
      const main = document.querySelector('[role="main"]');
      if (main && main.getBoundingClientRect().height > 100) return main;
    }
    return null;
  }

  function extractEventTitle(panel) {
    const h = panel.querySelector('[role="heading"]');
    if (h?.textContent?.trim()) return h.textContent.trim();
    const input = panel.querySelector('[aria-label="Titre"]');
    return (input?.value || input?.textContent || "").trim();
  }

  function readPanelFieldValue(el) {
    if (!el) return "";
    const raw =
      el.value ??
      el.getAttribute?.("value") ??
      el.getAttribute?.("datetime") ??
      el.textContent ??
      "";
    return String(raw).trim();
  }

  function pickPanelField(root, labels) {
    if (!root) return "";
    for (const label of labels) {
      const exact = root.querySelector(`[aria-label="${label}"]`);
      const value = readPanelFieldValue(exact);
      if (value) return value;
      const partial = root.querySelector(`[aria-label*="${label}"]`);
      const partialValue = readPanelFieldValue(partial);
      if (partialValue) return partialValue;
    }
    return "";
  }

  function formatEventDateTime(date, startTime) {
    if (!date && !startTime) return "";
    if (date && startTime) {
      const startOnly =
        startTime.match(/^(\d{1,2}:\d{2})/)?.[1] ||
        startTime.match(/De\s+(\d{1,2}:\d{2})/i)?.[1];
      return startOnly ? `${date} — ${startOnly}` : `${date} — ${startTime}`;
    }
    return date || startTime;
  }

  function extractEventDateTime(panel) {
    const scopes = [panel, document].filter(Boolean);
    const dateLabels = [
      "Date de début",
      "Date",
      "Start date",
      "Date de l'événement",
    ];
    const startLabels = [
      "Heure de début",
      "Start time",
      "Heure",
    ];
    let date = "";
    let startTime = "";

    for (const scope of scopes) {
      if (!date) date = pickPanelField(scope, dateLabels);
      if (!startTime) startTime = pickPanelField(scope, startLabels);
      if (date && startTime) break;
    }

    if (!startTime) {
      for (const scope of scopes) {
        const endOnly = pickPanelField(scope, ["Heure de fin", "End time"]);
        if (endOnly) {
          startTime = endOnly;
          break;
        }
      }
    }

    const months =
      "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
    const dateRe = new RegExp(
      `(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*\\d{1,2}\\s+(?:${months})(?:\\s+\\d{4})?`,
      "i"
    );
    const timeRangeRe = /\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/;
    const timeFrRe = /De\s+(\d{1,2}:\d{2})\s+à\s+\d{1,2}:\d{2}/i;

    if (!date || !startTime) {
      for (const scope of scopes) {
        for (const el of scope.querySelectorAll(
          "div, span, button, time, input, [datetime]"
        )) {
          const text = readPanelFieldValue(el);
          if (!text || text.length > 120) continue;
          if (!date) {
            const dateMatch =
              text.match(dateRe) || text.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
            if (dateMatch) date = dateMatch[0].trim();
          }
          if (!startTime) {
            const frMatch = text.match(timeFrRe);
            if (frMatch) startTime = frMatch[1];
            else {
              const timeMatch = text.match(timeRangeRe);
              if (timeMatch) startTime = timeMatch[0].trim();
            }
          }
          if (date && startTime) break;
        }
        if (date && startTime) break;
      }
    }

    if (!date) {
      for (const scope of scopes) {
        const dated = scope.querySelector("[data-date], time[datetime]");
        const raw =
          dated?.getAttribute("data-date") || dated?.getAttribute("datetime");
        if (raw) {
          date = raw;
          break;
        }
      }
    }

    return formatEventDateTime(date, startTime);
  }

  function extractPanelText(panel) {
    const title = extractEventTitle(panel);
    const descEl = panel.querySelector('[aria-label="Description"]');
    const desc = descEl ? descEl.value || descEl.textContent || "" : "";
    const body = (panel.textContent || "").slice(0, 8000);
    return { title, text: [title, desc, body].filter(Boolean).join("\n") };
  }

  function findPhonesInPanel(panel) {
    const { text } = extractPanelText(panel);
    const rawPhones = extractPhones(text, {
      excludeMeetingDialIn: true,
      defaultCountryCode,
    });
    const results = [];

    for (const raw of rawPhones) {
      const normalized = normalizeForWhatsApp(raw, defaultCountryCode);
      if (normalized) {
        const parts = parsePhoneParts(normalized, defaultCountryCode);
        results.push({
          raw,
          normalized,
          display: formatDisplay(raw),
          countryCode: parts.countryCode,
          nationalNumber: parts.nationalNumber,
        });
      }
    }

    const seen = new Set();
    return results.filter((p) => {
      if (seen.has(p.normalized)) return false;
      seen.add(p.normalized);
      return true;
    });
  }

  function getAttendeeNames(panel) {
    const { title, text } = extractPanelText(panel);
    return extractAttendeeNames(title, text);
  }

  function removeBanner(panel) {
    panel.querySelectorAll(`.${WIDGET_CLASS}`).forEach((el) => el.remove());
    if (openWidget && !document.contains(openWidget)) openWidget = null;
  }

  function closeAllPanels(except) {
    document.querySelectorAll(`.${WIDGET_CLASS}`).forEach((widget) => {
      if (widget === except) return;
      const panel = widget.querySelector(`.${BANNER_CLASS}`);
      const trigger = widget.querySelector(".ctwa-trigger");
      if (panel) panel.classList.add(HIDDEN_CLASS);
      trigger?.setAttribute("aria-expanded", "false");
    });
    if (openWidget && openWidget !== except) openWidget = null;
  }

  function togglePanel(widget) {
    const panel = widget.querySelector(`.${BANNER_CLASS}`);
    if (!panel) return;

    const willOpen = panel.classList.contains(HIDDEN_CLASS);
    closeAllPanels(willOpen ? widget : null);

    if (willOpen) {
      panel.classList.remove(HIDDEN_CLASS);
      openWidget = widget;
    } else {
      panel.classList.add(HIDDEN_CLASS);
      openWidget = null;
    }
  }

  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .609.609l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.592-.832-6.323-2.22l-.448-.372-2.605.872.872-2.538-.39-.453A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>`;

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

  function createPhoneRow(phone, names, suffixes, lastSuffix) {
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
    suffixLabel.textContent = "Suffixe → Nom (WhatsApp)";
    form.appendChild(suffixLabel);

    const suffixList = [...new Set([...(suffixes || []), lastSuffix].filter(Boolean))];
    const suffixOptions = [
      { value: "", label: "— Aucun —" },
      ...suffixList.map((s) => ({ value: s, label: s })),
    ];
    const defaultSuffix =
      lastSuffix && suffixList.includes(lastSuffix) ? lastSuffix : "";
    const suffixSelect = buildSelect(suffixOptions, defaultSuffix, "Autre…");
    form.appendChild(suffixSelect);

    const suffixCustom = document.createElement("input");
    suffixCustom.type = "text";
    suffixCustom.className = "ctwa-banner__input";
    suffixCustom.placeholder = "Suffixe personnalisé (ex. YBS)";
    suffixCustom.hidden = suffixSelect.value !== "__custom__";
    form.appendChild(suffixCustom);

    suffixSelect.addEventListener("change", () => {
      suffixCustom.hidden = suffixSelect.value !== "__custom__";
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctwa-banner__btn";
    btn.textContent = "Créer ou ouvrir le contact";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      let firstName =
        nameSelect.value === "__custom__"
          ? nameCustom.value.trim()
          : nameSelect.value.trim();

      let suffixRaw =
        suffixSelect.value === "__custom__"
          ? suffixCustom.value.trim()
          : suffixSelect.value.trim();

      if (!firstName) {
        nameCustom.hidden = false;
        nameCustom.focus();
        nameCustom.placeholder = "Prénom requis";
        return;
      }

      if (suffixRaw) saveSuffix(suffixRaw);

      const panel = getOpenPanel();
      const eventDate = extractEventDateTime(panel);

      openWhatsAppContact(
        {
          phone: phone.normalized,
          rawPhone: phone.raw,
          countryCode: phone.countryCode,
          nationalNumber: phone.nationalNumber,
          firstName,
          lastName: formatSuffixForWhatsApp(suffixRaw),
          searchNames: names,
          eventDate,
        },
        btn
      );
    });
    form.appendChild(btn);

    row.appendChild(form);
    return row;
  }

  function createWidget(phones, panel, suffixes, lastSuffix) {
    const widget = document.createElement("div");
    widget.className = WIDGET_CLASS;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ctwa-trigger";
    trigger.setAttribute("aria-label", "Ajouter le contact sur WhatsApp");
    trigger.setAttribute("aria-expanded", "false");
    trigger.title = "Ajouter sur WhatsApp";
    trigger.innerHTML = WA_ICON_SVG;
    widget.appendChild(trigger);

    const banner = document.createElement("div");
    banner.className = `${BANNER_CLASS} ${HIDDEN_CLASS}`;
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Contacts WhatsApp détectés");

    const names = getAttendeeNames(panel);

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
      trigger.setAttribute("aria-expanded", "false");
      openWidget = null;
    });

    if (names.length > 0) {
      const hint = document.createElement("p");
      hint.className = "ctwa-banner__hint";
      hint.textContent = `${names.length} nom(s) détecté(s) dans la réunion`;
      banner.appendChild(hint);
    }

    const list = document.createElement("div");
    list.className = "ctwa-banner__list";
    phones.forEach((phone) => {
      list.appendChild(createPhoneRow(phone, names, suffixes, lastSuffix));
    });
    banner.appendChild(list);
    widget.appendChild(banner);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = banner.classList.contains(HIDDEN_CLASS);
      togglePanel(widget);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    return widget;
  }

  function openWhatsAppContact(contact, btn) {
    scanPaused = true;
    btn.disabled = true;
    btn.textContent = "Ouverture…";

    try {
      chrome.runtime.sendMessage({
        type: "OPEN_WHATSAPP_CONTACT",
        payload: contact,
      });
    } catch {
      btn.textContent = "Erreur — réessayer";
      btn.disabled = false;
      scanPaused = false;
      return;
    }

    btn.textContent = "WhatsApp ouvert ✓";
    closeAllPanels(null);
    const trigger = btn.closest(`.${WIDGET_CLASS}`)?.querySelector(".ctwa-trigger");
    trigger?.setAttribute("aria-expanded", "false");

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Créer ou ouvrir le contact";
      scanPaused = false;
    }, 1500);
  }

  function injectBanner(panel) {
    if (!panel || panel.querySelector(`.${WIDGET_CLASS}`)) return;

    const phones = findPhonesInPanel(panel);
    if (phones.length === 0) return;

    const widget = createWidget(
      phones,
      panel,
      cachedSuffixes.suffixes,
      cachedSuffixes.lastSuffix
    );

    const anchor =
      panel.querySelector('[role="heading"]')?.parentElement ||
      panel.firstElementChild;

    if (anchor) anchor.insertAdjacentElement("afterend", widget);
    else panel.prepend(widget);
  }

  function removeAllWidgets() {
    document.querySelectorAll(`.${WIDGET_CLASS}`).forEach((w) => w.remove());
  }

  function tick() {
    if (scanPaused) return;

    const panel = getOpenPanel();
    if (!panel) {
      removeAllWidgets();
      return;
    }

    injectBanner(panel);
  }

  function rescanAll() {
    removeAllWidgets();
    tick();
  }

  setInterval(tick, 2500);
  setTimeout(tick, 600);
})();
