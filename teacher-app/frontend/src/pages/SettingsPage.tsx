import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'
import type { UserInfo } from '../App'

interface OllamaStatus {
  installed: boolean
  running: boolean
  path?: string
  error?: string
}

interface ModelInfo {
  name: string
  size?: number
  modified_at?: string
}

interface AIBenchmark {
  cpu_name: string
  cpu_cores: number
  cpu_threads: number
  ram_total_gb: number
  ram_free_gb: number
  gpu_name: string
  gpu_memory_mb: number
  disk_free_gb: number
  cpu_score: number
  ram_score: number
  gpu_score: number
  disk_score: number
  grade: number
  grade_label: string
  grade_desc: string
  recomm_model: string
}

const RECOMMENDED_MODELS = [
  { name: 'gemma3:4b', desc: 'Google Gemma 3 (4B) — 가볍고 빠름, 기본 권장', size: '~3 GB' },
  { name: 'exaone3.5:2.4b', desc: 'LG EXAONE 3.5 — 한국어 성능 매우 우수, 저사양 권장', size: '~2 GB' },
  { name: 'eeve-korean:10.8b', desc: 'EEVE Korean — 자연스러운 한국어 문장 특화', size: '~7 GB' },
  { name: 'bllossom:8b', desc: 'Llama-3-Bllossom — 한국어 특화 파인튜닝', size: '~5 GB' },
  { name: 'gemma3:12b', desc: 'Google Gemma 3 (12B) — 더 정확한 분석, GPU 권장', size: '~8 GB' },
]

interface SettingsPageProps {
  user?: UserInfo
  onNavigate?: (page: string) => void
}

export default function SettingsPage({ user, onNavigate }: SettingsPageProps) {
  // Ollama states
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [starting, setStarting] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)

  // Benchmark
  const [benchmark, setBenchmark] = useState<AIBenchmark | null>(null)
  const [benchLoading, setBenchLoading] = useState(false)

  useEffect(() => {
    checkOllamaStatus()
    runBenchmark()
  }, [])

  const runBenchmark = async () => {
    setBenchLoading(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.GetAIBenchmark) {
        const result = await wailsApp.GetAIBenchmark()
        setBenchmark(result)
      }
    } catch (e) {
      console.error('[Settings] Benchmark error:', e)
    } finally {
      setBenchLoading(false)
    }
  }

  const gradeColors: Record<number, string> = {
    1: '#22c55e', // 최상 — green
    2: '#3b82f6', // 우수 — blue
    3: '#6366f1', // 양호 — indigo
    4: '#f59e0b', // 보통 — amber
    5: '#f97316', // 부족 — orange
    6: '#ef4444', // 부적합 — red
  }

  const gradeEmoji: Record<number, string> = {
    1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D', 6: 'F'
  }

  // --- Ollama / Local AI ---
  const checkOllamaStatus = async () => {
    setOllamaLoading(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.CheckOllama) {
        const status = await wailsApp.CheckOllama()
        setOllamaStatus(status)
        if (status.running) {
          await fetchModels()
        }
      } else {
        // Fallback: check via backend API
        const token = await getToken()
        const res = await fetch('http://localhost:5200/api/core/ai/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setOllamaStatus({ installed: true, running: data.ollama_running })
          if (data.models) {
            setModels(data.models.map((name: string) => ({ name })))
          }
        }
      }
    } catch (e) {
      console.error('[Settings] Ollama check error:', e)
      setOllamaStatus({ installed: false, running: false })
    } finally {
      setOllamaLoading(false)
    }
  }

  const fetchModels = async () => {
    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/core/ai/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.models) {
          setModels(data.models.map((m: any) => ({
            name: m.name,
            size: m.size,
            modified_at: m.modified_at,
          })))
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleInstallOllama = async () => {
    setInstalling(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.InstallOllama) {
        toast.info('Ollama 설치 중... 잠시 기다려주세요.')
        const result = await wailsApp.InstallOllama()
        if (result.installed) {
          toast.success('Ollama가 설치되었습니다!')
          setOllamaStatus(result)
        } else {
          toast.error(result.error || 'Ollama 설치에 실패했습니다.')
        }
      }
    } catch (e) {
      toast.error('Ollama 설치 중 오류가 발생했습니다.')
    } finally {
      setInstalling(false)
    }
  }

  const handleStartOllama = async () => {
    setStarting(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.StartOllama) {
        toast.info('Ollama 시작 중...')
        const result = await wailsApp.StartOllama()
        setOllamaStatus(result)
        if (result.running) {
          toast.success('Ollama가 시작되었습니다!')
          await fetchModels()
        } else {
          toast.error(result.error || 'Ollama 시작에 실패했습니다.')
        }
      }
    } catch (e) {
      toast.error('Ollama 시작 중 오류가 발생했습니다.')
    } finally {
      setStarting(false)
    }
  }

  const handleStopOllama = async () => {
    setStopping(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.StopOllama) {
        toast.info('Ollama 중지 중...')
        const result = await wailsApp.StopOllama()
        setOllamaStatus(result)
        if (!result.running) {
          toast.success('Ollama가 중지되었습니다.')
          setModels([])
        } else {
          toast.error(result.error || 'Ollama 중지에 실패했습니다.')
        }
      }
    } catch (e) {
      toast.error('Ollama 중지 중 오류가 발생했습니다.')
    } finally {
      setStopping(false)
    }
  }

  const handlePullModel = async (modelName: string) => {
    setPulling(modelName)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.PullModel) {
        toast.info(`${modelName} 모델 다운로드 중... 용량에 따라 수 분이 소요될 수 있습니다.`)
        const result = await wailsApp.PullModel(modelName)
        if (result.success) {
          toast.success(`${modelName} 모델이 설치되었습니다!`)
          await fetchModels()
        } else {
          toast.error(result.error || '모델 다운로드에 실패했습니다.')
        }
      }
    } catch (e) {
      toast.error('모델 다운로드 중 오류가 발생했습니다.')
    } finally {
      setPulling(null)
    }
  }

  const handleDeleteModel = async (modelName: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/core/ai/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success(`${modelName} 모델이 삭제되었습니다.`)
        await fetchModels()
      } else {
        toast.error('모델 삭제에 실패했습니다.')
      }
    } catch {
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleAutoSetup = async () => {
    // Step 1: Install Ollama if not installed
    if (!ollamaStatus?.installed) {
      setInstalling(true)
      toast.info('1단계: Ollama 설치 중...')
      try {
        const wailsApp = (window as any).go?.main?.App
        const installResult = await wailsApp.InstallOllama()
        if (!installResult.installed) {
          toast.error(installResult.error || 'Ollama 설치 실패')
          setInstalling(false)
          return
        }
        setOllamaStatus(installResult)
        toast.success('Ollama 설치 완료!')
      } catch {
        toast.error('Ollama 설치 중 오류')
        setInstalling(false)
        return
      }
      setInstalling(false)
    }

    // Step 2: Start Ollama if not running
    if (!ollamaStatus?.running) {
      setStarting(true)
      toast.info('2단계: Ollama 시작 중...')
      try {
        const wailsApp = (window as any).go?.main?.App
        const startResult = await wailsApp.StartOllama()
        setOllamaStatus(startResult)
        if (!startResult.running) {
          toast.error(startResult.error || 'Ollama 시작 실패')
          setStarting(false)
          return
        }
        toast.success('Ollama 시작 완료!')
      } catch {
        toast.error('Ollama 시작 중 오류')
        setStarting(false)
        return
      }
      setStarting(false)
    }

    // Step 3: Pull gemma3 model if not installed
    if (!isModelInstalled('gemma3:4b')) {
      await handlePullModel('gemma3:4b')
    } else {
      toast.info('gemma 모델이 이미 설치되어 있습니다.')
    }

    await checkOllamaStatus()
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const isModelInstalled = (modelName: string) => {
    const baseName = modelName.split(':')[0].toLowerCase()
    return models.some(m => {
      const installedName = m.name.toLowerCase()
      return installedName.includes(baseName) || installedName.includes(modelName.toLowerCase())
    })
  }

  const hasModel = models.length > 0

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* === User Info & Password Change === */}
      {user && (
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
            <i className="fi fi-rr-user" style={{ marginRight: 8 }} />사용자 정보 및 비밀번호 변경
          </h3>
          <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: 40, background: 'linear-gradient(135deg, var(--accent-blue), #6366f1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)' }}>
                {user.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{user.name} 선생님</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {user.school} {user.department && `· ${user.department}`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn-secondary" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 140 }} onClick={() => onNavigate && onNavigate('profile')}>
                  <i className="fi fi-rr-edit" /> 프로필 정보 변경
                </button>
                <button className="btn-secondary" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 140 }} onClick={() => onNavigate && onNavigate('profile')}>
                  <i className="fi fi-rr-lock" /> 비밀번호 변경
                </button>
                <button className="btn-secondary" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 140 }} onClick={() => onNavigate && onNavigate('profile')}>
                  <i className="fi fi-rr-picture" /> 프로필 사진 변경
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === AI Performance Benchmark === */}
      <div>
        <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
          <i className="fi fi-rr-dashboard" style={{ marginRight: 8 }} />AI 성능 진단
        </h3>

        <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          {benchLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>시스템 성능 분석 중...</div>
          ) : benchmark ? (
            <>
              {/* Grade Display */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 20,
                  background: `${gradeColors[benchmark.grade]}15`,
                  border: `3px solid ${gradeColors[benchmark.grade]}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', flexShrink: 0
                }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: gradeColors[benchmark.grade], lineHeight: 1 }}>
                    {gradeEmoji[benchmark.grade]}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: gradeColors[benchmark.grade] }}>
                    {benchmark.grade_label}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                    AI 적합도: {benchmark.grade_label} ({benchmark.grade}등급)
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {benchmark.grade_desc}
                  </div>
                  {benchmark.recomm_model && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      추천 모델: <strong style={{ color: gradeColors[benchmark.grade] }}>{benchmark.recomm_model}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Score Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'CPU', score: benchmark.cpu_score, detail: `${benchmark.cpu_name} (${benchmark.cpu_threads}스레드)`, icon: 'fi-rr-microchip' },
                  { label: 'RAM', score: benchmark.ram_score, detail: `${benchmark.ram_total_gb.toFixed(1)} GB (여유 ${benchmark.ram_free_gb.toFixed(1)} GB)`, icon: 'fi-rr-memory' },
                  { label: 'GPU', score: benchmark.gpu_score, detail: `${benchmark.gpu_name}${benchmark.gpu_memory_mb > 0 ? ` (${(benchmark.gpu_memory_mb / 1024).toFixed(1)} GB)` : ''}`, icon: 'fi-rr-graphic-style' },
                  { label: '디스크', score: benchmark.disk_score, detail: `여유 공간 ${benchmark.disk_free_gb.toFixed(0)} GB`, icon: 'fi-rr-disk' },
                ].map(item => {
                  const barColor = item.score >= 70 ? '#22c55e' : item.score >= 40 ? '#f59e0b' : '#ef4444'
                  return (
                    <div key={item.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className={`fi ${item.icon}`} style={{ fontSize: 14, color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.detail}</span>
                      </div>
                      <div style={{ height: 10, background: 'var(--bg-tertiary)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${item.score}%`, background: barColor,
                          borderRadius: 5, transition: 'width 0.5s ease'
                        }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.score}/100
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Grade Legend */}
              <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>등급 기준</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { g: 1, l: 'S 최상', d: '12B+ 모델' },
                    { g: 2, l: 'A 우수', d: '4B~8B 모델' },
                    { g: 3, l: 'B 양호', d: '4B 이하' },
                    { g: 4, l: 'C 보통', d: '3B 이하' },
                    { g: 5, l: 'D 부족', d: '1B 이하' },
                    { g: 6, l: 'F 부적합', d: '실행 불가' },
                  ].map(({ g, l, d }) => (
                    <div key={g} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                      borderRadius: 6, fontSize: 11,
                      background: benchmark.grade === g ? `${gradeColors[g]}15` : 'transparent',
                      border: benchmark.grade === g ? `1px solid ${gradeColors[g]}40` : '1px solid transparent',
                      fontWeight: benchmark.grade === g ? 700 : 400,
                      color: benchmark.grade === g ? gradeColors[g] : 'var(--text-muted)'
                    }}>
                      <span style={{ fontWeight: 700 }}>{l}</span>
                      <span style={{ opacity: 0.7 }}>· {d}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={runBenchmark} style={{
                marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'white', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)'
              }}>
                <i className="fi fi-rr-refresh" style={{ marginRight: 4 }} />다시 측정
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              성능 진단을 사용할 수 없습니다. (Wails 환경에서만 지원)
            </div>
          )}
        </div>
      </div>

      {/* === Local AI Section === */}
      <div>
        <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
          <i className="fi fi-rr-brain" style={{ marginRight: 8 }} />로컬 AI 관리
        </h3>

        <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>

          {/* Status */}
          {ollamaLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>상태 확인 중...</div>
          ) : (
            <>
              {/* Status Indicators */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <div style={{
                  flex: 1, padding: 16, borderRadius: 12,
                  background: ollamaStatus?.installed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${ollamaStatus?.installed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Ollama</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ollamaStatus?.installed ? '#22c55e' : '#ef4444' }}>
                    {ollamaStatus?.installed ? '설치됨' : '미설치'}
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12,
                  background: ollamaStatus?.running ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${ollamaStatus?.running ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>서버 상태</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: ollamaStatus?.running ? '#22c55e' : '#ef4444' }}>
                      {ollamaStatus?.running ? '실행 중' : '중지됨'}
                    </div>
                    {ollamaStatus?.installed && (
                      ollamaStatus?.running ? (
                        <button
                          onClick={handleStopOllama}
                          disabled={stopping}
                          style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer' }}
                        >
                          {stopping ? '중지 중...' : '■ 중지'}
                        </button>
                      ) : (
                        <button
                          onClick={handleStartOllama}
                          disabled={starting}
                          style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#22c55e', cursor: 'pointer' }}
                        >
                          {starting ? '시작 중...' : '▶ 시작'}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: 16, borderRadius: 12,
                  background: hasModel ? 'rgba(34,197,94,0.06)' : 'rgba(251,191,36,0.06)',
                  border: `1px solid ${hasModel ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)'}`
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>AI 모델</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: hasModel ? '#22c55e' : '#f59e0b' }}>
                    {hasModel ? `${models.length}개 설치됨` : '미설치'}
                  </div>
                </div>
              </div>

              {/* Auto Setup Button */}
              {(!ollamaStatus?.installed || !ollamaStatus?.running || !hasModel) && (
                <button
                  onClick={handleAutoSetup}
                  disabled={installing || starting || !!pulling}
                  style={{
                    width: '100%', padding: 16, borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                    marginBottom: 24, opacity: (installing || starting || pulling) ? 0.7 : 1,
                    transition: 'all 150ms'
                  }}
                >
                  <i className="fi fi-rr-magic-wand" style={{ marginRight: 8 }} />
                  {installing ? 'Ollama 설치 중...' :
                    starting ? 'Ollama 시작 중...' :
                      pulling ? `${pulling} 다운로드 중...` :
                        '자동 설정 (Ollama 설치 + Gemma 모델 다운로드)'}
                </button>
              )}

              {/* Manual Controls */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {!ollamaStatus?.installed && (
                  <button onClick={handleInstallOllama} disabled={installing}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {installing ? '설치 중...' : 'Ollama 설치'}
                  </button>
                )}
                {ollamaStatus?.installed && !ollamaStatus?.running && (
                  <button onClick={handleStartOllama} disabled={starting}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {starting ? '시작 중...' : 'Ollama 시작'}
                  </button>
                )}
                {ollamaStatus?.installed && ollamaStatus?.running && (
                  <button onClick={handleStopOllama} disabled={stopping}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {stopping ? '중지 중...' : 'Ollama 중지'}
                  </button>
                )}
                <button onClick={checkOllamaStatus}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 13 }}>
                  <i className="fi fi-rr-refresh" /> 새로고침
                </button>
              </div>

              {/* Installed Models */}
              {ollamaStatus?.running && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                      <i className="fi fi-rr-cube" style={{ marginRight: 6 }} />설치된 모델
                    </h4>
                    {models.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-primary)', borderRadius: 8 }}>
                        설치된 모델이 없습니다. 아래에서 모델을 설치해주세요.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {models.map(m => (
                          <div key={m.name} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-primary)'
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 8,
                              background: m.name.startsWith('gemma') ? 'rgba(99,102,241,0.1)' : 'rgba(59,130,246,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <i className="fi fi-rr-brain" style={{ color: m.name.startsWith('gemma') ? '#6366f1' : 'var(--accent-blue)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                              {m.size && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatSize(m.size)}</div>}
                            </div>
                            {m.name.startsWith('gemma') && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>기본 모델</span>
                            )}
                            <button
                              onClick={() => handleDeleteModel(m.name)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: 4 }}
                              onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                              title="모델 삭제"
                            >
                              <i className="fi fi-rr-trash" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recommended Models */}
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                      <i className="fi fi-rr-download" style={{ marginRight: 6 }} />추천 모델 설치
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {RECOMMENDED_MODELS.map(rm => {
                        const installed = isModelInstalled(rm.name)
                        const isPulling = pulling === rm.name
                        return (
                          <div key={rm.name} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                            borderRadius: 10, border: '1px solid var(--border)',
                            background: installed ? 'rgba(34,197,94,0.04)' : 'white'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{rm.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rm.desc}</div>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{rm.size}</span>
                            {installed ? (
                              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, flexShrink: 0 }}>설치됨</span>
                            ) : (
                              <button
                                onClick={() => handlePullModel(rm.name)}
                                disabled={!!pulling}
                                style={{
                                  padding: '6px 14px', borderRadius: 8, border: 'none',
                                  background: isPulling ? 'var(--text-muted)' : '#6366f1', color: 'white',
                                  fontWeight: 600, fontSize: 12, cursor: isPulling ? 'default' : 'pointer', flexShrink: 0
                                }}
                              >
                                {isPulling ? '다운로드 중...' : '설치'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* All Ready Message */}
              {ollamaStatus?.installed && ollamaStatus?.running && hasModel && (
                <div style={{
                  marginTop: 16, padding: 16, borderRadius: 12,
                  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>
                    <i className="fi fi-rr-check-circle" style={{ marginRight: 6 }} />로컬 AI 준비 완료
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    AI 문서 생성, 문서 자동완성 등 AI 기능을 사용할 수 있습니다.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}
