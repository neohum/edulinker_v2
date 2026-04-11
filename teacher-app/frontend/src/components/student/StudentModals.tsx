export function StudentModals({
  isAdmin,
  showAddModal, setShowAddModal, addForm, setAddForm, addError, adding, handleAddStudent,
  editStudent, setEditStudent, editForm, setEditForm, editError, editing, handleEditStudent
}: any) {
  return (
    <>
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>학생 추가</h3>
            {addError && (
              <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{addError}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>학년</label>
                <input type="number" value={addForm.grade} onChange={e => setAddForm((f: any) => ({ ...f, grade: e.target.value }))} disabled={!isAdmin}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: !isAdmin ? '#e2e8f0' : 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>반</label>
                <input type="number" value={addForm.classNum} onChange={e => setAddForm((f: any) => ({ ...f, classNum: e.target.value }))} disabled={!isAdmin}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: !isAdmin ? '#e2e8f0' : 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>번호</label>
                <input type="number" value={addForm.number} onChange={e => setAddForm((f: any) => ({ ...f, number: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>이름</label>
                <input value={addForm.name} onChange={e => setAddForm((f: any) => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddStudent() }}
                  placeholder="학생 이름"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box' }} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>성별</label>
                <select value={addForm.gender} onChange={e => setAddForm((f: any) => ({ ...f, gender: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid black', fontSize: 14, boxSizing: 'border-box', background: 'white' }}>
                  <option value="">알 수 없음/미지정</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 1 <span style={{ color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
              <input value={addForm.parent_phone} onChange={e => setAddForm((f: any) => ({ ...f, parent_phone: e.target.value }))}
                placeholder="010-0000-0000"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 2 <span style={{ color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
              <input value={addForm.parent_phone2} onChange={e => setAddForm((f: any) => ({ ...f, parent_phone2: e.target.value }))}
                placeholder="010-0000-0000"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 20 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>취소</button>
              <button onClick={handleAddStudent} disabled={adding}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-green)', color: 'white', cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: adding ? 0.7 : 1 }}>
                <i className="fi fi-rr-check" /> {adding ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>학생 정보 수정</h3>
            {editError && (
              <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{editError}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학년</label>
                <input type="number" value={editStudent.grade} disabled
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#e2e8f0', color: '#64748b', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>반</label>
                <input type="number" value={editStudent.class_num} disabled
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#e2e8f0', color: '#64748b', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>번호</label>
                <input type="number" value={editForm.number} onChange={e => setEditForm((f: any) => ({ ...f, number: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>이름</label>
                <input value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleEditStudent() }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>성별</label>
                <select value={editForm.gender} onChange={e => setEditForm((f: any) => ({ ...f, gender: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', background: 'white' }}>
                  <option value="">알 수 없음/미지정</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 1 <span style={{ color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
              <input value={editForm.parent_phone} onChange={e => setEditForm((f: any) => ({ ...f, parent_phone: e.target.value }))}
                placeholder="010-0000-0000"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>학부모 연락처 2 <span style={{ color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
              <input value={editForm.parent_phone2} onChange={e => setEditForm((f: any) => ({ ...f, parent_phone2: e.target.value }))}
                placeholder="010-0000-0000"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 20 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditForm({ ...editForm, name: '' })}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
                onClickCapture={(e) => { e.preventDefault(); setEditStudent(null); }}>취소</button>
              <button onClick={handleEditStudent} disabled={editing}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', cursor: editing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: editing ? 0.7 : 1 }}>
                <i className="fi fi-rr-check" /> {editing ? '수정 중...' : '정보 수정완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
