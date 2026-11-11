"use client";

import { useEffect } from 'react';

// Registers /sw.js (installable app + push). In `next dev` it is skipped unless the page is opened once with ?sw=1,
// so hot reload is never cached by accident.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let force = false;
    try {
      const q = new URLSearchParams(location.search).get('sw');
      if (q === '1') localStorage.setItem('lr-sw', '1');
      if (q === '0') localStorage.removeItem('lr-sw');
      force = localStorage.getItem('lr-sw') === '1';
    } catch {
      /* storage blocked */
    }
    if (process.env.NODE_ENV !== 'production' && !force) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* not available, for example plain http on a phone */
    });
  }, []);
  return null;
}
