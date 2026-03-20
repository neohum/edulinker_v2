'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SchoolResult {
  name: string;
  code: string;
  address: string;
  region: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schools, setSchools] = useState<SchoolResult[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  // Auto-login check
  useEffect(() => {
    const token = localStorage.getItem('student_token');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  // Debounced school search
  useEffect(() => {
    if (schoolQuery.length < 2) {
      setSchools([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://open.neis.go.kr/hub/schoolInfo?KEY=e6f150bd4fe14dde85c323a3ee241260&Type=json&pIndex=1&pSize=10&SCHUL_NM=${encodeURIComponent(schoolQuery)}`
        );
        const data = await res.json();
        const schoolInfo = data?.schoolInfo;
        if (!schoolInfo || schoolInfo.length < 2) {
          setSchools([]);
          return;
        }
        const rows = schoolInfo[1]?.row || [];
        setSchools(
          rows.map((r: any) => ({
            name: r.SCHUL_NM,
            code: r.SD_SCHUL_CODE,
            address: r.ORG_RDNMA,
            region: r.LCTN_SC_NM,
          }))
        );
      } catch {
        setSchools([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [schoolQuery]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedSchool) {
      setError('학교를 검색하여 선택해주세요.');
      return;
    }
    if (!grade || !classNum || !number || !name) {
      setError('학년, 반, 번호, 이름을 모두 입력해주세요.');
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/student-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_code: selectedSchool.code,
          grade: parseInt(grade),
          class_num: parseInt(classNum),
          number: parseInt(number),
          name: name.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      if (data.user.role !== 'student') {
        throw new Error('학생 계정만 접근 가능합니다.');
      }

      localStorage.setItem('student_token', data.token);
      localStorage.setItem('student_user', JSON.stringify(data.user));
      localStorage.setItem('student_school_code', selectedSchool.code);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] animate-fade-in">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">학생 로그인</h2>
        <p className="text-sm text-slate-500 mb-8">
          선생님이 등록한 학교·학년·반·번호·이름으로 로그인하세요.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* School Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <i className="fi fi-rr-building" style={{ marginRight: 6 }} />
              학교
            </label>
            {selectedSchool ? (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50">
                <div>
                  <div className="font-bold text-indigo-700 text-sm">{selectedSchool.name}</div>
                  <div className="text-xs text-indigo-500">{selectedSchool.address}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSchool(null);
                    setSchoolQuery('');
                  }}
                  className="text-indigo-400 hover:text-indigo-600 text-sm font-bold"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="학교 이름을 검색하세요"
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition"
                />
                {searching && (
                  <div className="absolute right-3 top-[42px] text-xs text-slate-400">검색 중...</div>
                )}
                {schools.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {schools.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => {
                          setSelectedSchool(s);
                          setSchools([]);
                          setSchoolQuery('');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition border-b border-slate-50 last:border-0"
                      >
                        <div className="font-bold text-sm text-slate-800">{s.name}</div>
                        <div className="text-xs text-slate-500">
                          {s.region} · {s.address}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Grade / Class / Number row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">학년</label>
              <input
                type="number"
                min="1"
                max="6"
                placeholder="1"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition text-center"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">반</label>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="1"
                value={classNum}
                onChange={(e) => setClassNum(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition text-center"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">번호</label>
              <input
                type="number"
                min="1"
                max="50"
                placeholder="1"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition text-center"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <i className="fi fi-rr-user" style={{ marginRight: 6 }} />
              이름
            </label>
            <input
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition mt-2"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
