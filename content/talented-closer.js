(function () {
  const SCRIPT_ID = "1.14.0-tc";
  if (window.__CTWA_TALENTED_CLOSER_SCRIPT__ === SCRIPT_ID) return;
  window.__CTWA_TALENTED_CLOSER_SCRIPT__ = SCRIPT_ID;

  const LEAD_DETAIL_PATH = /^\/crm\/leads\/\d+(?:\/|$)/;
  const PHONE_TEXT_REGEX = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/;
  const FOLLOW_UP_DATE =
    /\d{1,2}\s+[a-zàâäéèêëïîôùûüç.]+\.?\s+\d{4},?\s+\d{1,2}:\d{2}/i;
  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .609.609l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.592-.832-6.323-2.22l-.448-.372-2.605.872.872-2.538-.39-.453A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>`;

  let enableTalentedCloserWhatsApp = null;
  let settingsLoaded = false;
  let defaultCountryCode = "33";
  let leadWaWidget = null;
  let lastLeadKey = "";

  const phoneUtils = window.CalendarToWA;
  const { normalizeForWhatsApp, formatDisplay, parsePhoneParts, extractMeetUrl } =
    phoneUtils || {};

  chrome.storage.sync.get(
    { defaultCountryCode: "33", enableWhatsApp: true },
    (data) => {
      chrome.storage.sync.get("enableTalentedCloserWhatsApp", (tcWa) => {
        const hasSetting = "enableTalentedCloserWhatsApp" in tcWa;
        enableTalentedCloserWhatsApp = hasSetting
          ? tcWa.enableTalentedCloserWhatsApp === true
          : data.enableWhatsApp !== false;
        defaultCountryCode = data.defaultCountryCode || "33";
        settingsLoaded = true;
        tickLeadWhatsApp();
      });
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableTalentedCloserWhatsApp) {
      enableTalentedCloserWhatsApp = changes.enableTalentedCloserWhatsApp.newValue === true;
      tickLeadWhatsApp();
    }
    if (changes.defaultCountryCode) {
      defaultCountryCode = changes.defaultCountryCode.newValue || "33";
      lastLeadKey = "";
      tickLeadWhatsApp();
    }
  });

  function isLeadDetailPage() {
    return LEAD_DETAIL_PATH.test(location.pathname);
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

  function splitLeadNameForWhatsApp(fullName) {
    const trimmed = (fullName || "").trim();
    if (!trimmed) return { firstName: "", lastName: "", searchNames: [] };
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    const searchNames = lastName ? [trimmed, firstName] : [firstName];
    return { firstName, lastName, searchNames };
  }

  function extractLeadName(root) {
    for (const sel of ["h1", "[data-testid='lead-name']", ".lead-name", "main h2"]) {
      const text = root.querySelector(sel)?.textContent?.trim();
      if (text && text !== "Suivi") return text;
    }
    const title = document.title.split("|")[0].split("—")[0].trim();
    return title && !/connexion|login/i.test(title) ? title : "";
  }

  function extractRawPhone(root) {
    const tel = root.querySelector('a[href^="tel:"]');
    if (tel) {
      return (
        tel.getAttribute("href")?.replace(/^tel:/i, "").split(/[;,?]/)[0].trim() ||
        tel.textContent?.trim() ||
        ""
      );
    }

    const h1 = root.querySelector("h1");
    const scopedRoot = h1?.closest("section, header, .card, main") || h1?.parentElement || root;
    const scopedMatch = scopedRoot.textContent?.match(PHONE_TEXT_REGEX);
    if (scopedMatch) return scopedMatch[0].trim();

    const bodyMatch = root.textContent?.match(PHONE_TEXT_REGEX);
    return bodyMatch ? bodyMatch[0].trim() : "";
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findCallActionButton(root, contactBlock) {
    const scope = contactBlock || root;
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

    return telLinks[0] || null;
  }

  function getWaMountAnchor(contactBlock, callButton) {
    if (!callButton) return contactBlock;
    const row = callButton.closest("div, p, li, section, header");
    if (row && (row === contactBlock || contactBlock.contains(row))) return row;
    return contactBlock;
  }

  function findContactAnchor(root, telLink) {
    const tel = telLink || root.querySelector('a[href^="tel:"]');
    if (tel) {
      let block = tel.parentElement;
      while (block && block !== root) {
        if (block.querySelector('a[href^="mailto:"]')) return block;
        block = block.parentElement;
      }
      return tel.parentElement;
    }

    const h1 = root.querySelector("h1");
    if (h1) {
      const sibling = h1.nextElementSibling;
      if (sibling?.matches("p, div, span")) return sibling;
      const container = h1.closest("section, header, div") || h1.parentElement;
      if (container) return container;
    }

    const mail = root.querySelector('a[href^="mailto:"]');
    if (mail?.parentElement) return mail.parentElement;

    return root.querySelector("main") || root;
  }

  function extractFollowUpDate(root) {
    for (const heading of root.querySelectorAll("h4, h3, strong, .fw-bold")) {
      if (!/suivi/i.test(heading.textContent || "")) continue;
      const container =
        heading.closest(".card, section, [class*='follow'], [class*='suivi']") ||
        heading.parentElement;
      const text = container?.textContent || "";
      const match = text.match(FOLLOW_UP_DATE);
      if (match) return match[0].trim();
    }

    for (const el of root.querySelectorAll("span, div, time, p")) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (FOLLOW_UP_DATE.test(text) && text.length < 40) {
        const match = text.match(FOLLOW_UP_DATE);
        if (match) return match[0].trim();
      }
    }
    return "";
  }

  function extractMeetUrlFromPage(root) {
    for (const link of root.querySelectorAll('a[href*="meet.google.com"]')) {
      const url = extractMeetUrl(link.getAttribute("href") || link.textContent || "");
      if (url) return url;
    }
    return extractMeetUrl(root.textContent || "");
  }

  function extractContactPageData() {
    const root = document.querySelector("main") || document.body;
    if (!root || !isLeadDetailPage()) return null;

    const name = extractLeadName(root);
    const telLink = root.querySelector('a[href^="tel:"]');
    const rawPhone = extractRawPhone(root);
    const phone = phoneResultFromRaw(rawPhone);
    if (!phone) return null;

    const contactBlock = findContactAnchor(root, telLink);
    if (!contactBlock) return null;

    const { firstName, lastName, searchNames } = splitLeadNameForWhatsApp(name);
    const callButton = findCallActionButton(root, contactBlock);
    const mountAnchor = getWaMountAnchor(contactBlock, callButton);

    return {
      contactBlock,
      mountAnchor,
      callButton,
      phone,
      firstName,
      lastName,
      searchNames,
      eventDate: extractFollowUpDate(root),
      meetUrl: extractMeetUrlFromPage(root),
      key: `${location.pathname}|${phone.normalized}|${name}`,
    };
  }

  function buildWhatsAppPayload(data) {
    return {
      phone: data.phone.normalized,
      rawPhone: data.phone.raw,
      countryCode: data.phone.countryCode,
      nationalNumber: data.phone.nationalNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      searchNames: data.searchNames,
      eventDate: data.eventDate || "",
      meetUrl: data.meetUrl || "",
    };
  }

  function openWhatsAppContact(contact, btn) {
    const label = btn.querySelector(".ctwa-tc-wa-btn__label");
    btn.disabled = true;
    btn.classList.add("ctwa-tc-wa-btn--loading");
    if (label) label.textContent = "Ouverture…";

    try {
      chrome.runtime.sendMessage({
        type: "OPEN_WHATSAPP_CONTACT",
        payload: contact,
      });
    } catch {
      btn.disabled = false;
      btn.classList.remove("ctwa-tc-wa-btn--loading");
      if (label) label.textContent = "Erreur — réessayer";
      return;
    }

    if (label) label.textContent = "WhatsApp ouvert ✓";
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove("ctwa-tc-wa-btn--loading");
      if (label) label.textContent = "Créer ou ouvrir le contact";
    }, 1500);
  }

  function createLeadWhatsAppWidget(data) {
    const root = document.createElement("div");
    root.className = "ctwa-tc-lead-wa";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctwa-tc-wa-btn";
    btn.setAttribute("aria-label", "Créer ou ouvrir le contact sur WhatsApp");

    const icon = document.createElement("span");
    icon.className = "ctwa-tc-wa-btn__icon";
    icon.innerHTML = WA_ICON_SVG;

    const label = document.createElement("span");
    label.className = "ctwa-tc-wa-btn__label";
    label.textContent = "Créer ou ouvrir le contact";

    btn.append(icon, label);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openWhatsAppContact(buildWhatsAppPayload(data), btn);
    });

    root.appendChild(btn);
    return root;
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

  function removeLeadWhatsAppWidget() {
    leadWaWidget?.remove();
    leadWaWidget = null;
    lastLeadKey = "";
  }

  function tickLeadWhatsApp() {
    if (!settingsLoaded || !enableTalentedCloserWhatsApp || !phoneUtils) {
      removeLeadWhatsAppWidget();
      return;
    }
    if (!isLeadDetailPage()) {
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

  let tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      tickLeadWhatsApp();
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
    tickLeadWhatsApp();
  }, 1200);

  hookSpaNavigation();

  new MutationObserver(() => scheduleTick()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
