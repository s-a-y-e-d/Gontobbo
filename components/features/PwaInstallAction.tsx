"use client";

import { useEffect, useState } from "react";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms?: string[];
    readonly userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
    prompt(): Promise<void>;
  }
}

type PwaInstallActionProps = {
  variant?: "button" | "menu";
  canInstall: boolean;
  isInstalled: boolean;
  isPrompting: boolean;
  onInstall: () => void;
};

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    const updateInstalledState = () => {
      setIsInstalled(isStandaloneDisplayMode());
    };

    updateInstalledState();

    const displayModeQuery = window.matchMedia("(display-mode: standalone)");

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setIsPrompting(false);
    };

    displayModeQuery.addEventListener("change", updateInstalledState);
    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      displayModeQuery.removeEventListener("change", updateInstalledState);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsPrompting(true);

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setIsPrompting(false);
    }
  };

  return {
    canInstall: deferredPrompt !== null,
    isInstalled,
    isPrompting,
    onInstall: () => {
      void handleInstall();
    },
  };
}

export default function PwaInstallAction({
  variant = "button",
  canInstall,
  isInstalled,
  isPrompting,
  onInstall,
}: PwaInstallActionProps) {
  if (isInstalled || !canInstall) {
    return null;
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={onInstall}
        disabled={isPrompting}
        className="w-full rounded-[24px] border border-emerald-500/20 bg-emerald-50 px-4 py-4 text-left text-slate-900 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-slate-50 dark:hover:bg-emerald-400/15"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900">
            <span className="material-symbols-outlined text-[20px]">
              install_mobile
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {isPrompting ? "ইনস্টল অপশন খোলা হচ্ছে..." : "অ্যাপ ইনস্টল করুন"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              হোম স্ক্রিন থেকে ব্রাউজার ছাড়াই গন্তব্য খুলুন।
            </p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onInstall}
      disabled={isPrompting}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-on-surface px-4 text-sm font-semibold text-pure-white transition-opacity hover:bg-brand-green hover:text-on-surface disabled:cursor-wait disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[18px]">
        install_mobile
      </span>
      {isPrompting ? "খোলা হচ্ছে" : "ইনস্টল"}
    </button>
  );
}
