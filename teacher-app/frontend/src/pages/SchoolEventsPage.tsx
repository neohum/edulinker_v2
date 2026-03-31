import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch } from '../api'
import TargetTreeModal from '../components/TargetTreeModal'

interface Voting {
  id: string
  title: string
  content: string
  target_roles?: string
  options: string
  starts_at: string
  ends_at: string
  created_at: string
  author_id: string
  my_vote_option?: number | null
  my_extra_text?: string
}

export default function SchoolEventsPage({ onVoteChange }: { onVoteChange?: () => void }) {
  const [votings, setVotings] = useState<Voting[]>([])
  const [loading, setLoading] = useState(true)
  const [extraTexts, setExtraTexts] = useState<Record<string, string>>({})
  const [myId, setMyId] = useState<string>('')

  // Create voting modal
  const [showModal, setShowModal] = useState(false)
  const [votingTitle, setVotingTitle] = useState('')
  const [votingContent, setVotingContent] = useState('')
  const [votingTarget, setVotingTarget] = useState<string[]>(['ALL'])
  const [votingOptions, setVotingOptions] = useState<string[]>(['', ''])
  const [showOtherTip, setShowOtherTip] = useState(false)
  
  // Target Audience Tree Modal
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [showTargetModal, setShowTargetModal] = useState(false)
  
  const getLocalStr = (d: Date) => {
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
  }
  const [startsAt, setStartsAt] = useState<string>(() => getLocalStr(new Date()))
  const [endsAt, setEndsAt] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 3); return getLocalStr(d)
  })

  // Stats modal
  const [statsData, setStatsData] = useState<{ voting_id: string, total: number, option_counts: Record<number, number>, extra_texts?: Record<number, string[]> } | null>(null)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [selectedVotingForStats, setSelectedVotingForStats] = useState<Voting | null>(null)

  useEffect(() => {
    fetchMe()
    fetchVotings()
    fetchUsers()
  }, [])

  const fetchMe = async () => {
    try {
      const res = await apiFetch('/api/core/users/me')
      if (res.ok) {
        const data = await res.json()
        setMyId(data.id)
      }
    } catch {}
  }


  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/core/users?page_size=1000')
      if (res.ok) {
        const data = await res.json()
        setAllUsers(data.users || [])
      }
    } catch {}
  }

  const fetchVotings = async () => {
    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/plugins/schoolevents/votings', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setVotings(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateVoting = async () => {
    if (!votingTitle.trim()) { toast.warning('제목을 입력하세요'); return }
    const validOpts = votingOptions.map(o => o.trim()).filter(o => o)
    if (validOpts.length < 2) { toast.warning('최소 2개의 선택지를 입력하세요'); return }
    
    const startD = new Date(startsAt)
    const endD = new Date(endsAt)
    if (startD >= endD) { toast.warning('종료 일시가 시작 일시보다 빠를 수 없습니다.'); return }

    try {
      const token = await getToken()

      const res = await fetch('http://localhost:5200/api/plugins/schoolevents/votings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: votingTitle,
          content: votingContent || '별도의 상세 설명이 없습니다.',
          target_roles: votingTarget.join(','),
          options: JSON.stringify(validOpts),
          starts_at: startD.toISOString(),
          ends_at: endD.toISOString()
        })
      })
      if (res.ok) {
        toast.success('설문/투표가 개설되었습니다.')
        setShowModal(false)
        setVotingTitle('')
        setVotingContent('')
        setVotingTarget(['ALL'])
        setVotingOptions(['', ''])
        setStartsAt(getLocalStr(new Date()))
        let d = new Date(); d.setDate(d.getDate() + 3); setEndsAt(getLocalStr(d))
        fetchVotings()
        if (onVoteChange) onVoteChange()
      } else {
        toast.error('개설에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleVote = async (votingId: string, idx: number, extraText: string = '') => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/schoolevents/votings/${votingId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ option_idx: idx, extra_text: extraText })
      })
      if (res.ok) {
        toast.success('투표가 반영되었습니다.')
        setVotings(votings.map(v => 
          v.id === votingId ? { ...v, my_vote_option: idx, my_extra_text: extraText } : v
        ))
        if (onVoteChange) onVoteChange()
      } else {
        toast.error('투표 참여 도중 오류가 발생했습니다.')
      }
    } catch(e) {
      toast.error('오류 발생')
    }
  }

  const handleStats = async (v: Voting) => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/schoolevents/votings/${v.id}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setStatsData(data)
        setSelectedVotingForStats(v)
        setShowStatsModal(true)
      } else {
        toast.error('통계 데이터를 불러올 수 없습니다')
      }
    } catch(e) {
      toast.error('오류 발생')
    }
  }

  const handleDelete = async (v: Voting) => {
    if (!window.confirm(`'${v.title}' 설문/투표를 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.`)) return
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/schoolevents/votings/${v.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success('투표/설문이 삭제되었습니다.')
        setVotings(p => p.filter(voting => voting.id !== v.id))
      } else {
        toast.error('삭제 권한이 없거나 실패했습니다.')
      }
    } catch(e) {
      toast.error('오류 발생')
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>진행 중인 학교·학급 투표/설문</h3>
        <button onClick={() => setShowModal(true)} style={{
          background: '#3b82f6', color: 'white', padding: '8px 16px',
          borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          새 투표/설문 개설
        </button>
      </div>

      {loading ? (
        <div>목록 불러오는 중...</div>
      ) : votings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--surface)', borderRadius: 16, border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 40, color: 'var(--border)' }}><i className="fi fi-rr-box-open" /></div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>개설된 투표/설문이 없습니다.</div>
          <button onClick={() => setShowModal(true)} style={{ marginTop: 8, background: 'white', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fi fi-rr-plus" /> 첫 투표/설문 개설하기
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {votings.map((v) => {
            const isEnded = new Date(v.ends_at) < new Date()
            const isPending = new Date(v.starts_at || v.created_at) > new Date()
            let opts: string[] = []
            try {
              opts = JSON.parse(v.options || '[]')
              if (!Array.isArray(opts)) {
                opts = typeof opts === 'string' ? [opts] : []
              }
            } catch (e) {
              opts = v.options ? v.options.split(',').map(o => o.trim()) : []
            }

            return (
              <div key={v.id} style={{ background: 'white', borderRadius: 16, border: '1px solid var(--border)', padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{v.title}</h4>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {v.target_roles && v.target_roles !== 'ALL' && v.target_roles.split(',').map(role => {
                      let text = role; 
                      if (role === 'STUDENT') text = '학생 전체'; 
                      else if (role.startsWith('STUDENT_')) { const p = role.split('_'); text = p.length === 2 ? `학생 ${p[1]}학년` : `학생 ${p[1]}-${p[2]}`; } 
                      else if (role === 'TEACHER') text = '교직원 전체'; 
                      else if (role.startsWith('TEACHER_')) { text = `교직원 ${role.replace('TEACHER_','')}` }
                      else if (role === 'PARENT') text = '학부모 전체'; 
                      else if (role.startsWith('PARENT_')) { const p = role.split('_'); text = p.length === 2 ? `학부모 ${p[1]}학년` : `학부모 ${p[1]}-${p[2]}`; }
                      else if (role.startsWith('USER_')) { const u = allUsers.find(x=>x.id===role.replace('USER_','')); text = u ? `${u.name}` : '개별 사용자'; }
                      return <span key={role} style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{text}</span>
                    })}
                    <div style={{ background: isEnded ? '#f1f5f9' : (isPending ? '#fef3c7' : '#eff6ff'), color: isEnded ? '#64748b' : (isPending ? '#b45309' : '#3b82f6'), padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      {isEnded ? '종료됨' : (isPending ? '진행 대기' : '진행 중')}
                    </div>
                    {isEnded && v.author_id === myId && (
                      <button 
                        onClick={() => handleDelete(v)}
                        style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 8px', borderRadius: 6, fontSize: 13, border: 'none', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                        onMouseOver={e=>e.currentTarget.style.background='#fecaca'} 
                        onMouseOut={e=>e.currentTarget.style.background='#fee2e2'}
                        title="설문 삭제"
                      >
                        <i className="fi fi-rr-trash" />
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ margin: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {v.content}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, background: '#f8fafc', padding: '10px 12px', borderRadius: 8 }}>
                  <span>시작: {new Date(v.starts_at || v.created_at).toLocaleString()}</span>
                  <span>마감: {new Date(v.ends_at).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {opts.map((opt: string, idx: number) => {
                    const isSelected = v.my_vote_option === idx
                    const isOther = opt.includes('기타')
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div 
                          onClick={() => { if(!isEnded && !isPending && !isOther) handleVote(v.id, idx); else if (!isEnded && !isPending && isOther && !isSelected) handleVote(v.id, idx); }}
                          style={{ 
                            padding: '10px 14px', 
                            background: isSelected ? '#eff6ff' : 'var(--surface)', 
                            border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                            borderRadius: 6, 
                            fontSize: 14,
                            cursor: (isEnded || isPending) ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: isSelected ? '#3b82f6' : (isPending ? '#94a3b8' : 'var(--text)'),
                            opacity: isPending ? 0.6 : 1,
                            transition: 'all 0.1s'
                          }}
                        >
                          <i className={`fi ${isSelected ? 'fi-sr-checkbox' : 'fi-rr-checkbox'}`} style={{ marginRight: 8, color: isSelected ? '#3b82f6' : 'var(--text-muted)' }} />
                          <span style={{flex: 1, fontWeight: isSelected ? 700 : 500}}>
                            {opt} 
                            {isOther && <span style={{fontSize: 12, color: '#94a3b8', marginLeft: 6}}>(내용 입력 가능)</span>}
                          </span>
                          {isSelected && <span style={{fontSize: 12, fontWeight: 700, color: '#3b82f6'}}>내 선택</span>}
                        </div>
                        {isSelected && isOther && !isEnded && !isPending && (
                          <div style={{ paddingLeft: 24, display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                            <input 
                              type="text"
                              placeholder="추가 의견을 입력 후 저장 버튼을 누르세요..."
                              value={extraTexts[`${v.id}-${idx}`] ?? v.my_extra_text ?? ''}
                              onChange={e => setExtraTexts({...extraTexts, [`${v.id}-${idx}`]: e.target.value})}
                              onBlur={() => handleVote(v.id, idx, extraTexts[`${v.id}-${idx}`] ?? v.my_extra_text ?? '')}
                              style={{ flex: 1, padding: '8px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', outline: 'none' }}
                            />
                            <button onClick={() => handleVote(v.id, idx, extraTexts[`${v.id}-${idx}`] ?? v.my_extra_text ?? '')} style={{ padding: '0 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onMouseOver={e=>e.currentTarget.style.background='#2563eb'} onMouseOut={e=>e.currentTarget.style.background='#3b82f6'}>
                              의견 저장
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => handleStats(v)} style={{ width: '100%', marginTop: 16, padding: '10px', background: '#3b82f6', color: 'white', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#2563eb'} onMouseOut={e=>e.currentTarget.style.background='#3b82f6'}>
                  투표 통계 보기
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(4px)'
        }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 540, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>새 투표/설문 개설</h3>
              <button title="닫기" aria-label="닫기" onClick={() => { setShowModal(false); setVotingTitle(''); setVotingContent(''); setVotingTarget(['ALL']); setVotingOptions(['', '']) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 24, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 16, transition: 'all 0.2s' }} onMouseOver={e => {e.currentTarget.style.background='#e2e8f0'; e.currentTarget.style.color='#0f172a'}} onMouseOut={e => {e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#64748b'}}><i className="fi fi-rr-cross-small" /></button>
            </div>
            
            <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
              {/* Templates Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px', marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fi fi-rr-magic-wand" /> 자주 쓰는 템플릿으로 빠른 완성
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setVotingTitle('2026학년도 1학기 학급 반장선거'); setVotingContent('이번 선거는 전자투표로 진행됩니다. 신중하게 우리 반을 이끌어갈 대표를 선출해 주세요.'); setVotingTarget(['STUDENT']); setVotingOptions(['김철수', '이영희', '박지민']); }} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#334155', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>학급 반장선거</button>
                  <button onClick={() => { setVotingTitle('2026학년도 전교 학생회 임원 선거'); setVotingContent('전교 학생회장 및 부회장을 선출하는 투표입니다. 주어진 표에 맞게 정확히 행사해 주시기 바랍니다.'); setVotingTarget(['STUDENT']); setVotingOptions(['기호 1번 OOO', '기호 2번 OOO', '기호 3번 OOO']); }} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#334155', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>전교 학생회 선거</button>
                  <button onClick={() => { setVotingTitle('교직원 회의 안건(연수) 의견 수렴'); setVotingContent('선생님들의 원활한 연수 진행을 위해 사전 의견을 수렴하고자 합니다. 자유롭게 선택해 주십시오.'); setVotingTarget(['TEACHER']); setVotingOptions(['1안 동의', '2안 동의', '기타 의견']); }} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#334155', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>교사 설문</button>
                  <button onClick={() => { setVotingTitle('창의적 체험활동 장소 선호도 조사'); setVotingContent('다음 달 진행될 창체(소풍) 장소에 대한 학생들의 의견을 알아보고자 합니다.'); setVotingTarget(['STUDENT']); setVotingOptions(['에버랜드', '롯데월드', '직업체험관', '기타']); }} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#334155', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>학생 설문</button>
                  <button onClick={() => { setVotingTitle('2026학년도 학부모 총회 참석 여부 조사'); setVotingContent('학부모 총회 관련 일정 안내 및 참석 여부 조사 통신문입니다. 기한 내에 꼭 응답해 주시기 바랍니다.'); setVotingTarget(['PARENT']); setVotingOptions(['참석', '불참', '위임장 제출']); }} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#334155', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>학부모 설문</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Title Input */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#334155' }}>투표/설문 제목 <span style={{color: '#ef4444'}}>*</span></label>
                  <input
                    value={votingTitle}
                    onChange={e => setVotingTitle(e.target.value)}
                    placeholder="예: 학급 자율동아리 주제 선정"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: 15, transition: 'all 0.2s', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.02)', outline: 'none' }}
                    onFocus={e => {e.target.style.borderColor='var(--primary)'; e.target.style.boxShadow='0 0 0 2px rgba(59, 130, 246, 0.2)'}}
                    onBlur={e => {e.target.style.borderColor='#cbd5e1'; e.target.style.boxShadow='none'}}
                    autoFocus
                  />
                </div>

                {/* Content Input */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#334155' }}>상세 설명 (선택사항)</label>
                  <textarea
                    value={votingContent}
                    onChange={e => setVotingContent(e.target.value)}
                    placeholder="투표나 설문에 대한 세부적인 안내 사항을 편하게 적어주세요."
                    style={{ width: '100%', minHeight: 80, padding: '12px 16px', borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: 14, resize: 'vertical', transition: 'all 0.2s', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.02)', outline: 'none' }}
                    onFocus={e => {e.target.style.borderColor='var(--primary)'; e.target.style.boxShadow='0 0 0 2px rgba(59, 130, 246, 0.2)'}}
                    onBlur={e => {e.target.style.borderColor='#cbd5e1'; e.target.style.boxShadow='none'}}
                  />
                </div>

                {/* Target Role Selector */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>설문 대상 <span style={{color: '#ef4444'}}>*</span></label>
                    <button onClick={() => setShowTargetModal(true)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}>
                      <i className="fi fi-rr-list-tree" style={{ marginRight: 4 }} /> 대상 상세 설정하기
                    </button>
                  </div>
                  <div style={{ padding: '12px', borderRadius: 10, background: 'white', border: '1px solid #cbd5e1', minHeight: 44, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {votingTarget.includes('ALL') ? (
                       <span style={{ fontSize: 13, padding: '4px 10px', background: '#f1f5f9', color: '#475569', borderRadius: 16, border: '1px solid #e2e8f0', fontWeight: 600 }}>전체 (교직원·학생·학부모)</span>
                    ) : votingTarget.map(t => {
                      let text = t
                      if (t === 'STUDENT') text = '학생 전체'
                      else if (t.startsWith('STUDENT_')) { const p = t.split('_'); text = p.length === 2 ? `학생 ${p[1]}학년` : `학생 ${p[1]}학년 ${p[2]}반` }
                      else if (t === 'TEACHER') text = '교직원 전체'
                      else if (t.startsWith('TEACHER_')) { text = `교직원 ${t.replace('TEACHER_','')}` }
                      else if (t === 'PARENT') text = '학부모 전체'
                      else if (t.startsWith('PARENT_')) { const p = t.split('_'); text = p.length === 2 ? `학부모 ${p[1]}학년` : `학부모 ${p[1]}학년 ${p[2]}반` }
                      else if (t.startsWith('USER_')) { const u = allUsers.find(x=>x.id===t.replace('USER_','')); text = u ? `${u.name}` : '개별 사용자' }
                      return <span key={t} style={{ fontSize: 13, padding: '4px 10px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 16, border: '1px solid #c7d2fe', fontWeight: 600 }}>{text} <i className="fi fi-rr-cross-small" style={{marginLeft: 4, cursor:'pointer'}} onClick={() => {
                        const newTargets = votingTarget.filter(x => x !== t); 
                        setVotingTarget(newTargets.length === 0 ? ['ALL'] : newTargets)
                      }} /></span>
                    })}
                  </div>
                </div>

                {/* Dates Configuration */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#334155' }}>투표 시작 <span style={{color: '#ef4444'}}>*</span></label>
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={e => setStartsAt(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#334155' }}>투표 마감 <span style={{color: '#ef4444'}}>*</span></label>
                    <input
                      type="datetime-local"
                      value={endsAt}
                      onChange={e => setEndsAt(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: 14, outline: 'none' }}
                    />
                  </div>
                </div>

                {/* Options Input */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
                    <label style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#334155' }}>항목 입력 <span style={{color: '#ef4444'}}>*</span></label>
                    <button 
                      onClick={() => setShowOtherTip(!showOtherTip)} 
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                      onMouseOver={e=>e.currentTarget.style.borderColor='#3b82f6'} 
                      onMouseOut={e=>e.currentTarget.style.borderColor='#cbd5e1'}
                    >
                      <i className="fi fi-rr-comment-question" /> 기타 문구
                    </button>
                    {showOtherTip && (
                      <div style={{ position: 'absolute', right: 0, top: 32, fontSize: 12, color: '#3b82f6', fontWeight: 600, background: '#eff6ff', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #bfdbfe', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <i className="fi fi-rr-info" /> 항목명에 '기타' 단어가 포함되면 주관식 추가 의견을 받을 수 있습니다.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {votingOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, border: '1px solid #e2e8f0' }}>
                          {idx + 1}
                        </div>
                        <input
                          value={opt}
                          onChange={e => {
                            const newOpts = [...votingOptions]
                            newOpts[idx] = e.target.value
                            setVotingOptions(newOpts)
                          }}
                          placeholder={`내용을 입력하세요.`}
                          style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: 14, transition: 'all 0.2s', outline: 'none' }}
                          onFocus={e => {e.target.style.borderColor='var(--primary)'; e.target.style.boxShadow='0 0 0 2px rgba(59, 130, 246, 0.2)'}}
                          onBlur={e => {e.target.style.borderColor='#cbd5e1'; e.target.style.boxShadow='none'}}
                        />
                        {votingOptions.length > 2 ? (
                          <button aria-label="삭제" title="항목 삭제" onClick={() => setVotingOptions(votingOptions.filter((_, i) => i !== idx))} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, width: 42, height: 42, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#fee2e2'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <i className="fi fi-rr-trash" />
                          </button>
                        ) : (
                          <div style={{ width: 42, flexShrink: 0 }} />
                        )}
                      </div>
                    ))}
                    <button onClick={() => setVotingOptions([...votingOptions, ''])} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: 8, color: '#475569', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', marginTop: 4 }} onMouseOver={e => {e.currentTarget.style.background='#f1f5f9'; e.currentTarget.style.borderColor='#94a3b8'}} onMouseOut={e => {e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#cbd5e1'}}>
                      <i className="fi fi-rr-plus" /> 항목 한 칸 더 추가
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
                  <button onClick={() => { setShowModal(false); setVotingTitle(''); setVotingContent(''); setVotingTarget(['ALL']); setVotingOptions(['', '']) }} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#475569', fontSize: 14, transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#f8fafc'} onMouseOut={e=>e.currentTarget.style.background='white'}>취소</button>
                  <button onClick={handleCreateVoting} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)', fontSize: 14, transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#2563eb'} onMouseOut={e=>e.currentTarget.style.background='#3b82f6'}><i className="fi fi-rr-check" style={{marginRight: 6}} />개설 완료</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && selectedVotingForStats && statsData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(4px)'
        }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 440, padding: 32, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 8, paddingRight: 32, color: 'var(--text)' }}>
              [투표 결과] {selectedVotingForStats.title}
            </h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, fontWeight: 500 }}>총 투표수: {statsData.total} 표</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(() => {
                let opts: string[] = []
                try { opts = JSON.parse(selectedVotingForStats.options || '[]') } catch(e) {}
                if (!Array.isArray(opts)) opts = (selectedVotingForStats.options as any)?.split(',') || []
                
                return opts.map((opt, idx) => {
                  const count = statsData.option_counts[idx] || 0
                  const ratio = statsData.total > 0 ? (count / statsData.total) * 100 : 0
                  const isTop = ratio > 0 && Math.max(...Object.values(statsData.option_counts).concat([0])) === count

                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6, fontWeight: 600, color: isTop ? '#3b82f6' : 'var(--text)' }}>
                        <span>{opt} {isTop && <i className="fi fi-rr-star" style={{color: '#f59e0b', fontSize: 12, marginLeft: 4}}/>}</span>
                        <span>{count}표 <span style={{color: '#94a3b8', fontSize: 13, marginLeft: 4}}>({ratio.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ width: '100%', height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${ratio}%`, height: '100%', background: isTop ? 'linear-gradient(to right, #60a5fa, #3b82f6)' : 'linear-gradient(to right, #cbd5e1, #94a3b8)', borderRadius: 6, transition: 'width 0.5s ease-out' }} />
                      </div>
                      {statsData.extra_texts && statsData.extra_texts[idx] && statsData.extra_texts[idx].length > 0 && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 600, marginBottom: 8, color: '#64748b', fontSize: 12 }}><i className="fi fi-rr-comment" style={{marginRight: 4}}/>제출된 추가 의견</div>
                          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {statsData.extra_texts[idx].map((txt, i) => (
                              <li key={i}>{txt}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
            
            <button onClick={() => setShowStatsModal(false)} style={{ width: '100%', marginTop: 32, padding: '12px', background: '#f8fafc', color: '#475569', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 700, cursor: 'pointer', fontSize: 15, transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background='#f8fafc'}>
              닫기
            </button>
            <button aria-label="닫기" onClick={() => setShowStatsModal(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={e=>e.currentTarget.style.color='#1e293b'} onMouseOut={e=>e.currentTarget.style.color='#94a3b8'}><i className="fi fi-rr-cross-small" /></button>
          </div>
        </div>
      )}

      <TargetTreeModal
        isOpen={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        allUsers={allUsers}
        currentTargets={votingTarget}
        onApply={(newTargets) => {
          setVotingTarget(newTargets)
          setShowTargetModal(false)
        }}
      />
    </div>
  )
}
