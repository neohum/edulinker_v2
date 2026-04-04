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

interface EvalRecord {
  id: string
  student_id: string
  subject: string
  evaluation_type: string
  score: number
  feedback: string
  created_at: string
}

interface CurriculumPageProps {
  user?: UserInfo
}

const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '역사', '도덕', '미술', '음악', '체육', '기술·가정', '정보', '기타']

export default function CurriculumPage({ user }: CurriculumPageProps = {}) {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [evalRecords, setEvalRecords] = useState<EvalRecord[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [evalLoading, setEvalLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    subject: '국어', title: '', score: '', memo: ''
  })

  useEffect(() => { fetchStudents() }, [])
  useEffect(() => { if (selectedStudent) fetchEvalRecords(selectedStudent.id) }, [selectedStudent])

  const fetchStudents = async () => {
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (user?.grade) url += `&grade=${user.grade}`
      if (user?.classNum) url += `&class_num=${user.classNum}`
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || [])
          .filter((s: any) => (!user?.grade || s.grade === user.grade) && (!user?.classNum || s.class_num === user.classNum))
        list.sort((a, b) => a.number - b.number)
        setStudents(list)
      }
    } catch (e) { console.error(e) }
    finally { setLoadingStudents(false) }
  }

  const fetchEvalRecords = async (studentId: string) => {
    setEvalLoading(true)
    try {
      const data = await (window as any).go.main.App.GetCurriculumEvaluations();
      // data already matches EvalRecord structure, just filter it
      setEvalRecords((data || []).filter((r: any) => r.student_id === studentId))
    } catch { setEvalRecords([]) } finally { setEvalLoading(false) }
  }

  const handleSubmit = async () => {
    if (!selectedStudent) return
    if (!form.title.trim() || !form.score) { toast.error('평가명과 점수를 입력해주세요.'); return }
    setSubmitting(true)
    try {
      await (window as any).go.main.App.SaveCurriculumEvaluation(selectedStudent.id, form.subject, form.title.trim(), Number(form.score), form.memo);
      toast.success('수행평가 기록이 저장되었습니다.')
      setShowForm(false)
      setForm({ subject: '국어', title: '', score: '', memo: '' })
      fetchEvalRecords(selectedStudent.id)
    } catch { toast.error('저장에 실패했습니다.') } finally { setSubmitting(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 수행평가 기록을 삭제하시겠습니까?')) return
    try {
      await (window as any).go.main.App.DeleteCurriculumEvaluation(id);
      toast.success('삭제되었습니다.');
      if (selectedStudent) fetchEvalRecords(selectedStudent.id);
    } catch { toast.error('삭제에 실패했습니다.') }
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Left: Student List */}
      <div style={{ width: 220, borderRight: '1px solid var(--border)', padding: '16px 8px', overflowY: 'auto', background: 'var(--bg-primary)', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, padding: '0 8px' }}>
          학생 목록 ({students.length}명)
        </div>
        {loadingStudents ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px' }}>불러오는 중...</div>
        ) : students.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px' }}>학생관리에서<br />학생을 먼저 등록하세요.</div>
        ) : (
          students.map(s => (
            <div key={s.id} onClick={() => setSelectedStudent(s)}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: selectedStudent?.id === s.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: selectedStudent?.id === s.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                color: selectedStudent?.id === s.id ? '#6366f1' : 'var(--text)',
                fontWeight: selectedStudent?.id === s.id ? 700 : 400,
                fontSize: 14, transition: 'all 0.15s'
              }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{s.number}번</span>
              {s.name}
            </div>
          ))
        )}
      </div>

      {/* Right: Eval Records */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!selectedStudent ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 15 }}>
            <div style={{ textAlign: 'center' }}>
              <i className="fi fi-rr-edit" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              왼쪽에서 학생을 선택하면 수행평가 기록을 확인하고 추가할 수 있습니다.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedStudent.name} 학생 수행평가 기록</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {selectedStudent.grade}학년 {selectedStudent.class_num}반 {selectedStudent.number}번
                </div>
              </div>
              <button onClick={() => setShowForm(!showForm)}
                style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <i className="fi fi-rr-plus" style={{ marginRight: 6 }} />평가 추가
              </button>
            </div>

            {/* Add Form */}
            {showForm && (
              <div style={{ background: 'white', padding: 24, borderRadius: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>새 수행평가 기록</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>교과목</label>
                    <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>점수 (100점 만점)</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))} placeholder="점수"
                        style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>평가명 *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 1단원 수행평가, 서술형 평가..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>메모 (특이사항·피드백)</label>
                  <textarea rows={2} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="교사 평가 의견, 특이사항..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }} />
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
            {evalLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</div>
            ) : evalRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 14 }}>
                아직 수행평가 기록이 없습니다.
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)' }}>
                      {['날짜', '교과', '평가명', '점수', '메모', ''].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {evalRecords.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, background: '#e0e7ff', color: '#4f46e5', fontWeight: 700, fontSize: 12 }}>{r.subject}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.evaluation_type}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 800, fontSize: 16, color: r.score >= 80 ? '#22c55e' : r.score >= 50 ? '#f59e0b' : '#ef4444' }}>{r.score}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> / 100</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.feedback}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <button onClick={() => handleDelete(r.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                            onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                            <i className="fi fi-rr-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
