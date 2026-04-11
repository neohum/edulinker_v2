import { useState, useRef } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { apiFetch } from '../api'

export function useExcelImport({
  isAdmin,
  filterGrade,
  filterClass,
  user,
  loadLocalStudents,
  fetchStudents
}: any) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if ((window as any).go?.main?.App?.GetQueueLength) {
      try {
        const qLen = await (window as any).go.main.App.GetQueueLength()
        if (qLen > 0) {
          toast.warning('백그라운드 통신 작업이 남아있습니다. 잠시 후 상단 새로고침 아이콘을 누른 뒤 다시 시도해주세요.', { duration: 5000 })
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }
      } catch (err) { }
    }

    setImporting(true)
    setImportResult(null)

    if ((window as any).go?.main?.App?.InsertLocalStudent) {
      const reader = new FileReader()
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result
          const workbook = XLSX.read(bstr, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const data = XLSX.utils.sheet_to_json<any>(sheet)

          const effectiveGrade = isAdmin ? filterGrade : (user.grade || 0)
          const effectiveClass = isAdmin ? filterClass : (user.classNum || 0)

          let existingMap: Record<string, any> = {}
          try {
            if ((window as any).go?.main?.App?.GetLocalStudents) {
              const json = await (window as any).go.main.App.GetLocalStudents(effectiveGrade, effectiveClass)
              if (json && json !== '[]') {
                const list = JSON.parse(json)
                list.forEach((s: any) => {
                  const key = `${s.grade}_${s.class_num}_${s.number}`;
                  existingMap[key] = s;
                })
              }
            }
          } catch (e) { }

          let created = 0
          let updated = 0
          let skipped = 0

          for (const row of data) {
            const number = parseInt(row['번호'] || row['번'] || row['number'] || '')
            const name = String(row['성명'] || row['이름'] || row['name'] || '').trim()
            const gender = String(row['성별'] || row['gender'] || '').trim()

            const parentPhone = String(row['학부모 전화번호1'] || row['학부모전화번호'] || row['학부모전화번호1'] || row['연락처1'] || '').trim()
            const parentPhone2 = String(row['학부모 전화번호2'] || row['학부모전화번호2'] || row['연락처2'] || '').trim()

            if (isNaN(number) || !name) {
              skipped++;
              continue;
            }

            const targetGrade = isAdmin ? filterGrade : (user.grade || 0)
            const targetClass = isAdmin ? filterClass : (user.classNum || 0)

            const grade = targetGrade || 1
            const classNum = targetClass || 1
            const key = `${grade}_${classNum}_${number}`;

            if (existingMap[key]) {
              // Update existing local student
              const ex = existingMap[key]
              const updatedStudent = {
                ...ex,
                name,
                gender: gender || ex.gender,
                parent_phone: parentPhone || ex.parent_phone,
                parent_phone2: parentPhone2 || ex.parent_phone2,
              }
              await (window as any).go.main.App.UpdateLocalStudent(JSON.stringify(updatedStudent))
              updated++;
            } else {
              // Insert new local student
              const newStudent = {
                id: 'local_' + Date.now() + '_' + Math.random(),
                name, grade, class_num: classNum, number, gender,
                parent_phone: parentPhone, parent_phone2: parentPhone2,
                is_active: true
              }
              await (window as any).go.main.App.InsertLocalStudent(JSON.stringify(newStudent))
              created++;
            }
          }

          await loadLocalStudents(effectiveGrade, effectiveClass)

          setImportResult({ total: data.length, created, updated, skipped, errors: ['로컬 DB에 즉시 저장되었습니다. 화면에 곧바로 반영되며 백그라운드 동기화됩니다.'] })
          toast.success('로컬 환경에서 엑셀 대량 업로드가 완료되었습니다.')
        } catch (err) {
          console.error('Excel parse error:', err)
          setImportResult({ total: 0, created: 0, skipped: 0, errors: ['로컬 파싱 중 오류가 발생했습니다.'] })
        } finally {
          setImporting(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
      reader.readAsBinaryString(file)
    } else {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await apiFetch('/api/core/users/import-students', { method: 'POST', body: formData })
        const result = await res.json()
        setImportResult(result)
        fetchStudents()
      } catch (err) {
        toast.error('서버 연결 및 등록에 실패했습니다.')
      } finally {
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
  }

  return {
    importing,
    importResult,
    fileInputRef,
    handleFileUpload
  }
}
