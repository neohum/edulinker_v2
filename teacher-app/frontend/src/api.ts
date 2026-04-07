export const API_BASE = 'http://localhost:5200'

let isServerOnline = true;

/**
 * Gets the JWT token from Wails Go backend (per-instance) or localStorage (browser dev).
 * Wails token takes priority to prevent cross-instance token sharing via localStorage.
 */
export async function getToken(): Promise<string> {
  // 1. Try getting from Wails Go backend first (per-instance, no sharing)
  try {
    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.GetToken) {
      const token = await wailsApp.GetToken()
      if (token) return token
    }
  } catch { }

  // 2. Fallback to localStorage (browser dev mode only)
  const stored = localStorage.getItem('token')
  if (stored) return stored

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

