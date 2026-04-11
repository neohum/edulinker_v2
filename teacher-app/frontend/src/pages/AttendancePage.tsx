import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { apiFetch, getToken } from '../api'

interface UserInfo {
  name: string
  school: string
  department?: string
  role: string
  grade?: number
  classNum?: number
}

interface Student {
  id: string
  name: string
  grade: number
  class_num: number
  number: number
}

interface AttendanceRecord {
  id: string
  student_id: string
  type: string
  reason: string
  is_confirmed: boolean
  date: string
  start_date?: string
  end_date?: string
  absence_type?: string
  remark?: string
  document_submitted?: boolean
  counted_days?: number
  has_app?: boolean
  has_report?: boolean
  has_abs_report?: boolean
}

interface AttendancePageProps {
  user?: UserInfo
}

const HARDCODED_HOLIDAYS = [
  '2026-03-02', // 3.1절 대체휴무
  '2026-05-05', // 어린이날
  '2026-05-25', // 부처님오신날 대체휴무
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석 연휴
  '2026-10-03', // 개천절
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
];

export default function AttendancePage({ user }: AttendancePageProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [yearlyRecords, setYearlyRecords] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  // Date State
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [stampMode, setStampMode] = useState<string | null>(null);

  // Event Registration Modal State
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    studentId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    absenceType: '질병결석',
    remark: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Month Selector Tabs (March to Feb)
  const currentAcademicYear = useMemo(() => {
    const today = new Date();
    return today.getMonth() < 2 ? today.getFullYear() - 1 : today.getFullYear();
  }, []);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 3; i <= 14; i++) {
      const y = i > 12 ? currentAcademicYear + 1 : currentAcademicYear;
      const m = i > 12 ? i - 12 : i;
      options.push({ label: `${m}월`, value: `${y}-${String(m).padStart(2, '0')}` });
    }
    return options;
  }, [currentAcademicYear]);

  // Generate days including weekends and holidays
  const monthDays = useMemo(() => {
    const [yearStr, monthStr] = selectedYearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
      const isHoliday = HARDCODED_HOLIDAYS.includes(dateStr);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      days.push({
        dateStr,
        day: d,
        dayOfWeek,
        isDisabled: isWeekend || isHoliday,
        isHoliday,
      });
    }
    return days;
  }, [selectedYearMonth]);

  useEffect(() => {
    fetchStudents()
  }, [user])

  useEffect(() => {
    if (user) fetchMonthRecords(selectedYearMonth)
  }, [selectedYearMonth, user])

  const fetchStudents = async () => {
    const grade = user?.grade || 0
    const classNum = user?.classNum || 0
    if (!grade || !classNum) {
      setStudents([])
      return
    }

    try {
      // Offline-first Local SQLite Data
      if ((window as any).go?.main?.App?.GetLocalStudents) {
        const json = await (window as any).go.main.App.GetLocalStudents(grade, classNum)
        if (json && json !== '[]') {
          try {
            const list = JSON.parse(json)
            setStudents(list)
          } catch (e) { }
        }
      }
    } finally {
      // Background sync starts hereafter
    }

    syncNetworkStudents(grade, classNum)
  }

  const syncNetworkStudents = async (grade: number, classNum: number) => {
    if (!navigator.onLine) return
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (grade) url += `&grade=${grade}`
      if (classNum) url += `&class_num=${classNum}`

      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || []).filter((s: any) =>
          (!grade || s.grade === grade) && (!classNum || s.class_num === classNum)
        )
        list.sort((a, b) => a.number - b.number)

        if ((window as any).go?.main?.App?.SyncLocalStudentsConfig) {
          await (window as any).go.main.App.SyncLocalStudentsConfig(grade, classNum, JSON.stringify(list))
          // Refresh from local db
          const json = await (window as any).go.main.App.GetLocalStudents(grade, classNum)
          if (json && json !== '[]') {
            try { setStudents(JSON.parse(json)) } catch (e) { }
          }
        } else {
          setStudents(list)
        }
      }
    } catch (e) { console.error(e) }
  }

  const getSchoolYear = (ym: string) => {
    const [y, m] = ym.split('-');
    let year = parseInt(y, 10);
    if (parseInt(m, 10) < 3) year -= 1;
    return year;
  }

  const fetchMonthRecords = async (ym: string) => {
    setLoading(true)
    try {
      const schoolYear = getSchoolYear(ym);
      const [mData, yData] = await Promise.all([
        (window as any).go.main.App.GetMonthAttendanceRecords(ym),
        (window as any).go.main.App.GetSchoolYearRecords(schoolYear)
      ]);
      setRecords(mData || [])
      setYearlyRecords(yData || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const getRecordForDate = (studentId: string, dateStr: string) => {
    return records.find(r => r.student_id === studentId && r.date === dateStr);
  }

  const studentStats = useMemo(() => {
    const stats: { student: Student; events: { type: string, startDate: string, endDate: string, count: number, recordIds: string[], remark: string, records: AttendanceRecord[] }[], yearlyExperienceCount: number }[] = [];
    const sortedStudents = [...students].sort((a, b) => a.number - b.number);

    const checkContinuous = (d1: string, d2: string) => {
      let d = new Date(d1);
      const end = new Date(d2);
      d.setDate(d.getDate() + 1);
      while (d < end) {
        const dStr = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !HARDCODED_HOLIDAYS.includes(dStr)) {
          return false; // Found a valid missing school day, so they are not continuous
        }
        d.setDate(d.getDate() + 1);
      }
      return true;
    }

    for (const student of sortedStudents) {
      const sRecords = yearlyRecords.filter(r => r.student_id === student.id).sort((a, b) => a.date.localeCompare(b.date));
      if (sRecords.length === 0) continue;

      const allEvents: { type: string, startDate: string, endDate: string, count: number, recordIds: string[], remark: string, records: AttendanceRecord[] }[] = [];
      let currentEvent: any = null;

      for (const r of sRecords) {
        const rRemark = r.remark || (r.absence_type === '교외체험학습' ? '교외체험학습' : '');
        if (!currentEvent) {
          currentEvent = { type: r.absence_type, startDate: r.date, endDate: r.date, count: 1, recordIds: [r.id], remark: rRemark, records: [r] };
        } else {
          const isCont = checkContinuous(currentEvent.endDate, r.date);
          if (isCont && currentEvent.type === r.absence_type && currentEvent.remark === rRemark) {
            currentEvent.endDate = r.date;
            currentEvent.count += 1;
            currentEvent.recordIds.push(r.id);
            currentEvent.records.push(r);
          } else {
            allEvents.push(currentEvent);
            currentEvent = { type: r.absence_type, startDate: r.date, endDate: r.date, count: 1, recordIds: [r.id], remark: rRemark, records: [r] };
          }
        }
      }
      if (currentEvent) allEvents.push(currentEvent);

      // Filter events to only show those that intersect with the selected month
      const events = allEvents.filter(ev => ev.records.some(r => r.date.startsWith(selectedYearMonth)));

      const yearlyExperienceCount = yearlyRecords.filter(r => r.student_id === student.id && r.absence_type === '교외체험학습').length;

      if (events.length > 0) {
        stats.push({ student, events, yearlyExperienceCount });
      }
    }
    return stats;
  }, [yearlyRecords, students, selectedYearMonth]);

  const handleCellClick = (e: React.MouseEvent, studentId: string, dateStr: string, isDisabled?: boolean) => {
    if (isDisabled) return;

    // Instead of popover, populate and open the Event Modal for that cell's date and student
    setEventForm({
      studentId,
      startDate: dateStr,
      endDate: dateStr,
      absenceType: '질병결석',
      remark: ''
    });
    setShowEventModal(true);
  }

  const handleSaveEvent = async () => {
    if (!eventForm.studentId) {
      toast.error('학생을 선택해주세요.');
      return;
    }

    const start = new Date(eventForm.startDate);
    const end = new Date(eventForm.endDate);

    if (end < start) {
      toast.error('종료일이 시작일보다 빠를 수 없습니다.');
      return;
    }

    setSubmitting(true);
    let currentDate = new Date(start);
    let successCount = 0;

    try {
      while (currentDate <= end) {
        const dateStr = [
          currentDate.getFullYear(),
          String(currentDate.getMonth() + 1).padStart(2, '0'),
          String(currentDate.getDate()).padStart(2, '0')
        ].join('-');

        // Skip weekends and holidays
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6 && !HARDCODED_HOLIDAYS.includes(dateStr)) {
          await (window as any).go.main.App.SaveAttendanceRecord(eventForm.studentId, dateStr, eventForm.absenceType);
          successCount++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (successCount === 0) {
        toast.warning('선택한 기간이 모두 주말(휴일)이어서 등록되지 않았습니다.');
      } else {
        toast.success(`${successCount}일 치 출결이 정상 등록되었습니다.`);
      }

      setShowEventModal(false);
      fetchMonthRecords(selectedYearMonth);
    } catch (e: any) {
      toast.error('출결 등록에 실패했습니다: ' + (e.message || String(e)));
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await (window as any).go.main.App.DeleteAttendanceRecord(recordId);
      toast.success('초기화 (출석 상태) 되었습니다.');
      fetchMonthRecords(selectedYearMonth);
    } catch (e) {
      toast.error('초기화에 실패했습니다.');
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case '병결':
      case '질병결석':
      case '질병♡': return { bg: '#fee2e2', color: '#b91c1c', icon: 'fi-rr-stethoscope' };
      case '교외체험학습': return { bg: '#e0e7ff', color: '#4338ca', icon: 'fi-rr-car' };
      case '기타결석':
      case '기타':
      case '기타▲': return { bg: '#fef3c7', color: '#a16207', icon: 'fi-rr-document' };
      case '인정결석':
      case '출석인정△': return { bg: '#dcfce7', color: '#15803d', icon: 'fi-rr-graduation-cap' };
      case '미인정결석':
      case '미인정♥': return { bg: '#fce7f3', color: '#be123c', icon: 'fi-rr-cross' };
      default: return { bg: '#f1f5f9', color: '#475569', icon: 'fi-rr-calendar-check' };
    }
  };

  const dayOfWeekNames = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{ padding: 24, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 22, fontWeight: 700 }}><i className="fi fi-rr-calendar-check" style={{ marginRight: 8 }} />월별 출결 현황</h3>

        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
          {monthOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelectedYearMonth(opt.value)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: 'none',
                background: selectedYearMonth === opt.value ? 'white' : 'transparent',
                fontWeight: selectedYearMonth === opt.value ? 700 : 500,
                color: selectedYearMonth === opt.value ? '#3b82f6' : '#64748b',
                boxShadow: selectedYearMonth === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1px solid #cbd5e1', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fi fi-rr-calendar-lines" /> 캘린더 등록 (이벤트 방식)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setEventForm({
                studentId: students[0]?.id || '',
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date().toISOString().slice(0, 10),
                absenceType: '질병결석',
                remark: ''
              });
              setShowEventModal(true);
            }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 4px rgba(99,102,241,0.2)' }}
          ><i className="fi fi-rr-plus" /> 출결 등록</button>
        </div>
      </div>

      <div style={{ flex: 1, background: 'white', borderRadius: 16, border: '1px solid #cbd5e1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f8fafc' }}>
            {studentStats.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: 16, border: '1px dashed #cbd5e1' }}>
                <i className="fi fi-rr-magic-wand" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
                해당 월에 등록된 출결/결석 내역이 없습니다.<br />
                우측 상단의 [출결 등록] 버튼을 눌러 추가해보세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {studentStats.map(({ student, events, yearlyExperienceCount }) => (
                  <div key={student.id} style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#64748b', fontSize: 14 }}>{student.number}번</span> {student.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {events.map((ev, idx) => {
                        const style = getBadgeStyle(ev.type || '결석');
                        const hasApp = ev.records.some(r => r.has_app);
                        const hasReport = ev.records.some(r => r.has_report);
                        const hasAbsReport = ev.records.some(r => r.has_abs_report);

                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f1f5f9', padding: '12px 16px', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                              <div style={{ background: style.bg, color: style.color, fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, minWidth: 100, justifyContent: 'center' }}>
                                <i className={`fi ${style.icon}`} /> {ev.type}
                              </div>
                              <span style={{ color: '#334155', fontWeight: 600, width: 180 }}>
                                {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`}
                              </span>
                              <span style={{ color: '#3b82f6', fontWeight: 700, minWidth: 60, display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  defaultValue={ev.count}
                                  onBlur={async (e) => {
                                    let newVal = parseFloat(e.target.value);
                                    if (isNaN(newVal) || newVal < 0) {
                                      e.target.value = String(ev.count);
                                      return;
                                    }
                                    if (newVal !== ev.count) {
                                      try {
                                        await (window as any).go.main.App.SaveAttendanceDays(ev.recordIds, newVal);
                                        toast.success('결석 일수가 수정되었습니다.');
                                        fetchMonthRecords(selectedYearMonth);
                                      } catch (err) {
                                        toast.error('수정 실패');
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  style={{ width: 46, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 4, textAlign: 'center', marginRight: 4, color: '#3b82f6', fontWeight: 700, fontSize: 13, background: 'white' }}
                                />일
                                {ev.type === '교외체험학습' && (
                                  <span style={{ color: '#ef4444', fontSize: 12, marginLeft: 8, background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
                                    누적: {yearlyExperienceCount}일
                                  </span>
                                )}
                              </span>
                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  className="remark-input"
                                  defaultValue={ev.remark}
                                  placeholder="비고 입력 (엔터 저장)"
                                  onBlur={async (e) => {
                                    if (e.target.value !== ev.remark) {
                                      try {
                                        await (window as any).go.main.App.SaveAttendanceRemarks(ev.recordIds, e.target.value);
                                        toast.success('비고가 저장되었습니다.');
                                        fetchMonthRecords(selectedYearMonth);
                                      } catch (err) {
                                        toast.error('비고 저장 실패');
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none' }}
                                />
                              </div>
                              <button
                                onClick={async () => {
                                  if (window.confirm('해당 기록을 일괄 삭제(정상출석 처리)하시겠습니까?')) {
                                    try {
                                      for (const rId of ev.recordIds) {
                                        await (window as any).go.main.App.DeleteAttendanceRecord(rId);
                                      }
                                      toast.success('기록이 삭제되었습니다.');
                                      fetchMonthRecords(selectedYearMonth);
                                    } catch (err) {
                                      toast.error('삭제 실패');
                                    }
                                  }
                                }}
                                style={{ background: 'white', border: '1px solid #fecaca', color: '#ef4444', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <i className="fi fi-rr-trash" />
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 112, fontSize: 13, color: '#475569' }}>
                              {ev.type === '교외체험학습' ? (
                                <>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                    <input type="checkbox" defaultChecked={hasApp} onChange={async (e) => {
                                      try { await (window as any).go.main.App.SaveAttendanceDocs(ev.recordIds, 'app', e.target.checked); fetchMonthRecords(selectedYearMonth); } catch (err) { }
                                    }} style={{ accentColor: '#3b82f6', width: 14, height: 14 }} /> 신청서 제출
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                    <input type="checkbox" defaultChecked={hasReport} onChange={async (e) => {
                                      try { await (window as any).go.main.App.SaveAttendanceDocs(ev.recordIds, 'report', e.target.checked); fetchMonthRecords(selectedYearMonth); } catch (err) { }
                                    }} style={{ accentColor: '#3b82f6', width: 14, height: 14 }} /> 결과보고서 제출
                                  </label>
                                </>
                              ) : (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                  <input type="checkbox" defaultChecked={hasAbsReport} onChange={async (e) => {
                                    try { await (window as any).go.main.App.SaveAttendanceDocs(ev.recordIds, 'abs_report', e.target.checked); fetchMonthRecords(selectedYearMonth); } catch (err) { }
                                  }} style={{ accentColor: '#3b82f6', width: 14, height: 14 }} /> 결석신고서 (또는 기타 증빙) 제출
                                </label>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event Registration Modal */}
      {showEventModal && (
        <>
          <div onClick={() => setShowEventModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #cbd5e1', zIndex: 1000, width: 400
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📅 출결 등록</span>
              <button onClick={() => setShowEventModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>종속 학생</label>
                <select
                  value={eventForm.studentId}
                  onChange={e => setEventForm(f => ({ ...f, studentId: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                >
                  {students.map(s => <option key={s.id} value={s.id}>{s.number}번 {s.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>시작일</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={e => setEventForm(f => ({ ...f, startDate: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>종료일</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={e => setEventForm(f => ({ ...f, endDate: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>결석 유형</label>
                <select
                  value={eventForm.absenceType}
                  onChange={e => setEventForm(f => ({ ...f, absenceType: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                >
                  <option value="질병결석">질병결석 / 병결</option>
                  <option value="미인정결석">미인정결석 / 무단</option>
                  <option value="기타결석">기타결석</option>
                  <option value="인정결석">인정결석 (경조사 등)</option>
                  <option value="교외체험학습">교외체험학습</option>
                </select>
              </div>

              {eventForm.absenceType === '교외체험학습' && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#92400e', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                    <i className="fi fi-rr-info" /> 교외체험학습 최근 출결 지침 안내
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>
                      <strong style={{ color: '#dc2626' }}>해당 학생 현재 누적: {yearlyRecords.filter(r => r.student_id === eventForm.studentId && r.absence_type === '교외체험학습').length}일</strong>
                      <div style={{ fontSize: 11, color: '#b45309' }}>(* 학교 학칙상 연간 인정 일수(통상 15~20일) 초과 시 모두 미인정결석 처리됩니다.)</div>
                    </li>
                    <li>학원 무단수강 및 해외 어학연수는 명백한 <strong>미인정결석</strong> 사유입니다.</li>
                    <li>연속 5일 이상 등 장기 체험학습 시 교사의 주기적 안전 통화가 필수입니다.</li>
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowEventModal(false)}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveEvent}
                  disabled={submitting}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? '저장 중...' : '출결 등록'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
