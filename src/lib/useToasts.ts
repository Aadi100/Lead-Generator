"use client";

import { useCallback, useRef, useState } from 'react';
import type { ToastItem } from '@/components/ui/Toast';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const pushToast = useCallback((kind: ToastItem['kind'], message: string, action?: ToastItem['action']) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((cur) => [...cur.slice(-3), { id, kind, message, action }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  return { toasts, pushToast, dismissToast };
}
