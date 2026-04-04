import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

interface Bookmark {
  id: string
  title: string
  url: string
  student_url: string
  category: string
  is_shared: boolean
  share_teachers: boolean
  share_class: boolean
  target_ids: string
  is_own: boolean
  sort_order: number
}

interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  isUser?: boolean
}

const TreeNodeView = ({ node, selectedIds, onToggleSelect, expandedNodes, onToggleExpand }: { node: TreeNode, selectedIds: string[], onToggleSelect: (ids: string[], isSelect: boolean) => void, expandedNodes: string[], onToggleExpand: (id: string) => void }) => {
  const isExpanded = expandedNodes.includes(node.id)

  const getSelectionState = (n: TreeNode): 'all' | 'some' | 'none' => {
    if (n.isUser) return selectedIds.includes(n.id) ? 'all' : 'none'
    if (!n.children || n.children.length === 0) return 'none'

    let all = true
    let some = false

    for (const child of n.children) {
      const childState = getSelectionState(child)
      if (childState === 'some') { all = false; some = true }
      else if (childState === 'all') { some = true }
      else { all = false }
    }

    if (all) return 'all'
    if (some) return 'some'
    return 'none'
  }

  const selectionState = getSelectionState(node)

  const handleCheck = () => {
    const getLeafIds = (n: TreeNode): string[] => {
      if (n.isUser) return [n.id]
      return n.children ? n.children.flatMap(getLeafIds) : []
    }
    const leafIds = getLeafIds(node)
    if (selectionState === 'all') {
      onToggleSelect(leafIds, false)
    } else {
      onToggleSelect(leafIds, true)
    }
  }

  return (
    <div style={{ marginTop: 6, paddingLeft: node.isUser ? 6 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!node.isUser ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.id)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <i className={`fi ${isExpanded ? 'fi-rr-angle-small-down' : 'fi-rr-angle-small-right'}`} style={{ color: '#64748b' }} />
          </button>
        ) : <div style={{ width: 22 }} />}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: node.isUser ? '#475569' : '#0f172a', fontWeight: node.isUser ? 400 : 600 }}>
          <input
            type="checkbox"
            checked={selectionState === 'all'}
            ref={input => { if (input) input.indeterminate = selectionState === 'some' }}
            onChange={handleCheck}
            style={{ margin: 0, width: 14, height: 14, cursor: 'pointer' }}
          />
          {node.isUser ? null : <i className="fi fi-rr-folder" style={{ color: '#3b82f6', fontSize: 14 }} />}
          {node.label}
        </label>
      </div>

      {!node.isUser && isExpanded && node.children && (
        <div style={{ paddingLeft: 10, borderLeft: '1px solid #e2e8f0', marginLeft: 11 }}>
          {node.children.map(child => (
            <TreeNodeView
              key={child.id}
              node={child}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LinkerPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addStudentUrl, setAddStudentUrl] = useState('')
  const [addShareTeachers, setAddShareTeachers] = useState(false)
  const [addShareClass, setAddShareClass] = useState(false)
  const [addTargetStudents, setAddTargetStudents] = useState<string[]>([])
  const [userTree, setUserTree] = useState<TreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<string[]>(['group_teachers', 'group_students'])
  const [showStudentSelect, setShowStudentSelect] = useState(false)

  useEffect(() => {
    fetchBookmarks()
    fetchUsers()

    const handleOnline = () => {
      setIsOfflineMode(prev => {
        if (prev) {
          setTimeout(() => {
            fetchBookmarks()
          }, 0)
          return false
        }
        return false
      })
    }
    window.addEventListener('server-online', handleOnline)
    return () => window.removeEventListener('server-online', handleOnline)
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/core/users')
      if (res.ok) {
        const users = await res.json() || []
        const tree: TreeNode[] = []

        // 1. Teachers
        const teachers = users.filter((u: any) => u.role === 'teacher' || u.role === 'admin')
        if (teachers.length > 0) {
          const tGroup: TreeNode = { id: 'group_teachers', label: '교직원', children: [] }
          const depts: Record<string, TreeNode> = {}
          teachers.forEach((t: any) => {
            const dName = t.department || '소속 없음'
            if (!depts[dName]) { depts[dName] = { id: `dept_${dName}`, label: dName, children: [] }; tGroup.children!.push(depts[dName]) }
            depts[dName].children!.push({ id: t.id, label: `${t.name}`, isUser: true })
          })
          tGroup.children!.sort((a, b) => a.label.localeCompare(b.label))
          tGroup.children!.forEach(d => d.children!.sort((a, b) => a.label.localeCompare(b.label)))
          tree.push(tGroup)
        }

        // 2. Students
        const students = users.filter((u: any) => u.role === 'student' || u.role === 'parent')
        if (students.length > 0) {
          const sGroup: TreeNode = { id: 'group_students', label: '학생/학부모', children: [] }
          const grades: Record<string, TreeNode> = {}
          students.forEach((s: any) => {
            const gName = s.grade ? `${s.grade}학년` : '기타 학생'
            const cName = s.class_num ? `${s.class_num}반` : '반 미배정'
            if (!grades[gName]) { grades[gName] = { id: `grade_${s.grade || 'none'}`, label: gName, children: [] }; sGroup.children!.push(grades[gName]) }
            let classNode = grades[gName].children!.find(c => c.label === cName)
            if (!classNode) { classNode = { id: `class_${s.grade}_${s.class_num || 'none'}`, label: cName, children: [] }; grades[gName].children!.push(classNode) }
            classNode.children!.push({ id: s.id, label: `${s.number ? s.number + '번 ' : ''}${s.name} ${s.role === 'parent' ? '(학부모)' : ''}`, isUser: true })
          })
          sGroup.children!.sort((a, b) => a.label.localeCompare(b.label))
          sGroup.children!.forEach(g => {
            g.children!.sort((a, b) => a.label.localeCompare(b.label))
            g.children!.forEach(c => c.children!.sort((a, b) => {
              const aNum = parseInt(a.label.split('번')[0]) || 999
              const bNum = parseInt(b.label.split('번')[0]) || 999
              return aNum !== bNum ? aNum - bNum : a.label.localeCompare(b.label)
            }))
          })
          tree.push(sGroup)
        }
        setUserTree(tree)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchBookmarks = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/plugins/linker')
      if (res.ok) {
        const data = await res.json()
        setBookmarks(data || [])
        setIsOfflineMode(false)
        if ((window as any).go?.main?.App?.SyncLinkers) {
          (window as any).go.main.App.SyncLinkers(JSON.stringify(data || [])).catch((e: any) => console.error('Failed to sync linkers', e))
        }
      } else {
        throw new Error('Server returned !ok')
      }
    } catch (e) {
      console.error(e)
      setIsOfflineMode(true)
      if ((window as any).go?.main?.App?.GetLocalLinkers) {
        try {
          const localData = await (window as any).go.main.App.GetLocalLinkers()
          setBookmarks(localData || [])
          toast.info("오프라인 모드로 저장된 링크를 불러왔습니다.", { duration: 3000 })
        } catch (err) {
          console.error("Local sync error", err)
        }
      }
    }
    finally { setLoading(false) }
  }

  const handleToggleSelect = (ids: string[], isSelect: boolean) => {
    setAddTargetStudents(prev => {
      if (isSelect) {
        return Array.from(new Set([...prev, ...ids]))
      } else {
        const idSet = new Set(ids)
        return prev.filter(id => !idSet.has(id))
      }
    })
  }

  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    )
  }

  const handleAdd = async () => {
    if (!addTitle.trim()) { toast.warning('이름을 입력하세요'); return }
    if (!addUrl.trim()) { toast.warning('URL을 입력하세요'); return }
    try {
      const res = await apiFetch('/api/plugins/linker', {
        method: 'POST',
        body: JSON.stringify({
          title: addTitle, url: addUrl, student_url: addStudentUrl,
          category: 'general', sort_order: bookmarks.length,
          is_shared: false, share_teachers: addShareTeachers,
          share_class: addShareClass, target_ids: JSON.stringify(addTargetStudents)
        })
      })
      if (res.ok) {
        toast.success('링크가 추가되었습니다.')
        setShowAddModal(false); setAddTitle(''); setAddUrl(''); setAddStudentUrl('');
        setAddShareTeachers(false); setAddShareClass(false); setAddTargetStudents([]); setShowStudentSelect(false);
        fetchBookmarks()
      } else { toast.error('링크 추가에 실패했습니다.') }
    } catch (e) { console.error(e); toast.error('서버에 연결할 수 없습니다.') }
  }

  const handleDelete = (id: string) => {
    toast('이 링크를 삭제하시겠습니까?', {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch(`/api/plugins/linker/${id}`, { method: 'DELETE' })
            if (res.ok) { toast.success('삭제되었습니다.'); fetchBookmarks() }
          } catch (e) { console.error(e) }
        }
      },
      duration: 5000,
    })
  }

  const own = bookmarks.filter(b => b.is_own)
  const others = bookmarks.filter(b => !b.is_own)

  const formatUrl = (url: string) => {
    if (!url) return ''
    return /^https?:\/\//i.test(url) ? url : `http://${url}`
  }

  const BookmarkCard = ({ bm }: { bm: Bookmark }) => (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'white', borderRadius: 12, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box', gap: 16 }}>
      {/* 1. Title & Tags (Left aligned) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{bm.title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {bm.share_class && <span style={{ background: '#dcfce7', color: '#166534', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>우리반공유</span>}
          {bm.target_ids && bm.target_ids !== '[]' && bm.target_ids !== '' && <span style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>특정사용자공유</span>}
          {(bm.is_shared || bm.share_teachers) && <span style={{ background: '#fef9c3', color: '#92400e', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>교사공유</span>}
          {!bm.is_own && <span style={{ background: '#e2e8f0', color: '#334155', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>타교사작성</span>}
        </div>
      </div>

      {/* 2. Links (Center aligned, taking available space) */}
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>교사용:</span>
          <a href={formatUrl(bm.url)} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bm.url}
          </a>
        </div>

        {(bm.share_class || (bm.target_ids && bm.target_ids !== '[]' && bm.target_ids !== '') || bm.is_shared) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>학생용:</span>
            {bm.student_url ? (
              <a href={formatUrl(bm.student_url)} target="_blank" rel="noreferrer"
                style={{ fontSize: 13, color: '#0891b2', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bm.student_url}
              </a>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>교사용과 동일</span>
            )}
          </div>
        )}
      </div>

      {/* 3. Delete button (Right aligned) */}
      {bm.is_own && !isOfflineMode && (
        <button onClick={() => handleDelete(bm.id)}
          style={{ flexShrink: 0, background: '#fee2e2', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          삭제
        </button>
      )}
    </div>
  )

  return (
    <div style={{ padding: 24 }} >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-link" style={{ marginRight: 8 }} />빠른 링크 관리</h3>
        {!isOfflineMode && (
          <button onClick={() => setShowAddModal(true)}
            style={{ background: '#4f46e5', color: 'white', padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            + 새 링크 추가
          </button>
        )}
      </div>

      {
        loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }} > 로딩 중...</div >
        ) : (
          <>
            {/* My links */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fi fi-rr-user" /> 내 링크 ({own.length}개)
              </div>
              {own.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14 }}>
                  아직 추가한 링크가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {own.map(bm => <BookmarkCard key={bm.id} bm={bm} />)}
                </div>
              )}
            </div>

            {/* Others' shared links */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fi fi-rr-users" /> 다른 선생님 공유 링크 ({others.length}개)
              </div>
              {others.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14 }}>
                  다른 선생님이 공유한 링크가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {others.map(bm => <BookmarkCard key={bm.id} bm={bm} />)}
                </div>
              )}
            </div>
          </>
        )
      }

      {/* Add Modal */}
      {
        showAddModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'white', padding: 28, borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>새 링크 추가</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>링크 이름</label>
                  <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="즐겨찾기 이름을 입력하세요"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 14 }} autoFocus />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>교사용 URL</label>
                  <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 14 }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>공유 대상 선택</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={addShareTeachers} onChange={e => setAddShareTeachers(e.target.checked)} />
                      교사에게 공유
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={addShareClass} onChange={e => setAddShareClass(e.target.checked)} />
                      우리반 학생에 공유
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={showStudentSelect} onChange={e => {
                        setShowStudentSelect(e.target.checked);
                        if (!e.target.checked) setAddTargetStudents([]);
                      }} />
                      선택 사용자에게 공유
                    </label>

                    {showStudentSelect && (
                      <div style={{ marginTop: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', background: '#f8fafc' }}>
                        {userTree.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>사용자 정보가 없습니다.</div>
                        ) : (
                          userTree.map(node => (
                            <TreeNodeView
                              key={node.id}
                              node={node}
                              selectedIds={addTargetStudents}
                              onToggleSelect={handleToggleSelect}
                              expandedNodes={expandedNodes}
                              onToggleExpand={handleToggleExpand}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {(addShareClass || showStudentSelect) && (
                  <div style={{ padding: 14, background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#0369a1' }}>학생용 URL (선택)</label>
                    <input value={addStudentUrl} onChange={e => setAddStudentUrl(e.target.value)} placeholder="비워두면 교사용 URL과 동일하게 공유됩니다"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #bae6fd', boxSizing: 'border-box', fontSize: 14, background: 'white' }} />
                    <div style={{ fontSize: 11, color: '#0369a1', marginTop: 6 }}>학생에게 다른 URL을 보여주려면 입력하세요 (예: 학생 전용 뷰어 링크)</div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => { setShowAddModal(false); setAddTitle(''); setAddUrl(''); setAddStudentUrl(''); setAddShareTeachers(false); setAddShareClass(false); setAddTargetStudents([]); setShowStudentSelect(false); }}
                    style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontWeight: 600 }}>취소</button>
                  <button onClick={handleAdd}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 700, cursor: 'pointer' }}>추가</button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}
