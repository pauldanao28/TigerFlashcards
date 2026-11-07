"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface AlertOptions {
  title?: string;
  actionLabel?: string;
}

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AlertContextType {
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  // Resolves to the trimmed text on submit, or null on cancel/empty — the app's own
  // modal in place of the browser's native window.prompt().
  showPrompt: (message: string, options?: PromptOptions) => Promise<string | null>;
}

const AlertContext = createContext<AlertContextType>({
  showAlert: async () => {},
  showConfirm: async () => false,
  showPrompt: async () => null,
});

type ModalState =
  | { type: "alert"; message: string; title?: string; actionLabel?: string; resolve: () => void }
  | { type: "confirm"; message: string; title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { type: "prompt"; message: string; title?: string; placeholder?: string; confirmLabel?: string; cancelLabel?: string; resolve: (v: string | null) => void }
  | null;

export function AlertProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);
  const [promptValue, setPromptValue] = useState("");

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setModal({ type: "alert", message, title: options?.title, actionLabel: options?.actionLabel, resolve });
    });
  }, []);

  const showConfirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setModal({
        type: "confirm",
        message,
        title: options?.title,
        confirmLabel: options?.confirmLabel,
        cancelLabel: options?.cancelLabel,
        danger: options?.danger,
        resolve,
      });
    });
  }, []);

  const showPrompt = useCallback((message: string, options?: PromptOptions) => {
    setPromptValue("");
    return new Promise<string | null>((resolve) => {
      setModal({
        type: "prompt",
        message,
        title: options?.title,
        placeholder: options?.placeholder,
        confirmLabel: options?.confirmLabel,
        cancelLabel: options?.cancelLabel,
        resolve,
      });
    });
  }, []);

  const close = (result?: boolean) => {
    if (!modal) return;
    if (modal.type === "alert") modal.resolve();
    else if (modal.type === "prompt") modal.resolve(null);
    else modal.resolve(result ?? false);
    setModal(null);
  };

  const submitPrompt = () => {
    if (!modal || modal.type !== "prompt") return;
    const trimmed = promptValue.trim();
    modal.resolve(trimmed || null);
    setModal(null);
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {modal && (
        <>
          <div
            className="fixed inset-0 z-[400] bg-black/20"
            onClick={() => (modal.type === "alert" ? close() : close(false))}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[401] bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const title = modal.title ?? (modal.type === "confirm" ? "Are you sure?" : modal.type === "alert" ? "Notice" : "");
              return title ? <p className="text-base font-black text-slate-800 mb-1">{title}</p> : null;
            })()}
            <p className="text-xs text-slate-500 leading-relaxed mb-4 whitespace-pre-line">{modal.message}</p>
            {modal.type === "prompt" && (
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPrompt()}
                placeholder={modal.placeholder}
                className="w-full mb-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            )}
            {modal.type === "alert" ? (
              <button
                onClick={() => close()}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm"
              >
                {modal.actionLabel ?? "OK"}
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => close(false)}
                  className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all"
                >
                  {modal.cancelLabel ?? "Cancel"}
                </button>
                <button
                  onClick={modal.type === "prompt" ? submitPrompt : () => close(true)}
                  disabled={modal.type === "prompt" && !promptValue.trim()}
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm disabled:opacity-40 ${modal.type === "confirm" && modal.danger ? "bg-rose-600" : "bg-indigo-600"}`}
                >
                  {modal.confirmLabel ?? (modal.type === "prompt" ? "Submit" : "Confirm")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </AlertContext.Provider>
  );
}

export const useAppAlert = () => useContext(AlertContext);
