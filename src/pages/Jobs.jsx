import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, badgeClass, getInitials, avClass } from '../helpers'

export default function Jobs({ onRefresh }) {
  const [jobs, setJobs] = useState([])
  const [workers, setWorkers] = useState([])
  const [jobTypes, setJobTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    job_name: '', worker_id: '', job_type_id: '',
    date: new Date().toISOString().slice(0,10),
    hours: '', wage: '', status: 'Selesai', description: ''
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: j }, { data: w }, { data: jt }] = await Promise.all([
      supabase.from('jobs').select('*, workers(id,name), job_types(name,wage_per_unit,unit)').order('date', { ascending: false }),
      supabase.from('workers').select('*').order('name'),
      supabase.from('job_types').select('*').order('name'),
    ])
    setJobs(j || [])
    setWorkers(w || [])
    setJobTypes(jt || [])
    setLoading(false)
  }

  function handleJobTypeChange(job_type_id) {
    const jt = jobTypes.find(t => t.id === job_type_id)
    if (!jt) return setForm(f => ({ ...f, job_type_id, job_name: '' }))
    const hours = parseFloat(form.hours) || 1
    const wage = jt.unit === 'jam' ? Math.round(jt.wage_per_unit * hours) : jt.wage_per_unit
    setForm(f => ({ ...f, job_type_id, job_name: jt.name, wage: String(wage) }))
  }

  function handleHoursChange(hours) {
    const jt = jobTypes.find(t => t.id === form.job_type_id)
    if (jt && jt.unit === 'jam') {
      const wage = Math.round(jt.wage_per_unit * (parseFloat(hours) || 0))
      setForm(f => ({ ...f, hours, wage: String(wage) }))
    } else {
      setForm(f => ({ ...f, hours }))
    }
  }

  async function saveJob() {
    if (!form.job_name || !form.worker_id || !form.wage) return showToast('Lengkapi semua field!')
    setSaving(true)
    const { error } = await supabase.from('jobs').insert({
      job_name: form.job_name,
      worker_id: form.worker_id,
      job_type_id: form.job_type_id || null,
      date: form.date,
      hours: parseFloat(form.hours) || 0,
      wage: parseInt(form.wage),
      status: form.status,
      description: form.description,
    })
    setSaving(false)
    if (error) return showToast('Error: ' + error.message)
    setShowModal(false)
    resetForm()
    showToast('Pekerjaan berhasil disimpan!')
    loadData()
    onRefresh?.()
  }

  function resetForm() {
    setForm({ job_name:'', worker_id:'', job_type_id:'', date: new Date().toISOString().slice(0,10), hours:'', wage:'', status:'Selesai', description:'' })
  }

  async function deleteJob(id) {
    if (!confirm('Hapus pekerjaan ini?')) return
    await supabase.from('jobs').delete().eq('id', id)
    showToast('Pekerjaan dihapus.')
    loadData()
    onRefresh?.()
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    return (!q || j.job_name.toLowerCase().includes(q) || j.workers?.name?.toLowerCase().includes(q))
      && (!filterPerson || j.worker_id === filterPerson)
      && (!filterStatus || j.status === filterStatus)
  })

  if (loading) return <div className="loading">Memuat data...</div>

  return (
    <div>
      <div className="filter-row">
        <input type="text" placeholder="Cari pekerjaan..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}>
          <option value="">Semua orang</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option>Selesai</option><option>Berlangsung</option><option>Pending</option>
        </select>
        <span className="count-label">{filtered.length} pekerjaan</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Tambah</button>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table>
          <thead><tr>
            <th>Pekerjaan</th><th>Pekerja</th><th>Tanggal</th><th>Jam</th><th>Upah</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada pekerjaan</td></tr>
            )}
            {filtered.map(j => (
              <tr key={j.id}>
                <td>
                  <div style={{fontWeight:500}}>{j.job_name}</div>
                  {j.job_types && <div style={{fontSize:11,color:'#1D9E75',marginTop:2}}>{j.job_types.name}</div>}
                  {j.description && <div style={{fontSize:11,color:'#aaa'}}>{j.description}</div>}
                </td>
                <td>
                  <div className="person-row">
                    <span className={`avatar ${avClass(workers.findIndex(w=>w.id===j.worker_id))}`}>{getInitials(j.workers?.name)}</span>
                    <span>{j.workers?.name || '—'}</span>
                  </div>
                </td>
                <td style={{color:'#888',fontSize:12}}>{j.date}</td>
                <td style={{color:'#888',fontSize:12}}>{j.hours ? j.hours + ' jam' : '—'}</td>
                <td style={{fontWeight:500}}>{fmt(j.wage)}</td>
                <td><span className={`badge ${badgeClass(j.status)}`}>{j.status}</span></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => deleteJob(j.id)}>Hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div class="modal-title">Tambah Pekerjaan Baru</div>
            <div className="form-grid">
              <div className="form-group" style={{gridColumn:'span 2'}}>
                <label>Jenis Pekerjaan <span style={{color:'#aaa',fontWeight:400}}>(opsional — otomatis isi upah)</span></label>
                <select value={form.job_type_id} onChange={e => handleJobTypeChange(e.target.value)}>
                  <option value="">Pilih jenis pekerjaan...</option>
                  {jobTypes.map(jt => (
                    <option key={jt.id} value={jt.id}>{jt.name} — {fmt(jt.wage_per_unit)}/{jt.unit}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Nama Pekerjaan</label>
                <input placeholder="cth. Pasang keramik" value={form.job_name} onChange={e => setForm({...form, job_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Pekerja</label>
                <select value={form.worker_id} onChange={e => setForm({...form, worker_id: e.target.value})}>
                  <option value="">Pilih pekerja</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tanggal</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Jam Kerja</label>
                <input type="number" placeholder="cth. 8" min="0" step="0.5" value={form.hours} onChange={e => handleHoursChange(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Upah (Rp)</label>
                <input type="number" placeholder="cth. 250000" value={form.wage} onChange={e => setForm({...form, wage: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option>Selesai</option><option>Berlangsung</option><option>Pending</option>
                </select>
              </div>
              <div className="form-group" style={{gridColumn:'span 2'}}>
                <label>Deskripsi (opsional)</label>
                <textarea placeholder="Detail pekerjaan..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
            </div>
            {form.wage && (
              <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 14px',marginBottom:8,fontSize:13}}>
                <span style={{color:'#085041'}}>Total upah: <strong>{fmt(parseInt(form.wage)||0)}</strong>{form.hours ? ` (${form.hours} jam)` : ''}</span>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn" onClick={() => { setShowModal(false); resetForm() }}>Batal</button>
              <button className="btn btn-primary" onClick={saveJob} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
