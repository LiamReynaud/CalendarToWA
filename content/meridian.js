(function () {
  const SCRIPT_ID = "1.14.0-mer";
  if (window.__CTWA_MERIDIAN_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_MERIDIAN_SCRIPT__ = SCRIPT_ID;

  const LEAD_DETAIL_PATH = /^\/closing\/leads\/[A-Za-z0-9]+$/;
  const RDV_DETAIL_PATH = /^\/closing\/rdv\/[A-Za-z0-9]+$/;
  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .609.609l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.592-.832-6.323-2.22l-.448-.372-2.605.872.872-2.538-.39-.453A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>`;

  let fillInFlight = null;
  let enableMeridianWhatsApp = null;
  let settingsLoaded = false;
  let defaultCountryCode = "33";
  let cachedSuffixes = { suffixes: [], lastSuffix: "" };
  let leadWaWidget = null;
  let lastLeadKey = "";

  const phoneUtils = window.CalendarToWA;
  const {
    normalizeForWhatsApp,
    formatDisplay,
    parsePhoneParts,
    extractSuffixFromEvent,
    formatSuffixForWhatsApp,
    resolveRelativeDateLabel,
  } = phoneUtils || {};

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  chrome.storage.sync.get(
    {
      defaultCountryCode: "33",
      suffixes: [],
      lastSuffix: "",
      enableWhatsApp: true,
    },
    (data) => {
      chrome.storage.sync.get("enableMeridianWhatsApp", (merWa) => {
        const hasMeridianWaSetting = "enableMeridianWhatsApp" in merWa;
        enableMeridianWhatsApp = hasMeridianWaSetting
          ? merWa.enableMeridianWhatsApp === true
          : data.enableWhatsApp !== false;
        defaultCountryCode = data.defaultCountryCode || "33";
        cachedSuffixes = {
          suffixes: data.suffixes || [],
          lastSuffix: data.lastSuffix || "",
        };
        settingsLoaded = true;
        tickLeadWhatsApp();
      });
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableMeridianWhatsApp) {
      enableMeridianWhatsApp = changes.enableMeridianWhatsApp.newValue === true;
      tickLeadWhatsApp();
    }
    if (changes.defaultCountryCode) {
      defaultCountryCode = changes.defaultCountryCode.newValue || "33";
      lastLeadKey = "";
      tickLeadWhatsApp();
    }
    if (changes.suffixes || changes.lastSuffix) {
      chrome.storage.sync.get({ suffixes: [], lastSuffix: "" }, (data) => {
        cachedSuffixes = {
          suffixes: data.suffixes || [],
          lastSuffix: data.lastSuffix || "",
        };
        lastLeadKey = "";
        tickLeadWhatsApp();
      });
    }
  });

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

  function isLeadDetailPage() {
    return LEAD_DETAIL_PATH.test(location.pathname);
  }

  function isRdvDetailPage() {
    return RDV_DETAIL_PATH.test(location.pathname);
  }

  function isContactDetailPage() {
    return isLeadDetailPage() || isRdvDetailPage();
  }

  function phoneResultFromRaw(raw) {
    if (!phoneUtils) return null;
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

  function splitLeadName(fullName) {
    const trimmed = (fullName || "").trim();
    if (!trimmed) return { firstName: "", searchNames: [] };
    const parts = trimmed.split(/\s+/);
    return {
      firstName: parts[0] || trimmed,
      searchNames: trimmed === parts[0] ? [trimmed] : [trimmed, parts[0]],
    };
  }

  function extractProductText(main) {
    for (const el of main.querySelectorAll("div, p, span")) {
      const text = (el.textContent || "").trim();
      if (/^Produit\s*:/i.test(text) && text.length < 120) {
        return text.replace(/^Produit\s*:\s*/i, "").trim();
      }
    }

    const heading = main.querySelector("h1");
    const container = heading?.closest("div")?.parentElement;
    const paragraph = container?.querySelector("p");
    const fallback = (paragraph?.textContent || "").trim();
    if (fallback && !/→\s*\d{1,2}:\d{2}/.test(fallback)) return fallback;
    return "";
  }

  function extractTeamSuffix(main, name) {
    const productText = extractProductText(main);
    if (!productText || !extractSuffixFromEvent) return "";
    return extractSuffixFromEvent(name, productText, cachedSuffixes.suffixes);
  }

  function findContactAnchor(main) {
    const tel = main.querySelector('a[href^="tel:"]');
    if (!tel) return null;

    let block = tel.parentElement;
    while (block && block !== main) {
      const text = block.textContent || "";
      if (
        block.querySelector('a[href^="mailto:"]') &&
        (/Produit\s*:/i.test(text) ||
          block.querySelector('a[href*="/closing/leads/"]') ||
          isLeadDetailPage())
      ) {
        return block;
      }
      block = block.parentElement;
    }

    let fallback = tel.parentElement;
    while (fallback && fallback !== main) {
      if (fallback.querySelector('a[href^="mailto:"]')) return fallback;
      fallback = fallback.parentElement;
    }
    return tel.parentElement;
  }

  function findCallActionButton(main, contactBlock) {
    const scope = contactBlock || main;
    const telLinks = [...scope.querySelectorAll('a[href^="tel:"]')].filter(isVisible);

    const compactTel = telLinks.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 52 && r.height <= 52;
    });
    if (compactTel) return compactTel;

    for (const tel of telLinks) {
      const row = tel.parentElement;
      if (!row) continue;
      const actions = [...row.querySelectorAll("a, button")].filter(isVisible);
      const compactAction = actions.find((el) => {
        const r = el.getBoundingClientRect();
        return r.width <= 56 && r.height <= 56;
      });
      if (compactAction) return compactAction;
    }

    for (const el of scope.querySelectorAll("a, button")) {
      if (!isVisible(el)) continue;
      const label = `${el.getAttribute("aria-label") || ""} ${el.title || ""}`.toLowerCase();
      if (!/appel|call|phone|téléphone|tel/.test(label)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 56 && r.height <= 56) return el;
    }

    return telLinks[0] || null;
  }

  function getWaMountAnchor(contactBlock, callButton) {
    if (!callButton) return contactBlock;
    const row = callButton.closest("div, p, li, section, header");
    if (row && (row === contactBlock || contactBlock.contains(row))) return row;
    return contactBlock;
  }

  function extractRdvDateTime(main) {
    const paragraph = main.querySelector("h1")?.parentElement?.querySelector("p");
    const text = (paragraph?.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const match = text.match(
      /(\d{1,2}\s+(?:janv?\.?|févr?\.?|fevr?\.?|mars|avr?\.?|mai|juin|juil?\.?|août|aout|sept?\.?|oct?\.?|nov?\.?|déc?\.?|dec?\.?)(?:\s+\d{4})?)\s+(\d{1,2}:\d{2})/i
    );
    if (match) return `${match[1].trim()} — ${match[2]}`;

    return text.replace(/\s*→\s*/g, " — ");
  }

  function extractLeadCallbackDate(main) {
    const reminderLink = [...main.querySelectorAll('a[href*="/closing/rdv/"]')].find(
      (link) => /rappel|rdv/i.test(link.textContent || "")
    );
    const reminderText = (reminderLink?.textContent || "").replace(/\s+/g, " ").trim();
    const relativeMatch = reminderText.match(/\b(aujourd'?hui|demain|hier)\b/i);
    if (relativeMatch) {
      const resolved = resolveRelativeDateLabel(relativeMatch[1]);
      const timeMatch = reminderText.match(/(\d{1,2}:\d{2})/);
      return timeMatch ? `${resolved} — ${timeMatch[1]}` : resolved;
    }

    const historyMatch = (main.textContent || "").match(
      /(\d{1,2}\s+(?:janv?\.?|févr?\.?|fevr?\.?|mars|avr?\.?|mai|juin|juil?\.?|août|aout|sept?\.?|oct?\.?|nov?\.?|déc?\.?|dec?\.?)\s+\d{4},?\s*\d{1,2}:\d{2})/i
    );
    return historyMatch?.[1]?.trim() || "";
  }

  function extractContactPageData() {
    const main = document.querySelector("main");
    if (!main || !isContactDetailPage()) return null;

    const name = main.querySelector("h1")?.textContent?.trim() || "";
    const telLink = main.querySelector('a[href^="tel:"]');
    const rawPhone =
      telLink?.getAttribute("href")?.replace(/^tel:/i, "").split(/[;,?]/)[0].trim() ||
      "";
    const phone = phoneResultFromRaw(rawPhone);
    if (!phone) return null;

    const suffix = extractTeamSuffix(main, name);
    const { firstName, searchNames } = splitLeadName(name);
    const eventDate = isRdvDetailPage()
      ? extractRdvDateTime(main)
      : extractLeadCallbackDate(main);
    const contactBlock = findContactAnchor(main);
    const callButton = findCallActionButton(main, contactBlock);
    const mountAnchor = getWaMountAnchor(contactBlock, callButton);

    return {
      contactBlock,
      mountAnchor,
      callButton,
      phone,
      name,
      firstName,
      searchNames,
      suffix,
      eventDate,
      key: `${location.pathname}|${phone.normalized}|${name}|${suffix || "full"}`,
    };
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
      chrome.storage.sync.set({
        suffixes: suffixes.slice(0, 20),
        lastSuffix: trimmed,
      });
    });
  }

  function buildWhatsAppPayload(data, overrides = {}) {
    return {
      phone: data.phone.normalized,
      rawPhone: data.phone.raw,
      countryCode: data.phone.countryCode,
      nationalNumber: data.phone.nationalNumber,
      firstName: overrides.firstName ?? data.firstName,
      lastName: overrides.lastName ?? "",
      searchNames: overrides.searchNames ?? data.searchNames,
      eventDate: data.eventDate || "",
      meetUrl: "",
    };
  }

  function openWhatsAppContact(contact, btn, onDone) {
    const label = btn.querySelector(".ctwa-mer-wa-btn__label");
    const isExpandBtn = btn.classList.contains("ctwa-mer-wa-btn");
    btn.disabled = true;
    if (isExpandBtn) {
      btn.classList.add("ctwa-mer-wa-btn--loading");
      if (label) label.textContent = "Ouverture…";
    } else {
      btn.textContent = "Ouverture…";
    }

    try {
      chrome.runtime.sendMessage({
        type: "OPEN_WHATSAPP_CONTACT",
        payload: contact,
      });
    } catch {
      btn.disabled = false;
      if (isExpandBtn) {
        btn.classList.remove("ctwa-mer-wa-btn--loading");
        if (label) label.textContent = "Erreur — réessayer";
      } else {
        btn.textContent = "Erreur — réessayer";
      }
      return;
    }

    if (isExpandBtn && label) {
      label.textContent = "WhatsApp ouvert ✓";
    } else {
      btn.textContent = "WhatsApp ouvert ✓";
    }

    const banner = btn.closest(".ctwa-banner");
    const root = btn.closest(".ctwa-mer-lead-wa");
    root?._closeBanner?.();
    if (!root && banner) {
      banner.classList.add("ctwa-banner--hidden");
    }
    root
      ?.querySelector(".ctwa-trigger")
      ?.setAttribute("aria-expanded", "false");

    setTimeout(() => {
      btn.disabled = false;
      if (isExpandBtn) {
        btn.classList.remove("ctwa-mer-wa-btn--loading");
        if (label) label.textContent = "Créer ou ouvrir le contact";
      } else {
        btn.textContent = "Créer ou ouvrir le contact";
      }
      onDone?.();
    }, 1500);
  }

  function alignWaWidgetWithCallButton(widget, callButton) {
    if (!widget?.isConnected) return;
    if (!callButton?.isConnected) {
      widget.style.marginLeft = "";
      return;
    }
    widget.style.marginLeft = "0";
    requestAnimationFrame(() => {
      if (!widget.isConnected || !callButton.isConnected) return;
      const callRect = callButton.getBoundingClientRect();
      const widgetRect = widget.getBoundingClientRect();
      widget.style.marginLeft = `${Math.max(0, Math.round(callRect.left - widgetRect.left))}px`;
    });
  }

  function mountLeadWaWidget(mountAnchor, widget, callButton) {
    if (!mountAnchor?.isConnected || !widget) return;
    if (widget.previousElementSibling !== mountAnchor) {
      mountAnchor.insertAdjacentElement("afterend", widget);
    }
    widget._ctwaCallButton = callButton;
    alignWaWidgetWithCallButton(widget, callButton);
  }

  function isLeadWaWidgetMounted(mountAnchor, widget) {
    return widget?.isConnected && widget.previousElementSibling === mountAnchor;
  }

  function closeBannerPopover(banner, trigger, root, reposition) {
    banner.classList.add("ctwa-banner--hidden");
    trigger.setAttribute("aria-expanded", "false");
    banner.classList.remove("ctwa-banner--popover");
    banner.style.cssText = "";
    if (banner.parentElement === document.body) {
      root.appendChild(banner);
    }
    if (reposition) {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    }
  }

  function openBannerPopover(banner, trigger, root) {
    const reposition = () => {
      if (banner.classList.contains("ctwa-banner--hidden")) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(320, window.innerWidth - margin * 2);
      banner.style.position = "fixed";
      banner.style.zIndex = "2147483646";
      banner.style.width = `${width}px`;
      banner.style.maxWidth = `calc(100vw - ${margin * 2}px)`;
      banner.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
      const preferredTop = rect.bottom + 6;
      const maxTop = window.innerHeight - banner.offsetHeight - margin;
      banner.style.top = `${Math.max(margin, Math.min(preferredTop, maxTop))}px`;
    };

    document.body.appendChild(banner);
    banner.classList.add("ctwa-banner--popover");
    banner.classList.remove("ctwa-banner--hidden");
    trigger.setAttribute("aria-expanded", "true");
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return reposition;
  }

  function createSimpleLeadWhatsAppWidget(data) {
    const root = document.createElement("div");
    root.className = "ctwa-mer-lead-wa ctwa-mer-lead-wa--simple";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctwa-mer-wa-btn";
    btn.setAttribute("aria-label", "Créer ou ouvrir le contact sur WhatsApp");

    const icon = document.createElement("span");
    icon.className = "ctwa-mer-wa-btn__icon";
    icon.innerHTML = WA_ICON_SVG;

    const label = document.createElement("span");
    label.className = "ctwa-mer-wa-btn__label";
    label.textContent = "Créer ou ouvrir le contact";

    btn.append(icon, label);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openWhatsAppContact(
        buildWhatsAppPayload(data, {
          lastName: formatSuffixForWhatsApp(data.suffix),
        }),
        btn
      );
    });

    root.appendChild(btn);
    return root;
  }

  function createFullLeadWhatsAppWidget(data) {
    const root = document.createElement("div");
    root.className = "ctwa-mer-lead-wa ctwa-mer-lead-wa--full";

    const triggers = document.createElement("div");
    triggers.className = "ctwa-mer-lead-wa__triggers";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ctwa-trigger ctwa-trigger--wa";
    trigger.setAttribute("aria-label", "Ajouter le contact sur WhatsApp");
    trigger.setAttribute("aria-expanded", "false");
    trigger.title = "WhatsApp";
    trigger.innerHTML = WA_ICON_SVG;

    const banner = document.createElement("div");
    banner.className = "ctwa-banner ctwa-banner--hidden";

    const header = document.createElement("div");
    header.className = "ctwa-banner__header";
    header.innerHTML = `
      <span class="ctwa-banner__title">Ajouter sur WhatsApp</span>
      <button type="button" class="ctwa-banner__close" aria-label="Fermer">×</button>
    `;
    banner.appendChild(header);

    const phoneEl = document.createElement("span");
    phoneEl.className = "ctwa-banner__phone";
    phoneEl.textContent = data.phone.display;
    banner.appendChild(phoneEl);

    const form = document.createElement("div");
    form.className = "ctwa-banner__form";

    const nameLabel = document.createElement("label");
    nameLabel.className = "ctwa-banner__label";
    nameLabel.textContent = "Prénom (WhatsApp)";
    form.appendChild(nameLabel);

    const nameOptions = data.searchNames.map((n) => ({ value: n, label: n }));
    if (nameOptions.length === 0) {
      nameOptions.push({ value: data.firstName, label: data.firstName || "—" });
    }
    const nameSelect = buildSelect(
      nameOptions,
      nameOptions[0]?.value || data.firstName || "",
      "Autre…"
    );
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

    const suffixList = [
      ...new Set([...(cachedSuffixes.suffixes || []), cachedSuffixes.lastSuffix].filter(Boolean)),
    ];
    const suffixOptions = [
      { value: "", label: "— Aucun —" },
      ...suffixList.map((s) => ({ value: s, label: s })),
    ];
    const defaultSuffix =
      cachedSuffixes.lastSuffix && suffixList.includes(cachedSuffixes.lastSuffix)
        ? cachedSuffixes.lastSuffix
        : "";
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

    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "ctwa-banner__btn";
    waBtn.textContent = "Créer ou ouvrir le contact";
    waBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const firstName =
        nameSelect.value === "__custom__" ? nameCustom.value.trim() : nameSelect.value.trim();
      const suffixRaw =
        suffixSelect.value === "__custom__" ? suffixCustom.value.trim() : suffixSelect.value.trim();

      if (!firstName) {
        nameCustom.hidden = false;
        nameCustom.focus();
        return;
      }

      if (suffixRaw) saveSuffix(suffixRaw);

      openWhatsAppContact(
        buildWhatsAppPayload(data, {
          firstName,
          lastName: formatSuffixForWhatsApp(suffixRaw),
        }),
        waBtn
      );
    });
    form.appendChild(waBtn);
    banner.appendChild(form);

    let repositionBanner = null;
    root._closeBanner = () => {
      closeBannerPopover(banner, trigger, root, repositionBanner);
      repositionBanner = null;
    };

    header.querySelector(".ctwa-banner__close").addEventListener("click", (e) => {
      e.stopPropagation();
      root._closeBanner();
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = banner.classList.contains("ctwa-banner--hidden");
      if (willOpen) {
        repositionBanner = openBannerPopover(banner, trigger, root);
        return;
      }
      root._closeBanner();
    });

    triggers.appendChild(trigger);
    root.append(triggers, banner);
    return root;
  }

  function createLeadWhatsAppWidget(data) {
    if (data.suffix) return createSimpleLeadWhatsAppWidget(data);
    return createFullLeadWhatsAppWidget(data);
  }

  function removeLeadWhatsAppWidget() {
    leadWaWidget?.remove();
    leadWaWidget = null;
    lastLeadKey = "";
  }

  function tickLeadWhatsApp() {
    if (!settingsLoaded || !enableMeridianWhatsApp || !phoneUtils) {
      removeLeadWhatsAppWidget();
      return;
    }

    if (!isContactDetailPage()) {
      removeLeadWhatsAppWidget();
      return;
    }

    const data = extractContactPageData();
    if (!data?.contactBlock || !data?.mountAnchor) {
      removeLeadWhatsAppWidget();
      return;
    }

    if (leadWaWidget?.isConnected && lastLeadKey === data.key) {
      if (!isLeadWaWidgetMounted(data.mountAnchor, leadWaWidget)) {
        mountLeadWaWidget(data.mountAnchor, leadWaWidget, data.callButton);
      } else {
        leadWaWidget._ctwaCallButton = data.callButton;
        alignWaWidgetWithCallButton(leadWaWidget, data.callButton);
      }
      return;
    }

    removeLeadWhatsAppWidget();
    leadWaWidget = createLeadWhatsAppWidget(data);
    mountLeadWaWidget(data.mountAnchor, leadWaWidget, data.callButton);
    lastLeadKey = data.key;
  }

  function getSearchInputDisplayValue(input) {
    if (!input) return "";
    const direct = (input.value || input.getAttribute("value") || "").trim();
    if (direct) return direct;
    if (input.isContentEditable) return (input.textContent || "").trim();
    const editable = input.closest('[contenteditable="true"]');
    if (editable) return (editable.textContent || "").trim();
    return "";
  }

  function isLeadSearchInput(input) {
    if (!input || !isVisible(input)) return false;
    if (
      input.type === "password" ||
      input.type === "email" ||
      input.type === "hidden" ||
      input.type === "checkbox" ||
      input.type === "file"
    ) {
      return false;
    }

    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""} ${input.name || ""}`.toLowerCase();
    if (/nom ou t[eé]l[eé]phone|nom ou telephone/.test(label)) return true;

    if (input.closest('[role="dialog"]')) {
      return /nom|téléphone|telephone|phone|lead|recherch|search/.test(label);
    }

    if (input.closest("table thead, table tfoot")) return false;

    const rect = input.getBoundingClientRect();
    if (rect.top > 320 || rect.left > window.innerWidth * 0.75) return false;
    if (/nom|téléphone|telephone|phone|lead|recherch|search/.test(label)) return true;

    return rect.top < 220 && rect.left < 520;
  }

  function findLeadSearchTriggerButton() {
    for (const btn of document.querySelectorAll("button")) {
      if (!isVisible(btn)) continue;
      const label = `${btn.textContent || ""} ${btn.getAttribute("aria-label") || ""}`.trim();
      if (/rechercher un lead/i.test(label)) return btn;
    }
    return null;
  }

  async function openLeadSearchDialog() {
    const trigger = findLeadSearchTriggerButton();
    if (!trigger) return false;
    trigger.click();
    for (let i = 0; i < 12; i++) {
      if (findLeadsSearchInput()) return true;
      await sleep(60);
    }
    return false;
  }

  function scoreLeadSearchInput(input) {
    const rect = input.getBoundingClientRect();
    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
    let score = rect.top * 2 + rect.left;

    if (/nom ou t[eé]l[eé]phone|nom ou telephone/.test(label)) score -= 5000;
    else if (/nom|téléphone|telephone|phone|lead|recherch|search/.test(label)) score -= 2000;
    if (input.closest('[role="dialog"]')) score -= 3000;
    if (input.closest("header, nav, [role='banner'], aside, complementary")) score -= 400;
    if (input.closest("table thead, table tfoot, form")) score += 5000;
    if (input.type === "password" || input.type === "email" || input.type === "hidden") score += 10000;

    return score;
  }

  function findLeadsSearchInput() {
    const specificSelectors = [
      'input[placeholder*="Nom ou téléphone"]',
      'input[placeholder*="nom ou téléphone"]',
      'input[placeholder*="Nom ou telephone"]',
      'input[placeholder*="lead"]',
      'input[placeholder*="Lead"]',
      'input[aria-label*="Nom ou téléphone"]',
      'input[aria-label*="nom ou téléphone"]',
      'input[aria-label*="lead"]',
      'input[aria-label*="Lead"]',
    ];

    for (const sel of specificSelectors) {
      for (const input of document.querySelectorAll(sel)) {
        if (isLeadSearchInput(input)) return input;
      }
    }

    const broadSelectors = [
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

    let best = null;
    let bestScore = Infinity;

    for (const sel of broadSelectors) {
      for (const input of document.querySelectorAll(sel)) {
        if (!isLeadSearchInput(input)) continue;
        const score = scoreLeadSearchInput(input);
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
      if (!isLeadSearchInput(input)) continue;
      const score = scoreLeadSearchInput(input);
      if (score < bestScore) {
        bestScore = score;
        best = input;
      }
    }

    return best;
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
    await clearSearchInput(input);

    try {
      document.execCommand("insertText", false, text);
    } catch {
      /* execCommand may be unavailable */
    }

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
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return isAlreadyFilled(input, text);
  }

  function collectLeadSearchTargets(query) {
    const targets = [];

    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (!isVisible(dialog)) continue;
      for (const item of dialog.querySelectorAll("li, [role='listitem']")) {
        if (!isVisible(item) || !rowMatchesQuery(item, query)) continue;
        if (targets.some((target) => target.contains(item))) continue;
        targets.push(item);
      }
    }

    for (const row of findLeadRows()) {
      if (rowMatchesQuery(row, query)) targets.push(row);
    }

    const resultSelectors = [
      '[role="listbox"] [role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[class*="autocomplete"] li',
      '[class*="typeahead"] li',
      '[class*="search-result"]',
      '[class*="SearchResult"]',
    ];

    for (const sel of resultSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el) || !rowMatchesQuery(el, query)) continue;
        if (targets.some((target) => target.contains(el))) continue;
        targets.push(el);
      }
    }

    if (targets.length === 0) {
      for (const link of document.querySelectorAll('a[href*="/closing/leads/"]')) {
        if (!isVisible(link)) continue;
        const container =
          link.closest(
            'tr, li, [role="option"], [role="menuitem"], [class*="result"], [class*="search"]'
          ) || link.parentElement;
        if (!container || !rowMatchesQuery(container, query)) continue;
        if (targets.some((target) => target.contains(link))) continue;
        targets.push(container);
      }
    }

    return targets;
  }

  async function submitLeadSearch(input) {
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

  async function waitForLeadsSearchInput() {
    let input = findLeadsSearchInput();
    if (input) return input;

    const opened = await openLeadSearchDialog();
    if (!opened) return null;

    return findLeadsSearchInput();
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

    return phoneMatches(want, digitsOnly(row.textContent || ""));
  }

  async function clickMatchingLead(query, input) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const matching = collectLeadSearchTargets(query);

      if (matching.length >= 1) {
        const exact =
          matching.find((row) => {
            const telLink = row.querySelector('a[href^="tel:"]');
            return phoneMatches(
              digitsOnly(query),
              digitsOnly(telLink?.textContent || "")
            );
          }) || matching[0];

        const leadLink =
          exact.querySelector('a[href*="/closing/leads/"]') ||
          [...exact.querySelectorAll("a[href*='/closing/leads/']")].find(isVisible);
        if (leadLink) {
          leadLink.click();
          return true;
        }

        if (exact.matches('[role="option"], [role="menuitem"], li')) {
          exact.click();
          return true;
        }
      }

      if (attempt === 4 && input) {
        await submitLeadSearch(input);
      }

      await sleep(attempt < 5 ? 80 : 150);
    }

    return false;
  }

  async function fillLeadsSearchOnce(query) {
    const text = (query || "").trim();
    if (!text) return { ok: false, opened: false, reason: "empty_query" };

    const input = await waitForLeadsSearchInput();
    if (!input) return { ok: false, opened: false, reason: "input_not_found" };

    if (!isAlreadyFilled(input, text)) {
      const filled = await fillSearchInput(input, text);
      const display = getSearchInputDisplayValue(input);
      if (!filled && !phoneMatches(digitsOnly(text), digitsOnly(display))) {
        return { ok: false, opened: false, reason: "fill_failed" };
      }
    }

    await sleep(180);
    const opened = await clickMatchingLead(text, input);
    return { ok: true, opened, reason: opened ? "opened" : "search_only" };
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

  function tickAll() {
    tickLeadWhatsApp();
  }

  let tickScheduled = false;
  function scheduleTickAll() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      tickAll();
    });
  }

  let alignScheduled = false;
  function scheduleWaWidgetAlign() {
    if (alignScheduled || !leadWaWidget?.isConnected) return;
    alignScheduled = true;
    requestAnimationFrame(() => {
      alignScheduled = false;
      alignWaWidgetWithCallButton(leadWaWidget, leadWaWidget._ctwaCallButton);
    });
  }

  window.addEventListener("resize", scheduleWaWidgetAlign);
  window.addEventListener("scroll", scheduleWaWidgetAlign, true);

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastLeadKey = "";
    }
    tickAll();
  }, 1200);

  setTimeout(tickAll, 300);
  setTimeout(tickAll, 900);

  new MutationObserver(() => scheduleTickAll()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

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
            reason: result?.reason || "",
          })
        )
        .catch(() => sendResponse({ ok: false, opened: false, reason: "error" }));
      return true;
    }
  });
})();
