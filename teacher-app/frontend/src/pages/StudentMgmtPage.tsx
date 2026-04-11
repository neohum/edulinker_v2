import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import templateXlsxUrl from '../assets/student_template.xlsx?url'
import type { UserInfo } from '../App'

import { StudentTable } from '../components/student/StudentTable'
import { StudentModals } from '../components/student/StudentModals'

import { useExcelImport } from '../hooks/useExcelImport'
import { useStudentSelection } from '../hooks/useStudentSelection'
import { useStudentAPI } from '../hooks/useStudentAPI'

export default function StudentMgmtPage({ user }: { user: UserInfo }) {
  const isAdmin = user.role === 'admin'
  const [filterGrade, setFilterGrade] = useState<number>(user.grade || 0)
  const [filterClass, setFilterClass] = useState<number>(user.classNum || 0)
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ grade: '', classNum: '', number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const [editStudent, setEditStudent] = useState<any>(null)
  const [editForm, setEditForm] = useState({ number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)

  // API Hooks
  const fetchStudentsRef = useRef<any>(null)
  const loadLocalStudentsRef = useRef<any>(null)

  const {
    students, loading, parentEnabled, parentStatusMap,
    checkParentPlugin, fetchStudents, loadLocalStudents, handleDeleteClass, handleAddStudent, handleEditStudent
  } = useStudentAPI({
    user, isAdmin, filterGrade, filterClass, setIsOfflineMode,
    setShowAddModal, setAddForm, setAddError, setAdding, setEditStudent,
    fetchStudentsRef, loadLocalStudentsRef
  })

  // Hook injections
  const { importing, importResult, fileInputRef, handleFileUpload } = useExcelImport({
    isAdmin, filterGrade, filterClass, user,
    loadLocalStudents: (g: number, c: number) => loadLocalStudentsRef.current?.(g, c),
    fetchStudents: () => fetchStudentsRef.current?.()
  })

  const {
    selectedIds, toggleSelect, toggleSelectAll, handleDeleteSelected, handleEditSelectedSingle
  } = useStudentSelection({
    students, isAdmin, filterGrade, filterClass, user,
    openEditModal: (s: any) => {
      setEditStudent(s)
      setEditForm({ number: String(s.number), name: s.name, gender: s.gender || '', parent_phone: s.parent_phone || '', parent_phone2: s.parent_phone2 || '' })
      setEditError('')
    },
    loadLocalStudents: (g: number, c: number) => loadLocalStudentsRef.current?.(g, c),
    fetchStudents: () => fetchStudentsRef.current?.()
  })

  useEffect(() => { checkParentPlugin() }, [])

  useEffect(() => {
    fetchStudents()
    const handleOnline = () => { setIsOfflineMode(false); setTimeout(() => fetchStudents(), 0) }
    window.addEventListener('server-online', handleOnline)
    return () => window.removeEventListener('server-online', handleOnline)
  }, [filterGrade, filterClass, user.grade, user.classNum])

  const downloadTemplate = async () => {
    try {
      const res = await fetch(templateXlsxUrl)
      if (!res.ok) { toast.error('앱 내장 양식을 불러올 수 없습니다.'); return }
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1]
        if ((window as any).go?.main?.App?.SaveFileBytes) {
          const downloadRes = await (window as any).go.main.App.SaveFileBytes('student_template.xlsx', base64data)
          if (downloadRes.error) toast.error(downloadRes.error)
          else toast.success('다운로드 완료')
        } else {
          const a = document.createElement('a'); a.href = reader.result as string; a.download = 'student_template.xlsx'
          document.body.appendChild(a); a.click(); document.body.removeChild(a); toast.success('다운로드 시작됨')
        }
      }
      reader.readAsDataURL(blob)
    } catch { toast.error('다운로드 오류가 발생했습니다.') }
  }

  const isProfileSet = !!(user.grade && user.classNum)
  const allSelected = students.length > 0 && selectedIds.size === students.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < students.length

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}><i className="fi fi-rr-graduation-cap" style={{ marginRight: 8 }} />학생 관리</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={!isProfileSet} onClick={() => {
            if (!isProfileSet) { toast.error('프로필에서 학년과 반 설정을 먼저 해주세요.'); return }
            setShowAddModal(true); setAddError(''); setAddForm({ grade: String(user.grade), classNum: String(user.classNum), number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
          }}
            style={{ background: (!isProfileSet) ? '#9ca3af' : 'var(--accent-green)', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', cursor: (!isProfileSet) ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: (!isProfileSet) ? 0.7 : 1 }}>
            <i className="fi fi-rr-user-add" /> 학생 1명 추가
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button onClick={() => { if (!isProfileSet) { toast.error('프로필 설정 확인.'); return }; fileInputRef.current?.click() }} disabled={importing || !isProfileSet}
            style={{ background: (!isProfileSet) ? '#9ca3af' : 'var(--accent-blue)', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', cursor: (importing || !isProfileSet) ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: (importing || !isProfileSet) ? 0.7 : 1 }}>
            <i className="fi fi-rr-file-upload" /> {importing ? '업로드 중...' : '엑셀로 학생 등록'}
          </button>
          <button onClick={downloadTemplate} style={{ background: 'white', color: '#6366f1', padding: '8px 14px', borderRadius: 8, border: '1px solid #c7d2fe', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <i className="fi fi-rr-download" /> 등록 양식
          </button>
        </div>
      </div>

      {importResult && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: importResult.errors?.length ? '#fef2f2' : '#f0fdf4', border: `1px solid ${importResult.errors?.length ? '#fecaca' : '#bbf7d0'}` }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>총 {importResult.total}명 중 {importResult.created}명 등록 완료 / {importResult.skipped}명 건너뜀</div>
          {importResult.errors?.map((e: any, i: number) => <div key={i} style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{e}</div>)}
        </div>
      )}

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <select value={filterGrade} onChange={e => setFilterGrade(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
            <option value={0}>전체 학년</option>{[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}학년</option>)}
          </select>
          <select value={filterClass} onChange={e => setFilterClass(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
            <option value={0}>전체 반</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => <option key={c} value={c}>{c}반</option>)}
          </select>
          <button onClick={handleDeleteClass} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>이 반 학생 전체 삭제</button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{selectedIds.size}명 선택됨</span>
          <button onClick={handleEditSelectedSingle} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>수정</button>
          <button onClick={handleDeleteSelected} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626' }}>삭제</button>
        </div>
      )}

      <StudentTable students={students} loading={loading} isProfileSet={isProfileSet} allSelected={allSelected} someSelected={someSelected} toggleSelectAll={toggleSelectAll} selectedIds={selectedIds} toggleSelect={toggleSelect} parentEnabled={parentEnabled} parentStatusMap={parentStatusMap} />

      <StudentModals isAdmin={isAdmin} showAddModal={showAddModal} setShowAddModal={setShowAddModal} addForm={addForm} setAddForm={setAddForm} addError={addError} adding={adding} handleAddStudent={() => handleAddStudent(addForm)} editStudent={editStudent} editForm={editForm} setEditForm={setEditForm} editError={editError} editing={editing} handleEditStudent={() => handleEditStudent(editStudent, editForm, setEditError, setEditing)} />
    </div>
  )
}
