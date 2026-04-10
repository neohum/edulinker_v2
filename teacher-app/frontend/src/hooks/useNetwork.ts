import { useState, useEffect } from 'react';
import { API_BASE } from '../api';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverOnline, setServerOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Custom event triggered by apiFetch
    const handleServerOffline = () => setServerOnline(false);
    const handleServerOnline = () => setServerOnline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('server-offline', handleServerOffline);
    window.addEventListener('server-online', handleServerOnline);

    // Initial check on mount - Delay by 5 seconds to allow backend to wake up/connect
    const initialTimer = setTimeout(() => {
      fetch(`${API_BASE}/health`)
        .then(res => {
          if (!res.ok) window.dispatchEvent(new Event('server-offline'));
          else window.dispatchEvent(new Event('server-online'));
        })
        .catch(() => window.dispatchEvent(new Event('server-offline')));
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('server-offline', handleServerOffline);
      window.removeEventListener('server-online', handleServerOnline);
      clearTimeout(initialTimer);
    };
  }, []);

  // NOTE: Auto-reconnect polling has been removed here.
  // NetworkBanner handles reconnection via its own exponential-backoff retry loop.
  // Having a second polling loop here caused duplicate 'server-online' events
  // which resulted in duplicate toast notifications across the app.

  return {
    isOnline,
    serverOnline,
    isFullyOnline: isOnline && serverOnline

  };
}
