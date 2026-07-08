(function () {
  if (!window.CalendarToWA) return;

  const {
    extractPhones,
    normalizeForWhatsApp,
    formatDisplay,
    parsePhoneParts,
    extractAttendeeNames,
    extractPipedriveContacts,
    extractPipedriveDealName,
    formatSuffixForWhatsApp,
  } = window.CalendarToWA;

  const WIDGET_CLASS = "ctwa-widget";
  const BANNER_CLASS = "ctwa-banner";
  const WA_BANNER_CLASS = "ctwa-banner--wa";
  const PD_BANNER_CLASS = "ctwa-pd-banner";
  const HIDDEN_CLASS = "ctwa-banner--hidden";
  let defaultCountryCode = "33";
  let enableWhatsApp = true;
  let enablePipedrive = false;
  let openWidget = null;
  let scanPaused = false;
  let cachedSuffixes = { suffixes: [], lastSuffix: "" };

  chrome.storage.sync.get(
    {
      defaultCountryCode: "33",
      suffixes: [],
      lastSuffix: "",
      enableWhatsApp: true,
      enablePipedrive: false,
    },
    (data) => {
      defaultCountryCode = data.defaultCountryCode || "33";
      enableWhatsApp = data.enableWhatsApp !== false;
      enablePipedrive = data.enablePipedrive === true;
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
    if (changes.enableWhatsApp) {
      enableWhatsApp = changes.enableWhatsApp.newValue !== false;
      rescanAll();
    }
    if (changes.enablePipedrive) {
      enablePipedrive = changes.enablePipedrive.newValue === true;
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

  const IGNORED_PANEL_TITLES =
    /^(Agenda|Panneau|Paramètres|Settings|Semaine du |Page de modification)/i;

  function isVisiblePanel(el) {
    if (!el?.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 200 && r.height >= 150;
  }

  function scoreEventPanel(el) {
    if (!isVisiblePanel(el)) return -1;

    let score = 0;
    const heading = el.querySelector('[role="heading"]');
    const title = heading?.textContent?.trim() || "";
    if (heading && title && !IGNORED_PANEL_TITLES.test(title)) score += 20;

    const text = el.textContent || "";
    if (/créé par|created by/i.test(text)) score += 15;
    if (/Deal:\s/i.test(text)) score += 40;
    if (/Contact:.*Phone:/i.test(text)) score += 40;
    if (/minutes?\s+(avant|before)/i.test(text)) score += 10;
    if (
      el.querySelector(
        '[aria-label="Description"], [aria-label*="Description"], [aria-label*="description"]'
      )
    ) {
      score += 5;
    }

    if (
      el.closest('[role="complementary"]') &&
      el.querySelector('[role="list"], [role="tree"]') &&
      !heading
    ) {
      score -= 40;
    }

    return score;
  }

  function collectEventPanelCandidates() {
    const candidates = new Set();

    document.querySelectorAll('[role="dialog"]').forEach((el) => candidates.add(el));

    document.querySelectorAll('[role="heading"]').forEach((heading) => {
      const title = heading.textContent?.trim() || "";
      if (!title || IGNORED_PANEL_TITLES.test(title)) return;

      let node = heading.parentElement;
      for (let depth = 0; depth < 25 && node && node !== document.body; depth++) {
        const r = node.getBoundingClientRect();
        const text = node.textContent || "";
        if (
          r.height >= 180 &&
          r.width >= 260 &&
          /créé par|created by|minutes?\s+(avant|before)/i.test(text)
        ) {
          candidates.add(node);
          break;
        }
        node = node.parentElement;
      }
    });

    if (location.pathname.includes("/eventedit/")) {
      const main = document.querySelector('[role="main"]');
      if (main) candidates.add(main);
    }

    return [...candidates];
  }

  function getOpenPanel() {
    let best = null;
    let bestScore = 0;

    for (const el of collectEventPanelCandidates()) {
      const score = scoreEventPanel(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return bestScore >= 10 ? best : null;
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

  function extractEventDescription(panel) {
    const labels = [
      "Description",
      "Description de l'événement",
      "Event description",
      "Notes",
    ];

    for (const label of labels) {
      const value = pickPanelField(panel, [label]);
      if (value) return value;
    }

    let best = "";
    for (const el of panel.querySelectorAll("div, p, span, pre")) {
      const t = (el.textContent || "").trim();
      if (t.length < 8 || t.length > 2000) continue;
      if (/Deal:\s|Contact:.*Phone:|Num[ée]ro\s*:/i.test(t)) {
        if (!best || t.length < best.length) best = t;
      }
    }
    return best;
  }

  function extractPanelText(panel) {
    const title = extractEventTitle(panel);
    const desc = extractEventDescription(panel);
    const body = (panel.textContent || "").slice(0, 8000);
    return { title, text: [title, desc, body].filter(Boolean).join("\n") };
  }

  function phoneResultFromRaw(raw) {
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

  function findPhonesInPanel(panel) {
    const { text } = extractPanelText(panel);
    const rawPhones = extractPhones(text, {
      excludeMeetingDialIn: true,
      defaultCountryCode,
    });
    const results = [];

    for (const raw of rawPhones) {
      const entry = phoneResultFromRaw(raw);
      if (entry) results.push(entry);
    }

    for (const { phoneRaw } of extractPipedriveContacts(text)) {
      if (!phoneRaw) continue;
      const entry = phoneResultFromRaw(phoneRaw);
      if (entry) results.push(entry);
    }

    const seen = new Set();
    return results.filter((p) => {
      if (seen.has(p.normalized)) return false;
      seen.add(p.normalized);
      return true;
    });
  }

  function panelHasPipedriveData(panel) {
    const { text } = extractPanelText(panel);
    return extractPipedriveContacts(text).some((c) => c.dealName || c.phoneRaw);
  }

  function getAttendeeNames(panel) {
    const { title, text } = extractPanelText(panel);
    return extractAttendeeNames(title, text);
  }

  function removeBanner(panel) {
    panel.querySelectorAll(`.${WIDGET_CLASS}`).forEach((el) => el.remove());
    if (openWidget && !document.contains(openWidget)) openWidget = null;
  }

  function closeAllOverlays(exceptWidget, exceptType) {
    document.querySelectorAll(`.${WIDGET_CLASS}`).forEach((widget) => {
      const keepWa = widget === exceptWidget && exceptType === "wa";
      const keepPd = widget === exceptWidget && exceptType === "pd";

      if (!keepWa) {
        widget.querySelector(`.${WA_BANNER_CLASS}`)?.classList.add(HIDDEN_CLASS);
        widget
          .querySelector(".ctwa-trigger--wa")
          ?.setAttribute("aria-expanded", "false");
      }

      if (!keepPd) {
        widget.querySelector(`.${PD_BANNER_CLASS}`)?.classList.add(HIDDEN_CLASS);
        widget
          .querySelector(".ctwa-trigger--pipedrive")
          ?.setAttribute("aria-expanded", "false");
      }
    });

    if (openWidget && openWidget !== exceptWidget) openWidget = null;
  }

  function toggleOverlay(widget, type) {
    const isWa = type === "wa";
    const banner = widget.querySelector(
      isWa ? `.${WA_BANNER_CLASS}` : `.${PD_BANNER_CLASS}`
    );
    const trigger = widget.querySelector(
      isWa ? ".ctwa-trigger--wa" : ".ctwa-trigger--pipedrive"
    );
    if (!banner || !trigger) return;

    const willOpen = banner.classList.contains(HIDDEN_CLASS);
    closeAllOverlays(willOpen ? widget : null, willOpen ? type : null);

    if (willOpen) {
      banner.classList.remove(HIDDEN_CLASS);
      trigger.setAttribute("aria-expanded", "true");
      openWidget = widget;
    } else {
      banner.classList.add(HIDDEN_CLASS);
      trigger.setAttribute("aria-expanded", "false");
      openWidget = null;
    }
  }

  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .609.609l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.592-.832-6.323-2.22l-.448-.372-2.605.872.872-2.538-.39-.453A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>`;

  function extractPanelTelPhones(panel) {
    if (!panel) return [];
    const found = [];
    const seen = new Set();

    panel.querySelectorAll('a[href^="tel:"]').forEach((link) => {
      const href = link.getAttribute("href") || "";
      const raw = href.replace(/^tel:/i, "").split(/[;,?]/)[0].trim();
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 9 || seen.has(digits)) return;
      seen.add(digits);
      found.push(raw || digits);
    });

    return found;
  }

  function mergePhoneResult(existing, fallbackRaw) {
    if (existing) return existing;
    if (!fallbackRaw) return null;
    return phoneResultFromRaw(fallbackRaw);
  }

  function getPipedriveContactRows(panel) {
    const activePanel = panel || getOpenPanel();
    if (!activePanel) return [];

    const attendeeNames = getAttendeeNames(activePanel);
    const detectedPhones = findPhonesInPanel(activePanel);
    const telPhones = extractPanelTelPhones(activePanel);
    const { text } = extractPanelText(activePanel);
    const pipedriveContacts = extractPipedriveContacts(text);

    const pipedriveNamed = pipedriveContacts.filter(
      (c) => c.contactName || c.dealName
    );

    function attachPhone(index, contactPhoneRaw) {
      const phoneRaw =
        contactPhoneRaw ||
        detectedPhones[index]?.raw ||
        detectedPhones[0]?.raw ||
        telPhones[index] ||
        telPhones[0];
      return mergePhoneResult(
        contactPhoneRaw ? phoneResultFromRaw(contactPhoneRaw) : null,
        phoneRaw
      );
    }

    function resolveName(index, contactName, dealName) {
      return (
        contactName ||
        dealName ||
        attendeeNames[index] ||
        attendeeNames[0] ||
        ""
      );
    }

    if (pipedriveNamed.length) {
      return pipedriveNamed.map((c, index) => ({
        name: resolveName(index, c.contactName, c.dealName),
        phone: attachPhone(index, c.phoneRaw),
      }));
    }

    if (detectedPhones.length) {
      return detectedPhones.map((phone, index) => ({
        name: attendeeNames[index] || attendeeNames[0] || "",
        phone,
      }));
    }

    const orphanPhone = pipedriveContacts.find((c) => c.phoneRaw)?.phoneRaw;
    if (orphanPhone || telPhones[0]) {
      return [
        {
          name: attendeeNames[0] || "",
          phone: attachPhone(0, orphanPhone),
        },
      ];
    }

    return attendeeNames.length
      ? [{ name: attendeeNames[0], phone: null }]
      : [];
  }

  function createPipedriveBannerRow(rowData) {
    const { name, phone } = rowData;
    const row = document.createElement("div");
    row.className = "ctwa-pd-banner__row";

    const nameField = document.createElement("div");
    nameField.className = "ctwa-pd-banner__field";
    const nameLabel = document.createElement("span");
    nameLabel.className = "ctwa-pd-banner__label";
    nameLabel.textContent = "Nom";
    const nameValue = document.createElement("span");
    nameValue.className = "ctwa-pd-banner__value";
    nameValue.textContent = name || "—";
    nameField.append(nameLabel, nameValue);
    row.appendChild(nameField);

    const phoneField = document.createElement("div");
    phoneField.className = "ctwa-pd-banner__field";
    const phoneLabel = document.createElement("span");
    phoneLabel.className = "ctwa-pd-banner__label";
    phoneLabel.textContent = "Téléphone";
    const phoneValue = document.createElement("span");
    phoneValue.className = "ctwa-pd-banner__value";
    phoneValue.textContent = phone?.display || phone?.raw || "—";
    phoneField.append(phoneLabel, phoneValue);
    row.appendChild(phoneField);

    const modeLabel = document.createElement("span");
    modeLabel.className = "ctwa-pd-banner__label";
    modeLabel.textContent = "Type de recherche";
    row.appendChild(modeLabel);

    const modeGroup = document.createElement("div");
    modeGroup.className = "ctwa-pd-banner__modes";

    const nameRadio = document.createElement("label");
    nameRadio.className = "ctwa-pd-banner__mode";
    const nameInput = document.createElement("input");
    nameInput.type = "radio";
    nameInput.name = `ctwa-pd-mode-${Math.random().toString(36).slice(2)}`;
    nameInput.value = "name";
    nameInput.checked = !!name;
    nameInput.disabled = !name;
    nameRadio.appendChild(nameInput);
    nameRadio.append(" Rechercher par nom");

    const phoneRadio = document.createElement("label");
    phoneRadio.className = "ctwa-pd-banner__mode";
    const phoneInput = document.createElement("input");
    phoneInput.type = "radio";
    phoneInput.name = nameInput.name;
    phoneInput.value = "phone";
    phoneInput.checked = !name && !!phone;
    phoneInput.disabled = !phone;
    phoneRadio.appendChild(phoneInput);
    phoneRadio.append(" Rechercher par téléphone");

    modeGroup.appendChild(nameRadio);
    modeGroup.appendChild(phoneRadio);
    row.appendChild(modeGroup);

    const searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.className = "ctwa-pd-banner__btn";
    searchBtn.textContent = "Rechercher dans Pipedrive";
    searchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const mode = modeGroup.querySelector('input[type="radio"]:checked')?.value;
      let query = "";
      if (mode === "phone" && phone) {
        query = phone.display || phone.raw || phone.normalized;
      } else if (name) {
        query = name;
      } else if (phone) {
        query = phone.display || phone.raw || phone.normalized;
      }
      openPipedriveSearch(query, searchBtn);
    });
    row.appendChild(searchBtn);

    return row;
  }

  function fillPipedriveBanner(banner, panel) {
    const list = banner.querySelector(".ctwa-pd-banner__list");
    if (!list) return;
    list.replaceChildren();

    const rows = getPipedriveContactRows(panel);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ctwa-pd-banner__hint";
      empty.textContent = "Aucun nom ou numéro détecté dans cet événement.";
      list.appendChild(empty);
      return;
    }

    rows.forEach((rowData) => {
      list.appendChild(createPipedriveBannerRow(rowData));
    });
  }

  function createPipedriveBanner(panel) {
    const banner = document.createElement("div");
    banner.className = `${PD_BANNER_CLASS} ${HIDDEN_CLASS}`;
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Recherche Pipedrive");

    const header = document.createElement("div");
    header.className = "ctwa-pd-banner__header";
    header.innerHTML = `
      <span class="ctwa-pd-banner__title">Rechercher dans Pipedrive</span>
      <button type="button" class="ctwa-pd-banner__close" aria-label="Fermer">×</button>
    `;
    banner.appendChild(header);

    header.querySelector(".ctwa-pd-banner__close").addEventListener("click", (e) => {
      e.stopPropagation();
      banner.classList.add(HIDDEN_CLASS);
      banner
        .closest(`.${WIDGET_CLASS}`)
        ?.querySelector(".ctwa-trigger--pipedrive")
        ?.setAttribute("aria-expanded", "false");
      openWidget = null;
    });

    const list = document.createElement("div");
    list.className = "ctwa-pd-banner__list";
    banner.appendChild(list);

    fillPipedriveBanner(banner, panel);
    return banner;
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

    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "ctwa-banner__btn";
    waBtn.textContent = "Créer ou ouvrir le contact";
    waBtn.addEventListener("click", (e) => {
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
        waBtn
      );
    });
    form.appendChild(waBtn);

    row.appendChild(form);
    return row;
  }

  function createWidget(phones, panel, suffixes, lastSuffix, options = {}) {
    const { showWhatsApp = true, showPipedrive = false } = options;
    const widget = document.createElement("div");
    widget.className = WIDGET_CLASS;

    const triggers = document.createElement("div");
    triggers.className = "ctwa-triggers";

    let waTrigger = null;

    if (showWhatsApp && phones.length > 0) {
      waTrigger = document.createElement("button");
      waTrigger.type = "button";
      waTrigger.className = "ctwa-trigger ctwa-trigger--wa";
      waTrigger.setAttribute("aria-label", "Ajouter le contact sur WhatsApp");
      waTrigger.setAttribute("aria-expanded", "false");
      waTrigger.title = "Ajouter sur WhatsApp";
      waTrigger.innerHTML = WA_ICON_SVG;
      triggers.appendChild(waTrigger);
    }

    if (showPipedrive) {
      triggers.appendChild(createPipedriveTrigger(widget, panel));
    }

    widget.appendChild(triggers);

    if (showWhatsApp && phones.length > 0 && waTrigger) {
      const banner = document.createElement("div");
      banner.className = `${BANNER_CLASS} ${WA_BANNER_CLASS} ${HIDDEN_CLASS}`;
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
        waTrigger.setAttribute("aria-expanded", "false");
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

      waTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleOverlay(widget, "wa");
      });
    }

    if (showPipedrive) {
      widget.appendChild(createPipedriveBanner(panel));
    }

    return widget;
  }

  function openPipedriveSearch(query, btn) {
    const trimmed = (query || "").trim();
    if (!trimmed) {
      if (btn) {
        btn.textContent = "Rien à rechercher";
        setTimeout(() => {
          btn.textContent = "Rechercher dans Pipedrive";
        }, 2000);
      }
      return;
    }

    scanPaused = true;
    if (btn) {
      btn.disabled = true;
      btn.title = "Ouverture…";
    }

    chrome.runtime.sendMessage(
      {
        type: "OPEN_PIPEDRIVE_SEARCH",
        payload: { query: trimmed },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          if (btn) {
            btn.disabled = false;
            btn.title = "Erreur — réessayer";
            setTimeout(() => {
              btn.title = "Rechercher dans Pipedrive";
            }, 2000);
          }
          scanPaused = false;
          return;
        }

        if (btn) {
          if (btn.classList.contains("ctwa-pd-banner__btn")) {
            btn.textContent = response?.ok ? "Recherche lancée ✓" : "Champ introuvable";
            setTimeout(() => {
              btn.disabled = false;
              btn.textContent = "Rechercher dans Pipedrive";
              scanPaused = false;
            }, 1500);
          } else {
            btn.title = response?.ok
              ? "Recherche Pipedrive ✓"
              : "Pipedrive ouvert — champ introuvable";
            setTimeout(() => {
              btn.disabled = false;
              btn.title = "Rechercher dans Pipedrive";
              scanPaused = false;
            }, 1500);
          }
        } else {
          setTimeout(() => {
            scanPaused = false;
          }, 1500);
        }
      }
    );
  }

  function createPipedriveTrigger(widget, panel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctwa-trigger ctwa-trigger--pipedrive";
    btn.setAttribute("aria-label", "Rechercher dans Pipedrive");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Rechercher dans Pipedrive";

    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("icons/pipedrive.png");
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;
    btn.appendChild(icon);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pdBanner = widget.querySelector(`.${PD_BANNER_CLASS}`);
      if (pdBanner) fillPipedriveBanner(pdBanner, getOpenPanel() || panel);
      toggleOverlay(widget, "pd");
    });

    return btn;
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
    closeAllOverlays(null, null);
    const widget = btn.closest(`.${WIDGET_CLASS}`);
    widget?.querySelector(`.${WA_BANNER_CLASS}`)?.classList.add(HIDDEN_CLASS);
    widget?.querySelector(".ctwa-trigger--wa")?.setAttribute("aria-expanded", "false");

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Créer ou ouvrir le contact";
      scanPaused = false;
    }, 1500);
  }

  function injectBanner(panel) {
    if (!panel || panel.querySelector(`.${WIDGET_CLASS}`)) return;
    if (!enableWhatsApp && !enablePipedrive) return;

    const phones = findPhonesInPanel(panel);
    const hasPipedriveData = panelHasPipedriveData(panel);
    const showWhatsApp = enableWhatsApp && phones.length > 0;
    const showPipedrive = enablePipedrive && (phones.length > 0 || hasPipedriveData);

    if (!showWhatsApp && !showPipedrive) return;

    const widget = createWidget(
      phones,
      panel,
      cachedSuffixes.suffixes,
      cachedSuffixes.lastSuffix,
      { showWhatsApp, showPipedrive }
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

  setInterval(tick, 1200);
  setTimeout(tick, 300);
  setTimeout(tick, 900);
})();
