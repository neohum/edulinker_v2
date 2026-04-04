import { useState, useEffect } from 'react';
import { toast } from 'sonner';

type DBKnowledgeDoc = {
  id: string;
  school_id: string;
  title: string;
  source_type: string;
  original_filename: string;
  file_url: string;
  markdown_content: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export default function DocumentManagement() {
  const [docs, setDocs] = useState<DBKnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'file' | 'text' | 'qa'>('all');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 10;

  const wapp = () => (window as any).go?.main?.App;

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const app = wapp();
      if (!app?.GetDBKnowledgeDocs) return;
      const list: DBKnowledgeDoc[] = await app.GetDBKnowledgeDocs() ?? [];
      setDocs(list);
    } catch {
      toast.error('문서 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (doc: DBKnowledgeDoc) => {
    if (!confirm(`"${doc.title}" 문서를 삭제하시겠습니까?\n교사 앱의 로컬 인덱스는 앱 재시작 시 자동으로 갱신됩니다.`)) return;
    setDeletingId(doc.id);
    try {
      const app = wapp();
      if (!app?.DeleteDBKnowledgeDoc) return;
      await app.DeleteDBKnowledgeDoc(doc.id);
      toast.success('문서가 삭제되었습니다.');
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      if (expandedDoc === doc.id) setExpandedDoc(null);
    } catch {
      toast.error('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = docs.filter(d => {
    const matchType = filterType === 'all' || d.source_type === filterType;
    const matchSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.original_filename?.toLowerCase().includes(search.toLowerCase()) ||
      d.created_by_name?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType, docs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedDocs = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const typeInfo = (type: string) => {
    if (type === 'file') return { label: '파일', icon: 'fi-rr-document', color: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30' };
    if (type === 'qa') return { label: 'Q&A', icon: 'fi-rr-comment-alt', color: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' };
    return { label: '텍스트', icon: 'fi-rr-text', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' };
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch { return s; }
  };

  const totalChars = docs.reduce((sum, d) => sum + (d.markdown_content?.length ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden gap-6">
      {/* Header */}
      <header className="flex items-center justify-between shrink-0">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <i className="fi fi-rr-book-open-cover text-indigo-500" style={{ fontSize: 22 }} />
          문서 관리
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          지식베이스(업무 규칙/정보)에 등록된 문서를 조회하고 삭제할 수 있습니다.
        </p>
      </header>

      {/* Stats bar */}
      {docs.length > 0 && (
        <div className="shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>총</span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{docs.length}</span>
            <span>건</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{(totalChars / 1000).toFixed(1)}K</span>
            <span>자</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['file', 'text', 'qa'] as const).map(t => {
              const count = docs.filter(d => d.source_type === t).length;
              if (count === 0) return null;
              const { label, icon, color } = typeInfo(t);
              return (
                <span key={t} className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${color}`}>
                  <i className={`fi ${icon}`} />
                  {label} {count}건
                </span>
              );
            })}
          </div>
          <button
            onClick={fetchDocs}
            className="ml-auto flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <i className="fi fi-rr-refresh" />
            새로고침
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <i className="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제목 또는 등록자로 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i className="fi fi-rr-cross-small" />
            </button>
          )}
        </div>
        <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
          {(['all', 'file', 'text', 'qa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === t
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              {t === 'all' ? '전체' : t === 'file' ? '파일' : t === 'text' ? '텍스트' : 'Q&A'}
            </button>
          ))}
        </div>
        {filtered.length !== docs.length && (
          <span className="text-xs text-slate-400">{filtered.length}건 표시 중</span>
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-slate-400 gap-2">
            <i className="fi fi-rr-spinner animate-spin" />
            <span className="text-sm">문서를 불러오는 중...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col h-40 items-center justify-center text-slate-400 gap-2">
            <i className="fi fi-rr-document text-3xl" />
            <p className="text-sm">{docs.length === 0 ? '등록된 문서가 없습니다.' : '검색 결과가 없습니다.'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-6">
            {paginatedDocs.map(doc => {
              const { label, icon, color } = typeInfo(doc.source_type);
              const isExpanded = expandedDoc === doc.id;
              return (
                <div
                  key={doc.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border shrink-0 ${color}`}>
                      <i className={`fi ${icon}`} />
                      {label}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{doc.title || '(제목 없음)'}</div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {doc.original_filename && (
                          <span className="text-xs text-slate-400 truncate">
                            <i className="fi fi-rr-paperclip mr-1" />
                            {doc.original_filename}
                          </span>
                        )}
                        {doc.markdown_content && (
                          <span className="text-xs text-slate-400 shrink-0">
                            {doc.markdown_content.length.toLocaleString()}자
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-xs text-slate-400 text-right leading-5">
                        <div>{formatDate(doc.created_at)}</div>
                        {doc.created_by_name && (
                          <div className="text-slate-500">{doc.created_by_name}</div>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-colors"
                        title={isExpanded ? '내용 접기' : '내용 보기'}
                      >
                        <i className={`fi ${isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'}`} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                        title="문서 삭제"
                      >
                        {deletingId === doc.id
                          ? <i className="fi fi-rr-spinner animate-spin" />
                          : <i className="fi fi-rr-trash" />
                        }
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-5 py-4">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <i className="fi fi-rr-document" />
                        문서 내용 (Markdown)
                      </div>
                      <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-y-auto font-mono bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                        {doc.markdown_content || '(내용 없음)'}
                      </pre>
                      {doc.file_url && (
                        <div className="mt-3 flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                              <i className="fi fi-rr-document" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex items-center gap-2">
                                {doc.original_filename || '첨부 파일'}
                                {doc.original_filename && doc.original_filename.includes('.') && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase text-[10px] font-bold tracking-wider">
                                    {doc.original_filename.split('.').pop()}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                                {doc.file_url}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const host = window.location.href.includes('localhost') ? 'http://localhost:5200' : 'http://localhost:5200';
                              (window as any).runtime?.BrowserOpenURL(`${host}${doc.file_url}`);
                            }}
                            className="ml-4 shrink-0 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                          >
                            <i className="fi fi-rr-download" />
                            원본 개별 다운로드
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 flex items-center justify-center disabled:opacity-50 disabled:hover:text-slate-500 disabled:hover:border-slate-200 transition-all shadow-sm"
                >
                  <i className="fi fi-rr-angle-small-left text-lg" />
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{currentPage}</span>
                  <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/</span>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{totalPages}</span>
                </div>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 flex items-center justify-center disabled:opacity-50 disabled:hover:text-slate-500 disabled:hover:border-slate-200 transition-all shadow-sm"
                >
                  <i className="fi fi-rr-angle-small-right text-lg" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
