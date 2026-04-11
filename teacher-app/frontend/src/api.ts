export let API_BASE = 'http://127.0.0.1:5200'

// Initialize API_BASE from Go backend if available
const wailsApp = (window as any).go?.main?.App
if (wailsApp?.GetAPIBase) {
  wailsApp.GetAPIBase().then((base: string) => {
    if (base) API_BASE = base
  })
}

// Listen for API base changes from Go backend
const wailsRuntime = (window as any).runtime
if (wailsRuntime?.EventsOn) {
  wailsRuntime.EventsOn('api-base-changed', (newBase: string) => {
    if (newBase) API_BASE = newBase
  })
}

let isServerOnline = true;

// Keep isServerOnline in sync with external server-online events
// (e.g. from NetworkBanner retry), so apiFetch doesn't fire a second server-online
window.addEventListener('server-online', () => { isServerOnline = true; });
window.addEventListener('server-offline', () => { isServerOnline = false; });

/**
 * Gets the JWT token from Wails Go backend (per-instance) or localStorage (browser dev).
 * Wails token takes priority to prevent cross-instance token sharing via localStorage.
 */
/**
 * Gets the JWT token from Wails Go backend (per-instance) or localStorage (browser dev).
 * Wails token takes priority to prevent cross-instance token sharing via localStorage.
 */
export async function getToken(): Promise<string> {
  // 1. Try getting from Wails Go backend first (per-instance, no sharing)
  const wailsApp = (window as any).go?.main?.App
  try {
    if (wailsApp?.GetToken) {
      const token = await wailsApp.GetToken()
      if (token) return token
    }
  } catch { }

  // 2. Fallback to localStorage
  const stored = localStorage.getItem('token')
  if (stored) {
    // If backend lost its token (e.g. wails dev hot-reload), push the localStorage token back to it
    try {
      if (wailsApp?.SetToken) wailsApp.SetToken(stored)
    } catch { }
    return stored
  }

  return ''
}

/**
 * Authenticated fetch wrapper that automatically attaches the JWT token.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    // Dispatch server-online ONLY if the server was previously offline
    if (!isServerOnline) {
      isServerOnline = true;
      window.dispatchEvent(new Event('server-online'));
    }
    return response;
  } catch (error) {
    // Dispatch server-offline ONLY if the server was previously online
    if (isServerOnline) {
      isServerOnline = false;
      window.dispatchEvent(new Event('server-offline'));
    }
    throw error;
  }
}

