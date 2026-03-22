import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { toast } from 'sonner'

interface AssignmentSession {
  id: string
  title: string
  target_grade: number
  status: 'collecting' | 'processing' | 'completed'
  created_at: string
}

interface ParentRequest {
  id: string
  student_name: string
  request: string
  created_at: string
}

export default function ClassMgmtPage() {
  const [sessions, setSessions] = useState<AssignmentSession[]>([])
  const [selectedSession, setSelectedSession] = useState<AssignmentSession | null>(null)
  const [requests, setRequests] = useState<ParentRequest[]>([])
  const [isCreating, setIsCollecting] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGrade, setNewGrade] = useState(1)
  const [isSimulating, setIsSimulating] = useState(false)

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const res = await apiFetch('/api/plugins/classmgmt/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateSession = async () => {
    if (!newTitle) return toast.error('제목을 입력해주세요.')
    try {
      const res = await apiFetch('/api/plugins/classmgmt/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, target_grade: newGrade })
      })
      if (res.ok) {
        toast.success('반편성 세션이 생성되었습니다.')
        setIsCollecting(false)
        setNewTitle('')
        fetchSessions()
      }
    } catch (e) {
      toast.error('생성 실패')
    }
  }

  const runAISimulation = async (id: string) => {
    setIsSimulating(true)
    try {
      const res = await apiFetch(`/api/plugins/classmgmt/sessions/${id}/auto-assign`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success('AI 시뮬레이션 완료!')
        alert(`AI 분석 결과:\n${data.suggestion}`)
      }
    } catch (e) {
      toast.error('시뮬레이션 중 오류 발생')
    } finally {
      setIsSimulating(false)
    }
  }

  return (
    <div className="page-container">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>반편성 세션 목록</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>새 학기 반편성을 위한 데이터를 관리하고 AI 배정을 실행합니다.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCollecting(true)}>
          <i className="fi fi-rr-plus" style={{ marginRight: 8 }} />
          새 세션 생성
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>세션 명칭</th>
              <th>대상 학년</th>
              <th>상태</th>
              <th>생성일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  등록된 반편성 세션이 없습니다.
                </td>
              </tr>
            ) : (
              sessions.map(s => (
                <tr key={s.id} onClick={() => setSelectedSession(s)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{s.title}</td>
                  <td>{s.target_grade}학년</td>
                  <td>
                    <span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                      {s.status === 'collecting' ? '요청 수집 중' : s.status === 'completed' ? '배정 완료' : '분석 중'}
                    </span>
                  </td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); runAISimulation(s.id); }} disabled={isSimulating}>
                      {isSimulating ? '분석 중...' : 'AI 배정 실행'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <h4>새 반편성 세션 생성</h4>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">세션 제목</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="예: 2026학년도 신입생 반편성"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">대상 학년</label>
              <select className="form-input" value={newGrade} onChange={(e) => setNewGrade(parseInt(e.target.value))}>
                {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
              </select>
            </div>
            <div className="modal-footer" style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setIsCollecting(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleCreateSession}>생성하기</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h4 style={{ fontWeight: 600, marginBottom: 12 }}>
          <i className="fi fi-rr-info" style={{ marginRight: 8, color: 'var(--primary-color)' }} />
          지능형 반편성 가이드
        </h4>
        <div className="card" style={{ background: 'var(--bg-light)', border: '1px dashed var(--border-color)' }}>
          <ul style={{ paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <li>세션을 생성하면 학부모용 앱에서 해당 학년 학생들의 반편성 요청 사항을 입력받을 수 있습니다.</li>
            <li>성적 균형, 남녀 비율, 학부모 요청(특정 학생과 분리/배정 등)을 AI가 종합 분석합니다.</li>
            <li>[AI 배정 실행] 버튼을 누르면 Ollama 모델이 수천 가지 조합 중 최적의 안을 제안합니다.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
