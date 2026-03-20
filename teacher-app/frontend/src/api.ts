const API_BASE = 'http://localhost:5200'

/**
 * Gets the JWT token from either localStorage or Wails Go backend.
 */
export async function getToken(): Promise<string> {
  // 1. Check localStorage first
  const stored = localStorage.getItem('token')
  if (stored) return stored

  // 2. Try getting from Wails Go backend
  try {
    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.GetToken) {
      const token = await wailsApp.GetToken()
      if (token) {
        localStorage.setItem('token', token)
        return token
      }
    }
  } catch { }

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

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
}
