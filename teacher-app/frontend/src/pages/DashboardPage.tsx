import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { UserInfo } from '../App'
import { apiFetch, API_BASE } from '../api'
import Sidebar from '../components/Sidebar'
import GatongPage from './GatongPage'
import SendocPage from './SendocPage'
import StudentMgmtPage from './StudentMgmtPage'
import AIAnalysisPage from './AIAnalysisPage'
import CurriculumPage from './CurriculumPage'
import SchoolEventsPage from './SchoolEventsPage'
import MessengerPage from './MessengerPage'
import AnnouncementPage from './AnnouncementPage'
import TodoPage from './TodoPage'
import AttendancePage from './AttendancePage'
import StudentAlertPage from './StudentAlertPage'
import LinkerPage from './LinkerPage'
import PcInfoPage from './PcInfoPage'
import SettingsPage from './SettingsPage'
import ProfilePage from './ProfilePage'
import HwpConverterPage from './HwpConverterPage'
import XlsxConverterPage from './XlsxConverterPage'
import PptxConverterPage from './PptxConverterPage'
import CounselingPage from './CounselingPage'
import ClassMgmtPage from './ClassMgmtPage'
import ResourceMgmtPage from './ResourceMgmtPage'
import SchoolAdminPage from './SchoolAdminPage'
import KnowledgePage from './KnowledgePage'
import BehaviorOpinionPage from './BehaviorOpinionPage'

// === Knowledge Search Types ===
interface RAGSearchResult {
  doc_id: string;
  doc_title: string;
  source_type: string;
  display_text: string;
  heading_context: string;
  score: number;
  is_semantic: boolean;
}
// ==============================

interface DashboardPageProps {
  user: UserInfo
  onLogout: () => void
}

type PageView = 'dashboard' | 'messenger' | 'announcement' | 'todo' | 'student-alert' | 'attendance' | 'gatong' | 'sendoc' | 'studentmgmt' | 'counseling' | 'curriculum' | 'aianalysis' | 'schoolevents' | 'linker' | 'pcinfo' | 'hwp-converter' | 'xlsx-converter' | 'pptx-converter' | 'settings' | 'profile' | 'classmgmt' | 'resourcemgmt' | 'schooladmin' | 'knowledge' | 'behavior-opinion'

function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [currentPage, setCurrentPage] = useState<PageView>('dashboard')
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [pendingDocCount, setPendingDocCount] = useState(0)
  const [activeVotingsCount, setActiveVotingsCount] = useState(0)

  useEffect(() => {
    fetchPendingDocCount()
    fetchVotingsCount()
    const interval = setInterval(() => {
      fetchPendingDocCount()
      fetchVotingsCount()
    }, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [])

  const fetchVotingsCount = async () => {
    try {
      const res = await apiFetch('/api/plugins/schoolevents/votings')
      if (res.ok) {
        const data = await res.json()
        const now = new Date()
        const pending = (data || []).filter((v: any) => {
          const isPending = new Date(v.starts_at || v.created_at) > now
          const isEnded = new Date(v.ends_at) <= now
          return !isPending && !isEnded && v.my_vote_option == null
        })
        setActiveVotingsCount(pending.length)
      }
    } catch (e) {
      console.error('Failed to fetch votings count:', e)
    }
  }

  const fetchPendingDocCount = async () => {
    try {
      const res = await apiFetch('/api/plugins/sendoc/sign')
      if (res.ok) {
        const data = await res.json()
        // Filter those not yet signed
        const pending = data.filter((d: any) => !d.is_signed)
        setPendingDocCount(pending.length)
      }
    } catch (e) {
      console.error('Failed to fetch pending docs:', e)
    }
  }

  return (
    <div className="app-container">
      <Sidebar
        user={user}
        currentPage={currentPage}
        badges={{
          messenger: unreadMsgCount > 0 ? unreadMsgCount : undefined,
          sendoc: pendingDocCount > 0 ? pendingDocCount : undefined,
          schoolevents: activeVotingsCount > 0 ? activeVotingsCount : undefined
        }}
        onNavigate={(page) => setCurrentPage(page as PageView)}
        onLogout={onLogout}
      />

      <div className="main-content">
        <header className="main-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16 }}>
          {currentPage !== 'dashboard' && <h2 className="main-header-title" style={{ margin: 0 }}>{getPageTitle(currentPage)}</h2>}
          {currentPage === 'dashboard' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                안녕하세요, {user?.name || '선생님'} <i className="fi fi-rr-hand-wave" style={{ color: '#f59e0b', marginLeft: 4 }} />
              </span>
              <span style={{ color: 'var(--border)' }}>|</span>
              <span>
                {user?.school || '학교'} · {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </span>
            </div>
          )}
        </header>

        <div className="main-body" style={currentPage === 'dashboard' ? { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}}>
          {currentPage === 'dashboard' && <DashboardView user={user} />}
          {currentPage === 'gatong' && <GatongPage />}
          {currentPage === 'sendoc' && <SendocPage user={user} />}
          {currentPage === 'studentmgmt' && <StudentMgmtPage user={user} />}
          {currentPage === 'counseling' && <CounselingPage user={user} />}
          {currentPage === 'curriculum' && <CurriculumPage user={user} />}
          {currentPage === 'aianalysis' && <AIAnalysisPage user={user} onNavigate={(p) => setCurrentPage(p as PageView)} />}
          {currentPage === 'schoolevents' && <SchoolEventsPage onVoteChange={fetchVotingsCount} />}
          {currentPage === 'classmgmt' && <ClassMgmtPage />}
          {currentPage === 'behavior-opinion' && <BehaviorOpinionPage user={user} />}
          {currentPage === 'resourcemgmt' && <ResourceMgmtPage />}
          {currentPage === 'schooladmin' && <SchoolAdminPage user={user} />}

          <div style={{ display: currentPage === 'messenger' ? 'block' : 'none', height: '100%' }}>
            <MessengerPage user={user} isActive={currentPage === 'messenger'} onUnreadChange={setUnreadMsgCount} />
          </div>

          {currentPage === 'announcement' && <AnnouncementPage />}
          {currentPage === 'todo' && <TodoPage />}
          {currentPage === 'attendance' && <AttendancePage user={user} />}
          {currentPage === 'student-alert' && <StudentAlertPage />}
          {currentPage === 'linker' && <LinkerPage />}
          {currentPage === 'pcinfo' && <PcInfoPage user={user} />}
          {currentPage === 'hwp-converter' && <HwpConverterPage />}
          {currentPage === 'xlsx-converter' && <XlsxConverterPage />}
          {currentPage === 'pptx-converter' && <PptxConverterPage />}
          {currentPage === 'settings' && <SettingsPage />}
          {currentPage === 'profile' && <ProfilePage user={user} />}

          {currentPage === 'knowledge' && <KnowledgePage />}

          {currentPage !== 'dashboard' && currentPage !== 'gatong' && currentPage !== 'sendoc' && currentPage !== 'studentmgmt' && currentPage !== 'curriculum' && currentPage !== 'aianalysis' && currentPage !== 'schoolevents' && currentPage !== 'messenger' && currentPage !== 'announcement' && currentPage !== 'todo' && currentPage !== 'attendance' && currentPage !== 'student-alert' && currentPage !== 'linker' && currentPage !== 'pcinfo' && currentPage !== 'settings' && currentPage !== 'profile' && currentPage !== 'classmgmt' && currentPage !== 'resourcemgmt' && currentPage !== 'schooladmin' && currentPage !== 'knowledge' && currentPage !== 'behavior-opinion' && <PluginPlaceholder name={getPageTitle(currentPage)} />}
        </div>
      </div>
    </div>
  )
}

function DashboardView({ user }: { user: UserInfo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <KnowledgeSearchWidget isExpanded={true} />
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className={`stat-card-icon ${color}`}>
          <span style={{ fontSize: 20 }}><i className={icon} /></span>
        </div>
      </div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  )
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: { doc: any; matchSnippet: string }[];
  isGenerating?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

function KnowledgeSearchWidget({ isExpanded = false }: { isExpanded?: boolean }) {
  const [docs, setDocs] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null)
  const [expandedRefs, setExpandedRefs] = useState<Record<string, boolean>>({})
  const [docSearchQuery, setDocSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (docSearchQuery.trim()) {
      setTimeout(() => {
        const el = document.getElementById('search-match-active');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [currentMatchIndex, docSearchQuery]);

  const startNewSession = () => {
    setActiveSessionId(null);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: '무엇이든 물어보세요. 내장된 로컬 AI 리소스와 연동된 규정 문서를 통해 빠르게 안내해 드립니다.'
    }]);
  };

  const [sharingMsgId, setSharingMsgId] = useState<string | null>(null);

  const shareQA = async (msg: ChatMessage) => {
    const idx = messages.findIndex(m => m.id === msg.id);
    const userMsg = messages[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    setSharingMsgId(msg.id);
    try {
      const payload = {
        title: `[자주 묻는 질문] ${userMsg.content.length > 25 ? userMsg.content.substring(0, 25) + '...' : userMsg.content}`,
        source_type: 'qa',
        original_filename: 'ai_qa_history.md',
        content: `**질문:**\n${userMsg.content}\n\n**AI 규정 요약:**\n${msg.content}`
      };

      const res = await apiFetch('/api/plugins/knowledge/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("질의응답이 공유 지식베이스에 등록되었습니다!", {
          description: "다른 선생님들도 비슷한 질문 시 이 답변을 참조하게 됩니다."
        });
      } else {
        const errorText = await res.text();
        toast.error(`지식베이스 공유에 실패했습니다: ${errorText}`);
      }
    } catch (e: any) {
      toast.error(`서버 오류가 발생했습니다: ${e.message}`);
    } finally {
      setSharingMsgId(null);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('knowledge_chat_sessions');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
          if (parsed.length > 0) {
            setActiveSessionId(parsed[0].id);
            setMessages(parsed[0].messages);
          } else {
            startNewSession();
          }
        }
      } catch (e) {
        startNewSession();
      }
    } else {
      startNewSession();
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === activeSessionId);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], messages, updatedAt: new Date().toISOString() };
        localStorage.setItem('knowledge_chat_sessions', JSON.stringify(updated));
        return updated;
      }
      return prev;
    });
  }, [messages, activeSessionId]);

  useEffect(() => {
    // 구버전 로컬 벡터 캐시 정리
    localStorage.removeItem('knowledge_local_chunks');
    localStorage.removeItem('knowledge_chunk_hashes');

    const wailsApp = (window as any).go?.main?.App;

    // 서버 전체 문서 sync → 로컬 미인덱싱 문서 자동 보완
    const syncDocs = async () => {
      try {
        // 항상 전체 문서 목록 가져오기 (since 파라미터 없이)
        const res = await apiFetch('/api/plugins/knowledge/sync')
        if (!res.ok) return

        const data = await res.json()
        const allIds: string[] = data.all_ids || []
        const allDocs: any[] = data.updated_docs || []

        // 로컬 캐시 갱신
        setDocs(allDocs)
        localStorage.setItem('knowledge_cache', JSON.stringify(allDocs))
        localStorage.setItem('knowledge_last_sync', new Date().toISOString())

        if (!wailsApp?.IndexDocument || !wailsApp?.GetIndexedDocIDs) return

        // 로컬 SQLite에 인덱싱된 doc_id 목록 조회
        let indexedIds: string[] = []
        try { indexedIds = await wailsApp.GetIndexedDocIDs() ?? [] } catch (e) { }

        // 삭제된 문서 로컬 인덱스 제거
        if (wailsApp?.DeleteDocumentIndex) {
          const deletedIds = indexedIds.filter(id => !allIds.includes(id))
          for (const id of deletedIds) {
            wailsApp.DeleteDocumentIndex(id).catch(() => { })
          }
        }

        // 로컬에 없는 문서 + 내용이 있는 문서 인덱싱
        const toIndex = allDocs.filter(
          (doc: any) => doc.markdown_content && !indexedIds.includes(doc.id)
        )
        for (const doc of toIndex) {
          wailsApp.IndexDocument(
            doc.id, doc.title, doc.source_type ?? 'text', doc.markdown_content
          ).catch(() => { })
        }

      } catch (e) {
        console.error('Failed to sync knowledge docs', e)
      }
    }
    syncDocs()

    // Wails Events for AI
    const wails = (window as any).runtime;
    if (!wails) return;

    wails.EventsOn("ai:chunk", (chunk: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isGenerating) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        }
        return prev;
      });
    });

    wails.EventsOn("ai:done", () => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isGenerating) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, isGenerating: false };
          return updated;
        }
        return prev;
      });
      setIsSearching(false);
    });

    wails.EventsOn("ai:error", (msg: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isGenerating) {
          const updated = [...prev];
          let errorText = `[오류 발생: ${msg}]`
          if (msg.includes('메모리')) {
            errorText = `⚠️ **메모리 부족 안내**\n현재 데스크톱의 메모리로 실행하기엔 AI 모델이 너무 무겁습니다.\n[설정] 탭의 로컬 AI 관리에서 시스템에 맞는 '가벼운 모델(EXAONE 3.5 등)'을 다운로드 받아주세요.`
          } else if (msg.includes('not found') || msg.includes('404')) {
            errorText = `⚠️ **AI 모델 미설치 안내**\n로컬 AI 모델을 찾을 수 없습니다. [설정] 탭의 '로컬 AI 관리' 단추를 눌러 기본 모델(gemma3 등)을 설치해주세요.`
          }
          updated[updated.length - 1] = { ...last, content: last.content + "\n\n" + errorText, isGenerating: false };
          return updated;
        }
        return prev;
      });
      setIsSearching(false);
    });

    return () => {
      wails.EventsOff("ai:chunk");
      wails.EventsOff("ai:done");
      wails.EventsOff("ai:error");
    };
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // handleSearch: 로컬 SQLite + Ollama RAG 검색 (Wails)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isSearching) return

    const userQuery = query.trim();
    setQuery('');
    setIsSearching(true);

    // Wails를 통해 교사 PC 로컬 RAG 검색 수행
    let localResults: RAGSearchResult[] = [];
    let finalQuery = userQuery;

    try {
      const wailsApp = (window as any).go?.main?.App;
      
      // 문장형 질문(띄어쓰기 포함, 10자 이상)인 경우 핵심어 추출
      if (userQuery.includes(' ') && userQuery.length > 8) {
        setMessages(prev => [
          ...prev,
          { id: 'extracting', role: 'assistant', content: '💡 자연어 질의를 분석하여 핵심 검색어를 추출하고 있습니다...', isGenerating: true }
        ]);
        if (wailsApp?.ExtractKeywordsLocalAI) {
          const extracted = await wailsApp.ExtractKeywordsLocalAI(userQuery);
          if (extracted && extracted !== userQuery) {
            finalQuery = extracted;
          }
        }
        setMessages(prev => prev.filter(m => m.id !== 'extracting'));
      }

      if (wailsApp?.SearchKnowledge) {
        const raw = await wailsApp.SearchKnowledge(finalQuery, 5);
        if (Array.isArray(raw)) {
          localResults = raw.map((r: any) => ({
            doc_id: r.doc_id ?? r.DocID ?? '',
            doc_title: r.doc_title ?? r.DocTitle ?? '',
            source_type: r.source_type ?? r.SourceType ?? 'text',
            display_text: r.display_text ?? r.DisplayText ?? '',
            heading_context: r.heading_context ?? r.HeadingContext ?? '',
            score: r.score ?? r.Score ?? 0,
            is_semantic: r.is_semantic ?? r.IsSemantic ?? false,
          }));
        }
      }
    } catch (e) {
      console.error('Local search failed:', e);
    }

    // 로컬 결과를 references 포맷으로 변환
    const finalMatches = localResults.map(r => {
      const fullDoc = docs.find(d => d.id === r.doc_id) || {};
      return {
        doc: {
          id: r.doc_id,
          title: r.doc_title,
          source_type: r.source_type,
          markdown_content: fullDoc.markdown_content || r.display_text,
          original_filename: fullDoc.original_filename,
          file_url: fullDoc.file_url
        },
        matchSnippet: r.display_text,
        score: r.score,
        isSemantic: r.is_semantic
      };
    });

    const newMsgs: ChatMessage[] = [
      ...messages,
      { id: Date.now().toString() + '_u', role: 'user', content: userQuery }
    ];

    const aiMsgId = Date.now().toString() + '_a';
    newMsgs.push({
      id: aiMsgId,
      role: 'assistant',
      content: '',
      references: finalMatches.length > 0 ? finalMatches : undefined,
      isGenerating: true
    });

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = Date.now().toString();
      const titleText = userQuery.length > 20 ? userQuery.substring(0, 20) + '...' : userQuery;
      const newSession: ChatSession = {
        id: currentSessionId,
        title: titleText,
        updatedAt: new Date().toISOString(),
        messages: newMsgs
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(currentSessionId);
    }

    setMessages(newMsgs);

    const matchContext = finalMatches.slice(0, 3).map((m, i) =>
      `### [참고${i + 1}] ${m.doc.title}\n${m.matchSnippet}`
    ).join('\n\n---\n');

    const systemPrompt = `당신은 학교 업무 보조 및 규정 안내를 담당하는 AI 어시스턴트입니다.
오직 아래 제공된 [참고 문서]에 있는 내용만을 근거로 답변을 작성해야 합니다.
외부 정보를 임의로 추가하거나 지어내지 마십시오.
질문에 대한 답이 [참고 문서]에 명시되어 있지 않다면 "검색된 규정 문서에서 질문에 해당하는 관련된 내용을 찾을 수 없습니다."라고 안내하세요.

[참고 문서]
${matchContext || '현재 검색된 관련 문서 내용이 없습니다.'}`;

    if ((window as any).go?.main?.App?.GenerateAIStream) {
      let selectedModel = "gemma3:4b";
      try {
        const wailsApp = (window as any).go?.main?.App;
        if (wailsApp?.GetLocalModels) {
          const models = await wailsApp.GetLocalModels();
          if (models && models.length > 0) {
            const gemma = models.find((m: string) => m.includes('gemma'));
            selectedModel = gemma || models[0];
          }
        }
      } catch (e) {
        console.error("Failed to fetch local AI models:", e);
      }
      (window as any).go.main.App.GenerateAIStream(selectedModel, systemPrompt, userQuery);
    } else {
      setIsSearching(false);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = "AI 스트리밍 엔진에 연결할 수 없습니다. (Wails 환경인지 확인하세요)";
        updated[updated.length - 1].isGenerating = false;
        return updated;
      });
    }
  }

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'row', height: isExpanded ? '100%' : 'calc(100vh - 320px)', minHeight: 400, padding: 0, overflow: 'hidden', border: isExpanded ? 'none' : undefined, borderRadius: isExpanded ? 0 : undefined, transition: 'height 0.2s ease-out' }}>

        {/* Left Pane (Main Chat) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fi fi-rr-search-alt" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>업무 규정(지식베이스) 통합 검색</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>동기화된 문서 수: <b>{docs.length}</b>건</p>
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg, idx) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '16px',
                  borderRadius: 16,
                  borderTopLeftRadius: msg.role === 'assistant' ? 4 : 16,
                  borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)'
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--accent-blue)' }}>
                      <i className="fi fi-rr-robot" /> AI 규정 어시스턴트
                      {msg.isGenerating && <span style={{ fontSize: 11, opacity: 0.7 }}>답변 작성 중...</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && !msg.isGenerating && msg.content && msg.id !== 'welcome' && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => shareQA(msg)}
                        disabled={sharingMsgId === msg.id}
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 16, background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)', border: '1px solid currentColor', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {sharingMsgId === msg.id ? (
                          <><i className="fi fi-rr-spinner fi-spin" /> 공유 중...</>
                        ) : (
                          <><i className="fi fi-rr-share" /> 💡 이 질의응답을 공유 지식베이스에 추가하기</>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {msg.references && msg.references.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 8 }}>
                    <div
                      onClick={() => setExpandedRefs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
                    >
                      <i className={`fi ${expandedRefs[msg.id] ? 'fi-rr-angle-small-down' : 'fi-rr-angle-small-right'}`} />
                      참고 규정 문서 ({msg.references.length}건)
                    </div>
                    {expandedRefs[msg.id] && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8, animation: 'fadeIn 0.2s ease-out' }}>
                        {msg.references.map((res, i) => (
                          <div key={i} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <i className={`fi ${res.doc.source_type === 'file' ? 'fi-rr-file-hwp' : res.doc.source_type === 'qa' ? 'fi-rr-comment-alt' : 'fi-rr-document'}`} style={{ color: res.doc.source_type === 'qa' ? '#f59e0b' : 'var(--accent-blue)' }} />
                                {res.doc.title}
                              </div>
                              <button onClick={() => setSelectedDoc(res.doc)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, margin: 0, flexShrink: 0 }}>문서 보기</button>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {res.matchSnippet}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                lang="ko"
                className="form-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="단어로 검색하세요 예)초과근무"
                style={{ flex: 1, borderRadius: 24, paddingLeft: 20, imeMode: 'active' } as React.CSSProperties}
                disabled={isSearching}
              />
              {isSearching ? (
                <button
                  type="button"
                  onClick={() => {
                    if ((window as any).go?.main?.App?.CancelAIGenerate) {
                      (window as any).go.main.App.CancelAIGenerate();
                    }
                    setIsSearching(false);
                    setMessages(prev => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.isGenerating) {
                        last.isGenerating = false;
                        last.content += '\n\n*(답변 생성이 중단되었습니다)*';
                      }
                      return updated;
                    });
                  }}
                  className="btn-secondary"
                  style={{ borderRadius: 24, padding: '0 16px', height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', border: '1px solid currentColor', background: 'transparent' }}
                >
                  <i className="fi fi-rr-stop" style={{ marginRight: 6 }} /> 중지
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!query.trim()}
                  style={{ borderRadius: 24, width: 44, height: 44, padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <i className="fi fi-rr-search" />
                </button>
              )}
            </form>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
              검색어와 AI의 특성상 결과가 정확하지 않거나 오류가 있을 수 있으니 참고용으로 사용을 바랍니다.
            </div>
          </div>
        </div>

        {/* Right Pane (Sidebar) */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', flexShrink: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
            <button
              onClick={startNewSession}
              className="btn-primary"
              style={{ width: '100%', padding: '10px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
            >
              <i className="fi fi-rr-plus" /> 새 문의하기
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, paddingLeft: 4 }}>이전 문의 내역</div>
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => { setActiveSessionId(s.id); setMessages(s.messages); }}
                style={{
                  padding: '12px',
                  borderRadius: 8,
                  marginBottom: 8,
                  cursor: 'pointer',
                  background: s.id === activeSessionId ? 'var(--bg-primary)' : 'transparent',
                  border: '1px solid',
                  borderColor: s.id === activeSessionId ? 'var(--accent-blue)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ fontSize: 13, fontWeight: s.id === activeSessionId ? 600 : 400, color: s.id === activeSessionId ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 200 }} title={s.title}>
                  <i className="fi fi-rr-comment-alt" style={{ marginRight: 6, opacity: 0.7 }} />
                  {s.title}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newSessions = sessions.filter(x => x.id !== s.id);
                    setSessions(newSessions);
                    localStorage.setItem('knowledge_chat_sessions', JSON.stringify(newSessions));
                    if (activeSessionId === s.id) startNewSession();
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                  onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title="삭제"
                >
                  <i className="fi fi-rr-trash" />
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                이전 검색 내역이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 800, maxWidth: '90%', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: 'var(--bg-primary)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <i className={`fi ${selectedDoc.source_type === 'file' ? 'fi-rr-file-hwp' : 'fi-rr-text'}`} style={{ color: 'var(--accent-blue)' }} />
                {selectedDoc.title}
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedDoc.file_url ? (
                  <button
                    type="button"
                    onClick={() => {
                      const a = document.createElement('a')
                      a.href = `${API_BASE}${selectedDoc.file_url}`
                      a.download = selectedDoc.original_filename || 'download'
                      a.target = '_blank'
                      a.click()
                    }}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, borderRadius: 6, margin: 0 }}
                  >
                    <i className="fi fi-rr-download" /> 원본 다운로드
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([selectedDoc.markdown_content], { type: 'text/markdown;charset=utf-8;' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      const dlName = selectedDoc.original_filename ? `${selectedDoc.original_filename}.txt` : `${selectedDoc.title}.txt`
                      a.download = dlName
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, borderRadius: 6, margin: 0 }}
                  >
                    <i className="fi fi-rr-download" /> 텍스트 다운로드
                  </button>
                )}
                <button type="button" onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0 0 8px' }}>
                  <i className="fi fi-rr-cross-small" />
                </button>
              </div>
            </div>
            <div style={{ padding: '8px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => {
                let matchCount = 0;
                if (docSearchQuery.trim()) {
                  const m = selectedDoc.markdown_content.match(new RegExp(docSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
                  matchCount = m ? m.length : 0;
                }
                return (
                  <>
                    <i className="fi fi-rr-search" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="문서 내 검색 (Enter로 다음 이동)"
                      value={docSearchQuery}
                      onChange={e => {
                        setDocSearchQuery(e.target.value);
                        setCurrentMatchIndex(0);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (matchCount > 0) {
                            setCurrentMatchIndex(prev => (prev + 1) % matchCount);
                          }
                        }
                      }}
                      className="form-input"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }}
                    />
                    {docSearchQuery && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {matchCount > 0 ? `${currentMatchIndex + 1} / ${matchCount}` : '0 / 0'}
                        </span>
                        <button type="button" onClick={() => { setDocSearchQuery(''); setCurrentMatchIndex(0); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                         <i className="fi fi-rr-cross-circle" style={{ fontSize: 14 }} />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontFamily: 'sans-serif', background: 'var(--bg-primary)' }}>
              {docSearchQuery.trim() ? (() => {
                const regex = new RegExp(`(${docSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = selectedDoc.markdown_content.split(regex);
                let matchIdx = -1;
                return parts.map((part: string, i: number) => {
                  if (part.toLowerCase() === docSearchQuery.trim().toLowerCase()) {
                    matchIdx++;
                    const isActive = matchIdx === currentMatchIndex;
                    return (
                      <mark 
                        id={isActive ? 'search-match-active' : undefined} 
                        key={i} 
                        style={{ backgroundColor: isActive ? '#f97316' : '#fef08a', color: isActive ? '#fff' : '#000', padding: '0 2px', borderRadius: 2 }}
                      >
                        {part}
                      </mark>
                    );
                  }
                  return part;
                });
              })() : selectedDoc.markdown_content}
            </div>
            {selectedDoc.original_filename && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-color)', fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>원본 파일: {selectedDoc.original_filename} (서버에는 최적화를 위해 추출된 텍스트만 보관됩니다)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function PluginPlaceholder({ name }: { name: string }) {
  return (
    <div className="empty-state">
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}><i className="fi fi-rr-plug" /></div>
      <h3>{name}</h3>
      <p>이 플러그인은 Phase 1에서 구현 예정입니다. 아직 개발 중인 기능입니다.</p>
    </div>
  )
}

function getPageTitle(page: string): string {
  const titles: Record<string, string> = {
    dashboard: '통합 검색',
    messenger: '교사 메신저',
    announcement: '공문전달',
    todo: '투두리스트',
    'student-alert': '학생 알림',
    attendance: '출결',
    gatong: '가정통신문',
    sendoc: '전자문서/서명',
    studentmgmt: '학생관리',
    curriculum: '주간학습·평가',
    aianalysis: 'AI 문서 생성',
    schoolevents: '학교행사·투표/설문',
    linker: 'linker',
    pcinfo: 'pc-info',
    'hwp-converter': 'HWP 문서 변환',
    'xlsx-converter': 'Excel to PDF 변환',
    'pptx-converter': 'PPT to PDF 변환',
    settings: '설정',
    profile: '내 프로필',
    classmgmt: '반편성 관리',
    resourcemgmt: '시설 예약',
    schooladmin: '행정 및 인사 관리',
    knowledge: '업무 규칙/정보',
    'behavior-opinion': '행동특성 및 종합의견',
  }
  return titles[page] || page
}

export default DashboardPage
