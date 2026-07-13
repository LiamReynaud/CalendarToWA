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

async function findPipedriveTab() {
  const tabs = await chrome.tabs.query({ url: "https://*.pipedrive.com/*" });
  if (tabs.length === 0) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function pingPipedriveTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "CTWA_PIPEDRIVE_PING",
    });
    return response?.pong === true;
  } catch {
    return false;
  }
}

async function injectPipedriveScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/pipedrive.js"],
  });
}

async function ensurePipedriveScript(tabId) {
  if (await pingPipedriveTab(tabId)) return true;

  try {
    await injectPipedriveScripts(tabId);
  } catch {
    return false;
  }

  for (let i = 0; i < 15; i++) {
    await sleep(200);
    if (await pingPipedriveTab(tabId)) return true;
  }
  return false;
}

async function fillPipedriveSearch(tabId, query) {
  for (let i = 0; i < 12; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "FILL_PIPEDRIVE_SEARCH",
        query,
      });
      if (response?.ok) return true;
    } catch {
      await sleep(300);
    }
  }
  return false;
}

async function openOrReusePipedriveTab(searchQuery) {
  const existing = await findPipedriveTab();
  let tabId;
  let reused = false;

  if (existing?.id) {
    tabId = await focusTab(existing);
    reused = true;
    await sleep(600);
  } else {
    const tab = await chrome.tabs.create({
      url: "https://app.pipedrive.com/",
      active: true,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(1500);
  }

  if (!(await ensurePipedriveScript(tabId))) {
    if (reused) {
      await reloadAndWait(tabId);
      await sleep(800);
    }
    if (!(await ensurePipedriveScript(tabId))) {
      return { tabId, reused, filled: false };
    }
  }

  const filled = await fillPipedriveSearch(tabId, searchQuery);
  if (!filled && reused) {
    await sleep(800);
    return {
      tabId,
      reused,
      filled: await fillPipedriveSearch(tabId, searchQuery),
    };
  }
  return { tabId, reused, filled };
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
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/meridian.js"],
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
  for (let i = 0; i < 4; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "FILL_MERIDIAN_SEARCH",
        query,
      });
      if (response?.ok) {
        return { filled: true, opened: response.opened === true };
      }
    } catch {
      /* content script not ready yet */
    }
    await sleep(400);
  }
  return { filled: false, opened: false };
}

async function openOrReuseMeridianTab(searchQuery) {
  const existing = await findMeridianTab();
  let tabId;
  let reused = false;
  const onLeadsPage = existing?.url?.includes("/closing/leads");

  if (existing?.id && onLeadsPage) {
    tabId = await focusTab(existing);
    reused = true;
    await sleep(600);
  } else if (existing?.id) {
    tabId = await focusTab(existing);
    reused = true;
    await chrome.tabs.update(tabId, { url: MERIDIAN_LEADS_URL });
    await waitForTabLoad(tabId);
    await sleep(1200);
  } else {
    const tab = await chrome.tabs.create({
      url: MERIDIAN_LEADS_URL,
      active: true,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(1500);
  }

  if (!(await ensureMeridianScript(tabId))) {
    if (reused) {
      await reloadAndWait(tabId);
      await sleep(800);
    }
    if (!(await ensureMeridianScript(tabId))) {
      return { tabId, reused, filled: false };
    }
  }

  const searchResult = await fillMeridianSearch(tabId, searchQuery);
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
      enablePipedrive = false,
      enableMeridian = false,
    } = message.payload || {};
    chrome.storage.sync.set(
      {
        defaultCountryCode,
        enableWhatsApp,
        enablePipedrive,
        enableMeridian,
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

  if (message.type === "OPEN_PIPEDRIVE_SEARCH") {
    const { query } = message.payload || {};
    openOrReusePipedriveTab(query || "")
      .then((result) => sendResponse({ ok: result.filled, ...result }))
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
