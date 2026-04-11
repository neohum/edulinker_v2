import { useState, FormEvent, useEffect } from 'react'
import { toast } from 'sonner'
import { UserInfo } from '../App'
import logoUrl from '../assets/images/logo-universal.png'

interface LoginPageProps {
  onLogin: (user: UserInfo) => void
}

const formatPhoneNumber = (value: string) => {
  const nums = value.replace(/[^\d]/g, '')
  if (!nums) return ''
  if (nums.startsWith('02')) {
    if (nums.length <= 2) return nums
    if (nums.length <= 5) return `${nums.slice(0, 2)}-${nums.slice(2)}`
    if (nums.length <= 9) return `${nums.slice(0, 2)}-${nums.slice(2, 5)}-${nums.slice(5)}`
    return `${nums.slice(0, 2)}-${nums.slice(2, 6)}-${nums.slice(6, 10)}`
  }
  if (nums.length <= 3) return nums
  if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`
  return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7, 11)}`
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [isRegister, setIsRegister] = useState(false)

  // Shared
  const [serverIP, setServerIP] = useState(() => localStorage.getItem('serverIP') || '')
  const [serverStatus, setServerStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Register specific
  const [schoolCode, setSchoolCode] = useState('')
  const [selectedSchoolName, setSelectedSchoolName] = useState('')
  const [schoolSearchTerm, setSchoolSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const [name, setName] = useState('')
  const [role, setRole] = useState('teacher')
  const [grade, setGrade] = useState('')
  const [classNum, setClassNum] = useState('')
  const [taskName, setTaskName] = useState('')
  const [department, setDepartment] = useState('')
  const [classPhone, setClassPhone] = useState('')

  // Auto login & Remember me
  const [rememberMe, setRememberMe] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false)

  // Check connection status when serverIP changes (and poll in real-time)
  useEffect(() => {
    let ip = serverIP || 'localhost'
    ip = ip.split(':')[0].replace(/https?:\/\//, '')
    setServerStatus('checking')

    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.SetAPIBase) {
      wailsApp.SetAPIBase(`http://${ip}:5200`)
    }

    const checkConn = async () => {
      try {
        let isOnline = false
        if (wailsApp?.CheckConnection) {
          isOnline = await wailsApp.CheckConnection()
        } else {
          const res = await fetch(`http://${ip}:5200/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          })
          isOnline = res.ok
        }

        if (isOnline) {
          setServerStatus('connected')
          window.dispatchEvent(new Event('server-online'))
        } else {
          setServerStatus('error')
          window.dispatchEvent(new Event('server-offline'))
        }
      } catch (err) {
        setServerStatus('error')
        window.dispatchEvent(new Event('server-offline'))
      }
    }

    const timer = setTimeout(checkConn, 500)
    const interval = setInterval(checkConn, 5000) // 실시간 연결 상태 폴링

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [serverIP])

  useEffect(() => {
    const savedPhone = localStorage.getItem('loginPhone') || ''
    const savedPassword = localStorage.getItem('loginPassword') || ''
    const savedRemember = localStorage.getItem('rememberMe') === 'true'
    const savedAuto = localStorage.getItem('autoLogin') === 'true'
    let savedIP = localStorage.getItem('serverIP') || 'localhost'
    savedIP = savedIP.split(':')[0].replace(/https?:\/\//, '')

    // Apply saved IP to Go Backend immediately
    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.SetAPIBase) {
      wailsApp.SetAPIBase(`http://${savedIP}:5200`)
    }

    if (savedRemember) {
      setPhone(savedPhone)
      setPassword(savedPassword)
      setRememberMe(true)
    }

    if (savedAuto) {
      setAutoLogin(true)
      if (savedPhone && savedPassword) {
        setIsAutoLoggingIn(true)
        performLogin(savedPhone, savedPassword, true)
      }
    }
  }, [])

  const performLogin = async (p: string, pw: string, isAuto = false) => {

    setLoading(true)

    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.Login) {
        const result = await wailsApp.Login(p, pw)
        if (result.success) {
          const userProfile = {
            id: result.user_id,
            name: result.user_name,
            role: result.user_role,
            school: result.school_name,
            department: result.department,
            grade: result.grade,
            classNum: result.class_num,
            taskName: result.task_name,
            classPhone: result.class_phone,
            isOffline: result.is_offline
          }
          if (result.is_offline) {
            toast.warning('서버와의 연결이 필요해 일부 서비스는 사용할 수 없습니다.', { duration: 6000 })
          }
          onLogin(userProfile)
        } else {
          toast.error(result.error || '로그인에 실패했습니다')
          if (isAuto) setIsAutoLoggingIn(false)
        }
      } else {
        // Fallback: direct HTTP login for browser dev mode
        const resp = await fetch('http://localhost:5200/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: p, password: pw })
        })
        const data = await resp.json()
        if (resp.ok && data.token) {
          localStorage.setItem('token', data.token)
          const user = data.user || {}
          const school = user.school || {}
          const userProfile = {
            id: user.id || '',
            name: user.name || '교사',
            role: user.role || 'teacher',
            school: school.name || '',
            department: user.department,
            grade: user.grade,
            classNum: user.class_num,
            taskName: user.task_name,
            classPhone: user.class_phone
          }
          localStorage.setItem('offlineUserProfile', JSON.stringify(userProfile))
          localStorage.setItem('offlinePhone', p)
          localStorage.setItem('offlinePassword', pw)
          onLogin(userProfile)
        } else {
          toast.error(data.error || '로그인에 실패했습니다')
          if (isAuto) setIsAutoLoggingIn(false)
        }
      }
    } catch (err) {
      const cachedProfile = localStorage.getItem('offlineUserProfile')
      const cachedPhone = localStorage.getItem('offlinePhone')
      const cachedPassword = localStorage.getItem('offlinePassword')
      if (cachedProfile && p === cachedPhone && pw === cachedPassword) {
        toast.warning('서버와의 연결이 필요해 일부 서비스는 사용할 수 없습니다.', { duration: 6000 })
        const user = JSON.parse(cachedProfile)
        user.isOffline = true
        onLogin(user)
        return
      }
      toast.error('서버에 연결할 수 없습니다')
      if (isAuto) setIsAutoLoggingIn(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchSchool = async () => {
    if (!schoolSearchTerm) return
    setIsSearching(true)


    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.SearchSchool) {
        const results = await wailsApp.SearchSchool(schoolSearchTerm)
        setSearchResults(results || [])
        if (!results || results.length === 0) {
          toast.warning('검색된 학교가 없습니다')
        }
      }
    } catch (err) {
      toast.error('학교 검색 중 오류가 발생했습니다')
    } finally {
      setIsSearching(false)
    }
  }

  const selectSchool = (school: any) => {
    setSchoolCode(school.code)
    setSelectedSchoolName(school.name)
    setSearchResults([]) // clear results
    setSchoolSearchTerm('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    setLoading(true)

    try {
      const wailsApp = (window as any).go?.main?.App

      if (isRegister) {
        if (!schoolCode || !name || !phone || !password || !passwordConfirm || !role) {
          toast.warning('모든 항목을 입력해주세요 (학교 포함)')
          setLoading(false)
          return
        }

        if (password !== passwordConfirm) {
          toast.warning('비밀번호가 일치하지 않습니다')
          setLoading(false)
          return
        }

        if (wailsApp?.Register) {
          const result = await wailsApp.Register(
            schoolCode, selectedSchoolName, name, phone, password, role, classPhone,
            department, taskName, grade ? parseInt(grade) : 0, classNum ? parseInt(classNum) : 0
          )
          if (result.success) {
            // Token is stored in Go memory (per-instance), not localStorage
            onLogin({
              id: result.user_id,
              name: result.user_name,
              role: result.user_role,
              school: result.school_name,
              department: result.department,
              grade: result.grade,
              classNum: result.class_num,
              taskName: result.task_name,
              classPhone: result.class_phone
            })
          } else {
            toast.error(result.error || '회원가입에 실패했습니다')
          }
        } else {
          // Fallback: direct HTTP register for browser dev mode
          const resp = await fetch('http://localhost:5200/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              school_code: schoolCode, school_name: selectedSchoolName, name, phone, password, role,
              grade: grade ? parseInt(grade) : undefined,
              class_num: classNum ? parseInt(classNum) : undefined,
              task_name: taskName || undefined,
              department: department || undefined,
              class_phone: classPhone || undefined
            })
          })
          const data = await resp.json()
          if (resp.ok && data.token) {
            localStorage.setItem('token', data.token)
            const user = data.user || {}
            const school = user.school || {}
            onLogin({
              id: user.id || '',
              name: user.name || name,
              role: user.role || role,
              school: school.name || selectedSchoolName,
              department: user.department || department,
              grade: user.grade || (grade ? parseInt(grade) : undefined),
              classNum: user.class_num || (classNum ? parseInt(classNum) : undefined),
              taskName: user.task_name || taskName,
              classPhone: user.class_phone
            })
          } else {
            toast.error(data.error || '회원가입에 실패했습니다')
          }
        }
      } else {
        if (!phone || !password) {
          toast.warning('전화번호와 비밀번호를 입력해주세요')
          setLoading(false)
          return
        }

        if (rememberMe || autoLogin) {
          localStorage.setItem('loginPhone', phone)
          localStorage.setItem('loginPassword', password)
          localStorage.setItem('rememberMe', rememberMe.toString())
          localStorage.setItem('autoLogin', autoLogin.toString())
        } else {
          localStorage.removeItem('loginPhone')
          localStorage.removeItem('loginPassword')
          localStorage.setItem('rememberMe', 'false')
          localStorage.setItem('autoLogin', 'false')
        }

        await performLogin(phone, password)
      }
    } catch (err) {
      toast.error('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setIsRegister(!isRegister)

    setPhone('')
    setPassword('')
    setSchoolCode('')
    setSelectedSchoolName('')
    setSchoolSearchTerm('')
    setSearchResults([])
    setGrade('')
    setClassNum('')
    setTaskName('')
    setDepartment('')
    setClassPhone('')
  }

  return (
    <div className="login-container" style={{ padding: '2rem 0' }}>
      <div className="login-bg-glow blue" />
      <div className="login-bg-glow purple" />

      {isAutoLoggingIn ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'white' }}>
          <i className="fi fi-rr-spinner" style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1s linear infinite' }} />
          <h2>자동 로그인 중입니다...</h2>
        </div>
      ) : (
        <div className="login-card" style={{
          width: '100%',
          maxWidth: isRegister ? '680px' : '400px',
          maxHeight: isRegister ? '85vh' : 'none',
          overflowY: isRegister ? 'auto' : 'visible',
          overflowX: 'hidden'
        }}>
          <div className="login-logo">
            <img src={logoUrl} alt="edulinker logo" style={{ width: 60, height: 60, marginBottom: '1rem', filter: 'drop-shadow(0 4px 12px rgba(79, 70, 229, 0.3))' }} />
            <h1>edulinker</h1>
            <p>{isRegister ? '새로운 계정 만들기' : '플러그인 기반 학교 서비스 플랫폼'}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ color: '#4f46e5', fontWeight: 600, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between' }}>
                <span>서버 접속 주소 (IP)</span>
                {serverStatus === 'checking' && <span style={{ color: '#f59e0b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fi fi-rr-spinner animate-spin" style={{ display: 'inline-block' }} />확인 중...</span>}
                {serverStatus === 'connected' && <span style={{ color: '#10b981', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }} />연결됨</span>}
                {serverStatus === 'error' && <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444', boxShadow: '0 0 6px rgba(239, 68, 68, 0.4)' }} />연결 실패</span>}
              </label>
              <input
                className="form-input"
                type="text"
                placeholder="예: 192.168.0.10 (빈칸 시 localhost 기본값)"
                value={serverIP}
                onChange={(e) => {
                  setServerIP(e.target.value)
                  localStorage.setItem('serverIP', e.target.value)
                  let ip = e.target.value || 'localhost'
                  ip = ip.split(':')[0].replace(/https?:\/\//, '')
                  const wailsApp = (window as any).go?.main?.App
                  if (wailsApp?.SetAPIBase) {
                    wailsApp.SetAPIBase(`http://${ip}:5200`)
                  }
                }}
              />
            </div>

            {isRegister && (
              <>
                <div className="form-group">
                  <label className="form-label">소속 학교</label>
                  {schoolCode ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ flex: 1, padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{selectedSchoolName}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', borderLeft: '1px solid #334155', paddingLeft: '0.75rem' }}>학교 코드: {schoolCode}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSchoolCode(''); setSelectedSchoolName(''); }}
                        style={{ padding: '0.75rem', background: '#334155', border: 'none', borderRadius: '0.5rem', color: '#cbd5e1', cursor: 'pointer', alignSelf: 'stretch' }}
                      >
                        변경
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="예: 에듀링커초"
                          value={schoolSearchTerm}
                          onChange={(e) => setSchoolSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchSchool())}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={handleSearchSchool}
                          disabled={isSearching}
                          style={{ padding: '0 1rem', background: '#4f46e5', border: 'none', borderRadius: '0.5rem', color: 'white', cursor: 'pointer' }}
                        >
                          {isSearching ? '검색중' : '검색'}
                        </button>
                      </div>
                      {searchResults.length > 0 && (
                        <div style={{ marginTop: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                          {searchResults.map((school, i) => (
                            <div
                              key={i}
                              onClick={() => selectSchool(school)}
                              style={{ padding: '0.75rem', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{school.name}</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{school.region} | {school.address}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">이름</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="이름을 입력하세요"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">소속 (선택)</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="예: 1학년부, 과학과 등"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">담당 업무 (선택)</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="예: 정보부장, 스포츠클럽 등"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">담당 학년 (선택)</label>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="예: 3"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">담당 반 (선택)</label>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="예: 1"
                      value={classNum}
                      onChange={(e) => setClassNum(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">교실(내선) 전화번호 (선택)</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="예: 02-123-4567"
                      value={classPhone}
                      onChange={(e) => setClassPhone(formatPhoneNumber(e.target.value))}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">전화번호</label>
              <input
                className="form-input"
                type="tel"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                autoFocus={!isRegister}
              />
            </div>

            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input
                className="form-input"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isRegister && (
              <div className="form-group">
                <label className="form-label">비밀번호 확인</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="비밀번호를 다시 한번 입력하세요"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                />
              </div>
            )}

            {!isRegister && (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', marginBottom: '1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  아이디/비밀번호 기억
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLogin(e.target.checked)} />
                  자동 로그인
                </label>
              </div>
            )}



            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            >
              {loading ? (
                <>
                  <i className="fi fi-rr-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                  처리 중...
                </>
              ) : (isRegister ? '회원 가입' : '로그인')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
              <span style={{ color: '#94a3b8' }}>
                {isRegister ? '이미 계정이 있으신가요?' : '계정이 없으신가요?'}
              </span>
              <button
                type="button"
                onClick={switchMode}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  marginLeft: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {isRegister ? '로그인하기' : '회원 가입'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default LoginPage
