import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'

interface AIAnalysisPageProps {
  onNavigate?: (page: string) => void
}

interface AILog {
  id: string
  prompt_type: string
  input_data: string
  generated_content: string
  created_at: string
}

const RECOMMENDED_MODELS = [
  { id: 'exaone3.5:2.4b', name: 'EXAONE 3.5 (LG)', desc: '한국어 저사양 최적 (약 2GB)' },
  { id: 'gemma3:4b', name: 'Gemma 3 (4B)', desc: '속도와 품질 균형 (약 3GB)' },
  { id: 'eeve-korean:10.8b', name: 'EEVE Korean', desc: '한국어 문장 특화 (약 7GB)' },
]

export default function AIAnalysisPage({ onNavigate }: AIAnalysisPageProps = {}) {
  const [logs, setLogs] = useState<AILog[]>([])
  const [loading, setLoading] = useState(true)
  const [promptType, setPromptType] = useState('student_evaluation')
  const [selectedModel, setSelectedModel] = useState('auto')
  const [inputData, setInputData] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedDraft, setGeneratedDraft] = useState('')
  const [usedModel, setUsedModel] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  const uiUpdateRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const draftBufferRef = useRef('')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)

  const [aiStatus, setAiStatus] = useState<{
    running: boolean;
    installedModels: string[];
    checked: boolean
  }>({
    running: false,
    installedModels: [],
    checked: false
  })

  useEffect(() => {
    fetchLogs()
    checkAIStatus()
    return () => {
      if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startTimer = () => {
    setElapsedSecs(0)
    if (timerRef.current) clearInterval(timerRef.current)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - start) / 1000))
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const checkAIStatus = async () => {
    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/core/ai/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAiStatus({ running: !!data.ollama_running, installedModels: data.models || [], checked: true })
      }
    } catch (e) {
      setAiStatus(prev => ({ ...prev, checked: true }))
    }
  }

  const fetchLogs = async () => {
    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/plugins/aianalysis/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setLogs(data || [])
      }
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  const selectBestModel = () => {
    const fastPriority = ['exaone3.5:2.4b', 'gemma:2b', 'gemma3:4b', 'mistral', 'llama3', 'eeve']
    for (const p of fastPriority) {
      const found = aiStatus.installedModels.find(m => m.toLowerCase().includes(p))
      if (found) return found
    }
    return aiStatus.installedModels[0] || 'gemma3:4b'
  }

  const autoSaveToDB = async (finalContent: string) => {
    if (!finalContent.trim()) return
    try {
      const token = await getToken()
      await fetch('http://localhost:5200/api/plugins/aianalysis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt_type: promptType, input_data: inputData, generated_content: finalContent })
      })
      fetchLogs()
    } catch (e) { }
  }

  const handleCancel = () => {
    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.CancelAIGenerate) {
      wailsApp.CancelAIGenerate()
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setGenerating(false)
    stopTimer()
    if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
    toast.info('취소되었습니다.')
  }

  const handleGenerate = async () => {
    if (!inputData.trim()) return
    const model = selectedModel === 'auto' ? selectBestModel() : selectedModel
    setUsedModel(model)
    setGenerating(true)
    setGeneratedDraft('')
    setErrorDetail(null)
    draftBufferRef.current = ''
    startTimer()

    // Throttled UI update every 40ms
    uiUpdateRef.current = setInterval(() => {
      setGeneratedDraft(draftBufferRef.current)
    }, 40)

    const wailsApp = (window as any).go?.main?.App
    const systemPrompt = '당신은 학교 교사입니다. 입력된 키워드로 1-2문단의 전문적인 세특 초안을 작성하세요.'

    if (wailsApp?.GenerateAIStream) {
      // === Wails native path: Go calls Ollama directly (no CORS) ===
      const rt = (window as any).runtime
      if (rt) {
        rt.EventsOff('ai:chunk')
        rt.EventsOff('ai:done')
        rt.EventsOff('ai:error')
        rt.EventsOn('ai:chunk', (chunk: string) => {
          draftBufferRef.current += chunk
        })
        rt.EventsOn('ai:done', () => {
          if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
          stopTimer()
          setGeneratedDraft(draftBufferRef.current)
          setGenerating(false)
          autoSaveToDB(draftBufferRef.current)
        })
        rt.EventsOn('ai:error', (errMsg: string) => {
          if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
          stopTimer()
          setGenerating(false)
          setErrorDetail(errMsg)
          toast.error(errMsg)
        })
      }
      wailsApp.GenerateAIStream(model, systemPrompt, inputData)

    } else {
      // === Fallback: direct fetch (browser dev mode only) ===
      const controller = new AbortController()
      abortControllerRef.current = controller
      try {
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: inputData }
            ],
            stream: true,
            options: { num_ctx: 1024, num_predict: 512, temperature: 0.6, top_k: 20, top_p: 0.5 }
          })
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Reader failed')
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let boundary = buf.indexOf('\n')
          while (boundary !== -1) {
            const line = buf.substring(0, boundary).trim()
            buf = buf.substring(boundary + 1)
            if (line) {
              try { const j = JSON.parse(line); if (j.message?.content) draftBufferRef.current += j.message.content } catch { }
            }
            boundary = buf.indexOf('\n')
          }
        }
        if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
        stopTimer()
        setGeneratedDraft(draftBufferRef.current)
        setGenerating(false)
        autoSaveToDB(draftBufferRef.current)
      } catch (e: any) {
        if (e.name === 'AbortError') return
        if (uiUpdateRef.current) clearInterval(uiUpdateRef.current)
        stopTimer()
        setGenerating(false)
        const detail = e.message?.includes('Failed to fetch')
          ? `Ollama 서버(localhost:11434)에 연결할 수 없습니다. 설정에서 Ollama를 실행해주세요.`
          : `오류: ${e.message || '알 수 없는 오류'} (모델: ${model})`
        setErrorDetail(detail)
        toast.error(detail)
      } finally {
        abortControllerRef.current = null
      }
    }
  }

  const hasAnySupportedModel = () => {
    const supported = ['gemma', 'exaone', 'eeve', 'bllossom', 'llama', 'mistral', 'solar', 'phi']
    return aiStatus.installedModels.some(m => supported.some(s => m.toLowerCase().includes(s)))
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Ollama not running banner */}
      {!aiStatus.running && aiStatus.checked && (
        <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '16px 20px', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 16, color: '#9a3412' }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}><i className="fi fi-rr-exclamation" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Ollama가 실행되지 않고 있습니다</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>AI 문서 생성 기능을 사용하려면 아래 단계를 따라 Ollama를 준비해주세요.</div>
            <ol style={{ fontSize: 13, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.9 }}>
              <li>상단 메뉴 <strong>설정(⚙️)</strong> 페이지로 이동합니다.</li>
              <li><strong>로컬 AI 관리</strong> 섹션에서 Ollama 상태를 확인합니다.</li>
              <li>Ollama가 미설치된 경우: <strong>[자동 설정]</strong> 버튼 클릭 → Ollama 자동 설치 및 모델 다운로드</li>
              <li>Ollama는 설치되었지만 중지된 경우: <strong>[Ollama 시작]</strong> 버튼 클릭</li>
              <li>모델이 없는 경우: 추천 모델 목록에서 <strong>[설치]</strong> 버튼 클릭 (권장: EXAONE 3.5 또는 Gemma 3)</li>
            </ol>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <button onClick={() => onNavigate?.('settings')} style={{ background: '#9a3412', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <i className="fi fi-rr-settings" style={{ marginRight: 4 }} />설정으로 이동
            </button>
            <button onClick={checkAIStatus} style={{ background: 'white', color: '#9a3412', border: '1px solid #ffedd5', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>연결 재시도</button>
          </div>
        </div>
      )}

      {/* Error detail from generation */}
      {errorDetail && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '14px 18px', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12, color: '#be123c' }}>
          <i className="fi fi-rr-cross-circle" style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>생성 오류</div>
            <div style={{ fontSize: 13 }}>{errorDetail}</div>
          </div>
          <button onClick={() => setErrorDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#be123c', fontSize: 16, padding: 2 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>🌟 AI 작성 도우미</h3>
          <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>작성 유형</label>
                <select value={promptType} onChange={e => setPromptType(e.target.value)} disabled={generating} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <option value="student_evaluation">학생 세특·종특 (생활기록부)</option>
                  <option value="budget_plan">예산 품의서 초안</option>
                  <option value="general_document">일반 결재 공문</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>사용 모델</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={generating} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <option value="auto">자동 선택 (최적 속도)</option>
                  {aiStatus.installedModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>핵심 키워드 및 관찰 내용</label>
              <textarea rows={4} value={inputData} onChange={e => setInputData(e.target.value)} disabled={generating} placeholder="내용을 입력하세요..." style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            {!generating ? (
              <button onClick={handleGenerate} disabled={!inputData.trim() || !hasAnySupportedModel()} style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)', color: 'white', padding: '12px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                <i className="fi fi-rr-magic-wand" style={{ marginRight: 8 }} /> AI 초안 생성하기
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: '#f1f5f9', color: '#475569', padding: '12px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontWeight: 600, fontSize: 14 }}>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  실시간 생성 중...
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{elapsedSecs}s</span>
                </div>
                <button onClick={handleCancel} style={{ padding: '0 24px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>취소</button>
              </div>
            )}
          </div>

          {(generatedDraft || generating) && (
            <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>생성 결과</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>모델: <span style={{ fontWeight: 700 }}>{usedModel}</span></div>
                </div>
                <textarea rows={10} value={generatedDraft} onChange={e => setGeneratedDraft(e.target.value)} placeholder="생성 중..." style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', lineHeight: 1.6, background: generating ? '#fff' : 'transparent' }} />
              </div>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, textAlign: 'center' }}><i className="fi fi-rr-check-circle" style={{ marginRight: 4 }} /> 생성 완료 시 자동으로 저장됩니다.</div>
            </div>
          )}
        </div>

        <div style={{ width: 350, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>최근 생성 내역</h3>
          {loading ? <div>불러오는 중...</div> : logs.length === 0 ? <div style={{ padding: 20, background: 'var(--surface)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>기록된 내역이 없습니다.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              {logs.map(log => (
                <div key={log.id} style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{log.prompt_type} · {new Date(log.created_at).toLocaleDateString()}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{log.generated_content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
