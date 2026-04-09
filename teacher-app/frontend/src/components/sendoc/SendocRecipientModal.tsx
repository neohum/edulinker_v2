import { useState } from 'react'

interface SendocRecipientModalProps {
  allUsers: any[]
  selectedUsers: string[]
  setSelectedUsers: React.Dispatch<React.SetStateAction<string[]>>
  setShowRecipientModal: (show: boolean) => void
  handleSend: (isDraft: boolean) => void
  isSending: boolean
}

export function SendocRecipientModal({
  allUsers,
  selectedUsers,
  setSelectedUsers,
  setShowRecipientModal,
  handleSend,
  isSending
}: SendocRecipientModalProps) {
  const [expandedNodes, setExpandedNodes] = useState<string[]>([])

  const expandKey = (key: string) => expandedNodes.includes(key)
  const toggleExpand = (key: string) => setExpandedNodes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Build tree: role → group → class → users
  // 수신자 선택: 현재 교사 롤만 표시
  // 추후 학생/학부모 등 다른 롤 추가 시 아래 주석을 해제하세요.
  const teachers = allUsers.filter(u => u.role === 'teacher' || u.role === 'admin')
  // const students = allUsers.filter(u => u.role === 'student')
  // const parents = allUsers.filter(u => u.role === 'parent')

  // Group teachers by department
  const teachersByDept: Record<string, any[]> = {}
  teachers.forEach(u => {
    const dept = u.department || '미배정'
    if (!teachersByDept[dept]) teachersByDept[dept] = []
    teachersByDept[dept].push(u)
  })

  // Group students/parents by grade → class
  // 추후 학생/학부모 섹션 복원 시 아래 주석을 해제하세요.
  // const groupByGradeClass = (users: any[]) => {
  //   const byGrade: Record<number, Record<number, any[]>> = {}
  //   users.forEach(u => {
  //     const g = u.grade || 0
  //     const c = u.class_num || 0
  //     if (!byGrade[g]) byGrade[g] = {}
  //     if (!byGrade[g][c]) byGrade[g][c] = []
  //     byGrade[g][c].push(u)
  //   })
  //   return byGrade
  // }
  // const studentTree = groupByGradeClass(students)
  // const parentTree = groupByGradeClass(parents)

  // Helpers
  const getUsersInGroup = (users: any[]) => users.map(u => u.id)
  const isAllSelected = (ids: string[]) => ids.length > 0 && ids.every(id => selectedUsers.includes(id))
  const isSomeSelected = (ids: string[]) => ids.some(id => selectedUsers.includes(id))
  const toggleGroup = (ids: string[]) => {
    if (isAllSelected(ids)) {
      setSelectedUsers(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setSelectedUsers(prev => [...new Set([...prev, ...ids])])
    }
  }

  const renderUser = (u: any) => (
    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', borderRadius: 8, background: selectedUsers.includes(u.id) ? '#eff6ff' : 'transparent', marginLeft: 8 }}>
      <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={e => {
        if (e.target.checked) setSelectedUsers(p => [...p, u.id])
        else setSelectedUsers(p => p.filter(id => id !== u.id))
      }} />
      <span style={{ fontSize: 13 }}>{u.name}</span>
      {u.number > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.number}번</span>}
    </label>
  )

  const renderGroupHeader = (key: string, label: string, userIds: string[], icon: string, depth: number) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderRadius: 10, background: expandKey(key) ? '#f8fafc' : 'transparent', marginLeft: depth * 16 }}
      onClick={() => toggleExpand(key)}>
      <i className={`fi ${expandKey(key) ? 'fi-rr-angle-down' : 'fi-rr-angle-right'}`} style={{ fontSize: 11, color: '#94a3b8', width: 14 }} />
      <input type="checkbox" checked={isAllSelected(userIds)} ref={el => { if (el) el.indeterminate = !isAllSelected(userIds) && isSomeSelected(userIds) }}
        onClick={e => e.stopPropagation()} onChange={() => toggleGroup(userIds)} style={{ accentColor: '#3b82f6' }} />
      <i className={`fi ${icon}`} style={{ fontSize: 13, color: '#64748b' }} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{userIds.length}명</span>
    </div>
  )

  const allTeacherIds = teachers.map(u => u.id)
  // const allStudentIds = students.map(u => u.id)
  // const allParentIds = parents.map(u => u.id)

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ fontSize: 18, fontWeight: 700 }}>수신자 선택</h4>
          <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>{selectedUsers.length}명 선택됨</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 교사 */}
          {teachers.length > 0 && (<>
            {renderGroupHeader('teacher', '교사', allTeacherIds, 'fi-rr-chalkboard-user', 0)}
            {expandKey('teacher') && Object.entries(teachersByDept).sort(([a], [b]) => a.localeCompare(b)).map(([dept, users]) => {
              const deptKey = `teacher-${dept}`
              const deptIds = getUsersInGroup(users)
              return (<div key={deptKey}>
                {renderGroupHeader(deptKey, dept, deptIds, 'fi-rr-building', 1)}
                {expandKey(deptKey) && users.sort((a: any, b: any) => a.name.localeCompare(b.name)).map(renderUser)}
              </div>)
            })}
          </>)}

          {/* 학생 - 추후 학생 롤 추가 시 아래 주석을 해제하세요. */}
          {/* {students.length > 0 && (<>
            {renderGroupHeader('student', '학생', allStudentIds, 'fi-rr-graduation-cap', 0)}
            {expandKey('student') && Object.entries(studentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
              const gradeKey = `student-${grade}`
              const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
              return (<div key={gradeKey}>
                {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                  const clsKey = `student-${grade}-${cls}`
                  const clsIds = getUsersInGroup(users)
                  return (<div key={clsKey}>
                    {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                    {expandKey(clsKey) && users.sort((a: any, b: any) => (a.number || 0) - (b.number || 0)).map(renderUser)}
                  </div>)
                })}
              </div>)
            })}
          </>)} */}

          {/* 학부모 - 추후 학부모 롤 추가 시 아래 주석을 해제하세요. */}
          {/* {parents.length > 0 && (<>
            {renderGroupHeader('parent', '학부모', allParentIds, 'fi-rr-users-alt', 0)}
            {expandKey('parent') && Object.entries(parentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
              const gradeKey = `parent-${grade}`
              const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
              return (<div key={gradeKey}>
                {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                  const clsKey = `parent-${grade}-${cls}`
                  const clsIds = getUsersInGroup(users)
                  return (<div key={clsKey}>
                    {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                    {expandKey(clsKey) && users.sort((a: any, b: any) => a.name.localeCompare(b.name)).map(renderUser)}
                  </div>)
                })}
              </div>)
            })}
          </>)} */}

          {allUsers.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>사용자 목록이 없습니다.</div>}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* 전체선택: 현재 교사(allTeacherIds)만 선택. 추후 확장 시 allUsers.map(u => u.id) 로 변경 */}
          <button onClick={() => setSelectedUsers(allTeacherIds)} className="btn-secondary" style={{ padding: '10px 16px', fontSize: 13 }}>전체선택</button>
          <button onClick={() => setSelectedUsers([])} className="btn-secondary" style={{ padding: '10px 16px', fontSize: 13 }}>선택해제</button>
          <button onClick={() => setShowRecipientModal(false)} className="btn-secondary" style={{ padding: '10px 20px' }} disabled={isSending}>취소</button>
          <button onClick={() => handleSend(false)} disabled={isSending} className="btn-primary" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, opacity: isSending ? 0.7 : 1 }}>
            {isSending && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
            {isSending ? '발송 중...' : '발송하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
