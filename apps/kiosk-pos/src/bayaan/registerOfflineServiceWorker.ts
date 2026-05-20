export function registerOfflineServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/bayaan-sw.js").catch(() => undefined);
  });
}
