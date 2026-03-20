import { useState } from 'react'
import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

// User info stored after login
export interface UserInfo {
  name: string
  role: string
  school: string
}

function App() {
  const [user, setUser] = useState<UserInfo | null>(null)

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

  if (!user) {
    return <><Toaster richColors position="top-center" /><LoginPage onLogin={handleLogin} /></>
  }

  return <><Toaster richColors position="top-center" /><DashboardPage user={user} onLogout={handleLogout} /></>
}

export default App
