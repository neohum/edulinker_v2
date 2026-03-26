import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch } from '../api'
import type { UserInfo } from '../App'

interface AIAnalysisPageProps {
  onNavigate?: (page: string) => void
  user?: UserInfo
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

export default function AIAnalysisPage({ onNavigate, user }: AIAnalysisPageProps = {}) {
  const [logs, setLogs] = useState<AILog[]>([])
  const [loading, setLoading] = useState(true)
  const [promptType, setPromptType] = useState('general')
  const [isFetchingData, setIsFetchingData] = useState(false)
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
    const fastPriority = ['exaone3.5:2.4b', 'gemma3:4b', 'llama3.2:1b', 'llama3.2:3b', 'gemma2:2b', 'qwen2.5:3b', 'mistral', 'eeve-korean:10.8b']
    for (const p of fastPriority) {
      const found = aiStatus.installedModels.find(m => m.toLowerCase().includes(p))
      if (found && !found.toLowerCase().includes('70b') && !found.toLowerCase().includes('32b')) {
        return found
      }
    }
    // Final safe fallback
    const safeModel = aiStatus.installedModels.find(m => !m.toLowerCase().includes('70b') && !m.toLowerCase().includes('32b'))
    return safeModel || aiStatus.installedModels[0] || 'gemma3:4b'
  }

  const handleFetchStudentData = async () => {
    setIsFetchingData(true)
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (user?.grade) url += `&grade=${user.grade}`
      if (user?.classNum) url += `&class_num=${user.classNum}`

      const res = await apiFetch(url)
      if (!res.ok) throw new Error('학생 목록을 불러올 수 없습니다.')
      const data = await res.json()

      const list = (data.users || [])
        .filter((s: any) => (!user?.grade || s.grade === user.grade) && (!user?.classNum || s.class_num === user.classNum))
        .sort((a: any, b: any) => a.number - b.number)

      if (list.length === 0) {
        toast.error('등록된 학생이 없습니다. 학생 관리에 학생을 먼저 등록해주세요.')
        setIsFetchingData(false)
        return
      }

      toast.info(`총 ${list.length}명 학생의 데이터 수집을 시작합니다... (잠시만 기다려주세요)`)

      const studentContexts = await Promise.all(list.map(async (student: any) => {
        const cRes = await apiFetch(`/api/plugins/studentmgmt/counseling?student_id=${student.id}`)
        let cLogs = []
        if (cRes.ok) cLogs = await cRes.json()

        const eRes = await apiFetch(`/api/plugins/studentmgmt/evaluation?student_id=${student.id}`)
        let eLogs = []
        if (eRes.ok) eLogs = await eRes.json()

        let context = `[${student.number}번 ${student.name} 학생]\n`
        context += `- 상담 기록: ` + (!cLogs || cLogs.length === 0 ? '없음' : cLogs.map((c: any) => `${c.date} [${c.category}] 내용: ${c.content} / 결과: ${c.result || '-'}`).join(' | ')) + '\n'
        context += `- 수행평가 기록: ` + (!eLogs || eLogs.length === 0 ? '없음' : eLogs.map((e: any) => `${e.subject} ${e.title} (${e.score}/${e.max_score}) ${e.memo ? '- ' + e.memo : ''}`).join(' | ')) + '\n'

        return context
      }))

      const combinedData = studentContexts.join('\n')
      const systemPromptPrefix = `다음은 우리 반 전체 학생들의 상담 기록과 수행평가 기록입니다. 이를 바탕으로 각 학생별 교과지도 사항과 학생 종합 평가를 학부모 통지서나 학교생활기록부에 적합한 전문적인 어조로 상세히 작성해주세요:\n\n`

      setInputData(systemPromptPrefix + combinedData)
      toast.success('모든 학생 데이터를 성공적으로 반영했습니다. 이제 AI 초안 생성하기를 클릭하세요!')
    } catch (e: any) {
      toast.error(e.message || '데이터 수집 중 오류가 발생했습니다.')
    } finally {
      setIsFetchingData(false)
    }
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

  const [pullingModel, setPullingModel] = useState<string | null>(null)

  const handlePullLightModel = async () => {
    const modelName = 'exaone3.5:2.4b'
    setPullingModel(modelName)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.PullModel) {
        toast.info(`${modelName} 모델 다운로드를 시작합니다 (약 2GB)...`)
        const result = await wailsApp.PullModel(modelName)
        if (result.success) {
          toast.success(`${modelName} 다운로드가 완료되었습니다. 다시 생성을 시도해 주세요!`)
          await checkAIStatus()
          setSelectedModel(modelName)
          setErrorDetail(null)
        } else {
          toast.error(result.error || '다운로드 실패')
        }
      }
    } catch {
      toast.error('다운로드 중 오류가 발생했습니다.')
    } finally {
      setPullingModel(null)
    }
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
    const systemPrompt = '당신은 숙련되고 유능한 교사이자 교육 전문가입니다. 사용자가 입력한 요청(프롬프트)에 맞춰 학교 업무, 생활기록부, 창의적 체험활동, 공문서 등 전문적이고 완성도 높은 초안을 작성해주세요.'

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

      {errorDetail && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '14px 18px', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12, color: '#be123c' }}>
          <i className="fi fi-rr-cross-circle" style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{errorDetail.includes('메모리') ? '메모리 부족 안내' : '생성 오류'}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {errorDetail.includes('메모리') ? 'PC 사양에 비해 현재 선택된 AI 모델이 너무 큽니다. 여유 메모리가 적은 환경에서도 원활하게 동작하는 가벼운 모델(EXAONE 3.5)을 즉시 다운로드하여 사용할 수 있습니다.' : errorDetail}
            </div>
            {errorDetail.includes('메모리') && (
              <button
                onClick={handlePullLightModel}
                disabled={!!pullingModel}
                style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#be123c', color: 'white', fontWeight: 600, fontSize: 13, cursor: pullingModel ? 'default' : 'pointer', opacity: pullingModel ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="fi fi-rr-download" />
                {pullingModel ? `가벼운 모델(EXAONE 3.5) 다운로드 중...` : '가벼운 모델(EXAONE 3.5) 원클릭 다운로드'}
              </button>
            )}
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
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>AI 모델 선택</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={generating} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <option value="auto">자동 선택 (최적 속도 및 품질)</option>
                  {aiStatus.installedModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>작성 모드</label>
                <select value={promptType} onChange={e => setPromptType(e.target.value)} disabled={generating} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <option value="general">일반 자유 작성</option>
                  <option value="student_evaluation">반 전체 학생 데이터 기반 종합 평가</option>
                </select>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>프롬프트 입력 (요청 사항)</label>
                {promptType === 'student_evaluation' && (
                  <button
                    onClick={handleFetchStudentData}
                    disabled={generating || isFetchingData}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontWeight: 600, color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)' }}
                  >
                    <i className={isFetchingData ? "fi fi-rr-spinner fi-spin" : "fi fi-rr-users"} />
                    {isFetchingData ? '학생 데이터 수집 및 병합 중...' : '학생 상담/평가 기록 통째로 불러오기'}
                  </button>
                )}
              </div>
              <textarea rows={6} value={inputData} onChange={e => setInputData(e.target.value)} disabled={generating} placeholder="원하시는 문서 내용, 목적이나 학생 관찰 기록을 자유롭게 입력해주세요..." style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
            </div>
            {!generating ? (
              <button
                onClick={handleGenerate}
                disabled={!inputData.trim() || !hasAnySupportedModel() || isFetchingData}
                style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)', color: 'white', padding: '12px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: (!inputData.trim() || !hasAnySupportedModel() || isFetchingData) ? 'not-allowed' : 'pointer', opacity: (!inputData.trim() || !hasAnySupportedModel() || isFetchingData) ? 0.6 : 1 }}
              >
                <i className="fi fi-rr-magic-wand" style={{ marginRight: 8 }} /> AI 초안 생성 시작
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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                검색어와 AI의 특성상 결과가 정확하지 않거나 오류가 있을 수 있으니 참고용으로 사용을 바랍니다.
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 350, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>최근 생성 내역</h3>
          {loading ? <div>불러오는 중...</div> : logs.length === 0 ? <div style={{ padding: 20, background: 'var(--surface)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>기록된 내역이 없습니다.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              {logs.map(log => (
                <div
                  key={log.id}
                  onClick={() => {
                    setInputData(log.input_data || '')
                    setGeneratedDraft(log.generated_content || '')
                    setUsedModel('불러온 이전 내역')
                    document.querySelector('.main-body')?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {log.prompt_type === 'general' ? '일반 문서' : log.prompt_type} · {new Date(log.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {log.generated_content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
