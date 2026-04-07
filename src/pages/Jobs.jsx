import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, badgeClass, getInitials, avClass } from '../helpers'

const today = () => new Date().toISOString().slice(0, 10)
const newEntry = () => ({ date: today(), hours: '' })

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

  // Base form fields (shared across all entries)
  const [form, setForm] = useState({
    job_name: '', worker_id: '', job_type_id: '',
    wage: '', status: 'Selesai', description: '',
  })

  // Multi-entry: list of { date, hours }
  const [entries, setEntries] = useState([newEntry()])

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
    // use first entry's hours for wage calc if unit=jam
    const hours = parseFloat(entries[0]?.hours) || 1
    const wage = jt.unit === 'jam' ? Math.round(jt.wage_per_unit * hours) : jt.wage_per_unit
    setForm(f => ({ ...f, job_type_id, job_name: jt.name, wage: String(wage) }))
  }

  function handleHoursChange(idx, hours) {
    const updated = entries.map((e, i) => i === idx ? { ...e, hours } : e)
    setEntries(updated)
    // Auto-recalc wage for per-jam type based on first entry
    if (idx === 0) {
      const jt = jobTypes.find(t => t.id === form.job_type_id)
      if (jt && jt.unit === 'jam') {
        const wage = Math.round(jt.wage_per_unit * (parseFloat(hours) || 0))
        setForm(f => ({ ...f, wage: String(wage) }))
      }
    }
  }

  function addEntry() {
    setEntries(prev => [...prev, newEntry()])
  }

  function removeEntry(idx) {
    if (entries.length === 1) return
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  function updateEntryDate(idx, date) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, date } : e))
  }

  async function saveJob() {
    if (!form.job_name || !form.worker_id || !form.wage) return showToast('Lengkapi nama pekerjaan, pekerja, dan upah!')
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i].date) return showToast(`Isi tanggal untuk entri ke-${i + 1}!`)
    }
    setSaving(true)
    const rows = entries.map(e => ({
      job_name: form.job_name,
      worker_id: form.worker_id,
      job_type_id: form.job_type_id || null,
      date: e.date,
      hours: parseFloat(e.hours) || 0,
      wage: parseInt(form.wage),
      status: form.status,
      description: form.description,
    }))
    const { error } = await supabase.from('jobs').insert(rows)
    setSaving(false)
    if (error) return showToast('Error: ' + error.message)
    setShowModal(false)
    resetForm()
    showToast(rows.length > 1 ? `${rows.length} pekerjaan berhasil disimpan!` : 'Pekerjaan berhasil disimpan!')
    loadData()
    onRefresh?.()
  }

  function resetForm() {
    setForm({ job_name:'', worker_id:'', job_type_id:'', wage:'', status:'Selesai', description:'' })
    setEntries([newEntry()])
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

  // total wage preview: entries.length × wage (since each entry has same wage)
  const totalWagePreview = (parseInt(form.wage) || 0) * entries.length

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

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{width: 560, maxHeight:'90vh', overflowY:'auto'}}>
            <div className="modal-title">Tambah Pekerjaan Baru</div>

            {/* ── Shared fields ── */}
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
                <input placeholder="cth. Pasang keramik" value={form.job_name}
                  onChange={e => setForm({...form, job_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Pekerja</label>
                <select value={form.worker_id} onChange={e => setForm({...form, worker_id: e.target.value})}>
                  <option value="">Pilih pekerja</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Upah per Entri (Rp)</label>
                <input type="number" placeholder="cth. 250000" value={form.wage}
                  onChange={e => setForm({...form, wage: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option>Selesai</option><option>Berlangsung</option><option>Pending</option>
                </select>
              </div>
              <div className="form-group" style={{gridColumn:'span 2'}}>
                <label>Deskripsi (opsional)</label>
                <textarea placeholder="Detail pekerjaan..." value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})} />
              </div>
            </div>

            {/* ── Multi-entry section ── */}
            <div style={{borderTop:'1px solid #f0f0eb',paddingTop:'1rem',marginBottom:'0.75rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div>
                  <span style={{fontSize:13,fontWeight:500,color:'#111'}}>Tanggal & Jam Kerja</span>
                  <span style={{fontSize:11,color:'#aaa',marginLeft:8}}>
                    {entries.length} entri · masing-masing disimpan sebagai pekerjaan terpisah
                  </span>
                </div>
                <button
                  onClick={addEntry}
                  style={{fontSize:12,padding:'5px 12px',border:'1px solid #1D9E75',borderRadius:8,
                    background:'#e1f5ee',color:'#085041',cursor:'pointer',fontWeight:500}}>
                  + Tambah Entri
                </button>
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {entries.map((entry, idx) => (
                  <div key={idx} style={{
                    display:'grid', gridTemplateColumns:'1fr 1fr auto',
                    gap:8, alignItems:'end',
                    background: idx % 2 === 0 ? '#fafaf7' : '#f5f5f0',
                    borderRadius:8, padding:'10px 12px',
                    border:'1px solid #eee',
                  }}>
                    {/* Entry label */}
                    <div style={{gridColumn:'1/-1',marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:500,color:'#1D9E75'}}>
                        Entri {idx + 1}
                        {entries.length > 1 && (
                          <span style={{color:'#aaa',fontWeight:400}}> — {entry.date || 'belum dipilih'}</span>
                        )}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="form-group" style={{margin:0}}>
                      <label style={{fontSize:11}}>Tanggal</label>
                      <input type="date" value={entry.date}
                        onChange={e => updateEntryDate(idx, e.target.value)}
                        style={{fontSize:13,padding:'7px 10px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#111',width:'100%',outline:'none'}} />
                    </div>

                    {/* Hours */}
                    <div className="form-group" style={{margin:0}}>
                      <label style={{fontSize:11}}>Jam Kerja</label>
                      <input type="number" placeholder="cth. 8" min="0" step="0.5" value={entry.hours}
                        onChange={e => handleHoursChange(idx, e.target.value)}
                        style={{fontSize:13,padding:'7px 10px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#111',width:'100%',outline:'none'}} />
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeEntry(idx)}
                      disabled={entries.length === 1}
                      style={{
                        width:32, height:32, border:'1px solid #e0e0d8', borderRadius:8,
                        background:'#fff', cursor: entries.length === 1 ? 'not-allowed' : 'pointer',
                        color: entries.length === 1 ? '#ddd' : '#e24b4a',
                        fontSize:16, display:'flex', alignItems:'center', justifyContent:'center',
                        flexShrink:0, marginBottom:1,
                      }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Summary preview ── */}
            {form.wage && (
              <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 14px',marginBottom:8,fontSize:13}}>
                <div style={{color:'#085041'}}>
                  {entries.length > 1 ? (
                    <>
                      <span>{entries.length} entri × </span>
                      <strong>{fmt(parseInt(form.wage)||0)}</strong>
                      <span> = </span>
                      <strong style={{fontSize:15}}>{fmt(totalWagePreview)}</strong>
                      <span style={{color:'#0F6E56',marginLeft:6}}>total upah</span>
                    </>
                  ) : (
                    <>
                      <span>Total upah: </span>
                      <strong>{fmt(parseInt(form.wage)||0)}</strong>
                      {entries[0]?.hours && <span> ({entries[0].hours} jam)</span>}
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn" onClick={() => { setShowModal(false); resetForm() }}>Batal</button>
              <button className="btn btn-primary" onClick={saveJob} disabled={saving}>
                {saving ? 'Menyimpan...' : entries.length > 1 ? `Simpan ${entries.length} Pekerjaan` : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
