'use client';

import { useEffect, useState } from 'react';

interface WeeklyPlan {
  id: string;
  title: string;
  content: string;
  week_start: string;
  week_end: string;
  created_at: string;
  teacher?: { name: string };
}

export default function StudentCurriculumPage() {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const schoolCode = localStorage.getItem('student_school_code');
        const res = await fetch(`${process.env.NEXT_PUBLIC_SYNC_SERVER_URL}/api/sync/pull/${schoolCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data_json) {
            const parsed = JSON.parse(data.data_json);
            setPlans(parsed.curriculum || []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-800"><i className="fi fi-rr-book" /> 주간학습안내</h2>
        <p className="text-sm text-slate-500 mt-1">선생님이 올려주신 이번 주 학습 계획을 확인하세요.</p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-10 text-slate-500 animate-pulse">불러오는 중...</div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
            등록된 주간학습안내가 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className="p-5 border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-md transition bg-slate-50">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-indigo-700">{plan.title}</h3>
                  <span className="text-xs font-semibold px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full">
                    {new Date(plan.week_start).toLocaleDateString()} ~ {new Date(plan.week_end).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{plan.content}</p>
                <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500 text-right">
                  게시일: {new Date(plan.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
