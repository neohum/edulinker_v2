import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'

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

interface StudentMgmtPageProps {
  user: UserInfo
}

export default function StudentMgmtPage({ user }: StudentMgmtPageProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [filterGrade, setFilterGrade] = useState<number>(user.grade || 0)
  const [filterClass, setFilterClass] = useState<number>(user.classNum || 0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = user.role === 'admin'

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Add student modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ grade: '', classNum: '', number: '', name: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit student modal state
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState({ number: '', name: '' })
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [filterGrade, filterClass])

  // Clear selection when student list changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [students])

  const fetchStudents = async () => {
    try {
      const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
      const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)

      let url = '/api/core/users?role=student&page_size=100'
      if (effectiveGrade > 0) url += `&grade=${effectiveGrade}`
      if (effectiveClass > 0) url += `&class_num=${effectiveClass}`

      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        let list: Student[] = data.users || []
        if (effectiveGrade > 0) list = list.filter(s => s.grade === effectiveGrade)
        if (effectiveClass > 0) list = list.filter(s => s.class_num === effectiveClass)
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
    const delGrade = isAdmin ? filterGrade : (user.grade || 0)
    const delClass = isAdmin ? filterClass : (user.classNum || 0)

    if (delGrade === 0 || delClass === 0) {
      toast.warning('삭제할 학년과 반을 선택해주세요.')
      return
    }

    toast(`${delGrade}학년 ${delClass}반 학생 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch(
              `/api/core/users/students-by-class?grade=${delGrade}&class_num=${delClass}`,
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

      setShowAddModal(false)
      setAddForm({ grade: '', classNum: '', number: '', name: '' })
      fetchStudents()
    } catch (err) {
      setAddError('서버에 연결할 수 없습니다.')
    } finally {
      setAdding(false)
    }
  }

  // ── Selection handlers ──

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(students.map(s => s.id)))
    }
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return

    toast(`선택한 학생 ${selectedIds.size}명을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch('/api/core/users/delete-students-batch', {
              method: 'POST',
              body: JSON.stringify({ ids: Array.from(selectedIds) })
            })
            if (res.ok) {
              const data = await res.json()
              toast.success(data.message)
              fetchStudents()
            } else {
              toast.error('삭제에 실패했습니다.')
            }
          } catch (e) {
            console.error(e)
            toast.error('서버에 연결할 수 없습니다.')
          }
        }
      },
      duration: 10000,
    })
  }

  // ── Edit handlers ──

  const openEditModal = (student: Student) => {
    setEditStudent(student)
    setEditForm({ number: String(student.number), name: student.name })
    setEditError('')
  }

  const handleEditStudent = async () => {
    if (!editStudent) return
    setEditError('')

    const { number, name } = editForm
    if (!number || !name.trim()) {
      setEditError('번호와 이름을 입력해주세요.')
      return
    }

    setEditing(true)
    try {
      const res = await apiFetch(`/api/core/users/${editStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          // number field — backend UpdateUser doesn't have number, so we set grade/class to keep and update name
        })
      })

      if (res.ok) {
        toast.success('학생 정보가 수정되었습니다.')
        setEditStudent(null)
        fetchStudents()
      } else {
        const data = await res.json()
        setEditError(data.error || '수정에 실패했습니다.')
      }
    } catch (err) {
      setEditError('서버에 연결할 수 없습니다.')
    } finally {
      setEditing(false)
    }
  }

  const handleEditSelectedSingle = () => {
    if (selectedIds.size !== 1) {
      toast.warning('수정할 학생을 1명만 선택해주세요.')
      return
    }
    const id = Array.from(selectedIds)[0]
    const student = students.find(s => s.id === id)
    if (student) openEditModal(student)
  }

  const isProfileSet = !!(user.grade && user.classNum)
  const allSelected = students.length > 0 && selectedIds.size === students.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < students.length

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
              if (!isProfileSet) {
                toast.error('프로필에서 학년과 반 설정을 먼저 해주세요.')
                return
              }
              setShowAddModal(true)
              setAddError('')
              setAddForm({
                grade: String(user.grade),
                classNum: String(user.classNum),
                number: '',
                name: ''
              })
            }}
            style={{
              background: isProfileSet ? 'var(--accent-green)' : '#9ca3af',
              color: 'white', padding: '8px 16px',
              borderRadius: 8, border: 'none', cursor: isProfileSet ? 'pointer' : 'not-allowed', fontWeight: 600,
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
            onClick={() => {
              if (!isProfileSet) {
                toast.error('프로필에서 학년과 반 설정을 먼저 해주세요.')
                return
              }
              fileInputRef.current?.click()
            }}
            disabled={importing || !isProfileSet}
            style={{
              background: isProfileSet ? 'var(--accent-blue)' : '#9ca3af',
              color: 'white', padding: '8px 16px',
              borderRadius: 8, border: 'none', cursor: (importing || !isProfileSet) ? 'not-allowed' : 'pointer', fontWeight: 600,
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

      {/* Filters + Selection Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin ? (
          <>
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
          </>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', padding: '8px 0' }}>
            {user.grade}학년 {user.classNum}반
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Selection action buttons */}
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--accent-blue)',
              background: 'rgba(59,130,246,0.1)', padding: '6px 12px', borderRadius: 8
            }}>
              {selectedIds.size}명 선택
            </span>
            {selectedIds.size === 1 && (
              <button
                onClick={handleEditSelectedSingle}
                style={{
                  background: 'var(--accent-blue)', color: 'white', padding: '7px 14px',
                  borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <i className="fi fi-rr-edit" style={{ fontSize: 12 }} />
                수정
              </button>
            )}
            <button
              onClick={handleDeleteSelected}
              style={{
                background: 'var(--accent-red)', color: 'white', padding: '7px 14px',
                borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <i className="fi fi-rr-trash" style={{ fontSize: 12 }} />
              선택 삭제
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: 'transparent', color: 'var(--text-muted)', padding: '7px 10px',
                borderRadius: 8, border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 13
              }}
            >
              선택 해제
            </button>
          </div>
        )}

        {selectedIds.size === 0 && (
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {students.length}명
          </span>
        )}

        {selectedIds.size === 0 && ((isAdmin && filterGrade > 0 && filterClass > 0) || (!isAdmin && user.grade && user.classNum)) && (
          <button
            onClick={handleDeleteClass}
            style={{
              background: 'var(--accent-red)', color: 'white', padding: '8px 14px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="fi fi-rr-trash" />
            {isAdmin ? filterGrade : user.grade}학년 {isAdmin ? filterClass : user.classNum}반 전체 삭제
          </button>
        )}
      </div>

      {/* Student Table */}
      {!isProfileSet ? (
        <div style={{
          textAlign: 'center', padding: 60,
          background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5, color: '#ef4444' }}>
            <i className="fi fi-rr-settings" />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            학생을 등록하려면 <strong style={{ color: 'var(--text-primary)' }}>내 프로필</strong>에서 '담당 학년'과 '담당 반'을 먼저 설정해주세요.
          </p>
        </div>
      ) : loading ? (
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
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 44 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>학년</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>반</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 70 }}>번호</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>이름</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 80 }}>상태</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const isChecked = selectedIds.has(s.id)
                return (
                  <tr
                    key={s.id}
                    style={{
                      borderTop: '1px solid var(--border-color)',
                      background: isChecked ? 'rgba(59,130,246,0.06)' : 'transparent',
                      transition: 'background 100ms'
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(s.id)}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                      />
                    </td>
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
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => openEditModal(s)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: 14, padding: '4px 6px', borderRadius: 6,
                          transition: 'color 150ms'
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--accent-blue)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title="수정"
                      >
                        <i className="fi fi-rr-edit" />
                      </button>
                    </td>
                  </tr>
                )
              })}
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
                  type="number" min="1" max="6"
                  value={addForm.grade}
                  disabled
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: '#e2e8f0',
                    color: '#64748b', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>반</label>
                <input
                  type="number" min="1" max="20"
                  value={addForm.classNum}
                  disabled
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: '#e2e8f0',
                    color: '#64748b', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
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

      {/* Edit Student Modal */}
      {editStudent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setEditStudent(null)}>
          <div style={{
            background: 'var(--bg-card, #1e293b)', borderRadius: 16, padding: 28, width: 400,
            border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-edit" />
              학생 정보 수정
            </h4>

            {editError && (
              <div style={{
                padding: 10, borderRadius: 8, marginBottom: 16,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, fontWeight: 500
              }}>
                {editError}
              </div>
            )}

            {/* Read-only info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학년</label>
                <input
                  type="number" value={editStudent.grade} disabled
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: '#e2e8f0',
                    color: '#64748b', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>반</label>
                <input
                  type="number" value={editStudent.class_num} disabled
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: '#e2e8f0',
                    color: '#64748b', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>번호</label>
                <input
                  type="number" value={editStudent.number} disabled
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: '#e2e8f0',
                    color: '#64748b', fontSize: 14, textAlign: 'center', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Editable name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>이름</label>
              <input
                type="text" placeholder="이름"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEditStudent() }}
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
                onClick={() => setEditStudent(null)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600
                }}
              >
                취소
              </button>
              <button
                onClick={handleEditStudent}
                disabled={editing}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--accent-blue)', color: 'white', cursor: editing ? 'not-allowed' : 'pointer',
                  fontWeight: 600, opacity: editing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <i className="fi fi-rr-check" />
                {editing ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
