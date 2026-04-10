import { useState, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { EventsOn } from '../wailsjs/runtime/runtime'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NetworkBanner from './components/NetworkBanner'
import { apiFetch, API_BASE } from './api'
import { GetAppVersion } from '../wailsjs/go/main/App'

// Returns true if `a` is strictly newer than `b` (both in "vX.Y.Z" or "X.Y.Z" format)
function semverIsNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj > bMaj
  if (aMin !== bMin) return aMin > bMin
  return aPat > bPat
}

// User info stored after login
export interface UserInfo {
  id: string
  name: string
  role: string
  school: string
  department?: string
  grade?: number
  classNum?: number
  taskName?: string
  classPhone?: string
  profileImage?: string // Base64 or URL
  isOffline?: boolean
}

function App() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [hasNotifiedUpdate, setHasNotifiedUpdate] = useState(false)

  // Auto-update notification
  useEffect(() => {
    // Listen for GitHub update events
    const off = EventsOn('update:available', (info: { version: string; url: string; download_url?: string }) => {
      toast.info(`새 버전 ${info.version} 이 출시되었습니다.`, {
        duration: Infinity,
        action: {
          label: '지금 다운로드',
          onClick: () => {
            if (info.download_url) {
              // Direct download using browser
              const a = document.createElement('a')
              a.href = info.download_url
              a.download = '' // Let browser decide filename from URL
              a.target = '_blank'
              a.click()
              toast.success('다운로드를 시작합니다. 완료 후 실행하여 설치를 마무리해주세요.')
            } else {
              // Fallback to GitHub page
              try { (window as any).go?.main?.App?.OpenExternalURL(info.url) } catch { }
            }
          },
        },
      })
    })

    // Check for server-synced updates (when server dashboard updates itself)
    const checkServerVersion = async () => {
      if (hasNotifiedUpdate) return; // Skip if already shown

      try {
        const [myVer, res] = await Promise.all([
          GetAppVersion(),
          apiFetch('/api/versions')
        ])

        if (res.ok) {
          const data = await res.json()
          const serverVer = data['teacher-app']?.version
          
          // Only notify when the server recommends a NEWER version than what is installed.
          // If the installed app is already newer (e.g. user updated manually before the
          // server-dashboard was redeployed), suppress the alert to avoid confusing messages.
          if (serverVer && myVer && semverIsNewer(serverVer, myVer)) {
            setHasNotifiedUpdate(true)
            toast.warning(`새 버전 ${serverVer} 으로 업데이트가 필요합니다.`, {
              id: 'server-update-toast',
              duration: Infinity,
              closeButton: true,
              description: '서버와 버전이 다를 경우 기능이 제한될 수 있습니다.'
            })
          }
        }
      } catch (e) {
        console.log('[VersionCheck] Failed to check server version', e)
      }
    }

    // Check version 5 seconds after startup and when server comes online
    const timer = setTimeout(checkServerVersion, 5000)
    window.addEventListener('server-online', checkServerVersion)

    return () => {
      try { (off as any)?.() } catch { }
      clearTimeout(timer)
      window.removeEventListener('server-online', checkServerVersion)
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setUser(prev => {
        if (prev && prev.isOffline) {
          return { ...prev, isOffline: false }
        }
        return prev
      })
    }
    const handleOffline = () => {
      setUser(prev => {
        if (prev && !prev.isOffline) {
          return { ...prev, isOffline: true }
        }
        return prev
      })
    }

    window.addEventListener('server-online', handleOnline)
    window.addEventListener('server-offline', handleOffline)

    return () => {
      window.removeEventListener('server-online', handleOnline)
      window.removeEventListener('server-offline', handleOffline)
    }
  }, [])

  const handleLogin = (userInfo: UserInfo) => {
    setUser(userInfo)
  }

  const handleLogout = () => {
    // Call Wails Logout if available
    try {
      (window as any).go?.main?.App?.Logout()
    } catch { }
    // Clear token and disable auto login on manual logout
    localStorage.removeItem('token')
    localStorage.setItem('autoLogin', 'false')
    setUser(null)
  }

  const handleUpdateUser = (updates: Partial<UserInfo>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev)
  }

  if (!user) {
    return <><NetworkBanner /><Toaster richColors position="top-center" /><LoginPage onLogin={handleLogin} /></>
  }

  return <><NetworkBanner /><Toaster richColors position="top-center" /><DashboardPage user={user} onLogout={handleLogout} onUpdateUser={handleUpdateUser} /></>
}

export default App
