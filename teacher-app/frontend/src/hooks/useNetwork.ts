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

    // Initial check on mount
    fetch(`${API_BASE}/health`)
      .then(res => {
        if (!res.ok) window.dispatchEvent(new Event('server-offline'));
      })
      .catch(() => window.dispatchEvent(new Event('server-offline')));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('server-offline', handleServerOffline);
      window.removeEventListener('server-online', handleServerOnline);
    };
  }, []);

  // Auto-reconnect polling when server is offline
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!serverOnline && isOnline) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/health`);
          if (res.ok) {
            window.dispatchEvent(new Event('server-online'));
          }
        } catch {
          // Still offline, waiting for next ping
        }
      }, 3000); // Ping every 3 seconds
    }
    return () => clearInterval(interval);
  }, [serverOnline, isOnline]);

  return {
    isOnline,
    serverOnline,
    isFullyOnline: isOnline && serverOnline

  };
}
