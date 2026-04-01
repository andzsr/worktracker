import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass, personColor } from '../helpers'

export default function People() {
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ name: '', role: '' })
  const [saving, setSaving] = useState(false)
  const [editWorker, setEditWorker] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')



  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: w }, { data: j }] = await Promise.all([
      supabase.from('workers').select('*').order('name'),
      supabase.from('jobs').select('worker_id, wage, status'),
    ])
    setWorkers(w || [])
    setJobs(j || [])
    setLoading(false)
  }

  async function saveWorker() {
  if (!form.name) return
  setSaving(true)

  console.log('EDIT MODE?', editWorker) // ← DEBUG WAJIB

  if (editWorker) {
    // ✅ UPDATE
    await supabase
      .from('workers')
      .update({
        name: form.name,
        role: form.role
      })
      .eq('id', editWorker.id)

    setToast('Pekerja berhasil diperbarui!')
  } else {
    // ✅ INSERT
    await supabase
      .from('workers')
      .insert({
        name: form.name,
        role: form.role
      })

    setToast('Pekerja berhasil ditambahkan!')
  }

  setSaving(false)
  setShowModal(false)
  setEditWorker(null)          // ← PENTING
  setForm({ name: '', role: '' })

  setTimeout(() => setToast(''), 2500)
  loadData()
  }


  async function deleteWorker(id) {
    if (!confirm('Hapus pekerja ini? Semua pekerjaan terkait juga akan terhapus.')) return
    await supabase.from('jobs').delete().eq('worker_id', id)
    await supabase.from('workers').delete().eq('id', id)
    setToast('Pekerja dihapus.')
    setTimeout(() => setToast(''), 2500)
    loadData()
  }


function openAdd() {
  setEditWorker(null)
  setForm({ name: '', role: '' })
  setShowModal(true)
}


  if (loading) return <div className="loading">Memuat data...</div>

  const stats = workers.map((w, i) => {
    const wjobs = jobs.filter(j => j.worker_id === w.id)
    const total = wjobs.reduce((s,j) => s + j.wage, 0)
    const done = wjobs.filter(j => j.status === 'Selesai').length
    return { ...w, idx: i, wjobs, total, done, count: wjobs.length }
  })

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <span style={{fontSize:13,color:'#888'}}>{workers.length} pekerja terdaftar</span>
        
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            + Tambah Pekerja
          </button>

      </div>

      <div className="person-grid">
        {stats.map(s => (
          <div key={s.id} className="person-card">
            <div className="person-header">
              <span className={`avatar ${avClass(s.idx)}`} style={{width:38,height:38,fontSize:13}}>
                {getInitials(s.name)}
              </span>
              <div>
                <div className="person-name">{s.name}</div>
                <div className="person-role">{s.role || 'Pekerja'}</div>
              </div>
            </div>
            <div className="stat-row"><span className="stat-lbl">Total Upah</span><span className="stat-val" style={{color: personColor(s.idx)}}>{fmt(s.total)}</span></div>
            <div className="stat-row"><span className="stat-lbl">Total Pekerjaan</span><span className="stat-val">{s.count} tugas</span></div>
            <div className="stat-row"><span className="stat-lbl">Selesai</span><span className="stat-val">{s.done}/{s.count}</span></div>
            <div className="prog-bar">
              <div className="prog-fill" style={{width: s.count ? Math.round(s.done/s.count*100)+'%' : '0%', background: personColor(s.idx)}}></div>
            </div>
            
              <button
                  className="btn btn-sm"
                  style={{flex:1}}
                  onClick={() => {
                    setEditWorker(s)
                    setForm({ name: s.name, role: s.role || '' })
                    setShowModal(true)
                  }}
                >
                  Edit
                </button>

                <button
                  className="btn btn-sm btn-danger"
                  style={{flex:1}}
                  onClick={() => deleteWorker(s.id)}
                >
                  Hapus
                </button>

          </div>
        ))}
        {workers.length === 0 && (
          <div style={{gridColumn:'span 3',textAlign:'center',color:'#aaa',padding:'3rem'}}>Belum ada pekerja. Tambahkan pekerja dulu!</div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{width:380}}>
            
<div className="modal-title">
  {editWorker ? 'Edit Pekerja' : 'Tambah Pekerja Baru'}
</div>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Nama Lengkap</label><input placeholder="cth. Ahmad Fauzi" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="form-group"><label>Pekerjaan / Role</label><input placeholder="cth. Tukang batu" value={form.role} onChange={e => setForm({...form, role: e.target.value})} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={saveWorker} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
