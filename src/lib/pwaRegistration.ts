import { toast } from "sonner";

const isPreviewHost = (hostname: string) =>
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  hostname === "lovableproject.com" ||
  hostname.endsWith(".lovableproject.com") ||
  hostname === "lovableproject-dev.com" ||
  hostname.endsWith(".lovableproject-dev.com") ||
  hostname === "beta.lovable.dev" ||
  hostname.endsWith(".beta.lovable.dev");

const shouldRegisterPwa = () =>
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  window.self === window.top &&
  !isPreviewHost(window.location.hostname) &&
  !new URLSearchParams(window.location.search).has("sw");

const unregisterAppWorker = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => new URL(registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || "", window.location.origin).pathname === "/sw.js")
      .map((registration) => registration.unregister())
  );
};

export const registerPwa = async () => {
  if (!shouldRegisterPwa()) {
    await unregisterAppWorker();
    return;
  }

  const { registerSW } = await import("virtual:pwa-register");
  registerSW({
    immediate: true,
    onNeedRefresh(updateSW) {
      toast.info("Nova versão disponível, atualizar sistema", {
        duration: 10000,
        action: { label: "Atualizar", onClick: () => updateSW(true) },
      });
    },
  });
};