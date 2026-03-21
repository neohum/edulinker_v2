import { useState, FormEvent, useEffect } from 'react'
import { UserInfo } from '../App'

interface LoginPageProps {
  onLogin: (user: UserInfo) => void
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [isRegister, setIsRegister] = useState(false)

  // Shared
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
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

  useEffect(() => {
    const savedPhone = localStorage.getItem('loginPhone') || ''
    const savedPassword = localStorage.getItem('loginPassword') || ''
    const savedRemember = localStorage.getItem('rememberMe') === 'true'
    const savedAuto = localStorage.getItem('autoLogin') === 'true'

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
    setError('')
    setLoading(true)

    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.Login) {
        const result = await wailsApp.Login(p, pw)
        if (result.success) {
          // Token is stored in Go memory (per-instance), not localStorage
          // This prevents cross-instance token sharing when running multiple Wails apps
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
          setError(result.error || '로그인에 실패했습니다')
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
          onLogin({
            id: user.id || '',
            name: user.name || '교사',
            role: user.role || 'teacher',
            school: school.name || '',
            department: user.department,
            grade: user.grade,
            classNum: user.class_num,
            taskName: user.task_name,
            classPhone: user.class_phone
          })
        } else {
          setError(data.error || '로그인에 실패했습니다')
          if (isAuto) setIsAutoLoggingIn(false)
        }
      }
    } catch (err) {
      setError('서버에 연결할 수 없습니다')
      if (isAuto) setIsAutoLoggingIn(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchSchool = async () => {
    if (!schoolSearchTerm) return
    setIsSearching(true)
    setError('')

    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.SearchSchool) {
        const results = await wailsApp.SearchSchool(schoolSearchTerm)
        setSearchResults(results || [])
        if (!results || results.length === 0) {
          setError('검색된 학교가 없습니다')
        }
      }
    } catch (err) {
      setError('학교 검색 중 오류가 발생했습니다')
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
    setError('')
    setLoading(true)

    try {
      const wailsApp = (window as any).go?.main?.App

      if (isRegister) {
        if (!schoolCode || !name || !phone || !password || !role) {
          setError('모든 항목을 입력해주세요 (학교 포함)')
          setLoading(false)
          return
        }

        if (wailsApp?.Register) {
          const result = await wailsApp.Register(schoolCode, selectedSchoolName, name, phone, password, role, classPhone)
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
            setError(result.error || '회원가입에 실패했습니다')
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
            setError(data.error || '회원가입에 실패했습니다')
          }
        }
      } else {
        if (!phone || !password) {
          setError('전화번호와 비밀번호를 입력해주세요')
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
      setError('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setIsRegister(!isRegister)
    setError('')
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
            <div className="login-logo-icon">E</div>
            <h1>edulinker</h1>
            <p>{isRegister ? '새로운 계정 만들기' : '플러그인 기반 학교 서비스 플랫폼'}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div className="form-group">
                  <label className="form-label">소속 학교</label>
                  {schoolCode ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ flex: 1, padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{selectedSchoolName}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem' }}>학교 코드: {schoolCode}</span>
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
                      onChange={(e) => setClassPhone(e.target.value)}
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
                onChange={(e) => setPhone(e.target.value)}
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

            {error && <div className="login-error">{error}</div>}

            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? '처리 중...' : (isRegister ? '회원 가입' : '로그인')}
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
