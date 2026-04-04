import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'

interface Student {
  id: string
  name: string
  number: number
  grade: number
  class_num: number
}

interface OpinionRecord {
  id: string
  student_id: string
  content: string
  created_at: string
}

interface BehaviorOpinionPageProps {
  user?: UserInfo
}

export default function BehaviorOpinionPage({ user }: BehaviorOpinionPageProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [opinions, setOpinions] = useState<OpinionRecord[]>([])
  const [loading, setLoading] = useState(true)

  const abortControllerRef = useRef<AbortController | null>(null)
  const abortBatchRef = useRef<boolean>(false)
  const [generating, setGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number, name: string } | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const timerRef = useRef<any>(null)

  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<Student | null>(null)
  const [studentHistories, setStudentHistories] = useState<OpinionRecord[]>([])
  const [clipboardMode, setClipboardMode] = useState(false)

  const toggleClipboardMode = () => {
    const nextMode = !clipboardMode
    setClipboardMode(nextMode)
    try {
      if ((window as any).runtime && (window as any).runtime.WindowSetAlwaysOnTop) {
        (window as any).runtime.WindowSetAlwaysOnTop(nextMode)
      }
    } catch (e) { }

    if (nextMode) {
      toast.success('나이스 자동 클립보드 켜짐 (항상 위 고정)\n학생 칸을 누르면 즉시 복사됩니다!', { duration: 4000 })
    } else {
      toast.error('자동 클립보드 모드가 해제되었습니다.')
    }
  }

  const openHistory = async (student: Student) => {
    setSelectedHistoryStudent(student)
    try {
      const hData = await (window as any).go.main.App.GetOpinionHistories(student.id)
      setStudentHistories(hData || [])
    } catch (e) {
      toast.error('히스토리 로드 실패')
    }
  }

  const restoreHistory = async (studentId: string, content: string) => {
    if (!window.confirm('이전 내용으로 되돌리시겠습니까? 현재 작성된 내용은 히스토리에 보관됩니다.')) return

    try {
      const existing = getOpinionForStudent(studentId)
      if (existing && existing.trim() !== '') {
        await (window as any).go.main.App.SaveOpinionHistory(studentId, existing.trim())
      }

      await (window as any).go.main.App.SaveOpinionRecord(studentId, content)
      setOpinions(prev => {
        const idx = prev.findIndex(o => o.student_id === studentId)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = { ...next[idx], content }
          return next
        }
        return [...prev, { id: 'temp-' + studentId, student_id: studentId, content, created_at: new Date().toISOString() }]
      })
      toast.success('선택한 이전 기록으로 복구되었습니다.')
      setSelectedHistoryStudent(null)
    } catch (e: any) {
      toast.error('복구 실패: ' + e.message)
    }
  }

  const deleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('해당 히스토리 기록을 삭제하시겠습니까?')) return
    try {
      if ((window as any).go.main.App.DeleteOpinionHistory) {
        await (window as any).go.main.App.DeleteOpinionHistory(id)
      } else {
        toast.error('앱 백엔드가 아직 업데이트되지 않았습니다. 잠시 후 시도해주세요.')
        return
      }
      setStudentHistories(prev => prev.filter(h => h.id !== id))
      toast.success('기록이 삭제되었습니다.')
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message)
    }
  }

  const startTimer = () => {
    setElapsedSecs(0)
    if (timerRef.current) clearInterval(timerRef.current)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - start) / 1000))
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const handleCancel = () => {
    abortBatchRef.current = true
    if (abortControllerRef.current) abortControllerRef.current.abort()
    setGenerating(false)
    setBatchProgress(null)
    stopTimer()
    toast.info('자동 생성이 취소되었습니다.')
  }

  const handleAutoGenerate = async () => {
    if (students.length === 0) {
      toast.error('등록된 학생이 없습니다.')
      return
    }

    if (!window.confirm('모든 학생에 대해 새로운 초안이 일괄 생성됩니다.\n(기존에 작성된 내용들은 자동으로 히스토리에 보관됩니다)\n계속 진행하시겠습니까?')) return

    setGenerating(true)
    abortBatchRef.current = false
    startTimer()

    try {
      let modelToUse = 'gemma3:4b'
      try {
        const res = await apiFetch('/api/core/ai/status')
        if (res.ok) {
          const data = await res.json()
          const models = data.models || []
          const fastPriority = ['exaone3.5:2.4b', 'gemma3:4b', 'llama3.2:3b', 'qwen2.5:3b', 'mistral', 'gemma2:2b']
          for (const p of fastPriority) {
            const found = models.find((m: string) => m.toLowerCase().includes(p))
            if (found && !found.toLowerCase().includes('70b') && !found.toLowerCase().includes('32b')) {
              modelToUse = found
              break
            }
          }
        }
      } catch (e) { }

      let allEvals: any[] = []
      try {
        allEvals = await (window as any).go.main.App.GetCurriculumEvaluations() || []
      } catch (e) { }

      let count = 0
      for (const student of students) {
        if (abortBatchRef.current) break

        const existing = getOpinionForStudent(student.id)
        if (existing && existing.trim() !== '') {
          await (window as any).go.main.App.SaveOpinionHistory(student.id, existing.trim())
        }

        setBatchProgress({ current: count + 1, total: students.length, name: student.name })

        let cLogs = []
        try {
          cLogs = await (window as any).go.main.App.GetCounselingRecords(student.id) || []
        } catch (e) { }

        const eLogs = allEvals.filter((e: any) => e.student_id === student.id)

        let context = `[${student.number}번 ${student.name} 학생]\n`
        context += `- 상담 기록: ` + (!cLogs || cLogs.length === 0 ? '없음' : cLogs.map((c: any) => `${c.counseling_date?.split('T')[0] || ''} [${c.category}] 내용: ${c.content}`).join(' | ')) + '\n'
        context += `- 평가 기록: ` + (!eLogs || eLogs.length === 0 ? '없음' : eLogs.map((e: any) => `[${e.evaluation_type}] ${e.subject} ${e.score}점 ${e.feedback ? '- ' + e.feedback : ''}`).join(' | ')) + '\n'

        const prompt = `당신은 초등학교 교사입니다. 다음 학생의 [상담 기록]과 [평가 기록]만을 바탕으로 교육부 '학교생활기록부 기재요령'을 엄격하게 준수하여 <행동특성 및 종합의견>을 작성하세요.

[필수 작성 규칙]
1. 반드시 모든 문장은 '-함.', '-임.', '-보임.', '-함양함.' 등 명사형 종결어미로 끝내야 합니다. ('~습니다', '~해요' 절대 금지)
2. 줄바꿈 없이 하나의 문단(단락)으로만 작성하세요. 
3. 글머리 기호(-, *, 1. 등)나 소제목을 절대 사용하지 마세요.
4. 인사말, 부연 설명, 인사치레 없이 오직 300자 내외의 종합의견 본문 텍스트만 출력하세요.
5. 부정적인 내용이 있다면 이를 극복하기 위한 노력이나 긍정적인 변화 과정으로 순화하여 구체적으로 작성하세요.
6. 사교육 유발 요인이 큰 항목(어학시험 성적, 각종 교외상, 부모의 사회·경제적 지위 암시 등)은 일절 기재 금지합니다.
7. 특정 대학명, 기관명, 상호명 등도 명시적/암시적으로 절대로 기재하지 마세요.
8. 학생의 학교폭력 관련 기재 사항은 종합의견 영역에 절대 섞어서 포함시키지 마세요.
9. 작성 시 학생의 이름(성명)을 본문에 절대 직접 언급하거나 포함시키지 마세요.
10. '국어', '수학' 등 특정 교과목 명칭을 노출하여 언급하지 마세요. (예: '국어 시간에~' -> '학습 및 토론 활동 시~' 등으로 대체)

[올바른 작성 예시]
학업에 대한 열정이 높고 수업 시간에 항상 집중하는 태도를 보임. 교우 관계가 원만하여 친구들의 의견을 잘 경청하고 배려하는 등 타인을 존중하는 자세를 갖춤. 발표 및 토론 활동 시 논리적으로 자신의 주장을 펼치는 능력이 탁월함. 때때로 과제 제출 기한을 놓치는 경우가 있으나 스스로 플래너를 작성하며 개선하려는 의지를 보임.

-----------------
[학생 데이터]
${context}

[위 학생에 대한 종합의견 작성본 (오직 본문만 출력)]`

        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
          // Use Wails native binding to bypass browser CORS headers
          const wailsApp = (window as any).go.main.App
          if (!wailsApp || !wailsApp.GenerateAISync) {
            throw new Error("Wails 백엔드 AI 메서드를 찾을 수 없습니다. (앱을 다시 빌드해주세요)")
          }

          const opinion = await wailsApp.GenerateAISync(modelToUse, prompt)
          const trimmedOpinion = opinion?.trim() || ''

          if (trimmedOpinion) {
            await wailsApp.SaveOpinionRecord(student.id, trimmedOpinion)
            setOpinions(prev => {
              const idx = prev.findIndex(o => o.student_id === student.id)
              if (idx !== -1) {
                const next = [...prev]
                next[idx] = { ...next[idx], content: trimmedOpinion }
                return next
              }
              return [...prev, { id: 'temp-' + student.id, student_id: student.id, content: trimmedOpinion, created_at: new Date().toISOString() }]
            })
          }
        } catch (genError: any) {
          throw new Error(genError.message || String(genError))
        }

        count++
      }

      if (!abortBatchRef.current) {
        toast.success(`학생들 행동특성 자동 완성이 종료되었습니다!`)
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        toast.error('생성 중 오류 발생: ' + e.message)
      }
    } finally {
      if (!abortBatchRef.current) {
        setGenerating(false)
        setBatchProgress(null)
        stopTimer()
      }
      abortControllerRef.current = null
    }
  }

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Students
      let url = '/api/core/users?role=student&page_size=200'
      if (user?.grade) url += `&grade=${user.grade}`
      if (user?.classNum) url += `&class_num=${user.classNum}`

      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || []).filter((s: any) =>
          (!user?.grade || s.grade === user.grade) && (!user?.classNum || s.class_num === user.classNum)
        ).sort((a: any, b: any) => a.number - b.number)
        setStudents(list)
      }

      // 2. Fetch Opinions from Local DB
      const localData = await (window as any).go.main.App.GetOpinionRecords()
      if (localData) {
        setOpinions(localData)
      }

    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const getOpinionForStudent = (studentId: string) => {
    return opinions.find(o => o.student_id === studentId)?.content || ''
  }

  const handleBlur = async (studentId: string, content: string) => {
    const existing = getOpinionForStudent(studentId)
    if (existing === content) return // No change

    try {
      await (window as any).go.main.App.SaveOpinionRecord(studentId, content)
      toast.success('저장되었습니다.')

      setOpinions(prev => {
        const idx = prev.findIndex(o => o.student_id === studentId)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = { ...next[idx], content }
          return next
        }
        return [...prev, { id: 'temp', student_id: studentId, content, created_at: new Date().toISOString() }]
      })
    } catch (e: any) {
      toast.error('저장 실패: ' + e.message)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fi fi-rr-document-signed" style={{ color: 'var(--accent-blue)' }} /> 행동특성 및 종합의견 관리
          </h2>

          {!generating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleAutoGenerate}
                disabled={students.length === 0}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(to right, #10b981, #059669)', color: 'white', padding: '8px 14px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: students.length === 0 ? 'not-allowed' : 'pointer', opacity: students.length === 0 ? 0.6 : 1, whiteSpace: 'nowrap', fontSize: 14 }}
              >
                <i className="fi fi-rr-magic-wand" /> ✨ AI 일괄 자동 생성
              </button>
              <button
                onClick={toggleClipboardMode}
                disabled={students.length === 0}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: clipboardMode ? '#f59e0b' : 'white', color: clipboardMode ? 'white' : 'var(--text)', border: clipboardMode ? '1px solid #f59e0b' : '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: students.length === 0 ? 'not-allowed' : 'pointer', opacity: students.length === 0 ? 0.6 : 1, whiteSpace: 'nowrap', fontSize: 14, transition: 'all 0.2s' }}
              >
                <i className="fi fi-rr-copy" /> 📋 나이스 자동 클립보드 {clipboardMode ? 'ON' : 'OFF'}
              </button>
            </div>
          ) : (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, background: '#f1f5f9', padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                {batchProgress ? `실시간 개별 생성 중... (${batchProgress.current}/${batchProgress.total} - ${batchProgress.name})` : '실시간 생성 중...'}
                <span style={{ marginLeft: 8, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{elapsedSecs}s</span>
              </div>
              <button onClick={handleCancel} style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12, background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>취소</button>
            </div>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          학생별 행동특성 및 종합의견을 작성하고 관리합니다. AI를 활용해 클릭 한 번으로 수집된 상담/수행평가 기록을 토대로 종합의견을 스케치할 수 있습니다.
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 16px', borderWidth: 2 }} />
            데이터를 불러오는 중입니다...
          </div>
        ) : students.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>👨‍🎓</div>
            조회된 학생이 없습니다. 학생관리 메뉴에서 먼저 학생을 등록해주세요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {students.map((student, idx) => (
              <div
                key={student.id}
                style={{
                  display: 'flex',
                  borderBottom: idx === students.length - 1 ? 'none' : '1px solid var(--border)',
                  background: idx % 2 === 0 ? 'white' : '#f8fafc'
                }}
              >
                <div style={{ width: 180, padding: 20, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{user?.grade}학년 {user?.classNum}반</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        <span style={{ color: 'var(--accent-blue)', marginRight: 6 }}>{student.number}번</span>
                        {student.name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => openHistory(student)}
                    style={{ background: 'white', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
                  >
                    <i className="fi fi-rr-time-past" /> 기존 기록 (히스토리)
                  </button>
                </div>
                <div style={{ flex: 1, padding: 20, position: 'relative' }}>
                  <textarea
                    defaultValue={getOpinionForStudent(student.id)}
                    onBlur={(e) => handleBlur(student.id, e.target.value)}
                    placeholder={`${student.name} 학생의 행동특성 및 종합의견을 입력하세요...`}
                    style={{
                      width: '100%',
                      minHeight: 100,
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
                  />
                  {clipboardMode && (
                    <div
                      onClick={() => {
                        const text = getOpinionForStudent(student.id)
                        if (!text) {
                          toast.error('복사할 내용이 없습니다.', { id: 'copy-toast' })
                          return
                        }
                        navigator.clipboard.writeText(text)
                        toast.success(`[${student.name}] 복사 완료! 나이스 창에 붙여넣으세요.`, { id: 'copy-toast' })
                      }}
                      style={{
                        position: 'absolute', top: 20, left: 20, right: 20, bottom: 20,
                        background: 'rgba(245, 158, 11, 0.1)', cursor: 'pointer',
                        border: '2px dashed #f59e0b', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(2px)', transition: 'all 0.1s'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)'}
                      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.99)'}
                      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <div style={{ background: '#f59e0b', color: 'white', padding: '12px 24px', borderRadius: 30, fontWeight: 700, fontSize: 16, boxShadow: '0 4px 12px rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fi fi-rr-copy" /> 클릭하여 복사하기
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedHistoryStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fi fi-rr-time-past" style={{ color: 'var(--accent-blue)' }} /> {selectedHistoryStudent.name} 학생 작성 히스토리
              </h3>
              <button
                onClick={() => setSelectedHistoryStudent(null)}
                style={{ background: 'transparent', border: 'none', fontSize: 28, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {studentHistories.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>보관된 이전 기록이 없습니다.</div>
              ) : (
                studentHistories.map((h, i) => (
                  <div key={h.id || i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                        🕒 {new Date(h.created_at).toLocaleString('ko-KR')} 보관됨
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={(e) => deleteHistory(h.id, e)}
                          title="기록 삭제"
                          style={{ background: 'white', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#ef4444', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#ef4444' }}
                          onMouseOut={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#fecaca' }}
                        ><i className="fi fi-rr-trash" /></button>
                        <button
                          onClick={() => restoreHistory(selectedHistoryStudent.id, h.content)}
                          style={{ background: 'white', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--primary)', transition: 'all 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >이 기록으로 복구</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {h.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
