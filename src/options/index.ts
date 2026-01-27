import { storage } from "webextension-polyfill";

import { defaultSettings, type Settings } from "#/settings";

const $logLevel = document.getElementById("log-level") as HTMLInputElement;
const $devMode = document.getElementById("dev-mode") as HTMLInputElement;
const $status = document.getElementById("status") as HTMLDivElement;
const $save = document.getElementById("save") as HTMLButtonElement;

// Saves options to chrome.storage
const saveOptions = () => {
  const options: Settings = {
    logLevel:
      ($logLevel.value as Settings["logLevel"]) || defaultSettings.logLevel,
    devMode: $devMode.checked,
  };

  storage.sync.set(options as Record<string, unknown>).then(() => {
    // Update status to let user know options were saved.
    $status.textContent = "Options saved";
    setTimeout(() => {
      $status.textContent = "";
    }, 750);
  });
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  storage.sync.get(defaultSettings as Record<string, unknown>).then((items) => {
    $logLevel.value = items.logLevel as string;
    $devMode.checked = items.devMode as boolean;
  });
};

restoreOptions();
$save.addEventListener("click", saveOptions);
