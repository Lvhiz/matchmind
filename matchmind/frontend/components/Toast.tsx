'use client'

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function ToastContainer({ toasts }: { toasts?: ToastItem[] }) {
  const items = toasts ?? [];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-md border px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-green-500/40 bg-green-950 text-green-100"
              : "border-red-500/40 bg-red-950 text-red-100"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
