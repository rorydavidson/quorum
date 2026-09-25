'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export type ToastType = 'success' | 'error';
export type ShowToast = (message: string, type: ToastType) => void;

const TOAST_DURATION_MS = 3500;

function Toast({ message, type }: { message: string; type: ToastType }) {
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium ${
        type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {message}
    </div>
  );
}

/**
 * Transient bottom-right toast. A new message replaces the current one and
 * restarts the timer, so a fast sequence of actions never leaves a stale
 * timeout clearing a newer toast early.
 */
export function useToast(): { showToast: ShowToast; toastElement: React.ReactNode } {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback<ShowToast>((message, type) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return {
    showToast,
    toastElement: toast ? <Toast message={toast.message} type={toast.type} /> : null,
  };
}
