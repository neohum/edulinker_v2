import React, { useState, useEffect } from 'react'

interface TargetTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: any[];
  currentTargets: string[];
  onApply: (newTargets: string[]) => void;
}

export default function TargetTreeModal({ isOpen, onClose, allUsers, currentTargets, onApply }: TargetTreeModalProps) {
  const [expandedNodes, setExpandedNodes] = useState<string[]>(['TEACHER', 'STUDENT', 'PARENT'])
  const [draftUsers, setDraftUsers] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      let expanded: string[] = []
      if (currentTargets.includes('ALL')) {
         expanded = allUsers.map(u => u.id)
      } else {
         allUsers.forEach(u => {
            let match = false
            if (currentTargets.includes(`USER_${u.id}`)) match = true
            else if (currentTargets.includes('TEACHER') && ['teacher','admin'].includes(u.role)) match = true
            else if (['teacher','admin'].includes(u.role) && currentTargets.includes(`TEACHER_${u.department || '미배정'}`)) match = true
            else if (u.role === 'student') {
               if (currentTargets.includes('STUDENT')) match = true
               else if (currentTargets.includes(`STUDENT_${u.grade}`)) match = true
               else if (currentTargets.includes(`STUDENT_${u.grade}_${u.class_num}`)) match = true
            }
            else if (u.role === 'parent') {
               if (currentTargets.includes('PARENT')) match = true
               else if (currentTargets.includes(`PARENT_${u.grade}`)) match = true
               else if (currentTargets.includes(`PARENT_${u.grade}_${u.class_num}`)) match = true
            }
            if (match) expanded.push(u.id)
         })
      }
      setDraftUsers(expanded)
    }
  }, [isOpen, currentTargets, allUsers])

  if (!isOpen) return null

  const expandKey = (key: string) => expandedNodes.includes(key)
  const toggleExpand = (key: string) => setExpandedNodes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const teachers = allUsers.filter(u => ['teacher', 'admin'].includes(u.role))
  const students = allUsers.filter(u => u.role === 'student')
  const parents = allUsers.filter(u => u.role === 'parent')

  const teachersByDept: Record<string, any[]> = {}
  teachers.forEach(u => {
    const dept = u.department || '미배정'
    if (!teachersByDept[dept]) teachersByDept[dept] = []
    teachersByDept[dept].push(u)
  })

  const groupByGradeClass = (users: any[]) => {
    const byGrade: Record<number, Record<number, any[]>> = {}
    users.forEach(u => {
      const g = u.grade || 0
      const c = u.class_num || 0
      if (!byGrade[g]) byGrade[g] = {}
      if (!byGrade[g][c]) byGrade[g][c] = []
      byGrade[g][c].push(u)
    })
    return byGrade
  }

  const studentTree = groupByGradeClass(students)
  const parentTree = groupByGradeClass(parents)

  const isAllSelected = (ids: string[]) => ids.length > 0 && ids.every(id => draftUsers.includes(id))
  const isSomeSelected = (ids: string[]) => ids.some(id => draftUsers.includes(id))
  
  const toggleGroup = (ids: string[]) => {
    if (isAllSelected(ids)) setDraftUsers(prev => prev.filter(id => !ids.includes(id)))
    else setDraftUsers(prev => [...new Set([...prev, ...ids])])
  }

  const handleConfirmTarget = () => {
    let compacted: string[] = []
    const teacherIds = teachers.map(u=>u.id)
    if (teacherIds.length > 0 && teacherIds.every(id => draftUsers.includes(id))) compacted.push('TEACHER')
    else {
      Object.entries(teachersByDept).forEach(([dept, deptUsers]) => {
        const dIds = deptUsers.map(u=>u.id)
        if (dIds.length > 0 && dIds.every(id => draftUsers.includes(id))) compacted.push(`TEACHER_${dept}`)
        else dIds.forEach(id => { if (draftUsers.includes(id)) compacted.push(`USER_${id}`) })
      })
    }
    
    const studentIds = students.map(u=>u.id)
    if (studentIds.length > 0 && studentIds.every(id => draftUsers.includes(id))) compacted.push('STUDENT')
    else {
      Object.entries(studentTree).forEach(([g, classes]) => {
        const gIds = Object.values(classes).flat().map((u:any)=>u.id)
        if (gIds.length > 0 && gIds.every((id:string) => draftUsers.includes(id))) compacted.push(`STUDENT_${g}`)
        else {
          Object.entries(classes).forEach(([c, cUsers]) => {
            const cIds = (cUsers as any[]).map(u=>u.id)
            if (cIds.length > 0 && cIds.every(id => draftUsers.includes(id))) compacted.push(`STUDENT_${g}_${c}`)
            else cIds.forEach(id => { if (draftUsers.includes(id)) compacted.push(`USER_${id}`) })
          })
        }
      })
    }

    const parentIds = parents.map(u=>u.id)
    if (parentIds.length > 0 && parentIds.every(id => draftUsers.includes(id))) compacted.push('PARENT')
    else {
      Object.entries(parentTree).forEach(([g, classes]) => {
        const gIds = Object.values(classes).flat().map((u:any)=>u.id)
        if (gIds.length > 0 && gIds.every((id:string) => draftUsers.includes(id))) compacted.push(`PARENT_${g}`)
        else {
          Object.entries(classes).forEach(([c, cUsers]) => {
            const cIds = (cUsers as any[]).map(u=>u.id)
            if (cIds.length > 0 && cIds.every(id => draftUsers.includes(id))) compacted.push(`PARENT_${g}_${c}`)
            else cIds.forEach(id => { if (draftUsers.includes(id)) compacted.push(`USER_${id}`) })
          })
        }
      })
    }
    
    if (compacted.includes('TEACHER') && compacted.includes('STUDENT') && compacted.includes('PARENT')) compacted = ['ALL']
    if (compacted.length === 0) compacted = ['ALL']
    
    onApply(compacted)
  }

  const renderUser = (u: any) => (
    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', borderRadius: 8, background: draftUsers.includes(u.id) ? '#eff6ff' : 'transparent', marginLeft: 36, transition: 'background 0.2s' }} onMouseOver={e=> {if(!draftUsers.includes(u.id)) e.currentTarget.style.background='#f8fafc'}} onMouseOut={e=>{if(!draftUsers.includes(u.id)) e.currentTarget.style.background='transparent'}}>
      <input type="checkbox" checked={draftUsers.includes(u.id)} onChange={e => {
        if (e.target.checked) setDraftUsers(p => [...p, u.id])
        else setDraftUsers(p => p.filter(id => id !== u.id))
      }} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
      <span style={{ fontSize: 13 }}>{u.name}</span>
      {u.number > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.number}번</span>}
      {u.position && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.position}</span>}
    </label>
  )

  const renderGroupHeader = (key: string, label: string, userIds: string[], icon: string, depth: number) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', borderRadius: 8, background: expandKey(key) ? '#f8fafc' : 'transparent', marginLeft: depth * 12, transition: 'background 0.2s' }} onClick={() => toggleExpand(key)} onMouseOver={e=> {if(!expandKey(key)) e.currentTarget.style.background='#f8fafc'}} onMouseOut={e=>{if(!expandKey(key)) e.currentTarget.style.background='transparent'}}>
      <i className={`fi ${expandKey(key) ? 'fi-rr-angle-down' : 'fi-rr-angle-right'}`} style={{ fontSize: 11, color: '#94a3b8', width: 14, textAlign: 'center' }} />
      <input type="checkbox" checked={isAllSelected(userIds)} ref={el => { if (el) el.indeterminate = !isAllSelected(userIds) && isSomeSelected(userIds) }} onClick={e => e.stopPropagation()} onChange={() => toggleGroup(userIds)} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
      {icon && <i className={`fi ${icon}`} style={{ fontSize: 13, color: '#64748b' }} />}
      <span style={{ fontSize: 14, fontWeight: isAllSelected(userIds) ? 700 : 600, color: isAllSelected(userIds) ? '#1e293b' : '#334155' }}>{label}</span>
      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{userIds.length}명</span>
    </div>
  )

  const allTeacherIds = teachers.map(u => u.id)
  const allStudentIds = students.map(u => u.id)
  const allParentIds = parents.map(u => u.id)
  const allIds = allUsers.map(u => u.id)

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 2000, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
         <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>설문 대상 상세 선택</h3>
           <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}><i className="fi fi-rr-cross-small" /></button>
         </div>
         
         <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderRadius: 8, background: '#f8fafc' }} onClick={() => toggleGroup(allIds)}>
              <input type="checkbox" checked={isAllSelected(allIds)} ref={el => { if(el) el.indeterminate = !isAllSelected(allIds) && isSomeSelected(allIds) }} onChange={() => {}} onClick={(e)=>e.stopPropagation()} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>전체 (교직원·학생·학부모)</span>
            </div>
            <div style={{ height: 1, background: '#f1f5f9', margin: '8px 0' }} />

            {teachers.length > 0 && (<>
              {renderGroupHeader('TEACHER', '교직원', allTeacherIds, 'fi-rr-chalkboard-user', 0)}
              {expandKey('TEACHER') && Object.entries(teachersByDept).sort(([a], [b]) => a.localeCompare(b)).map(([dept, users]) => {
                const deptKey = `TEACHER_${dept}`
                const deptIds = users.map(u=>u.id)
                return (<div key={deptKey}>
                  {renderGroupHeader(deptKey, dept, deptIds, 'fi-rr-building', 1)}
                  {expandKey(deptKey) && users.sort((a: any, b: any) => a.name.localeCompare(b.name)).map(renderUser)}
                </div>)
              })}
            </>)}
            
            {students.length > 0 && (<>
              {renderGroupHeader('STUDENT', '학생', allStudentIds, 'fi-rr-graduation-cap', 0)}
              {expandKey('STUDENT') && Object.entries(studentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
                const gradeKey = `STUDENT_${grade}`
                const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
                return (<div key={gradeKey}>
                  {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                  {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                    const clsKey = `STUDENT_${grade}_${cls}`
                    const clsIds = (users as any[]).map(u=>u.id)
                    return (<div key={clsKey}>
                      {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                      {expandKey(clsKey) && (users as any[]).sort((a: any, b: any) => (a.number || 0) - (b.number || 0)).map(renderUser)}
                    </div>)
                  })}
                </div>)
              })}
            </>)}

            {parents.length > 0 && (<>
              {renderGroupHeader('PARENT', '학부모', allParentIds, 'fi-rr-users-alt', 0)}
              {expandKey('PARENT') && Object.entries(parentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
                const gradeKey = `PARENT_${grade}`
                const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
                return (<div key={gradeKey}>
                  {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                  {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                    const clsKey = `PARENT_${grade}_${cls}`
                    const clsIds = (users as any[]).map(u=>u.id)
                    return (<div key={clsKey}>
                      {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                      {expandKey(clsKey) && (users as any[]).sort((a: any, b: any) => (a.number || 0) - (b.number || 0)).map(renderUser)}
                    </div>)
                  })}
                </div>)
              })}
            </>)}
         </div>
         
         <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
           <button onClick={handleConfirmTarget} className="btn-primary" style={{ padding: '10px 32px', borderRadius: 8, fontWeight: 600, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer' }}>확인 및 적용 ({draftUsers.length}명)</button>
         </div>
      </div>
    </div>
  )
}
