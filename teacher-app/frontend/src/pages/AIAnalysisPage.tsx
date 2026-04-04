import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
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
  const [selectedModel, setSelectedModel] = useState('auto')
  const [inputData, setInputData] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedDraft, setGeneratedDraft] = useState('')
  const [usedModel, setUsedModel] = useState('')
  const [viewMode, setViewMode] = useState<'markdown' | 'raw'>('markdown')

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

  useEffect(() => {
    (window as any).isAIGenerating = generating;
  }, [generating])

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
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.GetAILogs) {
        const data = await wailsApp.GetAILogs()
        setLogs(data || [])
      }
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("정말 이 생성 내역을 삭제하시겠습니까? (로컬 앱 데이터)")) return;
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.DeleteAILog) {
        await wailsApp.DeleteAILog(id)
        toast.success("내역이 삭제되었습니다.");
        fetchLogs();
      }
    } catch (e) {
      toast.error("삭제 중 오류가 발생했습니다.");
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

  const autoSaveToDB = async (finalContent: string) => {
    if (!finalContent.trim()) return
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.SaveAILog) {
        await wailsApp.SaveAILog(promptType, inputData, finalContent)
        fetchLogs()
      }
    } catch (e) { }
  }

  const handleCopyContent = async () => {
    if (!generatedDraft) return;
    try {
      if (viewMode === 'markdown') {
        const mdDiv = document.querySelector('.markdown-content');
        if (mdDiv) {
          // To ensure proper styling on paste, we can wrap the HTML
          const html = `<div style="font-family: sans-serif; line-height: 1.6;">${mdDiv.innerHTML}</div>`;
          const blobHtml = new Blob([html], { type: 'text/html' });
          const blobText = new Blob([generatedDraft], { type: 'text/plain' });
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': blobHtml,
              'text/plain': blobText
            })
          ]);
          toast.success('마크다운 서식이 유지된 상태로 복사되었습니다! (한글/워드에 붙여넣어 보세요)');
          return;
        }
      }

      await navigator.clipboard.writeText(generatedDraft);
      toast.success('단순 텍스트가 원본 기호와 함께 복사되었습니다.');
    } catch (e) {
      toast.error('복사 중 오류가 발생했습니다.');
    }
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
    let finalSystemPrompt = '당신은 숙련되고 유능한 교사이자 교육 전문가입니다. 사용자가 입력한 요청(프롬프트)에 맞춰 학교 업무, 생활기록부, 창의적 체험활동, 공문서 등 전문적이고 완성도 높은 초안을 작성해주세요.'

    if (promptType === 'knowledge_based') {
      try {
        toast.info('지식 베이스에서 관련 규정을 검색하고 있습니다...');
        let keywords = inputData;
        if (wailsApp?.SearchKnowledge) {
          const raw = await wailsApp.SearchKnowledge(keywords, 3);
          if (raw && raw.length > 0) {
            const context = raw.map((r: any) => `[관련 문서 발췌: ${r.doc_title || '규정'}]\n${r.heading_context || ''}\n${r.display_text}`).join('\n\n');
            finalSystemPrompt += `\n\n<참고 자료>\n다음은 우리 학교의 실제 규정 및 업무 정보입니다. 이 내용을 최우선으로 참고하여 문서를 작성하세요:\n${context}\n</참고 자료>`;
            toast.success('관련 규정을 성공적으로 참조했습니다. 문서 초안 생성을 시작합니다.');
          } else {
            toast.info('관련 규정을 찾을 수 없어 일반 지식 기반으로 작성합니다.');
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    }

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
      wailsApp.GenerateAIStream(model, finalSystemPrompt, inputData)

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
              { role: 'system', content: finalSystemPrompt },
              { role: 'user', content: inputData }
            ],
            keep_alive: "60m",
            stream: true,
            options: { num_ctx: 4096, num_predict: 2048, temperature: 0.6, top_k: 20, top_p: 0.5 }
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
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={generating} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)', outline: 'none', cursor: 'pointer' }}>
                  <option value="auto">자동 선택 (최적 속도 및 품질)</option>
                  {aiStatus.installedModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>작성 모드</label>
                <select value={promptType} onChange={e => setPromptType(e.target.value)} disabled={generating} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)', outline: 'none', cursor: 'pointer' }}>
                  <option value="general">일반 자유 작성</option>
                  <option value="knowledge_based">통합 검색 기반 작성</option>
                </select>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>프롬프트 입력 (요청 사항)</label>
              </div>
              <textarea rows={6} value={inputData} onChange={e => setInputData(e.target.value)} disabled={generating} placeholder="원하시는 문서 내용, 목적이나 학생 관찰 기록을 자유롭게 입력해주세요..." style={{ width: '100%', padding: '16px 18px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, lineHeight: 1.6, backgroundColor: '#f8fafc', resize: 'vertical', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }} />
            </div>
            {!generating ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleGenerate}
                  disabled={!inputData.trim() || !hasAnySupportedModel()}
                  style={{ flex: 1, background: 'linear-gradient(to right, #6366f1, #8b5cf6)', color: 'white', padding: '12px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: (!inputData.trim() || !hasAnySupportedModel()) ? 'not-allowed' : 'pointer', opacity: (!inputData.trim() || !hasAnySupportedModel()) ? 0.6 : 1 }}
                >
                  <i className="fi fi-rr-magic-wand" style={{ marginRight: 8 }} /> AI 문서 작성 시작
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: '#f1f5f9', color: '#475569', padding: '12px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontWeight: 600, fontSize: 14 }}>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  {'실시간 생성 중...'}
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{elapsedSecs}s</span>
                </div>
                <button onClick={handleCancel} style={{ padding: '0 24px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>취소</button>
              </div>
            )}
          </div>

          {(generatedDraft || generating) && (
            <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>생성 결과</div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <button
                      onClick={handleCopyContent}
                      style={{ background: 'white', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <i className="fi fi-rr-copy" /> 내용 복사하기
                    </button>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 6 }}>
                      <button onClick={() => setViewMode('markdown')} style={{ background: viewMode === 'markdown' ? 'white' : 'transparent', border: 'none', padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: viewMode === 'markdown' ? 600 : 500, color: viewMode === 'markdown' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', boxShadow: viewMode === 'markdown' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>마크다운 뷰어</button>
                      <button onClick={() => setViewMode('raw')} style={{ background: viewMode === 'raw' ? 'white' : 'transparent', border: 'none', padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: viewMode === 'raw' ? 600 : 500, color: viewMode === 'raw' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', boxShadow: viewMode === 'raw' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>텍스트 편집</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>모델: <span style={{ fontWeight: 700 }}>{usedModel}</span></div>
                  </div>
                </div>
                {viewMode === 'markdown' ? (
                  <div className="markdown-content" style={{ width: '100%', padding: '24px 28px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', minHeight: '200px', maxHeight: '500px', overflowY: 'auto', fontSize: 15, color: '#334155', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }}>
                    <ReactMarkdown
                      components={{
                        p: ({ node, ...props }) => <p style={{ marginBottom: '1.2em', lineHeight: 1.8, letterSpacing: '-0.01em' }} {...props} />,
                        h1: ({ node, ...props }) => <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginTop: '1.5em', marginBottom: '0.8em', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4em', color: '#0f172a' }} {...props} />,
                        h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '1.4em', marginBottom: '0.6em', color: '#1e293b' }} {...props} />,
                        h3: ({ node, ...props }) => <h3 style={{ fontSize: '1.15em', fontWeight: 600, marginTop: '1.2em', marginBottom: '0.5em', color: '#334155' }} {...props} />,
                        ul: ({ node, ...props }) => <ul style={{ paddingLeft: '1.8em', marginBottom: '1.2em', listStyleType: 'disc', lineHeight: 1.8 }} {...props} />,
                        ol: ({ node, ...props }) => <ol style={{ paddingLeft: '1.8em', marginBottom: '1.2em', listStyleType: 'decimal', lineHeight: 1.8 }} {...props} />,
                        li: ({ node, ...props }) => <li style={{ marginBottom: '0.4em' }} {...props} />,
                        strong: ({ node, ...props }) => <strong style={{ fontWeight: 700, color: '#0f172a' }} {...props} />,
                        blockquote: ({ node, ...props }) => <blockquote style={{ borderLeft: '4px solid #cbd5e1', color: '#475569', background: '#f8fafc', padding: '0.8em 1.2em', borderRadius: '0 8px 8px 0', margin: '1em 0' }} {...props} />
                      }}
                    >{generatedDraft || (generating ? '생성 중...' : '')}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea rows={12} value={generatedDraft} onChange={e => setGeneratedDraft(e.target.value)} placeholder="생성 중..." style={{ width: '100%', padding: '20px', borderRadius: 10, border: '1px solid #cbd5e1', lineHeight: 1.8, fontSize: 15, color: '#334155', background: generating ? '#f1f5f9' : '#f8fafc', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)', resize: 'vertical' }} />
                )}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {log.prompt_type === 'general' ? '일반 문서' : log.prompt_type} · {new Date(log.created_at).toLocaleString()}
                    </div>
                    <button
                      onClick={(e) => handleDeleteLog(log.id, e)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s', fontSize: 14 }}
                      onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
                      title="삭제"
                    >
                      <i className="fi fi-rr-trash" />
                    </button>
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
