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

interface AlertContextType {
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType>({
  showAlert: async () => {},
  showConfirm: async () => false,
});

type ModalState =
  | { type: "alert"; message: string; title?: string; actionLabel?: string; resolve: () => void }
  | { type: "confirm"; message: string; title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | null;

export function AlertProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);

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

  const close = (result?: boolean) => {
    if (!modal) return;
    if (modal.type === "alert") modal.resolve();
    else modal.resolve(result ?? false);
    setModal(null);
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modal && (
        <>
          <div
            className="fixed inset-0 z-[400] bg-black/20"
            onClick={() => (modal.type === "confirm" ? close(false) : close())}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[401] bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-black text-slate-800 mb-1">
              {modal.title ?? (modal.type === "confirm" ? "Are you sure?" : "Notice")}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4 whitespace-pre-line">{modal.message}</p>
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
                  onClick={() => close(true)}
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm ${modal.danger ? "bg-rose-600" : "bg-indigo-600"}`}
                >
                  {modal.confirmLabel ?? "Confirm"}
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
