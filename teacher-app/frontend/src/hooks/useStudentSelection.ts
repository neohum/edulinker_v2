import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

export function useStudentSelection({
  students,
  isAdmin,
  filterGrade,
  filterClass,
  user,
  openEditModal,
  loadLocalStudents,
  fetchStudents
}: any) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        const student = students.find((s: any) => s.id === id)
        if (student) openEditModal(student)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(students.map((s: any) => s.id)))
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    toast(`선택한 학생 ${selectedIds.size}명을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          const idsArr = Array.from(selectedIds)
          const payload = { ids: idsArr }
          try {
            if ((window as any).go?.main?.App?.DeleteLocalStudentBatch) {
              await (window as any).go.main.App.DeleteLocalStudentBatch(idsArr)
              toast.success('로컬에서 학생이 삭제되었습니다. 온라인 시 자동 동기화됩니다.')
              setSelectedIds(new Set())
              const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
              const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)
              await loadLocalStudents(effectiveGrade, effectiveClass)
            } else {
              const res = await apiFetch('/api/core/users/delete-students-batch', {
                method: 'POST', body: JSON.stringify(payload)
              })
              if (res.ok) {
                const data = await res.json();
                toast.success(data.message);
                fetchStudents()
              } else {
                throw new Error('Delete batch non-ok')
              }
            }
          } catch (e) {
            toast.error('삭제 처리 중 오류가 발생했습니다.')
          }
        }
      },
      duration: 10000,
    })
  }

  const handleEditSelectedSingle = () => {
    if (selectedIds.size !== 1) { toast.warning('수정할 학생을 1명만 선택해주세요.'); return }
    const id = Array.from(selectedIds)[0]
    const student = students.find((s: any) => s.id === id)
    if (student) openEditModal(student)
  }

  return {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    handleDeleteSelected,
    handleEditSelectedSingle
  }
}
