import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt } from '../helpers'

const UNIT_OPTIONS = ['tugas', 'jam', 'hari', 'm²', 'm³', 'unit']

export default function JobTypes() {
  const [jobTypes, setJobTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', wage_per_unit: '', unit: 'tugas', description: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('job_types').select('*').order('name')
    setJobTypes(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditItem(null)
    setForm({ name: '', wage_per_unit: '', unit: 'tugas', description: '' })
    setShowModal(true)
  }

  function openEdit(jt) {
    setEditItem(jt)
    setForm({ name: jt.name, wage_per_unit: String(jt.wage_per_unit), unit: jt.unit, description: jt.description || '' })
    setShowModal(true)
  }

  async function save() {
  if (!form.name || !form.wage_per_unit) {
    showToast('Lengkapi nama dan upah!')
    return
  }

  setSaving(true)

  const payload = {
    name: form.name,
    wage_per_unit: parseInt(form.wage_per_unit),
    unit: form.unit,
    description: form.description
  }

  let result

  if (editItem) {
    result = await supabase
      .from('job_types')
      .update(payload)
      .eq('id', editItem.id)
  } else {
    result = await supabase
      .from('job_types')
      .insert(payload)
  }

  const { error } = result

  if (error) {
    console.error(error)
    showToast(error.message)
  } else {
    showToast(editItem ? 'Jenis diperbarui!' : 'Jenis ditambahkan!')
    setShowModal(false)
    loadData()
  }

  setSaving(false)
  }


  async function deleteType(id) {
    if (!confirm('Hapus jenis pekerjaan ini?')) return
    await supabase.from('job_types').delete().eq('id', id)
    showToast('Dihapus.')
    loadData()
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) return <div className="loading">Memuat data...</div>

  const unitLabel = { tugas: 'per tugas', jam: 'per jam', hari: 'per hari', 'm²': 'per m²', 'm³': 'per m³', unit: 'per unit' }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <span style={{fontSize:13,color:'#888'}}>{jobTypes.length} jenis pekerjaan</span>
          <div style={{fontSize:12,color:'#aaa',marginTop:2}}>Daftar jenis pekerjaan & standar upah. Saat input pekerjaan, pilih jenis ini untuk auto-fill upah.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Tambah Jenis</button>
      </div>

      {jobTypes.length === 0 ? (
        <div className="card" style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>
          <div style={{fontSize:32,marginBottom:12}}>📋</div>
          <div style={{fontSize:14,fontWeight:500,marginBottom:6}}>Belum ada jenis pekerjaan</div>
          <div style={{fontSize:12}}>Tambahkan jenis pekerjaan seperti "Tukang batu", "Finishing", dll beserta standar upahnya</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={openAdd}>+ Tambah Jenis Pekerjaan</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table>
            <thead><tr>
              <th>Nama Pekerjaan</th>
              <th>Satuan</th>
              <th>Upah Standar</th>
              <th>Keterangan</th>
              <th></th>
            </tr></thead>
            <tbody>
              {jobTypes.map(jt => (
                <tr key={jt.id}>
                  <td style={{fontWeight:500}}>{jt.name}</td>
                  <td>
                    <span className="badge" style={{background:'#e6f1fb',color:'#185FA5'}}>{jt.unit}</span>
                  </td>
                  <td>
                    <div style={{fontWeight:500,color: jt.wage_per_unit < 0 ? '#dc2626' : '#1D9E75'}}>{fmt(jt.wage_per_unit)}</div>
                    <div style={{fontSize:11,color:'#aaa'}}>{unitLabel[jt.unit] || jt.unit}</div>
                  </td>
                  <td style={{color:'#888',fontSize:12}}>{jt.description || '—'}</td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-sm" onClick={() => openEdit(jt)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteType(jt.id)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary cards */}
      {jobTypes.length > 0 && (
        <div style={{marginTop:'1rem'}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8,color:'#555'}}>Ringkasan upah per satuan</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
            {jobTypes.map(jt => (
              <div key={jt.id} className="metric">
                <div className="metric-label">{jt.name}</div>
                <div className="metric-val green" 
                  style={{
                      fontSize: 16,
                      color: jt.wage_per_unit < 0 ? '#dc2626' : '#16a34a'
                    }}
                  >{fmt(jt.wage_per_unit)}
                </div>
                <div className="metric-sub">per {jt.unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-title">{editItem ? 'Edit Jenis Pekerjaan' : 'Tambah Jenis Pekerjaan'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group">
                <label>Nama Jenis Pekerjaan</label>
                <input placeholder="cth. Pasang keramik, Tukang kayu..." value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label>Upah Standar (Rp)</label>
                  <input type="number" placeholder="cth. 150000" value={form.wage_per_unit} onChange={e => setForm({...form, wage_per_unit: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Satuan</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Keterangan (opsional)</label>
                <input placeholder="cth. Termasuk bahan, eksklusif bahan..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              {form.wage_per_unit && (
                <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 14px',fontSize:13}}>
                  <span style={{color:'#085041'}}>Upah standar: <strong>{fmt(parseInt(form.wage_per_unit)||0)}</strong> per {form.unit}</span>
                  {form.unit === 'jam' && <div style={{fontSize:11,color:'#1D9E75',marginTop:4}}>Tip: Saat input pekerjaan, masukkan jam kerja → upah otomatis terhitung</div>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
