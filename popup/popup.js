const countryInput = document.getElementById("countryCode");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

chrome.storage.sync.get({ defaultCountryCode: "33" }, (data) => {
  countryInput.value = data.defaultCountryCode || "33";
});

saveBtn.addEventListener("click", () => {
  const code = countryInput.value.replace(/\D/g, "");
  if (!code || code.length < 1 || code.length > 3) {
    showStatus("Indicatif invalide", true);
    return;
  }

  chrome.storage.sync.set({ defaultCountryCode: code }, () => {
    showStatus("Enregistré ✓");
  });
});

function showStatus(message, isError = false) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c62828" : "#2e7d32";
  setTimeout(() => {
    statusEl.hidden = true;
  }, 2000);
}
