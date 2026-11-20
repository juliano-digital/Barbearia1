window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.brasaInstallPromptEvent = event;
  window.dispatchEvent(new Event("brasa-install-prompt"));
});
