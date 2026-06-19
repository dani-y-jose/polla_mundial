"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Promise-based replacement for the browser's blocking window.alert/confirm.
// `useDialog()` returns `{ alert, confirm }`; both await a user action and
// resolve — alert to void, confirm to a boolean. A single styled modal lives at
// the app root (see DialogProvider in layout.tsx), so any client component can
// raise a dialog without rendering its own markup.

type DialogTone = "default" | "danger";

type AlertOptions = { title?: string; confirmText?: string };
type ConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
};

type DialogState = {
  kind: "alert" | "confirm";
  message: string;
  title?: string;
  confirmText: string;
  cancelText?: string;
  tone: DialogTone;
  resolve: (value: boolean) => void;
};

type DialogApi = {
  alert: (message: string, options?: AlertOptions) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within a <DialogProvider>");
  }
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const alert = useCallback((message: string, options: AlertOptions = {}) => {
    return new Promise<void>((resolve) => {
      setDialog({
        kind: "alert",
        message,
        title: options.title,
        confirmText: options.confirmText ?? "Entendido",
        tone: "default",
        resolve: () => resolve(),
      });
    });
  }, []);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        kind: "confirm",
        message,
        title: options.title,
        confirmText: options.confirmText ?? "Confirmar",
        cancelText: options.cancelText ?? "Cancelar",
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setDialog((current) => {
        current?.resolve(result);
        return null;
      });
    },
    []
  );

  // Move focus to the primary action when a dialog opens, and let Escape
  // dismiss it (cancel for confirm, acknowledge for alert).
  useEffect(() => {
    if (!dialog) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, close]);

  const isDanger = dialog?.tone === "danger";

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 motion-safe:animate-[fadeIn_120ms_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title ?? "Aviso"}
        >
          {/* Backdrop — clicking it cancels (confirm) / acknowledges (alert). */}
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            onClick={() => close(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl motion-safe:animate-[popIn_150ms_ease-out]">
            {dialog.title && (
              <h2 className="mb-2 text-base font-bold text-white">{dialog.title}</h2>
            )}
            <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-line">
              {dialog.message}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              {dialog.kind === "confirm" && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-300 hover:bg-white/10 transition-colors"
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => close(true)}
                className={`min-h-[44px] rounded-xl px-5 text-sm font-bold text-white transition-colors ${
                  isDanger
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
