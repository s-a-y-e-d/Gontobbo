"use client";

import React from "react";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastInput = {
  variant?: ToastVariant;
  message: string;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toastStyles: Record<ToastVariant, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-brand-green-deep dark:border-emerald-300/15 dark:bg-emerald-950/40 dark:text-emerald-100",
  error:
    "border-[#f1c2bc] bg-[#fff4f2] text-[#c54f41] dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-100",
  info:
    "border-border-subtle bg-pure-white text-on-surface dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100",
};

const toastIcons: Record<ToastVariant, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismissToast = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = React.useCallback(
    ({ variant = "info", message }: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current, { id, variant, message }].slice(-4));
      window.setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (message) => showToast({ variant: "success", message }),
      error: (message) => showToast({ variant: "error", message }),
      info: (message) => showToast({ variant: "info", message }),
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-3 bottom-24 z-[200] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(24rem,calc(100vw-3rem))]"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-[20px] border px-4 py-3 text-sm shadow-[0_18px_50px_rgba(0,0,0,0.10)] backdrop-blur ${toastStyles[toast.variant]}`}
          >
            <span className="material-symbols-outlined mt-0.5 text-[19px]">
              {toastIcons[toast.variant]}
            </span>
            <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current opacity-60 transition-opacity hover:opacity-100"
              aria-label="Toast বন্ধ করুন"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
