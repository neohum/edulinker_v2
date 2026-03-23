import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

type DBUser = {
  id: string; name: string; phone: string; role: string;
  grade: number; class_num: number; number: number; gender: string; student_name: string;
  school_name: string; is_active: boolean; created_at: string; position?: string;
};

export default function UserManagement() {
  const [activeUsers, setActiveUsers] = useState<DBUser[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<DBUser[]>([]);
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [searchName, setSearchName] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const isInitialLoad = useRef(true);

  const fetchUsers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const wapp = (window as any).go?.main?.App;
      if (wapp?.GetDBUsers) {
        const [active, inactive] = await Promise.all([
          wapp.GetDBUsers(),
          wapp.GetInactiveDBUsers?.() ?? [],
        ]);
        setActiveUsers(prev => {
          // Only update if data actually changed to avoid unnecessary re-renders
          const next = active || [];
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
        setInactiveUsers(prev => {
          const next = inactive || [];
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
    } catch (err) {
      if (!silent) toast.error('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  };

  useEffect(() => {
    fetchUsers();
    // Silent background refresh every 30s — no spinner, no flicker
    const timer = setInterval(() => fetchUsers(true), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Listen for real-time WebSocket parent_link notifications
  useEffect(() => {
    const ws = (window as any).__edulinkerWS as WebSocket | undefined;
    if (!ws) return;
    const handler = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.plugin_id === 'parent_link' && msg?.payload?.event === 'parent_linked') {
          toast.success(`🔔 ${msg.payload.message}`, { duration: 5000 });
          fetchUsers(true); // silent — only updates rows that changed
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, []);

  /* ── handlers ── */
  const handleDeactivate = (id: string, name: string) => {
    toast(`"${name}"을(를) 비활성화하시겠습니까?`, {
      action: {
        label: '비활성화',
        onClick: async () => {
          try {
            await (window as any).go.main.App.DeleteDBUser(id);
            toast.success(`${name} 비활성화 완료`);
            fetchUsers();
          } catch (err: any) { toast.error(`실패: ${err.message || err}`); }
        }
      },
      cancel: { label: '취소', onClick: () => { } }
    });
  };

  const handleReactivate = (id: string, name: string) => {
    toast(`"${name}"을(를) 재활성화하시겠습니까?`, {
      action: {
        label: '재활성화',
        onClick: async () => {
          try {
            await (window as any).go.main.App.ReactivateDBUser(id);
            toast.success(`${name} 재활성화 완료`);
            fetchUsers();
          } catch (err: any) { toast.error(`실패: ${err.message || err}`); }
        }
      },
      cancel: { label: '취소', onClick: () => { } }
    });
  };

  const handleHardDelete = (id: string, name: string) => {
    toast.warning(`"${name}"을(를) 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다!`, {
      action: {
        label: '영구 삭제',
        onClick: async () => {
          try {
            await (window as any).go.main.App.HardDeleteDBUser(id);
            toast.success(`${name} 영구 삭제 완료`);
            fetchUsers();
          } catch (err: any) { toast.error(`실패: ${err.message || err}`); }
        }
      },
      cancel: { label: '취소', onClick: () => { } }
    });
  };

  const handleResetPassword = (id: string) => {
    toast.custom((t) => (
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-[320px]">
        <h3 className="font-bold mb-2">비밀번호 변경</h3>
        <p className="text-xs text-slate-500 mb-3">초기화할 새 비밀번호를 입력해주세요.</p>
        <div className="flex gap-2">
          <input id={`pw-${id}`} type="password" placeholder="새 비밀번호"
            className="flex-1 w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button onClick={async () => {
            const el = document.getElementById(`pw-${id}`) as HTMLInputElement;
            if (!el?.value) { toast.error('비밀번호를 입력해주세요.'); return; }
            try {
              await (window as any).go.main.App.ResetDBUserPassword(id, el.value);
              toast.success('비밀번호가 초기화되었습니다.');
              toast.dismiss(t);
            } catch (err: any) { toast.error(`변경 실패: ${err.message || err}`); }
          }} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors">적용</button>
        </div>
      </div>
    ));
  };

  const handleEditPosition = (id: string, currentPosition?: string) => {
    toast.custom((t) => (
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-[320px]">
        <h3 className="font-bold mb-2">직위 / 직책 설정</h3>
        <p className="text-xs text-slate-500 mb-3">사용자에게 교장, 교감 등의 직위를 부여합니다.</p>
        <div className="flex gap-2">
          <input id={`pos-${id}`} type="text" placeholder="예: 교장, 교감, 부장교사" defaultValue={currentPosition || ''}
            className="flex-1 w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button onClick={async () => {
            const el = document.getElementById(`pos-${id}`) as HTMLInputElement;
            try {
              await (window as any).go.main.App.UpdateDBUserPosition(id, el.value);
              toast.success('직위가 변경되었습니다.');
              toast.dismiss(t);
              fetchUsers();
            } catch (err: any) { toast.error(`변경 실패: ${err.message || err}`); }
          }} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors">저장</button>
          <button onClick={() => toast.dismiss(t)} className="px-3 py-1.5 bg-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-300">취소</button>
        </div>
      </div>
    ));
  };

  /* ── filter logic ── */
  const applyFilters = (list: DBUser[]) => list.filter(u => {
    if (searchName && !u.name.includes(searchName)) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterGrade && u.grade !== parseInt(filterGrade)) return false;
    if (filterClass && u.class_num !== parseInt(filterClass)) return false;
    return true;
  });

  const currentList = tab === 'active' ? activeUsers : inactiveUsers;
  const filtered = applyFilters(currentList);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const paginated = filtered.slice((page - 1) * 20, page * 20);

  useEffect(() => { setPage(1); }, [searchName, filterRole, filterGrade, filterClass, tab]);

  const roleBadge = (role: string) => {
    if (role === 'admin') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (role === 'teacher') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
    if (role === 'parent') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  };

  const formatGender = (g: string) => {
    if (!g) return '';
    const lower = g.toLowerCase();
    if (lower === 'm' || lower === 'male' || lower === '남자') return '남';
    if (lower === 'f' || lower === 'female' || lower === '여자') return '여';
    return g;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <header className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">사용자 관리</h2>
        <button onClick={() => fetchUsers()} className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2">
          새로고침
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('active')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'active' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}>
          활성 사용자 <span className="ml-1 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">{activeUsers.length}</span>
        </button>
        <button onClick={() => setTab('inactive')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'inactive' ? 'bg-white dark:bg-slate-700 shadow text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}>
          비활성 사용자 <span className="ml-1 text-xs bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full">{inactiveUsers.length}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-2 flex flex-col md:flex-row gap-3 shadow-sm">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <i className="fi fi-rr-search text-slate-400"></i>
          <input type="text" placeholder="이름 검색" value={searchName} onChange={e => setSearchName(e.target.value)}
            className="w-full text-sm outline-none bg-transparent dark:text-slate-200" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200">
          <option value="">모든 역할</option>
          <option value="student">학생</option>
          <option value="teacher">교사</option>
          <option value="admin">관리자</option>
          <option value="parent">학부모</option>
        </select>
        <input type="number" placeholder="학년" value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
          className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200" min="1" max="6" />
        <input type="number" placeholder="반" value={filterClass} onChange={e => setFilterClass(e.target.value)}
          className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200" min="1" max="20" />
      </div>

      {tab === 'inactive' && (
        <p className="text-sm text-amber-700 dark:text-amber-400 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/30 bg-amber-50 dark:bg-amber-900/10 flex items-center gap-2">
          <i className="fi fi-rr-info" />
          비활성 사용자는 로그인이 불가능합니다. 재활성화하거나 영구 삭제할 수 있습니다.
          <strong className="ml-1 text-rose-600">영구 삭제는 복구 불가입니다.</strong>
        </p>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500 flex-1 flex items-center justify-center">
          <i className="fi fi-rr-spinner animate-spin text-2xl" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-y-auto flex-1 shadow-sm">
          <table className="w-full text-sm text-left align-middle relative">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0 backdrop-blur-sm z-10">
              <tr>
                <th className="px-4 py-3 font-semibold w-32">이름</th>
                <th className="px-4 py-3 font-semibold w-24">역할</th>
                <th className="px-4 py-3 font-semibold w-48">상세 정보</th>
                <th className="px-4 py-3 font-semibold w-32">전화번호</th>
                <th className="px-4 py-3 font-semibold text-right w-52">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginated.map(u => (
                <tr key={u.id} className={`transition-colors ${tab === 'inactive' ? 'opacity-60 hover:opacity-100' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'}`}>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded inline-flex text-xs font-semibold ${roleBadge(u.role)}`}>
                      {u.role === 'admin' ? '관리자' : u.role === 'teacher' ? '교사' : u.role === 'student' ? '학생' : u.role === 'parent' ? '학부모' : u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {u.role === 'student' ? (
                      u.grade ? `${u.grade}학년 ${u.class_num}반 ${u.number}번${formatGender(u.gender) ? ` (${formatGender(u.gender)})` : ''}` : '-'
                    ) : u.role === 'parent' ? (
                      u.grade ? `${u.grade}학년 ${u.class_num}반 ${u.number}번 (${u.student_name || '자녀 미연동'})` : '-'
                    ) : (
                      (u.grade ? `${u.grade}학년 ${u.class_num}반 ` : '') + (u.position ? `[${u.position}]` : '') || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums">{u.phone}</td>
                  <td className="px-4 py-3 text-right flex justify-end gap-1">
                    {tab === 'active' ? (
                      <>
                        {u.role === 'teacher' && (
                          <button onClick={() => handleEditPosition(u.id, u.position)}
                            className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/10 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded font-medium transition-colors">
                            직위
                          </button>
                        )}
                        <button onClick={() => handleResetPassword(u.id)}
                          className="text-xs px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-medium transition-colors">
                          비밀번호
                        </button>
                        <button onClick={() => handleDeactivate(u.id, u.name)}
                          className="text-xs px-2.5 py-1.5 bg-amber-50 text-amber-600 dark:bg-amber-900/10 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded font-medium transition-colors">
                          비활성화
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleReactivate(u.id, u.name)}
                          className="text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded font-medium transition-colors">
                          재활성화
                        </button>
                        <button onClick={() => handleHardDelete(u.id, u.name)}
                          className="text-xs px-2.5 py-1.5 bg-rose-50 text-rose-600 dark:bg-rose-900/10 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded font-medium transition-colors">
                          영구삭제
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <i className="fi fi-rr-folder-open text-3xl opacity-50 mb-3 block" />
                    {tab === 'active' ? '등록된 사용자가 없습니다.' : '비활성화된 사용자가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 rounded-lg text-sm transition-colors shadow-sm">이전</button>
          <span className="text-sm font-semibold">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 rounded-lg text-sm transition-colors shadow-sm">다음</button>
        </div>
      )}
    </div>
  );
}
