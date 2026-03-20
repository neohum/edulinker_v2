'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('student_token');
    const userData = localStorage.getItem('student_user');

    if (!token || !userData) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      if (parsedUser.role !== 'student') {
        router.push('/login');
        return;
      }
      setUser(parsedUser);
    } catch {
      router.push('/login');
    }
  }, [router]);

  if (!user) {
    return <div className="p-8 text-center animate-pulse text-indigo-400 font-medium">인증 정보를 확인 중입니다...</div>;
  }

  return (
    <div className="flex gap-6 animate-fade-in">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hidden md:block">
        <div className="mb-8">
          <div className="text-xl font-bold text-slate-800">{user.name} 학생</div>
          <div className="text-sm text-slate-500 mt-1">{user.school?.name || '소속 학교 정보 모델 불러오는중'}</div>
        </div>

        <nav className="flex flex-col gap-2">
          <Link href="/dashboard" className={`text-left px-4 py-3 rounded-xl font-bold transition ${pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <i className="fi fi-rr-home" /> 홈 대시보드
          </Link>
          <Link href="/dashboard/curriculum" className={`text-left px-4 py-3 rounded-xl font-bold transition ${pathname === '/dashboard/curriculum' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <i className="fi fi-rr-book" /> 주간학습안내
          </Link>
          <Link href="/dashboard/events" className={`text-left px-4 py-3 rounded-xl font-bold transition ${pathname === '/dashboard/events' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <i className="fi fi-rr-calendar-check" /> 투두·행사·투표
          </Link>
          <button className="text-left px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition cursor-not-allowed opacity-50">
            <i className="fi fi-rr-megaphone" /> 알림장 (가통)
          </button>
          <button className="text-left px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition cursor-not-allowed opacity-50">
            <i className="fi fi-rr-document" /> 전자문서/서명
          </button>
        </nav>

        <div className="mt-12 pt-6 border-t border-slate-100">
          <button
            onClick={() => {
              localStorage.removeItem('student_token');
              localStorage.removeItem('student_user');
              router.push('/');
            }}
            className="w-full text-left px-4 py-2 text-red-500 rounded-xl hover:bg-red-50 transition text-sm font-bold"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <section className="flex-1">
        {children}
      </section>
    </div>
  );
}
