import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NetworkBanner from './components/NetworkBanner'

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
