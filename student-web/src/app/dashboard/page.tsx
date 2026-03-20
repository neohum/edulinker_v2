'use client';

import { useEffect, useState } from 'react';

interface Gatong {
  id: string;
  title: string;
  content: string;
  type: string;
  is_required: boolean;
  created_at: string;
  author: {
    name: string;
  };
}

export default function DashboardPage() {
  const [gatongs, setGatongs] = useState<Gatong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGatongs();
  }, []);

  const fetchGatongs = async () => {
    try {
      const token = localStorage.getItem('student_token');
      // Request gatongs specifically for the currently logged in student
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/plugins/gatong/view`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setGatongs(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch gatongs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats & Welcome */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-md">
        <h2 className="text-3xl font-extrabold mb-2 text-white">반갑습니다! <i className="fi fi-rr-hand-wave" /></h2>
        <p className="text-indigo-100">오늘 확인해야 할 새로운 소식들이 있습니다.</p>

        <div className="flex gap-4 mt-8">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10">
            <div className="text-indigo-100 text-sm font-medium mb-1">새 알림장</div>
            <div className="text-3xl font-bold">{gatongs.length}건</div>
          </div>
          <div className="bg-white/20 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10">
            <div className="text-indigo-100 text-sm font-medium mb-1">미완료 과제</div>
            <div className="text-3xl font-bold">0건</div>
          </div>
        </div>
      </div>

      {/* Main Feed: Gatong/Notice List */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">최신 알림장 (가통)</h3>
          <button className="text-indigo-600 text-sm font-bold hover:underline">모두 보기 &rarr;</button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">알림장을 불러오는 중입니다...</div>
        ) : gatongs.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <p className="text-slate-500 font-medium">새로운 등록된 알림이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {gatongs.map((item) => (
              <div key={item.id} className="p-5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition cursor-pointer bg-slate-50 hover:bg-white group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-2 items-center">
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg uppercase">
                      {item.type === 'notice' ? '공지' : item.type === 'survey' ? '설문' : '통신문'}
                    </span>
                    {item.is_required && (
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg">
                        필수 제출
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 text-xs font-medium">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition mb-1">{item.title}</h4>
                <p className="text-slate-500 text-sm line-clamp-2">{item.content}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    {item.author.name?.charAt(0) || 'T'}
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{item.author.name} 선생님</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
