const countryInput = document.getElementById("countryCode");
const enableWhatsAppInput = document.getElementById("enableWhatsApp");
const enableTalentedCloserInput = document.getElementById("enableTalentedCloser");
const enableMeridianInput = document.getElementById("enableMeridian");
const enableGhlInput = document.getElementById("enableGhl");
const enableOnoffInput = document.getElementById("enableOnoff");
const enableMeridianWhatsAppInput = document.getElementById("enableMeridianWhatsApp");
const enableCalendlyWhatsAppInput = document.getElementById("enableCalendlyWhatsApp");
const enableTalentedCloserWhatsAppInput = document.getElementById(
  "enableTalentedCloserWhatsApp"
);

let settingsLoaded = false;
let lastSavedCountryCode = "33";

function readSettings() {
  const code = countryInput.value.replace(/\D/g, "");
  const defaultCountryCode =
    code && code.length >= 1 && code.length <= 3 ? code : lastSavedCountryCode;

  return {
    defaultCountryCode,
    enableWhatsApp: enableWhatsAppInput.checked,
    enableTalentedCloser: enableTalentedCloserInput.checked,
    enableMeridian: enableMeridianInput.checked,
    enableGhl: enableGhlInput.checked,
    enableMeridianWhatsApp: enableMeridianWhatsAppInput.checked,
    enableCalendlyWhatsApp: enableCalendlyWhatsAppInput.checked,
    enableTalentedCloserWhatsApp: enableTalentedCloserWhatsAppInput.checked,
    enableOnoff: enableOnoffInput.checked,
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
    enableTalentedCloser: false,
    enableMeridian: false,
    enableOnoff: false,
  },
  (data) => {
    chrome.storage.sync.get(
      ["enableMeridianWhatsApp", "enableCalendlyWhatsApp", "enableTalentedCloserWhatsApp"],
      (opts) => {
      const hasMeridianWaSetting = "enableMeridianWhatsApp" in opts;
      const hasCalendlyWaSetting = "enableCalendlyWhatsApp" in opts;
      const hasTcWaSetting = "enableTalentedCloserWhatsApp" in opts;
      lastSavedCountryCode = data.defaultCountryCode || "33";
      countryInput.value = lastSavedCountryCode;
      enableWhatsAppInput.checked = data.enableWhatsApp !== false;
      enableTalentedCloserInput.checked =
        data.enableTalentedCloser === true || data.enablePipedrive === true;
      enableMeridianInput.checked = data.enableMeridian === true;
      enableGhlInput.checked = data.enableGhl === true;
      enableOnoffInput.checked = data.enableOnoff === true;
      enableMeridianWhatsAppInput.checked = hasMeridianWaSetting
        ? opts.enableMeridianWhatsApp === true
        : data.enableWhatsApp !== false;
      enableCalendlyWhatsAppInput.checked = hasCalendlyWaSetting
        ? opts.enableCalendlyWhatsApp === true
        : data.enableWhatsApp !== false;
      enableTalentedCloserWhatsAppInput.checked = hasTcWaSetting
        ? opts.enableTalentedCloserWhatsApp === true
        : data.enableWhatsApp !== false;
      settingsLoaded = true;
    }
    );
  }
);

enableWhatsAppInput.addEventListener("change", saveSettings);
enableTalentedCloserInput.addEventListener("change", saveSettings);
enableMeridianInput.addEventListener("change", saveSettings);
enableGhlInput.addEventListener("change", saveSettings);
enableOnoffInput.addEventListener("change", saveSettings);
enableMeridianWhatsAppInput.addEventListener("change", saveSettings);
enableCalendlyWhatsAppInput.addEventListener("change", saveSettings);
enableTalentedCloserWhatsAppInput.addEventListener("change", saveSettings);
countryInput.addEventListener("blur", saveSettings);

window.addEventListener("pagehide", saveSettings);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveSettings();
});
