import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch, getToken } from '../api'

interface UserInfo {
  name: string
  school: string
  department?: string
  role: string
  grade?: number
  classNum?: number
}

interface Student {
  id: string
  name: string
  grade: number
  class_num: number
  number: number
}

interface AttendanceRecord {
  id: string
  student_id: string
  type: 'late' | 'absent' | 'leave'
  reason: string
  is_confirmed: boolean
  date: string
  start_date?: string
  end_date?: string
  absence_type?: string
  document_submitted?: boolean
}

interface AttendancePageProps {
  user?: UserInfo
}

export default function AttendancePage({ user }: AttendancePageProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editForms, setEditForms] = useState<Record<string, { start_date: string, end_date: string, absence_type: string, document_submitted: boolean }>>({})

  const [newForm, setNewForm] = useState({
    student_id: '',
    absence_type: '질병결석',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    document_submitted: false,
    reason: ''
  })

  useEffect(() => {
    fetchStudents()
    fetchToday()
  }, [])

  const fetchStudents = async () => {
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (user?.grade) url += `&grade=${user.grade}`
      if (user?.classNum) url += `&class_num=${user.classNum}`

      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || []).filter((s: any) =>
          (!user?.grade || s.grade === user.grade) && (!user?.classNum || s.class_num === user.classNum)
        )
        list.sort((a, b) => a.number - b.number)
        setStudents(list)
      }
    } catch (e) { console.error(e) }
  }

  const fetchToday = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/attendance/today`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setRecords(data || [])

        // Initialize edit forms for unconfirmed records
        const forms: typeof editForms = {}
        const todayStr = new Date().toISOString().slice(0, 10)
          ; (data || []).forEach((r: AttendanceRecord) => {
            if (!r.is_confirmed) {
              forms[r.id] = {
                start_date: r.start_date ? r.start_date.split('T')[0] : r.date.split('T')[0] || todayStr,
                end_date: r.end_date ? r.end_date.split('T')[0] : r.date.split('T')[0] || todayStr,
                absence_type: r.absence_type || '질병결석',
                document_submitted: r.document_submitted || false
              }
            }
          })
        setEditForms(forms)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (id: string) => {
    try {
      const token = await getToken()
      const form = editForms[id] || {}

      const res = await fetch(`http://localhost:5200/api/plugins/attendance/${id}/confirm`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          absence_type: form.absence_type || '',
          document_submitted: !!form.document_submitted
        })
      })
      if (res.ok) {
        toast.success('승인되었습니다.')
        fetchToday()
      } else {
        toast.error('승인에 실패했습니다.')
      }
    } catch (e) {
      toast.error('서버에 연결할 수 없습니다.')
      console.error(e)
    }
  }

  const handleCreate = async () => {
    if (!newForm.student_id) { toast.error('학생을 선택해주세요.'); return }
    if (!newForm.reason.trim()) { toast.error('사유를 입력해주세요.'); return }
    setSubmitting(true)

    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/attendance/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id: newForm.student_id,
          type: 'absent', // Default mapped value since teacher inputs detail
          reason: newForm.reason,
          start_date: new Date(newForm.start_date).toISOString(),
          end_date: new Date(newForm.end_date).toISOString(),
          absence_type: newForm.absence_type,
          document_submitted: newForm.document_submitted
        })
      })
      if (res.ok) {
        toast.success('출결 기록이 등록되었습니다.')
        setShowForm(false)
        setNewForm({
          student_id: '',
          absence_type: '질병결석',
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
          document_submitted: false,
          reason: ''
        })
        fetchToday()
      } else {
        toast.error('저장에 실패했습니다.')
      }
    } catch (e) {
      toast.error('서버 연결 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'late': return <span style={{ background: '#fef9c3', color: '#a16207', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>지각</span>
      case 'absent': return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>결석</span>
      case 'leave': return <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>조퇴</span>
      default: return null
    }
  }

  return (
    <div style={{ padding: 24, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-alarm-clock" style={{ marginRight: 8 }} />오늘의 출결 접수 내역</h3>
        <button className="btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8 }}>
          <i className="fi fi-rr-plus" /> 출결 새로 등록
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : records.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
          오늘 접수된 근태 신고가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {records.map(r => (
            <div key={r.id} style={{ padding: '20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {getTypeLabel(r.type)}
                {r.is_confirmed ? (
                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 'bold' }}><i className="fi fi-rr-check-circle" /> 확인완료</span>
                ) : (
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 'bold' }}><i className="fi fi-rr-exclamation" /> 미확인</span>
                )}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>학생 ID: {r.student_id.substring(0, 8)}...</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>사유: {r.reason}</div>

              {r.is_confirmed ? (
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>결석 종류:</div>
                    <div style={{ fontWeight: 600 }}>{r.absence_type || '-'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>결석 기간:</div>
                    <div style={{ fontWeight: 600 }}>
                      {r.start_date ? new Date(r.start_date).toLocaleDateString() : '-'} ~ {r.end_date ? new Date(r.end_date).toLocaleDateString() : '-'}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>관련 서류:</div>
                    <div style={{ fontWeight: 600, color: r.document_submitted ? '#16a34a' : '#ea580c' }}>
                      {r.document_submitted ? '제출 완료' : '미제출'}
                    </div>
                  </div>
                </div>
              ) : editForms[r.id] && (
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>결석 종류</label>
                    <select
                      value={editForms[r.id].absence_type}
                      onChange={e => setEditForms(prev => ({ ...prev, [r.id]: { ...prev[r.id], absence_type: e.target.value } }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                    >
                      <option value="질병결석">질병결석</option>
                      <option value="인정결석">출석인정결석</option>
                      <option value="미인정결석">미인정결석</option>
                      <option value="기타결석">기타결석</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>결석 기간</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="date"
                        value={editForms[r.id].start_date}
                        onChange={e => setEditForms(prev => ({ ...prev, [r.id]: { ...prev[r.id], start_date: e.target.value } }))}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                      />
                      <span style={{ color: 'var(--text-muted)' }}>~</span>
                      <input
                        type="date"
                        value={editForms[r.id].end_date}
                        onChange={e => setEditForms(prev => ({ ...prev, [r.id]: { ...prev[r.id], end_date: e.target.value } }))}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      id={`doc_${r.id}`}
                      checked={editForms[r.id].document_submitted}
                      onChange={e => setEditForms(prev => ({ ...prev, [r.id]: { ...prev[r.id], document_submitted: e.target.checked } }))}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <label htmlFor={`doc_${r.id}`} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>질병/결석 관련 증빙 서류 접수 확인</label>
                  </div>
                </div>
              )}

              {!r.is_confirmed && (
                <button onClick={() => handleConfirm(r.id)} style={{ width: '100%', background: '#10b981', color: 'white', padding: '10px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                  입력 내용 저장 및 승인
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 출결 새로 등록 모달 */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 500, maxWidth: '90%', padding: '24px', background: 'var(--bg-primary)', borderRadius: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>출결 및 결석 확인서 새로 등록</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>학생 선택 *</label>
                <select
                  value={newForm.student_id}
                  onChange={e => setNewForm(f => ({ ...f, student_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
                >
                  <option value="">학생을 선택하세요</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.grade}학년 {s.class_num}반 {s.number}번 {s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>결석 종류 *</label>
                <select
                  value={newForm.absence_type}
                  onChange={e => setNewForm(f => ({ ...f, absence_type: e.target.value }))}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
                >
                  <option value="질병결석">질병결석</option>
                  <option value="인정결석">출석인정결석</option>
                  <option value="미인정결석">미인정결석</option>
                  <option value="기타결석">기타결석</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>결석 기간 *</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="date" value={newForm.start_date} onChange={e => setNewForm(f => ({ ...f, start_date: e.target.value }))}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                  <span>~</span>
                  <input type="date" value={newForm.end_date} onChange={e => setNewForm(f => ({ ...f, end_date: e.target.value }))}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>사유 *</label>
                <textarea rows={2} value={newForm.reason} onChange={e => setNewForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="상세 사유 입력"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }} />
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="doc_check" checked={newForm.document_submitted}
                    onChange={e => setNewForm(f => ({ ...f, document_submitted: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <label htmlFor="doc_check" style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>질병/결석 관련 증빙 서류 접수 확인</label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ padding: '10px 20px', borderRadius: 8 }}>취소</button>
              <button onClick={handleCreate} disabled={submitting} className="btn-primary" style={{ padding: '10px 20px', borderRadius: 8 }}>
                {submitting ? '저장 중...' : '저장 및 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
