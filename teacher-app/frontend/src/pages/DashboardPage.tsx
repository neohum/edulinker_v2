import { useState, useEffect, useRef } from 'react'
import type { UserInfo } from '../App'
import { apiFetch } from '../api'
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
        <header className="main-header">
          <h2 className="main-header-title">{getPageTitle(currentPage)}</h2>
        </header>

        <div className="main-body">
          {currentPage === 'dashboard' && <DashboardView user={user} />}
          {currentPage === 'gatong' && <GatongPage />}
          {currentPage === 'sendoc' && <SendocPage user={user} />}
          {currentPage === 'studentmgmt' && <StudentMgmtPage user={user} />}
          {currentPage === 'counseling' && <CounselingPage user={user} />}
          {currentPage === 'curriculum' && <CurriculumPage user={user} />}
          {currentPage === 'aianalysis' && <AIAnalysisPage onNavigate={(p) => setCurrentPage(p as PageView)} />}
          {currentPage === 'schoolevents' && <SchoolEventsPage />}
          {currentPage === 'classmgmt' && <ClassMgmtPage />}
          {currentPage === 'resourcemgmt' && <ResourceMgmtPage />}
          {currentPage === 'schooladmin' && <SchoolAdminPage user={user} />}

          <div style={{ display: currentPage === 'messenger' ? 'block' : 'none', height: '100%' }}>
            <MessengerPage user={user} isActive={currentPage === 'messenger'} onUnreadChange={setUnreadMsgCount} />
          </div>

          {currentPage === 'announcement' && <AnnouncementPage />}
          {currentPage === 'todo' && <TodoPage />}
          {currentPage === 'attendance' && <AttendancePage />}
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
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          안녕하세요, {user.name} 선생님 <i className="fi fi-rr-hand-wave" />
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 14 }}>
          {user.school} · {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      <div className="dashboard-grid">
        <StatCard icon="fi fi-rr-comment" label="읽지 않은 메시지" value="—" color="blue" />
        <StatCard icon="fi fi-rr-document" label="미확인 공문" value="—" color="orange" />
        <StatCard icon="fi fi-rr-checkbox" label="오늘 할 일" value="—" color="green" />
        <StatCard icon="fi fi-rr-bell" label="알림" value="—" color="purple" />
      </div>

      <div style={{ marginTop: 24 }}>
        <KnowledgeChatWidget />
      </div>

    </>
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

function KnowledgeChatWidget() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isTyping) return

    const userMsg = query.trim()
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setQuery('')
    setIsTyping(true)

    try {
      const res = await apiFetch('/api/plugins/knowledge/ask', {
        method: 'POST',
        body: JSON.stringify({ query: userMsg })
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '검색 중 오류가 발생했습니다.' }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '네트워크 연결 오류입니다.' }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 400 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fi fi-rr-robot" />
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>업무 규칙 AI 어시스턴트</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>학교 규정 및 매뉴얼 내용을 질문해보세요.</p>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fi fi-rr-sparkles" style={{ fontSize: 32, opacity: 0.5, marginBottom: 12, display: 'block' }} />
            <p style={{ fontSize: 14 }}>"휴직 처리 절차가 어떻게 되나요?"<br />"생활기록부 정정 방법 알려주세요." 등<br />결재, 복무, 규정에 대해 질문해보세요.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(59, 130, 246, 0.1)', color: msg.role === 'user' ? 'white' : 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`fi ${msg.role === 'user' ? 'fi-rr-user' : 'fi-rr-robot'}`} style={{ fontSize: 13 }} />
              </div>
              <div style={{
                maxWidth: '75%', padding: '12px 16px', borderRadius: 16, fontSize: 14, lineHeight: 1.5,
                background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                borderTopRightRadius: msg.role === 'user' ? 4 : 16,
                borderTopLeftRadius: msg.role === 'assistant' ? 4 : 16,
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="fi fi-rr-robot" style={{ fontSize: 13 }} />
            </div>
            <div style={{ padding: '12px 16px', borderRadius: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderTopLeftRadius: 4 }}>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="form-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="규칙이나 규정을 검색해보세요..."
            style={{ flex: 1, borderRadius: 24, paddingLeft: 20 }}
            disabled={isTyping}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={isTyping || !query.trim()}
            style={{ borderRadius: 24, width: 44, height: 44, padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <i className="fi fi-rr-paper-plane" />
          </button>
        </form>
      </div>
    </div>
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
    attendance: '지각·결석',
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
