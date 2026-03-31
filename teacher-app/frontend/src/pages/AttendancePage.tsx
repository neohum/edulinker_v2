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
}

interface AttendancePageProps {
  user?: UserInfo
}

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
  const [showStats, setShowStats] = useState(false);

  const [popover, setPopover] = useState<{ studentId: string; dateStr: string; record?: AttendanceRecord; x: number; y: number } | null>(null);

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
    
    // Hardcoded holidays
    const holidays = [
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

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
      const isHoliday = holidays.includes(dateStr);
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
  }, [])

  useEffect(() => {
    if (user) fetchMonthRecords(selectedYearMonth)
  }, [selectedYearMonth, user])

  const fetchStudents = async () => {
    try {
      let url = '/api/core/users?role=student&page_size=200'
      if (user?.grade) url += `&grade=${user.grade}`
      if (user?.classNum) url += `&class_num=${user.classNum}`

      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list: Student[] = (data.users || []).filter((s: any) =>
          (!user?.grade || s.grade === user.grade) && (!user?.classNum || s.class_num === user.classNum)
        )
        list.sort((a, b) => a.number - b.number)
        setStudents(list)
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
    const stats: { student: Student; events: { type: string, startDate: string, endDate: string, count: number, recordIds: string[], remark: string }[], yearlyExperienceCount: number }[] = [];
    const sortedStudents = [...students].sort((a,b) => a.number - b.number);
    
    for (const student of sortedStudents) {
      const sRecords = records.filter(r => r.student_id === student.id).sort((a,b) => a.date.localeCompare(b.date));
      if (sRecords.length === 0) continue;
      
      const events: { type: string, startDate: string, endDate: string, count: number, recordIds: string[], remark: string }[] = [];
      let currentEvent: any = null;
      
      for (const r of sRecords) {
        const rRemark = r.remark || (r.absence_type === '교외체험학습' ? '교외체험학습' : '');
        if (!currentEvent) {
          currentEvent = { type: r.absence_type, startDate: r.date, endDate: r.date, count: 1, recordIds: [r.id], remark: rRemark };
        } else {
          const startIdx = monthDays.findIndex(d => d.dateStr === currentEvent.endDate);
          const endIdx = monthDays.findIndex(d => d.dateStr === r.date);
          
          let isContinuous = false;
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            isContinuous = true;
            for (let i = startIdx + 1; i < endIdx; i++) {
              if (!monthDays[i].isDisabled) {
                isContinuous = false;
                break;
              }
            }
          }
          
          if (isContinuous && currentEvent.type === r.absence_type && currentEvent.remark === rRemark) {
            currentEvent.endDate = r.date;
            currentEvent.count += 1;
            currentEvent.recordIds.push(r.id);
          } else {
            events.push(currentEvent);
            currentEvent = { type: r.absence_type, startDate: r.date, endDate: r.date, count: 1, recordIds: [r.id], remark: rRemark };
          }
        }
      }
      if (currentEvent) events.push(currentEvent);
      
      const yearlyExperienceCount = yearlyRecords.filter(r => r.student_id === student.id && r.absence_type === '교외체험학습').length;
      
      stats.push({ student, events, yearlyExperienceCount });
    }
    return stats;
  }, [records, yearlyRecords, students, monthDays]);

  const handleCellClick = (e: React.MouseEvent, studentId: string, dateStr: string, isDisabled?: boolean) => {
    if (isDisabled) return;

    if (stampMode) {
      handleStampAttendance(studentId, dateStr, stampMode);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const record = getRecordForDate(studentId, dateStr);
    
    // Calculate popover position preventing off-screen overflow
    let x = rect.left;
    if (x + 280 > window.innerWidth) x = window.innerWidth - 280;
    
    let y = rect.bottom + 4;
    if (y + 190 > window.innerHeight) y = rect.top - 190 - 4; // popover displays above cell instead
    
    setPopover({ studentId, dateStr, record, x, y });
  }
  
  const handleSaveAttendance = async (absenceType: string) => {
    if (!popover) return;
    try {
      await (window as any).go.main.App.SaveAttendanceRecord(popover.studentId, popover.dateStr, absenceType);
      toast.success(`[${popover.dateStr}] ${absenceType} 처리되었습니다.`);
      setPopover(null);
      fetchMonthRecords(selectedYearMonth);
    } catch (e) {
      toast.error('저장 실패');
    }
  };

  const handleStampAttendance = async (studentId: string, dateStr: string, mode: string) => {
    try {
      if (mode === '초기화') {
        const record = getRecordForDate(studentId, dateStr);
        if (record) {
          await (window as any).go.main.App.DeleteAttendanceRecord(record.id);
          fetchMonthRecords(selectedYearMonth);
        }
      } else {
        await (window as any).go.main.App.SaveAttendanceRecord(studentId, dateStr, mode);
        fetchMonthRecords(selectedYearMonth);
      }
    } catch (e) {
      toast.error('단축 입력 실패: 오류');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await (window as any).go.main.App.DeleteAttendanceRecord(recordId);
      toast.success('초기화 (출석 상태) 되었습니다.');
      setPopover(null);
      fetchMonthRecords(selectedYearMonth);
    } catch (e) {
      toast.error('초기화에 실패했습니다.');
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case '병결':
      case '질병결석': return { bg: '#fee2e2', color: '#b91c1c', icon: 'fi-rr-stethoscope' };
      case '교외체험학습': return { bg: '#e0e7ff', color: '#4338ca', icon: 'fi-rr-car' };
      case '기타결석':
      case '기타': return { bg: '#fef3c7', color: '#a16207', icon: 'fi-rr-document' };
      case '인정결석': return { bg: '#dcfce7', color: '#15803d', icon: 'fi-rr-graduation-cap' };
      case '미인정결석': return { bg: '#fce7f3', color: '#be123c', icon: 'fi-rr-cross' };
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

      {/* Stamp Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1px solid #cbd5e1' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fi fi-rr-magic-wand" /> 연속 선택 옵션
        </div>
        <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 4px' }} />
        <button
          onClick={() => setStampMode(null)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: stampMode === null ? '#3b82f6' : 'white', color: stampMode === null ? 'white' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
        ><i className="fi fi-rr-pointer" /> 일반</button>
        
        <button
          onClick={() => setStampMode('질병결석')}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: stampMode === '질병결석' ? '#fee2e2' : 'white', color: stampMode === '질병결석' ? '#b91c1c' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
        ><i className="fi fi-rr-stethoscope" /> 병결</button>
        
        <button
          onClick={() => setStampMode('교외체험학습')}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: stampMode === '교외체험학습' ? '#e0e7ff' : 'white', color: stampMode === '교외체험학습' ? '#4338ca' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
        ><i className="fi fi-rr-car" /> 체험학습</button>
        
        <button
          onClick={() => setStampMode('기타결석')}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: stampMode === '기타결석' ? '#fef3c7' : 'white', color: stampMode === '기타결석' ? '#a16207' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
        ><i className="fi fi-rr-document" /> 기타결석</button>
        
        <button
          onClick={() => setStampMode('초기화')}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: stampMode === '초기화' ? '#f1f5f9' : 'white', color: stampMode === '초기화' ? '#475569' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
        ><i className="fi fi-rr-eraser" /> 지우개</button>

        <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 4px' }} />
        
        <button
          onClick={() => setShowStats(true)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', color: '#3b82f6', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        ><i className="fi fi-rr-stats" /> 통계보기/비고 입력</button>
      </div>

      <div style={{ flex: 1, background: 'white', borderRadius: 16, border: '1px solid #cbd5e1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800, border: '1px solid #cbd5e1' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 20, boxShadow: '0 1px 0 #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', minWidth: 140, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 30 }}>우리 반 학생</th>
                  {monthDays.map(d => {
                    let color = '#64748b'; // default grey
                    let dayColor = '#0f172a';
                    if (d.dayOfWeek === 0 || d.isHoliday) {
                      color = '#ef4444'; // red for Sunday & Holiday
                      dayColor = '#ef4444';
                    } else if (d.dayOfWeek === 6) {
                      color = '#3b82f6'; // blue for Saturday
                      dayColor = '#3b82f6';
                    }
                    
                    return (
                      <th key={d.dateStr} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color, minWidth: 45, borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', background: d.isDisabled ? '#f8fafc' : 'transparent' }}>
                        <div style={{ fontSize: 11, marginBottom: 2 }}>{dayOfWeekNames[d.dayOfWeek]}</div>
                        <div style={{ fontSize: 13, color: dayColor }}>{d.day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1', position: 'sticky', left: 0, background: 'white', zIndex: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 20 }}>{student.number}번</span>
                        <span style={{ fontSize: 14, color: '#1e293b' }}>{student.name}</span>
                      </div>
                    </td>
                    {monthDays.map(d => {
                      const record = getRecordForDate(student.id, d.dateStr);
                      const cellBg = d.isDisabled ? '#f1f5f9' : 'white';
                      return (
                        <td key={d.dateStr}
                          title={`${d.day}일 - ${student.number}번 ${student.name}${d.isDisabled ? ' (휴일/주말)' : ''}`}
                          onClick={(e) => handleCellClick(e, student.id, d.dateStr, d.isDisabled)}
                          style={{
                            padding: '4px',
                            textAlign: 'center',
                            borderRight: '1px solid #cbd5e1',
                            cursor: d.isDisabled ? 'not-allowed' : 'pointer',
                            background: cellBg,
                            transition: 'all 0.1s'
                          }}
                          onMouseOver={e => { if (!d.isDisabled) e.currentTarget.style.background = '#f8fafc' }}
                          onMouseOut={e => { if (!d.isDisabled) e.currentTarget.style.background = cellBg }}
                        >
                          <div style={{
                            width: '100%', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4
                          }}>
                            {record ? (
                                (() => {
                                  const typeLabel = record.absence_type || '결석';
                                  const style = getBadgeStyle(typeLabel);
                                  return (
                                    <div title={typeLabel} style={{ background: style.bg, color: style.color, fontSize: 13, padding: '4px', borderRadius: 4, width: '90%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <i className={`fi ${style.icon}`} />
                                    </div>
                                  )
                                })()
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={monthDays.length + 1} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      등록된 학생이 없거나 권한이 없습니다. (학생관리 페이지 확인)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {popover && (
        <>
          <div onClick={() => setPopover(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
          <div style={{
            position: 'fixed', top: popover.y, left: popover.x,
            background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', border: '1px solid #cbd5e1', zIndex: 1000, width: 260
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📅 {popover.dateStr} 출결 입력</span>
              <button onClick={() => setPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {['질병결석', '교외체험학습', '인정결석', '미인정결석', '기타결석'].map(type => (
                <button
                  key={type}
                  onClick={() => handleSaveAttendance(type)}
                  style={{
                    padding: '10px 8px', 
                    background: popover.record?.absence_type === type ? '#eff6ff' : '#f8fafc',
                    color: popover.record?.absence_type === type ? '#2563eb' : '#475569',
                    border: `1px solid ${popover.record?.absence_type === type ? '#93c5fd' : '#e2e8f0'}`,
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.1s'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            {popover.record && (
             <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <button onClick={() => handleDeleteRecord(popover.record!.id)} style={{ width: '100%', padding: '10px 8px', background: 'white', color: '#ef4444', border: '1px dashed #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  초기화 (정상 출석으로 변경)
                </button>
             </div>
            )}
          </div>
        </>
      )}

      {showStats && (
        <>
          <div onClick={() => setShowStats(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', border: '1px solid #cbd5e1', zIndex: 1000, width: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📊 {selectedYearMonth} 출결 통계 및 비고</span>
              <button onClick={() => setShowStats(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', paddingRight: 8 }}>
              {studentStats.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>해당 달에 등록된 출결/결석 기록이 없습니다.</div>
              ) : (
                studentStats.map(({ student, events, yearlyExperienceCount }) => (
                  <div key={student.id} style={{ marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#64748b' }}>{student.number}번</span> {student.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {events.map((ev, idx) => {
                        const style = getBadgeStyle(ev.type || '결석');
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '6px 12px', borderRadius: 6 }}>
                            <div style={{ background: style.bg, color: style.color, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className={`fi ${style.icon}`} /> {ev.type}
                            </div>
                            <span style={{ color: '#475569', fontWeight: 600, flex: 1 }}>
                              {ev.startDate === ev.endDate 
                                ? ev.startDate 
                                : `${ev.startDate} ~ ${ev.endDate}`}
                            </span>
                            <span style={{ color: '#3b82f6', fontWeight: 700, marginRight: 8, minWidth: 28, textAlign: 'right' }}>
                              {ev.count}일 {ev.type === '교외체험학습' && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 2 }}>( {yearlyExperienceCount})</span>}
                            </span>
                            <div style={{ flex: 1.5 }}>
                              <input 
                                type="text" 
                                className="remark-input"
                                defaultValue={ev.remark}
                                placeholder="비고 (엔터, 다음칸 자동 이동)"
                                onBlur={async (e) => {
                                  if (e.target.value !== ev.remark) {
                                    try {
                                      await (window as any).go.main.App.SaveAttendanceRemarks(ev.recordIds, e.target.value);
                                      toast.success('비고가 저장되었습니다.');
                                      fetchMonthRecords(selectedYearMonth);
                                    } catch(err) {
                                      toast.error('비고 저장 실패');
                                    }
                                  }
                                }}
                                onKeyDown={(e) => { 
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const inputs = Array.from(document.querySelectorAll('.remark-input')) as HTMLInputElement[];
                                    const idx = inputs.indexOf(e.currentTarget);
                                    if (idx !== -1 && idx < inputs.length - 1) {
                                      inputs[idx + 1].focus();
                                    } else {
                                      e.currentTarget.blur();
                                    }
                                  }
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
