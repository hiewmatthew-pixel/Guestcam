'use client';

import { useEffect } from 'react';

// Registers public/sw.js in production builds only.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Non-fatal: the app works fine without the service worker.
      });
    }
  }, []);
  return null;
}
