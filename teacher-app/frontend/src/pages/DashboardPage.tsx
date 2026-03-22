import { useState, useEffect } from 'react'
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

interface DashboardPageProps {
  user: UserInfo
  onLogout: () => void
}

type PageView = 'dashboard' | 'messenger' | 'announcement' | 'todo' | 'student-alert' | 'attendance' | 'gatong' | 'sendoc' | 'studentmgmt' | 'counseling' | 'curriculum' | 'aianalysis' | 'schoolevents' | 'linker' | 'pcinfo' | 'hwp-converter' | 'xlsx-converter' | 'pptx-converter' | 'settings' | 'profile'

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

          {currentPage !== 'dashboard' && currentPage !== 'gatong' && currentPage !== 'sendoc' && currentPage !== 'studentmgmt' && currentPage !== 'curriculum' && currentPage !== 'aianalysis' && currentPage !== 'schoolevents' && currentPage !== 'messenger' && currentPage !== 'announcement' && currentPage !== 'todo' && currentPage !== 'attendance' && currentPage !== 'student-alert' && currentPage !== 'linker' && currentPage !== 'pcinfo' && currentPage !== 'settings' && currentPage !== 'profile' && <PluginPlaceholder name={getPageTitle(currentPage)} />}
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
    studentmgmt: '학생관리·상담',
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
  }
  return titles[page] || page
}

export default DashboardPage
