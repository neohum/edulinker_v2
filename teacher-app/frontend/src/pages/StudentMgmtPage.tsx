import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

interface Student {
  id: string
  name: string
  grade: number
  class_num: number
  number: number
  is_active: boolean
}

interface ImportResult {
  total: number
  created: number
  skipped: number
  errors?: string[]
}

export default function StudentMgmtPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [filterGrade, setFilterGrade] = useState<number>(0)
  const [filterClass, setFilterClass] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add student modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ grade: '', classNum: '', number: '', name: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [filterGrade, filterClass])

  const fetchStudents = async () => {
    try {
      const res = await apiFetch('/api/core/users?role=student&page_size=100')
      if (res.ok) {
        const data = await res.json()
        let list: Student[] = data.users || []
        // Client-side filtering
        if (filterGrade > 0) list = list.filter(s => s.grade === filterGrade)
        if (filterClass > 0) list = list.filter(s => s.class_num === filterClass)
        setStudents(list)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await apiFetch('/api/core/users/import-students', {
        method: 'POST',
        body: formData
      })

      const result: ImportResult = await res.json()
      setImportResult(result)
      fetchStudents()
    } catch (err) {
      console.error(err)
      setImportResult({ total: 0, created: 0, skipped: 0, errors: ['파일 업로드에 실패했습니다.'] })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteClass = async () => {
    if (filterGrade === 0 || filterClass === 0) {
      toast.warning('삭제할 학년과 반을 선택해주세요.')
      return
    }

    toast(`${filterGrade}학년 ${filterClass}반 학생 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch(
              `/api/core/users/students-by-class?grade=${filterGrade}&class_num=${filterClass}`,
              { method: 'DELETE' }
            )
            if (res.ok) {
              const data = await res.json()
              toast.success(data.message)
              fetchStudents()
            }
          } catch (e) {
            console.error(e)
          }
        }
      },
      duration: 10000,
    })
  }

  const handleAddStudent = async () => {
    setAddError('')
    const { grade, classNum, number, name } = addForm
    if (!grade || !classNum || !number || !name.trim()) {
      setAddError('학년, 반, 번호, 이름을 모두 입력해주세요.')
      return
    }

    setAdding(true)
    try {
      const res = await apiFetch('/api/core/users/add-student', {
        method: 'POST',
        body: JSON.stringify({
          grade: parseInt(grade),
          class_num: parseInt(classNum),
          number: parseInt(number),
          name: name.trim()
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || '학생 등록에 실패했습니다.')
        return
      }

      // Success
      setShowAddModal(false)
      setAddForm({ grade: '', classNum: '', number: '', name: '' })
      fetchStudents()
    } catch (err) {
      setAddError('서버에 연결할 수 없습니다.')
    } finally {
      setAdding(false)
    }
  }

  // Get unique grades and classes from student list for filter
  const grades = [...new Set(students.map(s => s.grade))].sort()

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>
          <i className="fi fi-rr-graduation-cap" style={{ marginRight: 8 }} />
          학생 관리
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setShowAddModal(true)
              setAddError('')
              setAddForm({
                grade: filterGrade > 0 ? String(filterGrade) : '',
                classNum: filterClass > 0 ? String(filterClass) : '',
                number: '',
                name: ''
              })
            }}
            style={{
              background: 'var(--accent-green)', color: 'white', padding: '8px 16px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="fi fi-rr-user-add" />
            학생 1명 추가
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              background: 'var(--accent-blue)', color: 'white', padding: '8px 16px',
              borderRadius: 8, border: 'none', cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, opacity: importing ? 0.7 : 1
            }}
          >
            <i className="fi fi-rr-file-upload" />
            {importing ? '업로드 중...' : '엑셀로 학생 등록'}
          </button>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div style={{
          padding: 16, borderRadius: 12, marginBottom: 20,
          background: importResult.errors?.length ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${importResult.errors?.length ? '#fecaca' : '#bbf7d0'}`
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: importResult.errors?.length ? '#dc2626' : '#16a34a' }}>
            <i className="fi fi-rr-checkbox" style={{ marginRight: 6 }} />
            등록 결과: 전체 {importResult.total}명 중 {importResult.created}명 등록, {importResult.skipped}명 건너뜀
          </div>
          {importResult.errors && importResult.errors.length > 0 && (
            <div style={{ fontSize: 13, color: '#b91c1c' }}>
              {importResult.errors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Excel Format Guide */}
      <div style={{
        padding: 16, borderRadius: 12, marginBottom: 20,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14, color: 'var(--text-primary)' }}>
          <i className="fi fi-rr-info" style={{ marginRight: 6 }} />
          엑셀 파일 형식 안내
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          첫 번째 행(헤더)에 <b>학년, 반, 번호, 이름</b> 열이 포함되어야 합니다.<br />
          학생은 비밀번호 없이 <b>학교 + 학년 + 반 + 번호 + 이름</b>으로 로그인합니다.
        </div>
        <table style={{ marginTop: 12, fontSize: 13, borderCollapse: 'collapse', width: '100%', maxWidth: 400 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>학년</th>
              <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>반</th>
              <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>번호</th>
              <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>이름</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>3</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>2</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>1</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>홍길동</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>3</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>2</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>2</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>김철수</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select
          value={filterGrade}
          onChange={(e) => { setFilterGrade(Number(e.target.value)); setLoading(true) }}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14
          }}
        >
          <option value={0}>전체 학년</option>
          {[1, 2, 3, 4, 5, 6].map(g => (
            <option key={g} value={g}>{g}학년</option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={(e) => { setFilterClass(Number(e.target.value)); setLoading(true) }}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14
          }}
        >
          <option value={0}>전체 반</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => (
            <option key={c} value={c}>{c}반</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {students.length}명
        </span>

        {filterGrade > 0 && filterClass > 0 && (
          <button
            onClick={handleDeleteClass}
            style={{
              background: 'var(--accent-red)', color: 'white', padding: '8px 14px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="fi fi-rr-trash" />
            {filterGrade}학년 {filterClass}반 전체 삭제
          </button>
        )}
      </div>

      {/* Student Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          학생 목록을 불러오는 중...
        </div>
      ) : students.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60,
          background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>
            <i className="fi fi-rr-graduation-cap" />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            등록된 학생이 없습니다. 엑셀 파일로 학생을 등록해주세요.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>학년</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>반</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>번호</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>이름</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 80 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>{s.grade}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>{s.class_num}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>{s.number}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 500 }}>{s.name}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: s.is_active ? '#dcfce7' : '#fee2e2',
                      color: s.is_active ? '#16a34a' : '#dc2626'
                    }}>
                      {s.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            background: 'var(--bg-card, #1e293b)', borderRadius: 16, padding: 28, width: 400,
            border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-user-add" />
              학생 1명 추가
            </h4>

            {addError && (
              <div style={{
                padding: 10, borderRadius: 8, marginBottom: 16,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, fontWeight: 500
              }}>
                {addError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학년</label>
                <input
                  type="number" min="1" max="6" placeholder="3"
                  value={addForm.grade}
                  onChange={(e) => setAddForm({ ...addForm, grade: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>반</label>
                <input
                  type="number" min="1" max="20" placeholder="2"
                  value={addForm.classNum}
                  onChange={(e) => setAddForm({ ...addForm, classNum: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>번호</label>
                <input
                  type="number" min="1" max="50" placeholder="1"
                  value={addForm.number}
                  onChange={(e) => setAddForm({ ...addForm, number: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>이름</label>
              <input
                type="text" placeholder="홍길동"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddStudent() }}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600
                }}
              >
                취소
              </button>
              <button
                onClick={handleAddStudent}
                disabled={adding}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--accent-green)', color: 'white', cursor: adding ? 'not-allowed' : 'pointer',
                  fontWeight: 600, opacity: adding ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <i className="fi fi-rr-check" />
                {adding ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
