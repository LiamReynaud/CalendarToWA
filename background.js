const STORAGE_KEY = "pendingContact";

function getPendingContact() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      resolve(data[STORAGE_KEY] || null);
    });
  });
}

async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length === 0) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return tab.id;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 15000);

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        cleanup();
        resolve();
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingWhatsAppTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "CTWA_PING" });
    return response?.pong === true;
  } catch {
    return false;
  }
}

async function injectWhatsAppScripts(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/whatsapp.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/phone-utils.js", "content/whatsapp.js"],
  });
}

async function ensureWhatsAppScript(tabId) {
  if (await pingWhatsAppTab(tabId)) return true;

  try {
    await injectWhatsAppScripts(tabId);
  } catch {
    return false;
  }

  for (let i = 0; i < 15; i++) {
    await sleep(200);
    if (await pingWhatsAppTab(tabId)) return true;
  }
  return false;
}

async function reloadAndWait(tabId) {
  await chrome.tabs.reload(tabId);
  await waitForTabLoad(tabId);
  await sleep(800);
}

async function triggerAutomation(tabId, contact) {
  if (!contact) return false;

  for (let i = 0; i < 12; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "RUN_PENDING_CONTACT",
        contact,
      });
      if (response?.ok) return true;
    } catch {
      await sleep(300);
    }
  }
  return false;
}

const TC_URL_PATTERN = "https://talentedclosers.com/crm/*";

function normalizeTalentedCloserUrl(raw) {
  const trimmed = (raw || "").trim().replace(/[)\]>.,;]+$/, "");
  const match = trimmed.match(
    /^https?:\/\/(?:www\.)?talentedclosers\.com\/crm\/leads\/(\d+)/i
  );
  if (!match) return "";
  return `https://talentedclosers.com/crm/leads/${match[1]}`;
}

async function findTalentedCloserTab() {
  const tabs = await chrome.tabs.query({ url: TC_URL_PATTERN });
  if (tabs.length === 0) {
    const broader = await chrome.tabs.query({
      url: "https://talentedclosers.com/*",
    });
    if (broader.length === 0) return null;
    broader.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return broader[0];
  }
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function openOrReuseTalentedCloserTab(targetUrl) {
  const url = normalizeTalentedCloserUrl(targetUrl);
  if (!url) return { ok: false, error: "invalid_url" };

  const existing = await findTalentedCloserTab();
  let tabId;
  let reused = false;

  if (existing?.id) {
    tabId = await focusTab(existing);
    reused = true;
    await chrome.tabs.update(tabId, { url, active: true });
    await waitForTabLoad(tabId);
  } else {
    const tab = await chrome.tabs.create({ url, active: true });
    tabId = tab.id;
    await waitForTabLoad(tabId);
  }

  return { ok: true, tabId, reused, url };
}

const MERIDIAN_LEADS_URL = "https://studio.meridian-partner.net/closing/leads";

async function findMeridianTab() {
  const tabs = await chrome.tabs.query({
    url: "https://studio.meridian-partner.net/*",
  });
  if (tabs.length === 0) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function pingMeridianTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "CTWA_MERIDIAN_PING",
    });
    return response?.pong === true;
  } catch {
    return false;
  }
}

async function injectMeridianScripts(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/meridian.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/phone-utils.js", "content/meridian.js"],
  });
}

async function ensureMeridianScript(tabId) {
  if (await pingMeridianTab(tabId)) return true;

  try {
    await injectMeridianScripts(tabId);
  } catch {
    return false;
  }

  for (let i = 0; i < 15; i++) {
    await sleep(200);
    if (await pingMeridianTab(tabId)) return true;
  }
  return false;
}

async function fillMeridianSearch(tabId, query) {
  for (let i = 0; i < 6; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "FILL_MERIDIAN_SEARCH",
        query,
      });
      if (response?.ok) {
        return { filled: true, opened: response.opened === true };
      }
      if (response?.reason && response.reason !== "error") {
        break;
      }
    } catch {
      /* content script not ready yet */
    }
    if (i < 5) await sleep(120);
  }
  return { filled: false, opened: false };
}

async function openOrReuseMeridianTab(searchQuery) {
  const existing = await findMeridianTab();
  let tabId;
  let reused = false;

  if (existing?.id) {
    tabId = await focusTab(existing);
    reused = true;
    if (!(await pingMeridianTab(tabId))) {
      await sleep(150);
    }
  } else {
    const tab = await chrome.tabs.create({
      url: MERIDIAN_LEADS_URL,
      active: true,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(400);
  }

  if (!(await ensureMeridianScript(tabId))) {
    if (reused) {
      await reloadAndWait(tabId);
      await sleep(300);
    }
    if (!(await ensureMeridianScript(tabId))) {
      return { tabId, reused, filled: false };
    }
  }

  const searchResult = await fillMeridianSearch(tabId, searchQuery);
  if (!searchResult.filled && reused) {
    await sleep(200);
    const retry = await fillMeridianSearch(tabId, searchQuery);
    return {
      tabId,
      reused,
      filled: retry.filled,
      opened: retry.opened,
    };
  }
  return { tabId, reused, filled: searchResult.filled, opened: searchResult.opened };
}

async function openOrReuseWhatsAppTab() {
  const contact = await getPendingContact();
  const existing = await findWhatsAppTab();
  let tabId;
  let reused = false;

  if (existing?.id) {
    tabId = await focusTab(existing);
    reused = true;
  } else {
    const tab = await chrome.tabs.create({
      url: "https://web.whatsapp.com/",
      active: true,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(800);
  }

  if (!(await ensureWhatsAppScript(tabId))) {
    if (!reused) {
      await reloadAndWait(tabId);
    } else {
      for (let i = 0; i < 15; i++) {
        await sleep(400);
        try {
          await injectWhatsAppScripts(tabId);
        } catch {
          /* tab may still be loading */
        }
        if (await pingWhatsAppTab(tabId)) break;
      }
    }
    if (!(await ensureWhatsAppScript(tabId))) {
      return { tabId, reused, triggered: false };
    }
  }

  const triggered = await triggerAutomation(tabId, contact);
  return { tabId, reused, triggered };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_SETTINGS") {
    const {
      defaultCountryCode = "33",
      enableWhatsApp = true,
      enableTalentedCloser = false,
      enableMeridian = false,
      enableMeridianWhatsApp = false,
      enableTalentedCloserWhatsApp = false,
    } = message.payload || {};
    chrome.storage.sync.set(
      {
        defaultCountryCode,
        enableWhatsApp,
        enableTalentedCloser,
        enableMeridian,
        enableMeridianWhatsApp,
        enableTalentedCloserWhatsApp,
      },
      () => sendResponse({ ok: !chrome.runtime.lastError })
    );
    return true;
  }

  if (message.type === "OPEN_MERIDIAN_SEARCH") {
    const { query } = message.payload || {};
    openOrReuseMeridianTab(query || "")
      .then((result) =>
        sendResponse({
          ok: result.filled,
          opened: result.opened === true,
          ...result,
        })
      )
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "OPEN_TALENTED_CLOSER") {
    const { url } = message.payload || {};
    openOrReuseTalentedCloserTab(url || "")
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "OPEN_WHATSAPP_CONTACT") {
    const {
      phone,
      rawPhone,
      firstName,
      lastName,
      countryCode,
      nationalNumber,
      searchNames,
      eventDate,
      meetUrl,
    } = message.payload;

    chrome.storage.local.set(
      {
        [STORAGE_KEY]: {
          phone,
          rawPhone: rawPhone || phone,
          firstName: firstName || "",
          lastName: lastName || "",
          countryCode: countryCode || "33",
          nationalNumber: nationalNumber || "",
          searchNames: searchNames || [],
          eventDate: eventDate || "",
          meetUrl: meetUrl || "",
          awaitingTrigger: true,
          createdAt: Date.now(),
        },
      },
      () => {
        openOrReuseWhatsAppTab()
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch((error) => sendResponse({ ok: false, error: String(error) }));
      }
    );
    return true;
  }

  if (message.type === "GET_PENDING_CONTACT") {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      sendResponse({ contact: data[STORAGE_KEY] || null });
    });
    return true;
  }

  if (message.type === "ACK_PENDING_TRIGGER") {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const contact = data[STORAGE_KEY];
      if (contact?.awaitingTrigger) {
        chrome.storage.local.set({
          [STORAGE_KEY]: { ...contact, awaitingTrigger: false },
        });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "CLEAR_PENDING_CONTACT") {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
