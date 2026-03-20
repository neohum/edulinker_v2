import { useState } from 'react'
import type { UserInfo } from '../App'
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

interface DashboardPageProps {
  user: UserInfo
  onLogout: () => void
}

type PageView = 'dashboard' | 'messenger' | 'announcement' | 'todo' | 'student-alert' | 'attendance' | 'gatong' | 'sendoc' | 'studentmgmt' | 'curriculum' | 'aianalysis' | 'schoolevents' | 'linker' | 'pcinfo' | 'settings'

function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [currentPage, setCurrentPage] = useState<PageView>('dashboard')

  return (
    <div className="app-container">
      <Sidebar
        user={user}
        currentPage={currentPage}
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
          {currentPage === 'sendoc' && <SendocPage />}
          {currentPage === 'studentmgmt' && <StudentMgmtPage />}
          {currentPage === 'curriculum' && <CurriculumPage />}
          {currentPage === 'aianalysis' && <AIAnalysisPage />}
          {currentPage === 'schoolevents' && <SchoolEventsPage />}
          {currentPage === 'messenger' && <MessengerPage user={user} />}
          {currentPage === 'announcement' && <AnnouncementPage />}
          {currentPage === 'todo' && <TodoPage />}
          {currentPage === 'attendance' && <AttendancePage />}
          {currentPage === 'student-alert' && <StudentAlertPage />}
          {currentPage === 'linker' && <LinkerPage />}
          {currentPage === 'pcinfo' && <PcInfoPage />}
          {currentPage === 'settings' && <SettingsPage />}

          {currentPage !== 'dashboard' && currentPage !== 'gatong' && currentPage !== 'sendoc' && currentPage !== 'studentmgmt' && currentPage !== 'curriculum' && currentPage !== 'aianalysis' && currentPage !== 'schoolevents' && currentPage !== 'messenger' && currentPage !== 'announcement' && currentPage !== 'todo' && currentPage !== 'attendance' && currentPage !== 'student-alert' && currentPage !== 'linker' && currentPage !== 'pcinfo' && currentPage !== 'settings' && <PluginPlaceholder name={getPageTitle(currentPage)} />}
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

      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>활성화된 플러그인</h3>
        <div className="plugin-grid">
          <PluginCard name="교사 메신저" desc="교내 채팅 서비스" icon="fi fi-rr-comment" group="A" enabled />
          <PluginCard name="공문전달" desc="공문 분류 및 확인" icon="fi fi-rr-document" group="A" enabled />
          <PluginCard name="투두리스트" desc="개인·학교 할 일 관리" icon="fi fi-rr-checkbox" group="A" enabled />
          <PluginCard name="학생 알림" desc="학생에게 알림 전송" icon="fi fi-rr-bell" group="A" enabled />
          <PluginCard name="지각·결석" desc="원터치 출결 관리" icon="fi fi-rr-alarm-clock" group="A" enabled />
          <PluginCard name="가정통신문(가통)" desc="통신문, 설문조사 발송" icon="fi fi-rr-envelope-open" group="A" enabled />
          <PluginCard name="전자문서·서명" desc="결재 기안 및 서명 진행" icon="fi fi-rr-edit" group="B" enabled />
          <PluginCard name="학생 상담·관리" desc="학생 개인별 상담 일지" icon="fi fi-rr-graduation-cap" group="D" enabled />
          <PluginCard name="주간학습·평가" desc="주간학습안내 및 단원평가 배열" icon="fi fi-rr-book" group="E" enabled />
          <PluginCard name="AI 세특·종특 도우미" desc="학생 평가문 초안 자동생성" icon="fi fi-rr-magic-wand" group="G" enabled />
          <PluginCard name="학교행사·투표" desc="찬반/선택 투표 개설" icon="fi fi-rr-calendar-check" group="H" enabled />
          <PluginCard name="linker" desc="즐겨찾기 대시보드" icon="fi fi-rr-link" group="I" enabled />
          <PluginCard name="pc-info" desc="PC 정보 수집·관리" icon="fi fi-rr-computer" group="I" enabled />
          <PluginCard name="교사화면 설정" desc="학생 화면 서비스 선택" icon="fi fi-rr-settings" group="I" enabled />
        </div>
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

function PluginCard({ name, desc, icon, group, enabled }: { name: string; desc: string; icon: string; group: string; enabled?: boolean }) {
  return (
    <div className="plugin-card">
      <div className="plugin-card-header">
        <div className="plugin-card-icon" style={{ background: 'rgba(59,130,246,0.15)' }}>
          <i className={icon} />
        </div>
        <div>
          <div className="plugin-card-name">{name}</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>그룹 {group}</span>
        </div>
      </div>
      <div className="plugin-card-desc">{desc}</div>
      <div className={`plugin-card-badge ${enabled ? 'enabled' : 'disabled'}`}>
        {enabled ? '● 활성' : '○ 비활성'}
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
    studentmgmt: '학생관리·상담',
    curriculum: '주간학습·평가',
    aianalysis: 'AI 생기부 분석',
    schoolevents: '학교행사·투표',
    linker: 'linker',
    pcinfo: 'pc-info',
    settings: '설정',
  }
  return titles[page] || page
}

export default DashboardPage
