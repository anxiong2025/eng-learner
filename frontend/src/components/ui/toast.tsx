import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 2500);
    return () => clearTimeout(timer);
  }, [onRemove]);

  const icons = {
    success: <Check className="w-4 h-4 text-green-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg animate-in slide-in-from-top-2 fade-in duration-200',
        bgColors[toast.type]
      )}
    >
      {icons[toast.type]}
      <span className="text-sm">{toast.message}</span>
      <button
        onClick={onRemove}
        className="ml-2 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}
