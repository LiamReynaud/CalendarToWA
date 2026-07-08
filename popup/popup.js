const countryInput = document.getElementById("countryCode");
const enableWhatsAppInput = document.getElementById("enableWhatsApp");
const enablePipedriveInput = document.getElementById("enablePipedrive");

let settingsLoaded = false;
let lastSavedCountryCode = "33";

function readSettings() {
  const code = countryInput.value.replace(/\D/g, "");
  const defaultCountryCode =
    code && code.length >= 1 && code.length <= 3 ? code : lastSavedCountryCode;

  return {
    defaultCountryCode,
    enableWhatsApp: enableWhatsAppInput.checked,
    enablePipedrive: enablePipedriveInput.checked,
  };
}

function saveSettings() {
  if (!settingsLoaded) return;

  const settings = readSettings();
  lastSavedCountryCode = settings.defaultCountryCode;

  chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    payload: settings,
  });
}

chrome.storage.sync.get(
  {
    defaultCountryCode: "33",
    enableWhatsApp: true,
    enablePipedrive: false,
  },
  (data) => {
    lastSavedCountryCode = data.defaultCountryCode || "33";
    countryInput.value = lastSavedCountryCode;
    enableWhatsAppInput.checked = data.enableWhatsApp !== false;
    enablePipedriveInput.checked = data.enablePipedrive === true;
    settingsLoaded = true;
  }
);

enableWhatsAppInput.addEventListener("change", saveSettings);
enablePipedriveInput.addEventListener("change", saveSettings);
countryInput.addEventListener("blur", saveSettings);

window.addEventListener("pagehide", saveSettings);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveSettings();
});
