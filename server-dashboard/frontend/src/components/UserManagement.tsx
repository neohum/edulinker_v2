import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [searchName, setSearchName] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const fetchUsers = async () => {
    try {
      const wapp = (window as any).go?.main?.App;
      if (wapp?.GetDBUsers) {
        const data = await wapp.GetDBUsers();
        setUsers(data || []);
      }
    } catch (err) {
      toast.error('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = (id: string, name: string) => {
    toast(`사용자 ${name} (이)를 삭제하시겠습니까?`, {
      action: {
        label: '삭제 확인',
        onClick: async () => {
          try {
            const wapp = (window as any).go?.main?.App;
            if (wapp?.DeleteDBUser) {
              await wapp.DeleteDBUser(id);
              toast.success(`사용자 ${name} 삭제 완료`);
              fetchUsers();
            }
          } catch (err: any) {
            toast.error(`삭제 실패: ${err.message || err}`);
          }
        }
      },
      cancel: {
        label: '취소',
        onClick: () => { }
      }
    });
  };

  const handleResetPassword = (id: string) => {
    toast.custom((t) => (
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-[320px]">
        <h3 className="font-bold mb-2">비밀번호 변경</h3>
        <p className="text-xs text-slate-500 mb-3">초기화할 새 비밀번호를 입력해주세요.</p>
        <div className="flex gap-2">
          <input id={`pw-${id}`} type="password" placeholder="새 비밀번호" className="flex-1 w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button
            onClick={async () => {
              const el = document.getElementById(`pw-${id}`) as HTMLInputElement;
              const newPw = el?.value;
              if (!newPw) {
                toast.error('비밀번호를 입력해주세요.');
                return;
              }
              try {
                const wapp = (window as any).go?.main?.App;
                if (wapp?.ResetDBUserPassword) {
                  await wapp.ResetDBUserPassword(id, newPw);
                  toast.success('비밀번호가 초기화되었습니다.');
                  toast.dismiss(t);
                }
              } catch (err: any) {
                toast.error(`변경 실패: ${err.message || err}`);
              }
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    ));
  };

  const filteredUsers = users.filter(u => {
    if (searchName && !u.name.includes(searchName)) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterGrade && u.grade !== parseInt(filterGrade)) return false;
    if (filterClass && u.class_num !== parseInt(filterClass)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / 20));
  const paginatedUsers = filteredUsers.slice((page - 1) * 20, page * 20);

  useEffect(() => {
    setPage(1);
  }, [searchName, filterRole, filterGrade, filterClass]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <header className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          사용자 관리
        </h2>
        <button onClick={fetchUsers} className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2">
          새로고침
        </button>
      </header>

      <div className="bg-white dark:bg-slate-900 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-2 flex flex-col md:flex-row gap-3 shadow-sm">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <i className="fi fi-rr-search text-slate-400"></i>
          <input type="text" placeholder="이름 검색" value={searchName} onChange={e => setSearchName(e.target.value)} className="w-full text-sm outline-none bg-transparent dark:text-slate-200" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200">
          <option value="">모든 역할</option>
          <option value="student">학생</option>
          <option value="teacher">교사</option>
          <option value="admin">관리자</option>
        </select>
        <input type="number" placeholder="학년" value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200" min="1" max="6" />
        <input type="number" placeholder="반" value={filterClass} onChange={e => setFilterClass(e.target.value)} className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 text-sm outline-none focus:border-indigo-500 dark:text-slate-200" min="1" max="20" />
      </div>

      <p className="text-sm text-slate-500 mb-3 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/30">
        <i className="fi fi-rr-info mr-2" />
        PostgreSQL DB 직접 연결을 통한 계정 긴급 관리 모드입니다. API 서버가 중지되어 있어도 조작이 가능합니다.
      </p>

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
                <th className="px-4 py-3 font-semibold">학교</th>
                <th className="px-4 py-3 font-semibold w-24">역할</th>
                <th className="px-4 py-3 font-semibold w-28">학년/반</th>
                <th className="px-4 py-3 font-semibold w-32">전화번호</th>
                <th className="px-4 py-3 font-semibold text-right w-44">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={u.school_name}>{u.school_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded inline-flex text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                      u.role === 'teacher' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {u.grade ? `${u.grade}학년 ${u.class_num}반` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums">{u.phone}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleResetPassword(u.id)} className="text-xs px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-medium mr-2 transition-colors">비밀번호</button>
                    <button onClick={() => handleDelete(u.id, u.name)} className="text-xs px-2.5 py-1.5 bg-rose-50 text-rose-600 dark:bg-rose-900/10 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded font-medium transition-colors">삭제</button>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <i className="fi fi-rr-folder-open text-3xl opacity-50 mb-3 block" />
                    등록된 사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Container */}
      {!loading && totalPages > 0 && (
        <div className="flex justify-center items-center gap-4 mt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 rounded-lg text-sm transition-colors shadow-sm">이전</button>
          <span className="text-sm font-semibold">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 rounded-lg text-sm transition-colors shadow-sm">다음</button>
        </div>
      )}
    </div>
  );
}
