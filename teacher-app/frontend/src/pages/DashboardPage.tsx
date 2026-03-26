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

// === Local Semantic RAG Utilities ===
interface LocalChunk {
  docId: string;
  docTitle: string;
  sourceType: string;
  text: string;
  vector: number[];
}

const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const res = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    if (res.ok) {
      const data = await res.json();
      return data.embedding || [];
    }
  } catch (e) {
    console.error("Local embedding failed:", e);
  }
  return [];
};

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const splitIntoChunks = (text: string, maxLen = 500): string[] => {
  if (!text) return [];
  const rawChunks = text.split(/\n\s*\n/);
  const result: string[] = [];
  for (const rc of rawChunks) {
    let current = rc.trim();
    while (current.length > maxLen) {
      let breakPoint = current.substring(0, maxLen).lastIndexOf('. ');
      if (breakPoint < maxLen * 0.5) breakPoint = maxLen; // Hard cut fallback
      result.push(current.substring(0, breakPoint + 1).trim());
      current = current.substring(breakPoint + 1).trim();
    }
    if (current.length > 20) {
      result.push(current);
    }
  }
  return result;
};
// ====================================

interface DashboardPageProps {
  user: UserInfo
  onLogout: () => void
}

type PageView = 'dashboard' | 'messenger' | 'announcement' | 'todo' | 'student-alert' | 'attendance' | 'gatong' | 'sendoc' | 'studentmgmt' | 'counseling' | 'curriculum' | 'aianalysis' | 'schoolevents' | 'linker' | 'pcinfo' | 'hwp-converter' | 'xlsx-converter' | 'pptx-converter' | 'settings' | 'profile' | 'classmgmt' | 'resourcemgmt' | 'schooladmin' | 'knowledge'

function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [currentPage, setCurrentPage] = useState<PageView>('dashboard')
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [pendingDocCount, setPendingDocCount] = useState(0)

  useEffect(() => {
    fetchPendingDocCount()
    const interval = setInterval(fetchPendingDocCount, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [])

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
          sendoc: pendingDocCount > 0 ? pendingDocCount : undefined
        }}
        onNavigate={(page) => setCurrentPage(page as PageView)}
        onLogout={onLogout}
      />

      <div className="main-content">
        <header className="main-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16 }}>
          <h2 className="main-header-title" style={{ margin: 0 }}>{getPageTitle(currentPage)}</h2>
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
          {currentPage === 'schoolevents' && <SchoolEventsPage />}
          {currentPage === 'classmgmt' && <ClassMgmtPage />}
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

          {currentPage !== 'dashboard' && currentPage !== 'gatong' && currentPage !== 'sendoc' && currentPage !== 'studentmgmt' && currentPage !== 'curriculum' && currentPage !== 'aianalysis' && currentPage !== 'schoolevents' && currentPage !== 'messenger' && currentPage !== 'announcement' && currentPage !== 'todo' && currentPage !== 'attendance' && currentPage !== 'student-alert' && currentPage !== 'linker' && currentPage !== 'pcinfo' && currentPage !== 'settings' && currentPage !== 'profile' && currentPage !== 'classmgmt' && currentPage !== 'resourcemgmt' && currentPage !== 'schooladmin' && currentPage !== 'knowledge' && <PluginPlaceholder name={getPageTitle(currentPage)} />}
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const localChunksRef = useRef<LocalChunk[]>([])
  const [isEmbeddingDocs, setIsEmbeddingDocs] = useState(false)

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
    // Incremental sync of knowledge documents
    const syncDocs = async () => {
      try {
        const lastSyncStr = localStorage.getItem('knowledge_last_sync')
        const cachedDocsStr = localStorage.getItem('knowledge_cache')
        let cachedDocs: any[] = cachedDocsStr ? JSON.parse(cachedDocsStr) : []

        if (cachedDocs.length > 0) setDocs(cachedDocs)

        const url = lastSyncStr
          ? `/api/plugins/knowledge/sync?since=${encodeURIComponent(lastSyncStr)}`
          : '/api/plugins/knowledge/sync'

        const res = await apiFetch(url)
        if (res.ok) {
          const data = await res.json()
          const allIds = data.all_ids || []
          const updatedDocs = data.updated_docs || []

          let merged = cachedDocs.filter(d => allIds.includes(d.id))
          updatedDocs.forEach((newDoc: any) => {
            const idx = merged.findIndex(d => d.id === newDoc.id)
            if (idx >= 0) merged[idx] = newDoc
            else merged.push(newDoc)
          })

          setDocs(merged)
          localStorage.setItem('knowledge_cache', JSON.stringify(merged))
          localStorage.setItem('knowledge_last_sync', new Date().toISOString())
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

  // Load existing embeddings from cache once on mount
  useEffect(() => {
    const rawChunks = localStorage.getItem('knowledge_local_chunks');
    if (rawChunks) {
      try { localChunksRef.current = JSON.parse(rawChunks); } catch (e) {}
    }
  }, []);

  // Background processor for converting synced documents to dense vectors using local Ollama
  useEffect(() => {
    if (docs.length === 0) return;
    let isActive = true;

    const processEmbeddings = async () => {
      setIsEmbeddingDocs(true);
      let currentChunks = [...localChunksRef.current];
      const activeDocIds = new Set(docs.map(d => d.id));
      currentChunks = currentChunks.filter(c => activeDocIds.has(c.docId));
      let modified = false;

      for (const doc of docs) {
        if (!isActive) break;
        if (!doc.markdown_content) continue;
        
        const docChunkCount = currentChunks.filter(c => c.docId === doc.id).length;
        if (docChunkCount > 0) continue; 

        const textChunks = splitIntoChunks(doc.markdown_content, 450);
        for (const text of textChunks) {
          if (!isActive) break;
          const vec = await getEmbedding(text);
          if (vec.length > 0) {
            currentChunks.push({
              docId: doc.id,
              docTitle: doc.title,
              sourceType: doc.source_type,
              text,
              vector: vec
            });
            modified = true;
          }
        }
      }
      
      if (modified && isActive) {
        localChunksRef.current = currentChunks;
        localStorage.setItem('knowledge_local_chunks', JSON.stringify(currentChunks));
      }
      if (isActive) setIsEmbeddingDocs(false);
    };

    const timer = setTimeout(processEmbeddings, 1500);
    return () => { isActive = false; clearTimeout(timer); };
  }, [docs]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isSearching) return

    const userQuery = query.trim();
    setQuery('');
    setIsSearching(true);

    const keywords = userQuery.toLowerCase().split(/[\s,?\.:]+/).filter(k => k.length > 1);
    const validKeywords = keywords.length > 0 ? keywords : [userQuery.toLowerCase()];

    // 1. Lexical Search
    const lexicalScores = new Map<string, { doc: any; score: number; firstMatchIdx: number }>();
    docs.forEach(doc => {
      const titleLower = doc.title.toLowerCase()
      const contentLower = doc.markdown_content?.toLowerCase() || ''
      let score = 0;
      let firstMatchIdx = -1;

      validKeywords.forEach(k => {
        if (titleLower.includes(k)) score += 10;
        const idx = contentLower.indexOf(k);
        if (idx !== -1) {
          score += 2;
          const count = (contentLower.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          score += Math.min(count, 5);
          if (firstMatchIdx === -1 || idx < firstMatchIdx) firstMatchIdx = idx;
        }
      });
      if (score > 0) {
        lexicalScores.set(doc.id, { doc, score, firstMatchIdx });
      }
    });

    // 2. Semantic Search
    let semanticMatches: { chunk: LocalChunk; score: number }[] = [];
    try {
       const queryVector = await getEmbedding(userQuery);
       if (queryVector.length > 0) {
         semanticMatches = localChunksRef.current.map(chunk => {
           const sim = cosineSimilarity(queryVector, chunk.vector);
           return { chunk, score: sim };
         }).filter(m => m.score > 0.40).sort((a, b) => b.score - a.score);
       }
    } catch(e) {}

    // 3. Fusion matching
    const combinedMatches: { doc: any; matchSnippet: string; score: number; isSemantic: boolean }[] = [];
    const seenDocs = new Set<string>();
    
    semanticMatches.slice(0, 3).forEach(sm => {
      const doc = docs.find(d => d.id === sm.chunk.docId);
      if (doc && !seenDocs.has(doc.id)) {
        combinedMatches.push({ doc, matchSnippet: sm.chunk.text, score: sm.score * 100 + 50, isSemantic: true });
        seenDocs.add(doc.id);
      }
    });

    const sortedLexical = Array.from(lexicalScores.values()).sort((a, b) => b.score - a.score);
    sortedLexical.forEach(lx => {
      if (!seenDocs.has(lx.doc.id) && combinedMatches.length < 5) {
        let snippet = '';
        if (lx.firstMatchIdx === -1) {
          snippet = `[제목 일치] ${lx.doc.markdown_content?.substring(0, 150) || ''}...`;
        } else {
          const contentLower = lx.doc.markdown_content || '';
          const start = Math.max(0, lx.firstMatchIdx - 40);
          const end = Math.min(contentLower.length, lx.firstMatchIdx + 150);
          snippet = contentLower.substring(start, end).replace(/\n/g, ' ');
          if (start > 0) snippet = '...' + snippet;
          if (end < contentLower.length) snippet = snippet + '...';
        }
        combinedMatches.push({ doc: lx.doc, matchSnippet: snippet, score: lx.score, isSemantic: false });
        seenDocs.add(lx.doc.id);
      }
    });
    
    combinedMatches.sort((a, b) => b.score - a.score);
    const finalMatches = combinedMatches.slice(0, 5);

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

    const matchContext = finalMatches.slice(0, 3).map(m => {
      return `### 문서 제목: ${m.doc.title}\n${m.matchSnippet}`;
    }).join('\n\n');

    const systemPrompt = `당신은 학교 업무 보조 및 규정 안내를 담당하는 AI 어시스턴트입니다. 
아래 제공된 [참고 문서]에 질문과 관련된 내용이 있다면 이를 최우선으로 분석하여 답변하세요. 
만약 [참고 문서]에 정확히 일치하거나 명시된 내용이 없더라도, 당신이 가진 기본 지식과 질문의 문맥을 고려하여 일반적인 업무 기준에 맞춰 유연하게 조언해 주세요. 
단, 기본 지식으로 답변할 경우 '학교별 세부 규정에 따라 다를 수 있으므로 최종 확인이 필요하다'는 점을 덧붙여 주시면 좋습니다.

[참고 문서]
${matchContext || '현재 검색된 관련 문서 내용이 없습니다. AI의 기본 지식을 바탕으로 유연하게 답변해 주세요.'}`;

    if ((window as any).go?.main?.App?.GenerateAIStream) {
      let selectedModel = "gemma3:4b"; // default fallback
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
        console.error("Failed to fetch local AI models safely via Wails", e);
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
                placeholder="단어로 검색하세요"
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontFamily: 'sans-serif', background: 'var(--bg-primary)' }}>
              {selectedDoc.markdown_content}
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
    dashboard: '대시보드',
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
    schoolevents: '학교행사·투표',
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
  }
  return titles[page] || page
}

export default DashboardPage
