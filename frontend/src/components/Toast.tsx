import { translateText } from '../i18n/context';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/* ─── Types ─────────────────────────────────────────────────────── */
type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; type: ToastType; message: string };
type ToastCtx  = { toast: (msg: string, type?: ToastType) => void };

const ToastContext = createContext<ToastCtx>({ toast: () => undefined });

let _nextId = 1;

/* ─── Provider ──────────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = _nextId++;
    setItems(prev => [...prev, { id, type, message }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  const remove = (id: number) => setItems(prev => prev.filter(t => t.id !== id));

  const icons: Record<ToastType, string> = { success: '✓', error: '⚠', info: '✦' };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {items.map(item => (
          <div key={item.id} className={`toast ${item.type}`} role="alert">
            <span className="toast-icon">{icons[item.type]}</span>
            <span className="toast-msg">{item.message}</span>
            <button className="toast-close" onClick={() => remove(item.id)} aria-label={translateText("Close")}>{translateText("×")}</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
