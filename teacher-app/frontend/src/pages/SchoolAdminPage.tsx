import { useState, useEffect } from 'react'
import type { UserInfo } from '../App'
import { apiFetch } from '../api'
import { toast } from 'sonner'

interface SchoolAdminPageProps {
  user: UserInfo
}

interface Handover {
  id: string
  task_name: string
  from_user_id: string
  to_user_id: string
  content: string
  is_confirmed: boolean
  created_at: string
}

export default function SchoolAdminPage({ user }: SchoolAdminPageProps) {
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [activeTab, setActiveGroup] = useState<'handover' | 'evaluation'>('handover')
  const [isCreatingHandover, setIsCreatingHandover] = useState(false)
  
  // Handover Form
  const [newHandover, setNewHandover] = useState({ to_user_id: '', task_name: '', content: '' })

  useEffect(() => {
    if (activeTab === 'handover') fetchReceivedHandovers()
  }, [activeTab])

  const fetchReceivedHandovers = async () => {
    try {
      const res = await apiFetch('/api/plugins/schooladmin/handovers/received')
      if (res.ok) setHandovers(await res.json())
    } catch (e) { console.error(e) }
  }

  const handleCreateHandover = async () => {
    if (!newHandover.task_name || !newHandover.to_user_id) return toast.error('업무명과 수신자를 입력해주세요.')
    try {
      const res = await apiFetch('/api/plugins/schooladmin/handovers', {
        method: 'POST',
        body: JSON.stringify(newHandover)
      })
      if (res.ok) {
        toast.success('인수인계서가 발송되었습니다.')
        setIsCreatingHandover(false)
        setNewHandover({ to_user_id: '', task_name: '', content: '' })
      }
    } catch (e) { toast.error('발송 실패') }
  }

  const confirmHandover = async (id: string) => {
    try {
      const res = await apiFetch(`/api/plugins/schooladmin/handovers/${id}/confirm`, { method: 'PUT' })
      if (res.ok) {
        toast.success('인수인계를 확인했습니다.')
        fetchReceivedHandovers()
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="page-container">
      <div className="tabs" style={{ marginBottom: 24, display: 'flex', gap: 16, borderBottom: '1px solid var(--border-color)' }}>
        <button 
          className={`tab-item ${activeTab === 'handover' ? 'active' : ''}`} 
          onClick={() => setActiveGroup('handover')}
          style={{ padding: '8px 16px', borderBottom: activeTab === 'handover' ? '2px solid var(--primary-color)' : 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          업무 인수인계
        </button>
        <button 
          className={`tab-item ${activeTab === 'evaluation' ? 'active' : ''}`} 
          onClick={() => setActiveGroup('evaluation')}
          style={{ padding: '8px 16px', borderBottom: activeTab === 'evaluation' ? '2px solid var(--primary-color)' : 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          다면평가 관리
        </button>
      </div>

      {activeTab === 'handover' && (
        <>
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h4 style={{ fontWeight: 600 }}>수신된 인수인계</h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>전임자로부터 전달받은 업무 내역입니다.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setIsCreatingHandover(true)}>
              <i className="fi fi-rr-paper-plane" style={{ marginRight: 8 }} />
              업무 인계하기
            </button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>업무명</th>
                  <th>인계자</th>
                  <th>상태</th>
                  <th>날짜</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {handovers.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>수신된 업무가 없습니다.</td></tr>
                ) : (
                  handovers.map(h => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 500 }}>{h.task_name}</td>
                      <td>선생님 (ID: {h.from_user_id.slice(0,8)})</td>
                      <td>
                        <span className={`badge ${h.is_confirmed ? 'badge-success' : 'badge-warning'}`}>
                          {h.is_confirmed ? '확인 완료' : '미확인'}
                        </span>
                      </td>
                      <td>{new Date(h.created_at).toLocaleDateString()}</td>
                      <td>
                        {!h.is_confirmed && (
                          <button className="btn btn-sm btn-outline" onClick={() => confirmHandover(h.id)}>확인</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'evaluation' && (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}><i className="fi fi-rr-lock" /></div>
          <h3>보안 자료함</h3>
          <p>다면평가 위원으로 지정된 경우에만 접근 가능합니다.<br/>현재 관리자에 의해 권한 설정 중입니다.</p>
          {user.role === 'admin' && (
            <button className="btn btn-primary" style={{ marginTop: 16 }}>위원 지정 및 설정</button>
          )}
        </div>
      )}

      {/* 업무 인계 모달 */}
      {isCreatingHandover && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4>업무 인수인계 작성</h4>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">후임자 ID (UUID)</label>
              <input className="form-input" value={newHandover.to_user_id} onChange={e => setNewHandover({...newHandover, to_user_id: e.target.value})} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">업무명</label>
              <input className="form-input" placeholder="예: 2025 정보부 부장 업무" value={newHandover.task_name} onChange={e => setNewHandover({...newHandover, task_name: e.target.value})} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">상세 인계 내용</label>
              <textarea className="form-input" style={{ height: 120 }} value={newHandover.content} onChange={e => setNewHandover({...newHandover, content: e.target.value})} />
            </div>
            <div className="modal-footer" style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setIsCreatingHandover(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleCreateHandover}>발송하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
