export function StudentTable({
  students,
  loading,
  isProfileSet,
  allSelected,
  someSelected,
  toggleSelectAll,
  selectedIds,
  toggleSelect,
  parentEnabled,
  parentStatusMap
}: any) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중...</div>
  }

  if (students.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12 }}>
        <i className="fi fi-rr-users" style={{ fontSize: 36, display: 'block', marginBottom: 12 }} />
        {isProfileSet ? '등록된 학생이 없습니다.' : '프로필에서 학년과 반을 설정해주세요.'}
      </div>
    )
  }

  return (
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
          {students.map((s: any) => (
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
                const linkedPhones = new Set((ps?.parents || []).map((p: any) => p.phone.replace(/-/g, '')));

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexWrap: 'wrap' }}>
                      {p1 && (
                        <div title={p1} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: isLinked1 ? '#dcfce7' : '#fef3c7', color: isLinked1 ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: 11 }}>
                            <i className={isLinked1 ? "fi fi-rr-check" : "fi fi-rr-time-fast"} style={{ fontSize: 10 }} />
                            {p1} {isLinked1 ? '(연동됨)' : '(대기중)'}
                          </span>
                        </div>
                      )}
                      {p2 && (
                        <div title={p2} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: isLinked2 ? '#dcfce7' : '#fef3c7', color: isLinked2 ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: 11 }}>
                            <i className={isLinked2 ? "fi fi-rr-check" : "fi fi-rr-time-fast"} style={{ fontSize: 10 }} />
                            {p2} {isLinked2 ? '(연동됨)' : '(대기중)'}
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
