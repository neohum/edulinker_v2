import { useState, useEffect } from 'react'
import type { UserInfo } from '../App'
import logoUrl from '../assets/images/logo-universal.png'
import { GetAppVersion } from '../../wailsjs/go/main/App'

interface SidebarProps {
  user: UserInfo
  currentPage: string
  badges?: Record<string, number | undefined>
  onNavigate: (page: string) => void
  onLogout: () => void
}

interface NavItem {
  id: string
  label: string
  icon: string
  badge?: number
  priceType?: 'free' | 'paid' | 'partial'
}

const OFFLINE_ENABLED_IDS = ['dashboard', 'knowledge', 'aianalysis', 'pcinfo', 'settings', 'profile', 'todo', 'attendance', 'counseling', 'behavior-opinion', 'curriculum', 'linker', 'studentmgmt', 'announcement']

const coreItems: NavItem[] = [
  { id: 'dashboard', label: '통합 검색', icon: 'fi fi-rr-search' },
]

const pluginGroupA: NavItem[] = [
  { id: 'announcement', label: '공문전달', icon: 'fi fi-rr-document' },
  { id: 'todo', label: '투두리스트', icon: 'fi fi-rr-checkbox' },
  // { id: 'student-alert', label: '학생 알림', icon: 'fi fi-rr-bell' },
  { id: 'attendance', label: '출결', icon: 'fi fi-rr-alarm-clock' },
  // { id: 'gatong', label: '가정통신문', icon: 'fi fi-rr-envelope-open', priceType: 'paid' },
  { id: 'knowledge', label: '업무 규칙/정보', icon: 'fi fi-rr-book-bookmark' },
]

const pluginGroupB: NavItem[] = [
  { id: 'sendoc', label: '전자문서/서명', icon: 'fi fi-rr-edit' },
]

const pluginGroupC: NavItem[] = [
  { id: 'schooladmin', label: '행정 및 인사 관리', icon: 'fi fi-rr-briefcase' },
  { id: 'teacherhr', label: '교사인사·복무', icon: 'fi fi-rr-building' },
]

const pluginGroupD: NavItem[] = [
  { id: 'studentmgmt', label: '학생관리', icon: 'fi fi-rr-graduation-cap' },
  { id: 'counseling', label: '상담/생활기록', icon: 'fi fi-rr-comments' },
  // { id: 'classmgmt', label: '반편성 관리', icon: 'fi fi-rr-users' },
  { id: 'behavior-opinion', label: '행동특성 및 종합의견', icon: 'fi fi-rr-document-signed' },
]

const pluginGroupE: NavItem[] = [
  { id: 'curriculum', label: '수행평가', icon: 'fi fi-rr-book' },
]

const pluginGroupG: NavItem[] = [
  { id: 'aianalysis', label: 'AI 문서 생성', icon: 'fi fi-rr-magic-wand' /*, priceType: 'partial' */ },
]

const pluginGroupH: NavItem[] = [
  { id: 'schoolevents', label: '투표/설문', icon: 'fi fi-rr-vote-yea' },
]

const pluginGroupI: NavItem[] = [
  { id: 'linker', label: 'linker', icon: 'fi fi-rr-link' },
  { id: 'pcinfo', label: 'pc-info', icon: 'fi fi-rr-computer' },
  { id: 'resourcemgmt', label: '시설 예약', icon: 'fi fi-rr-building' },
]

const systemItems: NavItem[] = []

function Sidebar({ user, currentPage, badges, onNavigate, onLogout }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [version, setVersion] = useState('v1.0.0')
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('sidebar_favorites')
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { }
    }
    return ['aianalysis', 'sendoc']
  })

  useEffect(() => {
    GetAppVersion().then(v => {
      if (v) setVersion(v)
    })
  }, [])

  // Load saved group states or default to all closed
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar_open_groups')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse sidebar states', e)
      }
    }
    // Default: All closed except system
    return {
      favorites: true,
      groupA: false,
      groupB: false,
      groupC: false,
      groupD: false,
      groupE: false,
      groupG: false,
      groupH: false,
      groupI: false,
      system: true,
    }
  })

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      localStorage.setItem('sidebar_favorites', JSON.stringify(next))
      return next
    })
  }

  const allItems = [
    ...coreItems, ...pluginGroupA, ...pluginGroupB, ...pluginGroupC,
    ...pluginGroupD, ...pluginGroupE, ...pluginGroupG, ...pluginGroupH,
    ...pluginGroupI, ...systemItems
  ]

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] }
      localStorage.setItem('sidebar_open_groups', JSON.stringify(next))
      return next
    })
  }

  const roleLabel: Record<string, string> = {
    teacher: '교사',
    admin: '관리자',
    parent: '학부모',
    student: '학생',
  }

  const renderGroupTitle = (id: string, label: string) => {
    if (isCollapsed) return <div className="sidebar-section-divider" />

    const isOpen = openGroups[id]
    return (
      <div
        onClick={() => toggleGroup(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px 8px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        className="sidebar-section-title-container"
      >
        <div className="sidebar-section-title" style={{ padding: 0, margin: 0 }}>{label}</div>
        <i className={`fi ${isOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'}`} style={{ fontSize: 12, color: 'var(--text-muted)' }} />
      </div>
    )
  }

  const renderItems = (items: NavItem[], groupId: string | null) => {
    if (!isCollapsed && groupId !== null && !openGroups[groupId] && !searchQuery) return null
    return items.map((item) => {
      const isFav = favorites.includes(item.id)
      const uKey = groupId ? `${groupId}-${item.id}` : `search-${item.id}`
      const isOfflineDisabled = user.isOffline && !OFFLINE_ENABLED_IDS.includes(item.id)

      return (
        <button
          key={uKey}
          className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
          onClick={(e) => {
            if (isOfflineDisabled) {
              e.preventDefault()
              return
            }
            onNavigate(item.id)
          }}
          title={isCollapsed ? item.label : undefined}
          style={isOfflineDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          disabled={isOfflineDisabled}
        >
          <span className="sidebar-item-icon"><i className={item.icon} /></span>
          {!isCollapsed && <span className="sidebar-item-label" style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
          {!isCollapsed && isOfflineDisabled && (
            <span className="sidebar-price-badge" style={{ background: '#f87171', color: 'white', border: 'none' }}>
              사용불가
            </span>
          )}
          {!isCollapsed && !isOfflineDisabled && item.priceType && (
            <span className={`sidebar-price-badge ${item.priceType}`}>
              {item.priceType === 'paid' ? '유료' : item.priceType === 'partial' ? '부분' : '무료'}
            </span>
          )}
          {((badges && badges[item.id]) || item.badge) && !isOfflineDisabled ? (
            <span className="sidebar-item-badge">{badges?.[item.id] || item.badge}</span>
          ) : null}
          {!isCollapsed && item.id !== 'dashboard' && item.id !== 'settings' && (
            <div
              onClick={(e) => {
                if (isOfflineDisabled) return;
                toggleFavorite(e, item.id)
              }}
              className={`sidebar-fav-btn ${isFav ? 'active' : ''}`}
              title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              style={isOfflineDisabled ? { display: 'none' } : {}}
            >
              <i className={`fi ${isFav ? 'fi-sr-star' : 'fi-rr-star'}`} style={{ fontSize: 13 }} />
            </div>
          )}
        </button>
      )
    })
  }

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="sidebar-logo">
          <img src={logoUrl} className="sidebar-logo-icon" alt="EduLinker Logo" title="대시보드" onClick={() => { if (isCollapsed) setIsCollapsed(false); onNavigate('dashboard'); }} style={{ cursor: 'pointer', width: '32px', height: '32px', objectFit: 'contain' }} />
          {!isCollapsed && (
            <div onClick={() => onNavigate('dashboard')} style={{ cursor: 'pointer' }} title="대시보드">
              <div className="sidebar-logo-text">edulinker</div>
              <div className="sidebar-logo-version">{version}</div>
            </div>
          )}
        </div>
        <button
          className="sidebar-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <i className={`fi ${isCollapsed ? 'fi-rr-angle-right' : 'fi-rr-angle-left'}`} />
        </button>
      </div>

      {/* Search Box */}
      {!isCollapsed && (
        <div style={{ padding: '24px 16px 12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <i className="fi fi-rr-search" style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="메뉴 빠른 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'rgba(0,0,0,0.03)', color: 'var(--text)' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {searchQuery ? (
          <>
            <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>"{searchQuery}" 검색 결과 ({allItems.filter(i => i.label.toLowerCase().includes(searchQuery.toLowerCase())).length}건)</div>
            {renderItems(allItems.filter(i => i.label.toLowerCase().includes(searchQuery.toLowerCase())), null)}
          </>
        ) : (
          <>
            {/* Core (Always visible) */}
            {coreItems.map((item) => (
              <button
                key={item.id}
                className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="sidebar-item-icon"><i className={item.icon} /></span>
                {!isCollapsed && <span className="sidebar-item-label">{item.label}</span>}
              </button>
            ))}

            {!isCollapsed && favorites.length > 0 && (
              <>
                {renderGroupTitle('favorites', '📌 내 즐겨찾기')}
                {renderItems(allItems.filter(i => favorites.includes(i.id)), 'favorites')}
              </>
            )}

            {/* Group Mapping Helper */}
            {(() => {
              const renderFilteredGroup = (groupId: string, title: string, items: NavItem[]) => {
                const filteredItems = items.filter(i => !favorites.includes(i.id));
                if (filteredItems.length === 0) return null;
                return (
                  <>
                    {renderGroupTitle(groupId, title)}
                    {renderItems(filteredItems, groupId)}
                  </>
                );
              };

              return (
                <>
                  {renderFilteredGroup('groupA', 'A · 핵심 소통', pluginGroupA)}
                  {renderFilteredGroup('groupB', 'B · 문서·결재', pluginGroupB)}
                  {renderFilteredGroup('groupD', 'C · 학생관리', pluginGroupD)}
                  {renderFilteredGroup('groupE', 'D · 수업·평가', pluginGroupE)}
                  {renderFilteredGroup('groupG', 'E · AI 문서 생성', pluginGroupG)}
                  {renderFilteredGroup('groupH', 'F · 학교행사·투표/설문', pluginGroupH)}
                  {renderFilteredGroup('groupI', 'G · 인프라·도구', pluginGroupI)}
                </>
              );
            })()}
          </>
        )}
      </nav>


      {/* User Footer */}
      <div className="sidebar-footer">
        <div className={`sidebar-user ${isCollapsed ? 'collapsed' : ''}`} onClick={() => isCollapsed ? setIsCollapsed(false) : onNavigate('profile')} title={isCollapsed ? "프로필 보기" : undefined}>
          <div className="sidebar-user-avatar" style={user.profileImage ? { backgroundImage: `url(${user.profileImage})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : {}}>
            {!user.profileImage && user.name.charAt(0)}
          </div>
          {!isCollapsed && (
            <>
              <div className="sidebar-user-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                <div className="sidebar-user-role" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.school} {user.department ? `· ${user.department}` : ''} · {roleLabel[user.role] || user.role}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="sidebar-logout-btn" onClick={(e) => { e.stopPropagation(); onNavigate('settings'); }} title="설정" aria-label="설정" style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fi fi-rr-settings" />
                </button>
                <button className="sidebar-logout-btn" onClick={(e) => { e.stopPropagation(); onLogout(); }} title="로그아웃" aria-label="로그아웃" style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fi fi-rr-sign-out-alt" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
