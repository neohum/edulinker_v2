import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'

interface Student {
  id: string
  name: string
  grade: number
  class_num: number
  number: number
}

interface CounselingRecord {
  id: string
  student_id: string
  student_name?: string
  date: string
  category: string
  content: string
  result: string
  follow_up: string
  created_at: string
}

interface CounselingPageProps {
  user: UserInfo
}

const CATEGORIES = ['학업', '교우관계', '가정', '진로', '심리·정서', '행동·생활', '기타']

export default function CounselingPage({ user }: CounselingPageProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [records, setRecords] = useState<CounselingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: '학업',
    content: '',
    result: '',
    follow_up: '',
  })

  useEffect(() => { fetchStudents() }, [])
  useEffect(() => { if (selectedStudent) fetchRecords(selectedStudent.id) }, [selectedStudent])

  const fetchStudents = async () => {
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (user.grade) url += `&grade=${user.grade}`
      if (user.classNum) url += `&class_num=${user.classNum}`
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || []).filter((s: any) =>
          (!user.grade || s.grade === user.grade) && (!user.classNum || s.class_num === user.classNum)
        )
        list.sort((a, b) => a.number - b.number)
        setStudents(list)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchRecords = async (studentId: string) => {
    try {
      const res = await apiFetch(`/api/plugins/studentmgmt/counseling?student_id=${studentId}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data || [])
      }
    } catch (e) { setRecords([]) }
  }

  const handleSubmit = async () => {
    if (!selectedStudent) return
    if (!form.content.trim()) { toast.error('상담 내용을 입력해주세요.'); return }
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/plugins/studentmgmt/counseling', {
        method: 'POST',
        body: JSON.stringify({ student_id: selectedStudent.id, ...form })
      })
      if (res.ok) {
        toast.success('상담 기록이 저장되었습니다.')
        setShowForm(false)
        setForm({ date: new Date().toISOString().slice(0, 10), category: '학업', content: '', result: '', follow_up: '' })
        fetchRecords(selectedStudent.id)
      } else {
        const d = await res.json(); toast.error(d.error || '저장에 실패했습니다.')
      }
    } catch (e) { toast.error('서버에 연결할 수 없습니다.') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 상담 기록을 삭제하시겠습니까?')) return
    try {
      const res = await apiFetch(`/api/plugins/studentmgmt/counseling/${id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('삭제되었습니다.'); if (selectedStudent) fetchRecords(selectedStudent.id) }
      else toast.error('삭제에 실패했습니다.')
    } catch (e) { toast.error('서버에 연결할 수 없습니다.') }
  }

  const categoryColor: Record<string, string> = {
    '학업': '#6366f1', '교우관계': '#ec4899', '가정': '#f59e0b', '진로': '#10b981',
    '심리·정서': '#8b5cf6', '행동·생활': '#ef4444', '기타': '#64748b'
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Left: Student List */}
      <div style={{ width: 220, borderRight: '1px solid var(--border)', padding: '16px 8px', overflowY: 'auto', background: 'var(--bg-primary)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, padding: '0 8px' }}>
          학생 목록 ({students.length}명)
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px' }}>불러오는 중...</div>
        ) : students.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px' }}>학생이 없습니다.</div>
        ) : (
          students.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedStudent(s)}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: selectedStudent?.id === s.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: selectedStudent?.id === s.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                color: selectedStudent?.id === s.id ? '#6366f1' : 'var(--text)',
                fontWeight: selectedStudent?.id === s.id ? 700 : 400,
                fontSize: 14,
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{s.number}번</span>
              {s.name}
            </div>
          ))
        )}
      </div>

      {/* Right: Counseling Records */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!selectedStudent ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 15 }}>
            <div style={{ textAlign: 'center' }}>
              <i className="fi fi-rr-comments" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              왼쪽에서 학생을 선택하면 상담 기록을 확인하고 추가할 수 있습니다.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedStudent.name} 학생 상담 기록</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {selectedStudent.grade}학년 {selectedStudent.class_num}반 {selectedStudent.number}번
                </div>
              </div>
              <button
                onClick={() => setShowForm(!showForm)}
                style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                <i className="fi fi-rr-plus" style={{ marginRight: 6 }} />상담 기록 추가
              </button>
            </div>

            {/* Add Form */}
            {showForm && (
              <div style={{ background: 'white', padding: 24, borderRadius: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>새 상담 기록</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>상담 날짜</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>상담 유형</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>상담 내용 *</label>
                  <textarea rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="상담 내용을 입력하세요..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>상담 결과</label>
                    <textarea rows={2} value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
                      placeholder="상담 결과 및 학생 반응..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>후속 조치</label>
                    <textarea rows={2} value={form.follow_up} onChange={e => setForm(f => ({ ...f, follow_up: e.target.value }))}
                      placeholder="추후 확인 및 조치 사항..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 14 }}>취소</button>
                  <button onClick={handleSubmit} disabled={submitting}
                    style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}

            {/* Records */}
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 14 }}>
                아직 상담 기록이 없습니다.
              </div>
            ) : (
              records.map(r => (
                <div key={r.id} style={{ background: 'white', padding: 20, borderRadius: 14, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${categoryColor[r.category] || '#64748b'}18`, color: categoryColor[r.category] || '#64748b' }}>{r.category}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{r.date}</span>
                    <button onClick={() => handleDelete(r.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                      onMouseOver={e => (e.currentTarget.style.color = '#ef4444')} onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                      <i className="fi fi-rr-trash" /> 삭제
                    </button>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: r.result || r.follow_up ? 10 : 0 }}>{r.content}</div>
                  {(r.result || r.follow_up) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      {r.result && (
                        <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>상담 결과</div>
                          <div style={{ fontSize: 13 }}>{r.result}</div>
                        </div>
                      )}
                      {r.follow_up && (
                        <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>후속 조치</div>
                          <div style={{ fontSize: 13 }}>{r.follow_up}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
