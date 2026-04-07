import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'
import templateXlsxUrl from '../assets/student_template.xlsx?url'

interface Student {
  id: string
  name: string
  grade: number
  class_num: number
  number: number
  gender: string
  parent_phone?: string
  parent_phone2?: string
  is_active: boolean
}

interface ImportResult {
  total: number
  created: number
  skipped: number
  errors?: string[]
}

interface ParentStatus {
  student_id: string
  has_parent: boolean
  parents?: Array<{ name: string; phone: string }>
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
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  // Add student modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ grade: '', classNum: '', number: '', name: '', gender: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit student modal state
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState({ number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)

  // Parent plugin state
  const [parentEnabled, setParentEnabled] = useState(false)
  const [parentStatusMap, setParentStatusMap] = useState<Record<string, ParentStatus>>({})

  useEffect(() => {
    checkParentPlugin()
  }, [])

  useEffect(() => {
    fetchStudents()

    const handleOnline = () => {
      setIsOfflineMode(false)
      setTimeout(() => fetchStudents(), 0)
    }
    window.addEventListener('server-online', handleOnline)
    return () => window.removeEventListener('server-online', handleOnline)
  }, [filterGrade, filterClass])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [students])

  const downloadTemplate = async () => {
    try {
      const res = await fetch(templateXlsxUrl)
      if (!res.ok) { toast.error('앱 내장 양식을 불러올 수 없습니다.'); return }
      const blob = await res.blob()

      // Convert to base64 and save via Wails native dialog
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1]
        try {
          if ((window as any).go?.main?.App?.SaveFileBytes) {
            const downloadRes = await (window as any).go.main.App.SaveFileBytes('student_template.xlsx', base64data)
            if (downloadRes.error) {
              toast.error(downloadRes.error)
            } else if (downloadRes.success) {
              toast.success('다운로드 완료')
            }
          } else {
            // Browser fallback
            const a = document.createElement('a')
            a.href = reader.result as string
            a.download = 'student_template.xlsx'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            toast.success('다운로드 시작됨')
          }
        } catch (err) {
          console.error(err)
          toast.error('파일 저장 중 오류가 발생했습니다.')
        }
      }
      reader.readAsDataURL(blob)
    } catch { toast.error('다운로드 오류가 발생했습니다.') }
  }

  const checkParentPlugin = async () => {
    try {
      const res = await apiFetch('/api/core/plugins')
      if (res.ok) {
        const data = await res.json()
        const plugins = data.plugins || data || []
        const parentPlugin = plugins.find((p: any) => p.id === 'linker' || p.id === 'parent')
        // Check if role=parent access exists (indicates parent feature is on)
        const parentAccess = plugins.find((p: any) =>
          p.plugin_id === 'linker' || Array.isArray(p) ? false :
            (p.id === 'parent' && p.status === 'active')
        )
        // Simpler: try fetching student-links — if it returns 200, parent is enabled
        const test = await apiFetch('/api/parent/student-links?grade=0&class_num=0')
        setParentEnabled(test.ok)
        if (test.ok) fetchParentStatus()
      }
    } catch { /* parent plugin not active */ }
  }

  const fetchParentStatus = async () => {
    try {
      const g = isAdmin ? filterGrade : (user.grade || 0)
      const c = isAdmin ? filterClass : (user.classNum || 0)
      let url = '/api/parent/student-links'
      const params = []
      if (g > 0) params.push(`grade=${g}`)
      if (c > 0) params.push(`class_num=${c}`)
      if (params.length) url += '?' + params.join('&')
      const res = await apiFetch(url)
      if (res.ok) {
        const list: ParentStatus[] = await res.json()
        const map: Record<string, ParentStatus> = {}
        list.forEach(s => { map[s.student_id] = s })
        setParentStatusMap(map)
      }
    } catch { /* ignore */ }
  }

  const fetchStudents = async () => {
    try {
      setLoading(true)
      const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
      const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)

      if (user?.isOffline || !navigator.onLine) {
        throw new Error('already offline')
      }

      let url = '/api/core/users?role=student&page_size=100'
      if (effectiveGrade > 0) url += `&grade=${effectiveGrade}`
      if (effectiveClass > 0) url += `&class_num=${effectiveClass}`
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        let list: Student[] = data.users || []
        if (effectiveGrade > 0) list = list.filter(s => s.grade === effectiveGrade)
        if (effectiveClass > 0) list = list.filter(s => s.class_num === effectiveClass)
        list.sort((a, b) => a.number - b.number)
        setStudents(list)
        setIsOfflineMode(false)
        try { localStorage.setItem(`students_cache_${effectiveGrade}_${effectiveClass}`, JSON.stringify(list)) } catch (e) { }
      } else {
        throw new Error('Server non-ok response')
      }
    } catch (e: any) {
      console.error(e)
      setIsOfflineMode(true)
      const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
      const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)
      try {
        const cached = localStorage.getItem(`students_cache_${effectiveGrade}_${effectiveClass}`)
        if (cached) {
          setStudents(JSON.parse(cached))
          if (e.message !== 'already offline') {
            toast.info("오프라인 환경이라 로컬 캐시 명단을 표시합니다.", { duration: 3000 })
          }
        }
      } catch (err) { }
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
      const res = await apiFetch('/api/core/users/import-students', { method: 'POST', body: formData })
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
    if (delGrade === 0 || delClass === 0) { toast.warning('삭제할 학년과 반을 선택해주세요.'); return }
    toast(`${delGrade}학년 ${delClass}반 학생 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch(`/api/core/users/students-by-class?grade=${delGrade}&class_num=${delClass}`, { method: 'DELETE' })
            if (res.ok) { const data = await res.json(); toast.success(data.message); fetchStudents() }
          } catch (e) { console.error(e) }
        }
      },
      duration: 10000,
    })
  }

  const handleAddStudent = async () => {
    setAddError('')
    const { grade, classNum, number, name, gender } = addForm
    if (!grade || grade === '0' || !classNum || classNum === '0' || !number || !name.trim()) {
      setAddError('학년, 반, 번호, 이름을 모두 입력해주세요.'); return
    }
    setAdding(true)
    try {
      const g = parseInt(grade), c = parseInt(classNum), n = parseInt(number)
      if (isNaN(g) || isNaN(c) || isNaN(n) || g < 1 || c < 1 || n < 1) {
        setAddError('학년, 반, 번호는 1 이상의 숫자여야 합니다.'); setAdding(false); return
      }
      const res = await apiFetch('/api/core/users/add-student', {
        method: 'POST',
        body: JSON.stringify({ grade: g, class_num: c, number: n, name: name.trim(), gender })
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || '학생 등록에 실패했습니다.'); return }
      setShowAddModal(false)
      setAddForm({ grade: '', classNum: '', number: '', name: '', gender: '' })
      fetchStudents()
    } catch (err) {
      setAddError('서버에 연결할 수 없습니다.')
    } finally {
      setAdding(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        const student = students.find(s => s.id === id)
        if (student) openEditModal(student)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(students.map(s => s.id)))
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    toast(`선택한 학생 ${selectedIds.size}명을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch('/api/core/users/delete-students-batch', {
              method: 'POST', body: JSON.stringify({ ids: Array.from(selectedIds) })
            })
            if (res.ok) { const data = await res.json(); toast.success(data.message); fetchStudents() }
            else toast.error('삭제에 실패했습니다.')
          } catch (e) { console.error(e); toast.error('서버에 연결할 수 없습니다.') }
        }
      },
      duration: 10000,
    })
  }



  const openEditModal = (student: Student) => {
    setEditStudent(student)
    setEditForm({ number: String(student.number), name: student.name, gender: student.gender || '', parent_phone: student.parent_phone || '', parent_phone2: student.parent_phone2 || '' })
    setEditError('')
  }

  const handleEditStudent = async () => {
    if (!editStudent) return
    setEditError('')
    const { number, name, gender, parent_phone, parent_phone2 } = editForm
    if (!number || !name.trim()) { setEditError('번호와 이름을 입력해주세요.'); return }
    setEditing(true)
    try {
      const res = await apiFetch(`/api/core/users/${editStudent.id}`, {
        method: 'PUT', body: JSON.stringify({ name: name.trim(), number: parseInt(number), gender, parent_phone: parent_phone.trim(), parent_phone2: parent_phone2.trim() })
      })
      if (res.ok) { toast.success('학생 정보가 수정되었습니다.'); setEditStudent(null); fetchStudents() }
      else { const data = await res.json(); setEditError(data.error || '수정에 실패했습니다.') }
    } catch (err) {
      setEditError('서버에 연결할 수 없습니다.')
    } finally {
      setEditing(false)
    }
  }

  const handleEditSelectedSingle = () => {
    if (selectedIds.size !== 1) { toast.warning('수정할 학생을 1명만 선택해주세요.'); return }
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
            disabled={isOfflineMode || !isProfileSet}
            onClick={() => {
              if (isOfflineMode) return
              if (!isProfileSet) { toast.error('프로필에서 학년과 반 설정을 먼저 해주세요.'); return }
              setShowAddModal(true)
              setAddError('')
              setAddForm({ grade: String(user.grade), classNum: String(user.classNum), number: '', name: '', gender: '' })
            }}
            style={{
              background: (isOfflineMode || !isProfileSet) ? '#9ca3af' : 'var(--accent-green)', color: 'white',
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: (isOfflineMode || !isProfileSet) ? 'not-allowed' : 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: (isOfflineMode || !isProfileSet) ? 0.7 : 1
            }}>
            <i className="fi fi-rr-user-add" /> 학생 1명 추가
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button
            onClick={() => {
              if (isOfflineMode) return
              if (!isProfileSet) { toast.error('프로필에서 학년과 반 설정을 먼저 해주세요.'); return }
              fileInputRef.current?.click()
            }}
            disabled={isOfflineMode || importing || !isProfileSet}
            style={{
              background: (isOfflineMode || !isProfileSet) ? '#9ca3af' : 'var(--accent-blue)', color: 'white',
              padding: '8px 16px', borderRadius: 8, border: 'none',
              cursor: (isOfflineMode || importing || !isProfileSet) ? 'not-allowed' : 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: (isOfflineMode || importing || !isProfileSet) ? 0.7 : 1
            }}>
            <i className="fi fi-rr-file-upload" /> {importing ? '업로드 중...' : '엑셀로 학생 등록'}
          </button>
          <button
            onClick={downloadTemplate}
            disabled={isOfflineMode}
            style={{
              background: isOfflineMode ? '#f1f5f9' : 'white', color: isOfflineMode ? '#94a3b8' : '#6366f1', padding: '8px 14px', borderRadius: 8,
              border: isOfflineMode ? '1px solid #e2e8f0' : '1px solid #c7d2fe', cursor: isOfflineMode ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13
            }}>
            <i className="fi fi-rr-download" /> 등록 양식
          </button>
        </div>
      </div>

      {/* Import Result */}
      {
        importResult && (
          <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: importResult.errors?.length ? '#fef2f2' : '#f0fdf4', border: `1px solid ${importResult.errors?.length ? '#fecaca' : '#bbf7d0'}` }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              총 {importResult.total}명 중 {importResult.created}명 등록 완료 / {importResult.skipped}명 건너뜀
            </div>
            {importResult.errors?.map((e, i) => (
              <div key={i} style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{e}</div>
            ))}
          </div>
        )
      }

      {/* Admin grade/class filter */}
      {
        isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <select value={filterGrade} onChange={e => setFilterGrade(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
              <option value={0}>전체 학년</option>
              {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select value={filterClass} onChange={e => setFilterClass(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
              <option value={0}>전체 반</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => <option key={c} value={c}>{c}반</option>)}
            </select>
            <button onClick={handleDeleteClass}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              이 반 학생 전체 삭제
            </button>
          </div>
        )
      }

      {/* Bulk action bar */}
      {
        selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{selectedIds.size}명 선택됨</span>
            <button onClick={handleEditSelectedSingle} disabled={isOfflineMode}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: isOfflineMode ? '#e2e8f0' : 'white', cursor: isOfflineMode ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: isOfflineMode ? '#94a3b8' : '#1d4ed8' }}>
              수정
            </button>
            <button onClick={handleDeleteSelected} disabled={isOfflineMode}
              style={{ padding: '4px 12px', borderRadius: 6, border: isOfflineMode ? '1px solid #e2e8f0' : '1px solid #fecaca', background: isOfflineMode ? '#e2e8f0' : '#fef2f2', cursor: isOfflineMode ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: isOfflineMode ? '#94a3b8' : '#dc2626' }}>
              삭제
            </button>
          </div>
        )
      }

      {/* Student Table */}
      {
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중...</div>
        ) : students.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12 }}>
            <i className="fi fi-rr-users" style={{ fontSize: 36, display: 'block', marginBottom: 12 }} />
            {isProfileSet ? '등록된 학생이 없습니다.' : '프로필에서 학년과 반을 설정해주세요.'}
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <th style={{ padding: '12px 14px', width: 40, borderBottom: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {(['번호', '이름', '학년', '반', '성별'] as const).map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                  {parentEnabled && (
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>학부모 연동</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'white')}>
                    <td style={{ padding: '10px 14px' }}>
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.number}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '10px 14px' }}>{s.grade}학년</td>
                    <td style={{ padding: '10px 14px' }}>{s.class_num}반</td>
                    <td style={{ padding: '10px 14px' }}>
                      {s.gender === '남' ? (
                        <span style={{ padding: '2px 10px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, fontSize: 12 }}>남</span>
                      ) : s.gender === '여' ? (
                        <span style={{ padding: '2px 10px', borderRadius: 20, background: '#fce7f3', color: '#be185d', fontWeight: 700, fontSize: 12 }}>여</span>
                      ) : (
                        <span style={{ padding: '2px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {parentEnabled && (() => {
                      const ps = parentStatusMap[s.id];
                      const linkedPhones = new Set((ps?.parents || []).map(p => p.phone.replace(/-/g, '')));
                      
                      const p1 = s.parent_phone;
                      const p2 = s.parent_phone2;
                      
                      const isLinked1 = p1 && linkedPhones.has(p1.replace(/-/g, ''));
                      const isLinked2 = p2 && linkedPhones.has(p2.replace(/-/g, ''));

                      if (!p1 && !p2) {
                        return (
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontWeight: 600, fontSize: 12 }}>
                              전화번호 없음
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            {p1 && (
                              <div title={p1} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: isLinked1 ? '#dcfce7' : '#fef3c7', color: isLinked1 ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: 11 }}>
                                  <i className={isLinked1 ? "fi fi-rr-check" : "fi fi-rr-time-fast"} style={{ fontSize: 10 }} /> 학부모1 {isLinked1 ? '연동됨' : '대기중'}
                                </span>
                              </div>
                            )}
                            {p2 && (
                              <div title={p2} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: isLinked2 ? '#dcfce7' : '#fef3c7', color: isLinked2 ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: 11 }}>
                                  <i className={isLinked2 ? "fi fi-rr-check" : "fi fi-rr-time-fast"} style={{ fontSize: 10 }} /> 학부모2 {isLinked2 ? '연동됨' : '대기중'}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Add Modal */}
      {
        showAddModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>학생 추가</h3>
              {addError && (
                <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{addError}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>학년</label>
                  <input type="number" value={addForm.grade} onChange={e => setAddForm(f => ({ ...f, grade: e.target.value }))} disabled={!isAdmin}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: !isAdmin ? '#e2e8f0' : 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>반</label>
                  <input type="number" value={addForm.classNum} onChange={e => setAddForm(f => ({ ...f, classNum: e.target.value }))} disabled={!isAdmin}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: !isAdmin ? '#e2e8f0' : 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>번호</label>
                  <input type="number" value={addForm.number} onChange={e => setAddForm(f => ({ ...f, number: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>이름</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddStudent() }}
                    placeholder="학생 이름"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box' }} autoFocus />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>성별</label>
                  <select value={addForm.gender} onChange={e => setAddForm(f => ({ ...f, gender: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: 'white' }}>
                    <option value="">알 수 없음/미지정</option>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>취소</button>
                <button onClick={handleAddStudent} disabled={adding}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-green)', color: 'white', cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: adding ? 0.7 : 1 }}>
                  <i className="fi fi-rr-check" /> {adding ? '등록 중...' : '등록'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Modal */}
      {
        editStudent && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>학생 정보 수정</h3>
              {editError && (
                <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{editError}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학년</label>
                  <input type="number" value={editStudent.grade} disabled
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#e2e8f0', color: '#64748b', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>반</label>
                  <input type="number" value={editStudent.class_num} disabled
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#e2e8f0', color: '#64748b', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>번호</label>
                  <input type="number" value={editForm.number} onChange={e => setEditForm(f => ({ ...f, number: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>이름</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleEditStudent() }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} autoFocus />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>성별</label>
                  <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', background: 'white' }}>
                    <option value="">알 수 없음/미지정</option>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 1</label>
                  <input value={editForm.parent_phone} onChange={e => setEditForm(f => ({ ...f, parent_phone: e.target.value }))}
                    placeholder="010-0000-0000"
                    onKeyDown={e => { if (e.key === 'Enter') handleEditStudent() }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 2</label>
                  <input value={editForm.parent_phone2} onChange={e => setEditForm(f => ({ ...f, parent_phone2: e.target.value }))}
                    placeholder="010-0000-0000"
                    onKeyDown={e => { if (e.key === 'Enter') handleEditStudent() }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditStudent(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>취소</button>
                <button onClick={handleEditStudent} disabled={editing}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-blue)', color: 'white', cursor: editing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: editing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fi fi-rr-check" /> {editing ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}
