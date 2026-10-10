"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    function captureInstall(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", captureInstall);

    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return () => window.removeEventListener("beforeinstallprompt", captureInstall);
    }

    let refreshing = false;
    let interval = 0;
    let checkForUpdate: (() => void) | null = null;
    function activateUpdate() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", activateUpdate);

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
        });
      });
      const check = () => void registration.update();
      checkForUpdate = check;
      window.addEventListener("focus", check);
      interval = window.setInterval(check, 5 * 60 * 1000);
    }).catch(() => undefined);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      navigator.serviceWorker.removeEventListener("controllerchange", activateUpdate);
      if (checkForUpdate) window.removeEventListener("focus", checkForUpdate);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function update() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }

  if (!installPrompt && !waitingWorker) return null;
  return (
    <aside className="pwa-actions" aria-label="App installation and updates">
      {installPrompt && <button type="button" onClick={() => void install()}>Install app</button>}
      {waitingWorker && <div role="status"><span>App update available</span><button type="button" onClick={update}>Update now</button></div>}
    </aside>
  );
}
