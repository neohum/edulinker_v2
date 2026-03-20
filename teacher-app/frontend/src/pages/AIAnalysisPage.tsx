import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface AILog {
  id: string
  prompt_type: string
  input_data: string
  generated_content: string
  created_at: string
}

export default function AIAnalysisPage() {
  const [logs, setLogs] = useState<AILog[]>([])
  const [loading, setLoading] = useState(true)
  const [promptType, setPromptType] = useState('student_evaluation')
  const [inputData, setInputData] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedDraft, setGeneratedDraft] = useState('')

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/aianalysis/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setLogs(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!inputData.trim()) return
    setGenerating(true)
    setGeneratedDraft('')
    try {
      const token = localStorage.getItem('token')

      // Phase 1: Call Ollama proxy directly from the frontend to preview,
      // and log the final version to the backend db if the user chooses to save.
      // Alternatively, our backend /generate route could do both, but currently
      // the backend `/api/plugins/aianalysis/generate` just logs the data directly.
      // So we will first call the core AI API to generate text:
      const proxyRes = await fetch('http://localhost:5200/api/core/ai/autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: inputData })
      })

      if (!proxyRes.ok) {
        const errorData = await proxyRes.json()
        toast.error('AI 생성 실패: ' + (errorData.error || proxyRes.statusText))
        setGenerating(false)
        return
      }

      const proxyData = await proxyRes.json()
      setGeneratedDraft(proxyData.completion)

    } catch (e) {
      console.error(e)
      toast.error('오류 발생: ' + (e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveToDB = async () => {
    if (!generatedDraft) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/aianalysis/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt_type: promptType,
          input_data: generatedDraft // saving the approved final text
        })
      })
      if (res.ok) {
        toast.success('저장되었습니다!')
        setGeneratedDraft('')
        setInputData('')
        fetchLogs()
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24 }}>
      {/* Left Column: Generator */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>🌟 AI 작성 도우미 (Ollama 연동)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>학생 생활기록부/세부능력 초안이나 예산계획서 초안을 AI로 자동 생성합니다.</p>

        <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>작성 유형</label>
            <select value={promptType} onChange={e => setPromptType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="student_evaluation">학생 세특·종특 (생활기록부)</option>
              <option value="budget_plan">예산 품의서 초안</option>
              <option value="general_document">일반 결재 공문</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>핵심 키워드 및 관찰 내용</label>
            <textarea
              rows={4}
              value={inputData}
              onChange={e => setInputData(e.target.value)}
              placeholder="예: 국어시간에 주도적으로 발표함, 리더십 강함, 시 쓰기에 소질이 보임..."
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>

          <button onClick={handleGenerate} disabled={generating || !inputData.trim()} style={{
            background: 'linear-gradient(to right, #6366f1, #8b5cf6)', color: 'white', padding: '12px',
            borderRadius: 8, border: 'none', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1
          }}>
            {generating ? <><i className="fi fi-rr-spinner" /> AI 로컬 서버에서 생성 중...</> : <><i className="fi fi-rr-magic-wand" /> AI 초안 생성하기</>}
          </button>
        </div>

        {generatedDraft && (
          <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginBottom: 8 }}>생성된 초안 결과</div>
              <textarea
                rows={6}
                value={generatedDraft}
                onChange={e => setGeneratedDraft(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', lineHeight: 1.6 }}
              />
            </div>
            <button onClick={handleSaveToDB} style={{
              background: '#10b981', color: 'white', padding: '10px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
            }}>
              💾 학생 기록 데이터베이스에 저장
            </button>
          </div>
        )}
      </div>

      {/* Right Column: History */}
      <div style={{ width: 350, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>최근 기록 내역</h3>
        {loading ? (
          <div>불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 20, background: 'var(--surface)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
            기록된 AI 분석 내역이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            {logs.map(log => (
              <div key={log.id} style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {log.prompt_type} · {new Date(log.created_at).toLocaleDateString()}
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
  )
}
