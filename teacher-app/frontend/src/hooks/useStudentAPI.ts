import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

export function useStudentAPI({ user, isAdmin, filterGrade, filterClass, setIsOfflineMode, setShowAddModal, setAddForm, setAddError, setAdding, setEditStudent, fetchStudentsRef, loadLocalStudentsRef }: any) {
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [parentEnabled, setParentEnabled] = useState(false)
  const [parentStatusMap, setParentStatusMap] = useState<Record<string, any>>({})

  const checkParentPlugin = async () => {
    try {
      const res = await apiFetch('/api/core/plugins')
      if (res.ok) {
        const test = await apiFetch('/api/parent/student-links?grade=0&class_num=0')
        const isParentOn = test.ok
        setParentEnabled(isParentOn)
        localStorage.setItem('parent_plugin_enabled', isParentOn ? 'true' : 'false')
        if (isParentOn) fetchParentStatus()
      } else throw new Error('fetch missed')
    } catch {
      if (localStorage.getItem('parent_plugin_enabled') !== 'false') {
        setParentEnabled(true)
        fetchParentStatus()
      } else {
        setParentEnabled(false)
      }
    }
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
        const list = await res.json()
        const map: Record<string, any> = {}
        list.forEach((s: any) => { map[s.student_id] = s })
        setParentStatusMap(map)
        localStorage.setItem(`parent_status_cache_${g}_${c}`, JSON.stringify(map))
      } else throw new Error('Fetch failed')
    } catch {
      const g = isAdmin ? filterGrade : (user.grade || 0)
      const c = isAdmin ? filterClass : (user.classNum || 0)
      try {
        const cached = localStorage.getItem(`parent_status_cache_${g}_${c}`)
        if (cached) setParentStatusMap(JSON.parse(cached))
      } catch (e) { }
    }
  }

  const loadLocalStudents = async (g: number, c: number) => {
    if ((window as any).go?.main?.App?.GetLocalStudents) {
      const json = await (window as any).go.main.App.GetLocalStudents(g, c)
      if (json && json !== '[]') {
        try { setStudents(JSON.parse(json)) } catch (e) { }
      } else {
        setStudents([])
      }
    }
  }

  const fetchStudents = async () => {
    const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
    const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)
    if (effectiveGrade === 0 || effectiveClass === 0) { setStudents([]); setLoading(false); return }

    try {
      setLoading(true)
      await loadLocalStudents(effectiveGrade, effectiveClass)
    } finally {
      setLoading(false)
    }

    // Fire background sync without blocking the UI
    syncNetworkStudents(effectiveGrade, effectiveClass)
  }

  const syncNetworkStudents = async (effectiveGrade: number, effectiveClass: number) => {
    if (user?.isOffline || !navigator.onLine) { setIsOfflineMode(true); return }
    try {
      let url = '/api/core/users?role=student&page_size=100'
      if (effectiveGrade > 0) url += `&grade=${effectiveGrade}`
      if (effectiveClass > 0) url += `&class_num=${effectiveClass}`
      const res = await apiFetch(url)

      if (res.ok) {
        const data = await res.json()
        let list = data.users || []
        if (effectiveGrade > 0) list = list.filter((s: any) => s.grade === effectiveGrade)
        if (effectiveClass > 0) list = list.filter((s: any) => s.class_num === effectiveClass)
        list.sort((a: any, b: any) => a.number - b.number)
        setIsOfflineMode(false)

        if ((window as any).go?.main?.App?.SyncLocalStudentsConfig) {
          await (window as any).go.main.App.SyncLocalStudentsConfig(effectiveGrade, effectiveClass, JSON.stringify(list))
          // Only trigger a re-render from local DB if local DB data changed (or simply reload blindly in background)
          await loadLocalStudents(effectiveGrade, effectiveClass)
        } else {
          setStudents(list)
        }
      } else throw new Error('Server non-ok response')
    } catch {
      setIsOfflineMode(true)
    }
  }

  // Bind refs so other hooks can use them
  useEffect(() => {
    if (fetchStudentsRef) fetchStudentsRef.current = fetchStudents
    if (loadLocalStudentsRef) loadLocalStudentsRef.current = loadLocalStudents
  }, [filterGrade, filterClass])

  const handleDeleteClass = async () => {
    const delGrade = isAdmin ? filterGrade : (user.grade || 0)
    const delClass = isAdmin ? filterClass : (user.classNum || 0)
    if (delGrade === 0 || delClass === 0) { toast.warning('삭제할 학년과 반을 선택해주세요.'); return }
    toast(`${delGrade}학년 ${delClass}반 학생 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            if ((window as any).go?.main?.App?.ClearLocalClass) {
              await (window as any).go.main.App.ClearLocalClass(delGrade, delClass)
              toast.success('학생 정보가 로컬 저장소 상에서 완전히 삭제되었습니다. 차후 온라인일 때 동기화됩니다.');
              await loadLocalStudents(delGrade, delClass)
            } else {
              const res = await apiFetch(`/api/core/users/students-by-class?grade=${delGrade}&class_num=${delClass}`, { method: 'DELETE' })
              if (res.ok) { const data = await res.json(); toast.success(data.message); fetchStudents() }
              else throw new Error('Delete Failed')
            }
          } catch (e) { toast.error('로컬 삭제 실패.') }
        }
      }, duration: 10000,
    })
  }

  const handleAddStudent = async (addForm: any) => {
    const { grade, classNum, number, name, gender, parent_phone, parent_phone2 } = addForm
    if (!grade || grade === '0' || !classNum || classNum === '0' || !number || !name.trim()) {
      setAddError('학년, 반, 번호, 이름을 모두 입력해주세요.'); return
    }
    setAdding(true)
    const payloadBody = { grade: parseInt(grade), class_num: parseInt(classNum), number: parseInt(number), name: name.trim(), gender, parent_phone: parent_phone?.trim(), parent_phone2: parent_phone2?.trim() }
    try {
      const g = parseInt(grade), c = parseInt(classNum), n = parseInt(number)
      if (isNaN(g) || isNaN(c) || isNaN(n) || g < 1 || c < 1 || n < 1) {
        setAddError('학년, 반, 번호는 1 이상의 숫자여야 합니다.'); setAdding(false); return
      }

      if ((window as any).go?.main?.App?.InsertLocalStudent) {
        const newStudent = { id: 'local_' + Date.now(), name: payloadBody.name, grade: payloadBody.grade, class_num: payloadBody.class_num, number: payloadBody.number, gender: payloadBody.gender, parent_phone: payloadBody.parent_phone, parent_phone2: payloadBody.parent_phone2, is_active: true }
        await (window as any).go.main.App.InsertLocalStudent(JSON.stringify(newStudent))
        setShowAddModal(false); setAddForm({ grade: '', classNum: '', number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
        toast.success('기록되었습니다. 오프라인이더라도 서버 연결 시 자동 반영됩니다.')
        await loadLocalStudents(g, c)
      } else {
        const res = await apiFetch('/api/core/users/add-student', { method: 'POST', body: JSON.stringify(payloadBody) })
        const data = await res.json()
        if (!res.ok) { setAddError(data.error || '학생 등록에 실패했습니다.'); return }
        setShowAddModal(false); setAddForm({ grade: '', classNum: '', number: '', name: '', gender: '', parent_phone: '', parent_phone2: '' })
        fetchStudents()
      }
    } catch {
      setAddError('오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const handleEditStudent = async (editStudent: any, editForm: any, setEditError: any, setEditing: any) => {
    setEditError('')
    const { number, name, gender, parent_phone, parent_phone2 } = editForm
    if (!number || !name.trim()) { setEditError('번호와 이름을 입력해주세요.'); return }
    setEditing(true)
    const payload = { name: name.trim(), number: parseInt(number), gender, parent_phone: parent_phone.trim(), parent_phone2: parent_phone2.trim() }
    try {
      if ((window as any).go?.main?.App?.UpdateLocalStudent) {
        const studentCopy = { ...editStudent, ...payload }
        await (window as any).go.main.App.UpdateLocalStudent(JSON.stringify(studentCopy))
        setEditStudent(null)
        toast.success('로컬 업데이트 완료 (서버 자동 동기화)')
        const g = isAdmin ? filterGrade : (user.grade || 0)
        const c = isAdmin ? filterClass : (user.classNum || 0)
        await loadLocalStudents(g, c)
      } else {
        const res = await apiFetch(`/api/core/users/${editStudent.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        if (res.ok) { toast.success('학생 정보가 수정되었습니다.'); setEditStudent(null); fetchStudents() }
        else { const data = await res.json(); throw new Error(data.error || '수정에 실패했습니다.') }
      }
    } catch {
      toast.error('수정 처리 중 오류가 발생했습니다.')
    } finally {
      setEditing(false)
    }
  }

  return {
    students, loading, parentEnabled, parentStatusMap,
    checkParentPlugin, fetchStudents, loadLocalStudents, handleDeleteClass, handleAddStudent, handleEditStudent
  }
}
