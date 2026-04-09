import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'

interface ProfilePageProps {
  user: UserInfo
  onUpdateUser?: (updates: Partial<UserInfo>) => void
}

type TabType = 'info' | 'password' | 'photo'

export default function ProfilePage({ user, onUpdateUser }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('info')

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        <i className="fi fi-rr-user" style={{ marginRight: 8 }} />내 프로필 수정
      </h3>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
        <button 
          onClick={() => setActiveTab('info')} 
          style={{ flex: 1, padding: 12, borderRadius: 8, fontWeight: 600, fontSize: 15, background: activeTab === 'info' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'info' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <i className="fi fi-rr-edit" style={{ marginRight: 6 }} />정보 변경
        </button>
        <button 
          onClick={() => setActiveTab('password')} 
          style={{ flex: 1, padding: 12, borderRadius: 8, fontWeight: 600, fontSize: 15, background: activeTab === 'password' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'password' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <i className="fi fi-rr-lock" style={{ marginRight: 6 }} />비밀번호 변경
        </button>
        <button 
          onClick={() => setActiveTab('photo')} 
          style={{ flex: 1, padding: 12, borderRadius: 8, fontWeight: 600, fontSize: 15, background: activeTab === 'photo' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'photo' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <i className="fi fi-rr-picture" style={{ marginRight: 6 }} />사진 추가
        </button>
      </div>

      <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}>
        {activeTab === 'info' && <ProfileInfoTab user={user} onUpdateUser={onUpdateUser} />}
        {activeTab === 'password' && <PasswordTab user={user} />}
        {activeTab === 'photo' && <PhotoTab user={user} onUpdateUser={onUpdateUser} />}
      </div>
    </div>
  )
}

function ProfileInfoTab({ user, onUpdateUser }: ProfilePageProps) {
  const [name, setName] = useState(user.name)
  const [school, setSchool] = useState(user.school)
  const [grade, setGrade] = useState(user.grade ? String(user.grade) : '')
  const [classNum, setClassNum] = useState(user.classNum ? String(user.classNum) : '')
  const [taskName, setTaskName] = useState(user.taskName || '')
  const [department, setDepartment] = useState(user.department || '')
  const [phone, setPhone] = useState(user.classPhone || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const resp = await apiFetch(`/api/core/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          class_phone: phone,
          department,
          task_name: taskName,
          grade: grade ? parseInt(grade) : undefined,
          class_num: classNum ? parseInt(classNum) : undefined
        })
      })

      if (resp.ok) {
        toast.success('프로필 정보가 성공적으로 수정되었습니다.')
        if (onUpdateUser) {
          onUpdateUser({ name, school, department, taskName, grade: grade ? parseInt(grade) : undefined, classNum: classNum ? parseInt(classNum) : undefined, classPhone: phone })
        }
      } else {
        const errData = await resp.json().catch(() => ({}))
        toast.error(errData.error || '프로필 수정에 실패했습니다.')
      }
    } catch (err) {
      toast.error('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>이름</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="form-input" style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>소속 학교</label>
          <input type="text" value={school} onChange={e => setSchool(e.target.value)} required className="form-input" style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>소속 부서 (선택)</label>
          <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="예: 1학년부, 교무기획부 등" className="form-input" style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 업무 (선택)</label>
          <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="예: 정보부장, 1학년 부장 등" className="form-input" style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 학년</label>
          <select value={grade} onChange={e => setGrade(e.target.value)} className="form-input" style={{ width: '100%', appearance: 'auto' }}>
            <option value="">선택 안함</option>
            {[1, 2, 3, 4, 5, 6].map(g => (
              <option key={g} value={g}>{g}학년</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 반</label>
          <input type="number" value={classNum} onChange={e => setClassNum(e.target.value)} placeholder="예: 1" className="form-input" style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>교실(내선) 전화번호</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="예: 02-123-4567" className="form-input" style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', textAlign: 'center' }}>
        {loading ? '저장 중...' : '프로필 저장'}
      </button>
    </form>
  )
}

function PasswordTab({ user }: Pick<ProfilePageProps, 'user'>) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 8) {
      toast.error('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('새 비밀번호와 확인이 일치하지 않습니다.')
      return
    }

    setLoading(true)

    try {
      const resp = await apiFetch(`/api/core/users/${user.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      })

      if (resp.ok) {
        toast.success('비밀번호가 성공적으로 변경되었습니다.')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const errData = await resp.json().catch(() => ({}))
        toast.error(errData.error || '비밀번호 변경에 실패했습니다.')
      }
    } catch (err) {
      toast.error('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>현재 비밀번호</label>
        <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required className="form-input" style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>새 비밀번호 (8자 이상)</label>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} className="form-input" style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>새 비밀번호 확인</label>
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} className="form-input" style={{ width: '100%' }} />
      </div>

      <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', textAlign: 'center' }}>
        {loading ? '변경 중...' : '비밀번호 변경'}
      </button>
    </form>
  )
}

function PhotoTab({ user, onUpdateUser }: ProfilePageProps) {
  const [photo, setPhoto] = useState<string>(user.profileImage || '')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('이미지 크기는 5MB 이하 여야 합니다.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      // Create an image to resize it
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 400
        const MAX_HEIGHT = 400
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)

        // Convert back to Base64 (WebP, quality 0.8)
        const dataUrl = canvas.toDataURL('image/webp', 0.8)
        setPhoto(dataUrl)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!photo) {
      toast.error('선택된 사진이 없습니다.')
      return
    }

    setLoading(true)

    try {
      const resp = await apiFetch(`/api/core/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          profile_image: photo
        })
      })

      if (resp.ok) {
        toast.success('프로필 사진이 업데이트 되었습니다.')
        if (onUpdateUser) {
          onUpdateUser({ profileImage: photo })
        }
      } else {
        const errData = await resp.json().catch(() => ({}))
        toast.error(errData.error || '사진 업데이트에 실패했습니다.')
      }
    } catch (err) {
      toast.error('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    setLoading(true)
    try {
      const resp = await apiFetch(`/api/core/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          profile_image: '' // Clear image
        })
      })

      if (resp.ok) {
        toast.success('프로필 사진이 삭제되었습니다.')
        setPhoto('')
        if (onUpdateUser) {
          onUpdateUser({ profileImage: undefined })
        }
      } else {
        toast.error('사진 삭제에 실패했습니다.')
      }
    } catch {
      toast.error('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div 
          style={{ 
            width: 160, height: 160, borderRadius: '50%', background: photo ? `url(${photo})` : '#f0f2f5', 
            backgroundSize: 'cover', backgroundPosition: 'center', margin: '0 auto 24px', 
            border: '4px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: '#a0aabf'
          }}
        >
          {!photo && (user.name.charAt(0))}
        </div>
        
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => fileInputRef.current?.click()}
          >
            이미지 선택
          </button>
          {photo && (
            <button 
              type="button" 
              className="btn-danger" 
              onClick={handleRemove}
              disabled={loading}
              style={{ padding: '8px 16px', background: 'var(--danger-color)', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              삭제
            </button>
          )}
        </div>
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
          JPG, PNG 지원. 이미지는 자동으로 리사이징됩니다.
        </p>
      </div>

      <button type="button" onClick={handleSave} disabled={loading || !photo} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', textAlign: 'center' }}>
        {loading ? '업데이트 중...' : '프로필 사진 저장'}
      </button>
    </div>
  )
}
