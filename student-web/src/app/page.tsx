'use client';

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('student_token');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="bg-indigo-100 text-indigo-700 font-semibold px-4 py-1 rounded-full text-sm mb-6">
        에듀링커 학생 전용 홈
      </div>

      <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
        학교 생활을<br className="md:hidden" /> 더 스마트하게
      </h2>

      <p className="text-lg text-slate-600 mb-10 max-w-xl mx-auto">
        선생님이 보내신 알림장부터 학교 일정, 가정통신문 확인까지.
        학생 웹 플랫폼 하나로 모든 소식을 놓치지 마세요.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/login"
          className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
        >
          로그인하고 시작하기
        </Link>
        <Link
          href="/about"
          className="px-8 py-3 bg-white text-indigo-600 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition shadow-sm"
        >
          기능 둘러보기
        </Link>
      </div>

      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full max-w-4xl">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-2xl mb-4"><i className="fi fi-rr-megaphone" /></div>
          <h3 className="font-bold text-lg mb-2">실시간 알림장</h3>
          <p className="text-slate-500 text-sm">선생님의 공지와 숙제 알림을 웹에서 바로 확인하세요.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-2xl mb-4"><i className="fi fi-rr-checkbox" /></div>
          <h3 className="font-bold text-lg mb-2">내 할일 관리</h3>
          <p className="text-slate-500 text-sm">투두리스트 기능으로 학교 과제와 개인 일정을 깔끔하게 관리해요.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-2xl mb-4"><i className="fi fi-rr-building" /></div>
          <h3 className="font-bold text-lg mb-2">학교 정보 한눈에</h3>
          <p className="text-slate-500 text-sm">즐겨찾는 링크, 학급별 시간표 등 학교 특화 정보를 볼 수 있어요.</p>
        </div>
      </div>
    </div>
  )
}
