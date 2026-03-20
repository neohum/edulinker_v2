'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Voting {
  id: string;
  title: string;
  content: string;
  options: string;
  ends_at: string;
  created_at: string;
}

export default function StudentEventsPage() {
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVotings = async () => {
      try {
        const schoolCode = localStorage.getItem('student_school_code');
        const res = await fetch(`${process.env.NEXT_PUBLIC_SYNC_SERVER_URL}/api/sync/pull/${schoolCode}`);
        if (res.ok) {
          const data = await res.json();
          // parse data_json string
          if (data.data_json) {
            const parsed = JSON.parse(data.data_json);
            setVotings(parsed.schoolevents || []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchVotings();
  }, []);

  const handleVote = async (votingId: string, option: string) => {
    try {
      const schoolCode = localStorage.getItem('student_school_code');
      const res = await fetch(`${process.env.NEXT_PUBLIC_SYNC_SERVER_URL}/api/sync/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ school_code: schoolCode, plugin_id: 'schoolevents', payload: JSON.stringify({ votingId, option }) })
      });
      if (res.ok) {
        toast.success(`${option} 항목에 투표가 완료되었습니다!`);
      } else {
        toast.error('투표 처리 중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-800"><i className="fi fi-rr-calendar-check" /> 학급 투표 및 행사</h2>
        <p className="text-sm text-slate-500 mt-1">진행 중인 투표에 참여하거나 학교 행사 기록을 확인하세요.</p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-10 text-slate-500 animate-pulse">불러오는 중...</div>
        ) : votings.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
            현재 진행 중인 투표가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {votings.map((voting) => {
              const opts: string[] = JSON.parse(voting.options || '[]');
              const isEnded = new Date(voting.ends_at) < new Date();

              return (
                <div key={voting.id} className="p-6 border border-slate-100 rounded-xl shadow-sm bg-white relative">
                  <div className="absolute top-6 right-6">
                    {isEnded ? (
                      <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">마감됨</span>
                    ) : (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full animate-pulse">진행중</span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2 pr-16">{voting.title}</h3>
                  <p className="text-sm text-slate-600 mb-4">{voting.content}</p>
                  <div className="text-xs text-orange-500 font-semibold mb-4">
                    마감일시: {new Date(voting.ends_at).toLocaleString()}
                  </div>

                  <div className="flex flex-col gap-2">
                    {opts.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleVote(voting.id, opt)}
                        disabled={isEnded}
                        className={`text-left px-4 py-3 rounded-lg border text-sm font-medium transition ${isEnded
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-indigo-100 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300'
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
