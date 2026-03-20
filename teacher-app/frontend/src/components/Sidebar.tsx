import type { UserInfo } from '../App'

interface SidebarProps {
  user: UserInfo
  currentPage: string
  onNavigate: (page: string) => void
  onLogout: () => void
}

interface NavItem {
  id: string
  label: string
  icon: string
  badge?: number
}

const coreItems: NavItem[] = [
  { id: 'dashboard', label: '대시보드', icon: 'fi fi-rr-home' },
]

const pluginGroupA: NavItem[] = [
  { id: 'messenger', label: '교사 메신저', icon: 'fi fi-rr-comment' },
  { id: 'announcement', label: '공문전달', icon: 'fi fi-rr-document' },
  { id: 'todo', label: '투두리스트', icon: 'fi fi-rr-checkbox' },
  { id: 'student-alert', label: '학생 알림', icon: 'fi fi-rr-bell' },
  { id: 'attendance', label: '지각·결석', icon: 'fi fi-rr-alarm-clock' },
  { id: 'gatong', label: '가정통신문', icon: 'fi fi-rr-envelope-open' },
]

const pluginGroupB: NavItem[] = [
  { id: 'sendoc', label: '전자문서/서명', icon: 'fi fi-rr-edit' },
]

const pluginGroupC: NavItem[] = [
  { id: 'teacherhr', label: '교사인사·복무', icon: 'fi fi-rr-building' },
]

const pluginGroupD: NavItem[] = [
  { id: 'studentmgmt', label: '학생관리·상담', icon: 'fi fi-rr-graduation-cap' },
]

const pluginGroupE: NavItem[] = [
  { id: 'curriculum', label: '주간학습·평가', icon: 'fi fi-rr-book' },
]

const pluginGroupG: NavItem[] = [
  { id: 'aianalysis', label: 'AI 세특·종특 도우미', icon: 'fi fi-rr-magic-wand' },
]

const pluginGroupH: NavItem[] = [
  { id: 'schoolevents', label: '학급행사·투표', icon: 'fi fi-rr-calendar-check' },
]

const pluginGroupI: NavItem[] = [
  { id: 'linker', label: 'linker', icon: 'fi fi-rr-link' },
  { id: 'pcinfo', label: 'pc-info', icon: 'fi fi-rr-computer' },
]

const systemItems: NavItem[] = [
  { id: 'settings', label: '설정', icon: 'fi fi-rr-settings' },
]

function Sidebar({ user, currentPage, onNavigate, onLogout }: SidebarProps) {
  const roleLabel: Record<string, string> = {
    teacher: '교사',
    admin: '관리자',
    parent: '학부모',
    student: '학생',
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">E</div>
          <div>
            <div className="sidebar-logo-text">edulinker</div>
            <div className="sidebar-logo-version">v1.0.0 · Phase 1</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {/* Core */}
        {coreItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
            {item.badge && <span className="sidebar-item-badge">{item.badge}</span>}
          </button>
        ))}

        {/* Group A */}
        <div className="sidebar-section-title">A · 핵심 소통</div>
        {pluginGroupA.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group B */}
        <div className="sidebar-section-title">B · 문서·결재</div>
        {pluginGroupB.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group D */}
        <div className="sidebar-section-title">D · 학생관리</div>
        {pluginGroupD.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group E */}
        <div className="sidebar-section-title">E · 수업·평가</div>
        {pluginGroupE.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group G */}
        <div className="sidebar-section-title">G · AI 생기부 분석</div>
        {pluginGroupG.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group H */}
        <div className="sidebar-section-title">H · 학교행사·투표</div>
        {pluginGroupH.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* Group I */}
        <div className="sidebar-section-title">I · 인프라·도구</div>
        {pluginGroupI.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}

        {/* System */}
        <div className="sidebar-section-title">시스템</div>
        {systemItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon"><i className={item.icon} /></span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={onLogout} title="로그아웃">
          <div className="sidebar-user-avatar">
            {user.name.charAt(0)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">
              {user.school} · {roleLabel[user.role] || user.role}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
