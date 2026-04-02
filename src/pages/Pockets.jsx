import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass, personColor } from '../helpers'

const POCKET_TYPES = ['Tabungan', 'Investasi', 'Dana Darurat', 'Belanja', 'Umum']
const POCKET_COLORS = ['#1D9E75','#378ADD','#BA7517','#D85A30','#D4537E','#7F77DD']

export default function Pockets() {
  const [workers, setWorkers] = useState([])
  const [pockets, setPockets] = useState([])
  const [transactions, setTransactions] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [activeView, setActiveView] = useState('pockets') // 'pockets' | 'wages'
  const [showAddPocket, setShowAddPocket] = useState(false)
  const [showTransaction, setShowTransaction] = useState(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showInvite, setShowInvite] = useState(null)
  const [showWithdrawWage, setShowWithdrawWage] = useState(null) // job object
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  const [pocketForm, setPocketForm] = useState({ name:'', type:'Tabungan', goal:'', color:'#1D9E75' })
  const [txForm, setTxForm] = useState({ type:'top_up', amount:'', note:'' })
  const [tfForm, setTfForm] = useState({ from_pocket_id:'', to_pocket_id:'', amount:'', note:'' })
  const [inviteForm, setInviteForm] = useState({ email:'', password:'' })
  const [withdrawForm, setWithdrawForm] = useState({ pocket_id:'', amount:'' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [{ data: w }, { data: p }, { data: t }, { data: j }] = await Promise.all([
      supabase.from('workers').select('*').order('name'),
      supabase.from('pockets').select('*').order('created_at'),
      supabase.from('pocket_transactions').select('*, pockets(name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('jobs').select('*, workers(name), pockets(name)').eq('status', 'Selesai').order('date', { ascending: false }),
    ])
    setWorkers(w || [])
    setPockets(p || [])
    setTransactions(t || [])
    setJobs(j || [])
    setLoading(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }
  const workerPockets = (wid) => pockets.filter(p => p.worker_id === wid)
  const workerTx = (wid) => transactions.filter(t => t.worker_id === wid)
  const workerJobs = (wid) => jobs.filter(j => j.worker_id === wid)

  // Stats per worker
  function workerWageStats(wid) {
    const wj = workerJobs(wid)
    const totalUpah = wj.reduce((s,j) => s+j.wage, 0)
    const sudahDitarik = wj.filter(j=>j.withdrawn).reduce((s,j) => s+j.wage, 0)
    const belumDitarik = totalUpah - sudahDitarik
    return { totalUpah, sudahDitarik, belumDitarik, jobs: wj }
  }

  async function addPocket() {
    if (!pocketForm.name || !selectedWorker) return
    setSaving(true)
    await supabase.from('pockets').insert({
      worker_id: selectedWorker.id, name: pocketForm.name,
      type: pocketForm.type, goal: parseInt(pocketForm.goal)||0,
      color: pocketForm.color, balance: 0,
    })
    setSaving(false); setShowAddPocket(false)
    setPocketForm({ name:'', type:'Tabungan', goal:'', color:'#1D9E75' })
    showToast('Kantong berhasil dibuat!'); loadAll()
  }

  async function doTransaction() {
    const pocket = showTransaction
    const amount = parseInt(txForm.amount)
    if (!amount || amount<=0) return showToast('Masukkan jumlah yang valid!')
    if (txForm.type==='withdraw' && amount>pocket.balance) return showToast('Saldo tidak cukup!')
    setSaving(true)
    const delta = txForm.type==='withdraw' ? -amount : amount
    await supabase.from('pockets').update({ balance: pocket.balance+delta }).eq('id', pocket.id)
    await supabase.from('pocket_transactions').insert({
      pocket_id: pocket.id, worker_id: pocket.worker_id,
      type: txForm.type, amount, note: txForm.note,
    })
    setSaving(false); setShowTransaction(null)
    setTxForm({ type:'top_up', amount:'', note:'' })
    showToast(txForm.type==='withdraw'?'Penarikan berhasil!':'Top up berhasil!'); loadAll()
  }

  // Tarik upah dari job langsung ke kantong
  async function doWithdrawWage() {
    const job = showWithdrawWage
    const pocket = pockets.find(p => p.id === withdrawForm.pocket_id)
    const amount = parseInt(withdrawForm.amount) || job.wage
    if (!pocket) return showToast('Pilih kantong tujuan!')
    if (amount <= 0 || amount > job.wage) return showToast('Jumlah tidak valid!')
    setSaving(true)
    // Update job: tandai withdrawn
    await supabase.from('jobs').update({
      withdrawn: true,
      withdrawn_to_pocket_id: pocket.id,
      withdrawn_at: new Date().toISOString(),
    }).eq('id', job.id)
    // Tambah saldo kantong
    await supabase.from('pockets').update({ balance: pocket.balance + amount }).eq('id', pocket.id)
    // Catat transaksi
    await supabase.from('pocket_transactions').insert({
      pocket_id: pocket.id, worker_id: job.worker_id,
      type: 'from_wage', amount,
      note: `Upah: ${job.job_name} (${job.date})`,
    })
    setSaving(false); setShowWithdrawWage(null)
    setWithdrawForm({ pocket_id:'', amount:'' })
    showToast('Upah berhasil dipindah ke kantong!'); loadAll()
  }

  // Batalkan penarikan upah
  async function undoWithdraw(job) {
    if (!confirm('Batalkan penarikan upah ini?')) return
    const pocket = pockets.find(p => p.id === job.withdrawn_to_pocket_id)
    if (pocket) {
      await supabase.from('pockets').update({ balance: Math.max(0, pocket.balance - job.wage) }).eq('id', pocket.id)
      await supabase.from('pocket_transactions').delete()
        .eq('pocket_id', pocket.id).eq('type','from_wage')
        .like('note', `%${job.job_name}%`)
    }
    await supabase.from('jobs').update({ withdrawn: false, withdrawn_to_pocket_id: null, withdrawn_at: null }).eq('id', job.id)
    showToast('Penarikan dibatalkan.'); loadAll()
  }

  async function doTransfer() {
    const amount = parseInt(tfForm.amount)
    const from = pockets.find(p=>p.id===tfForm.from_pocket_id)
    const to = pockets.find(p=>p.id===tfForm.to_pocket_id)
    if (!from||!to||!amount) return showToast('Lengkapi semua field!')
    if (from.id===to.id) return showToast('Kantong asal dan tujuan harus berbeda!')
    if (amount>from.balance) return showToast('Saldo tidak cukup!')
    setSaving(true)
    await supabase.from('pockets').update({ balance: from.balance-amount }).eq('id', from.id)
    await supabase.from('pockets').update({ balance: to.balance+amount }).eq('id', to.id)
    await supabase.from('pocket_transactions').insert([
      { pocket_id:from.id, worker_id:from.worker_id, type:'transfer_out', amount, note:tfForm.note, related_pocket_id:to.id },
      { pocket_id:to.id, worker_id:to.worker_id, type:'transfer_in', amount, note:tfForm.note, related_pocket_id:from.id },
    ])
    setSaving(false); setShowTransfer(false)
    setTfForm({ from_pocket_id:'', to_pocket_id:'', amount:'', note:'' })
    showToast('Transfer berhasil!'); loadAll()
  }

  async function inviteWorker() {
    if (!inviteForm.email||!inviteForm.password) return showToast('Isi email dan password!')
    setSaving(true)
    const { data: sd, error: se } = await supabase.auth.signUp({ email:inviteForm.email, password:inviteForm.password })
    if (se) { setSaving(false); return showToast('Error: '+se.message) }
    await supabase.from('workers').update({ email:inviteForm.email, user_id:sd.user?.id }).eq('id', showInvite.id)
    setSaving(false); setShowInvite(null); setInviteForm({ email:'', password:'' })
    showToast('Akun pekerja berhasil dibuat!'); loadAll()
  }

  async function deletePocket(id) {
    if (!confirm('Hapus kantong ini?')) return
    await supabase.from('pocket_transactions').delete().eq('pocket_id', id)
    await supabase.from('pockets').delete().eq('id', id)
    showToast('Kantong dihapus.'); loadAll()
  }

  const txLabel = { top_up:'Top Up', withdraw:'Tarik', transfer_in:'Transfer Masuk', transfer_out:'Transfer Keluar', from_wage:'Dari Upah' }
  const txColor = { top_up:'#1D9E75', withdraw:'#e24b4a', transfer_in:'#378ADD', transfer_out:'#BA7517', from_wage:'#1D9E75' }

  if (loading) return <div className="loading">Memuat data...</div>

  return (
    <div>
      {/* Top actions */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:4,background:'#f0f0eb',borderRadius:8,padding:3}}>
          {[{id:'pockets',label:'Kantong'},{id:'wages',label:'Upah & Penarikan'}].map(v=>(
            <button key={v.id} onClick={()=>setActiveView(v.id)}
              style={{padding:'6px 14px',fontSize:12,fontWeight:500,border:'none',cursor:'pointer',borderRadius:6,
                background:activeView===v.id?'#fff':'transparent',
                color:activeView===v.id?'#111':'#888',
                boxShadow:activeView===v.id?'0 1px 3px rgba(0,0,0,.1)':'none'}}>
              {v.label}
            </button>
          ))}
        </div>
        {activeView==='pockets' && (
          <button className="btn btn-sm" onClick={()=>setShowTransfer(true)}>⇄ Transfer Antar Kantong</button>
        )}
      </div>

      {/* ===== VIEW: KANTONG ===== */}
      {activeView==='pockets' && workers.map((w,wi) => {
        const wp = workerPockets(w.id)
        const totalBalance = wp.reduce((s,p)=>s+p.balance,0)
        const wtx = workerTx(w.id).slice(0,5)
        const isExpanded = selectedWorker?.id===w.id

        return (
          <div key={w.id} className="card" style={{marginBottom:'1rem'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:isExpanded?'1rem':0}}>
              <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={()=>setSelectedWorker(isExpanded?null:w)}>
                <span className={`avatar ${avClass(wi)}`} style={{width:38,height:38,fontSize:13}}>{getInitials(w.name)}</span>
                <div>
                  <div style={{fontWeight:600}}>{w.name}</div>
                  <div style={{fontSize:11,color:'#888'}}>{w.role} · {wp.length} kantong · Saldo: <strong style={{color:'#1D9E75'}}>{fmt(totalBalance)}</strong></div>
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {!w.user_id
                  ? <button className="btn btn-sm" style={{fontSize:11}} onClick={()=>setShowInvite(w)}>+ Buat Akun Login</button>
                  : <span style={{fontSize:11,background:'#e1f5ee',color:'#085041',padding:'3px 10px',borderRadius:20}}>✓ Bisa Login</span>}
                <button className="btn btn-sm btn-primary" onClick={()=>{setSelectedWorker(w);setShowAddPocket(true)}}>+ Kantong</button>
                <button className="btn btn-sm" onClick={()=>setSelectedWorker(isExpanded?null:w)}>{isExpanded?'▲':'▼'}</button>
              </div>
            </div>

            {isExpanded && (
              <>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:'1rem'}}>
                  {wp.length===0 && <div style={{gridColumn:'1/-1',textAlign:'center',padding:'1.5rem',color:'#aaa',fontSize:13}}>Belum ada kantong.</div>}
                  {wp.map(p => {
                    const pct = p.goal>0 ? Math.min(100,Math.round(p.balance/p.goal*100)) : 0
                    return (
                      <div key={p.id} style={{background:'#fafaf7',border:'1px solid #eee',borderRadius:10,padding:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:p.color}}>{p.name}</div>
                            <div style={{fontSize:11,color:'#aaa'}}>{p.type}</div>
                          </div>
                          <button style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:18}} onClick={()=>deletePocket(p.id)}>×</button>
                        </div>
                        <div style={{fontSize:20,fontWeight:700,color:'#111',marginBottom:4}}>{fmt(p.balance)}</div>
                        {p.goal>0 && (
                          <>
                            <div style={{fontSize:11,color:'#aaa',marginBottom:4}}>Target: {fmt(p.goal)} ({pct}%)</div>
                            <div style={{height:4,background:'#eee',borderRadius:99,overflow:'hidden'}}>
                              <div style={{width:pct+'%',height:'100%',background:p.color,borderRadius:99}}></div>
                            </div>
                          </>
                        )}
                        <div style={{display:'flex',gap:6,marginTop:10}}>
                          <button className="btn btn-sm btn-primary" style={{flex:1,fontSize:11}}
                            onClick={()=>{setShowTransaction(p);setTxForm({type:'top_up',amount:'',note:''})}}>Top Up</button>
                          <button className="btn btn-sm" style={{flex:1,fontSize:11}}
                            onClick={()=>{setShowTransaction(p);setTxForm({type:'withdraw',amount:'',note:''})}}>Tarik</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {wtx.length>0 && (
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:8}}>Transaksi Terbaru</div>
                    {wtx.map(t=>(
                      <div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f0f0eb',fontSize:12}}>
                        <div>
                          <span style={{fontWeight:500,color:txColor[t.type]||'#333'}}>{txLabel[t.type]||t.type}</span>
                          <span style={{color:'#aaa',marginLeft:8}}>{t.pockets?.name}</span>
                          {t.note&&<span style={{color:'#bbb',marginLeft:8}}>· {t.note}</span>}
                        </div>
                        <div style={{fontWeight:500,color:['withdraw','transfer_out'].includes(t.type)?'#e24b4a':'#1D9E75'}}>
                          {['withdraw','transfer_out'].includes(t.type)?'−':'+'}  {fmt(t.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* ===== VIEW: UPAH & PENARIKAN ===== */}
      {activeView==='wages' && (
        <div>
          {workers.map((w,wi) => {
            const stats = workerWageStats(w.id)
            const isExpanded = selectedWorker?.id===w.id
            const wp = workerPockets(w.id)

            return (
              <div key={w.id} className="card" style={{marginBottom:'1rem'}}>
                {/* Worker header */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:isExpanded?'1rem':0,cursor:'pointer'}}
                  onClick={()=>setSelectedWorker(isExpanded?null:w)}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <span className={`avatar ${avClass(wi)}`} style={{width:38,height:38,fontSize:13}}>{getInitials(w.name)}</span>
                    <div>
                      <div style={{fontWeight:600}}>{w.name}</div>
                      <div style={{fontSize:11,color:'#888'}}>{stats.jobs.length} pekerjaan selesai</div>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:'#aaa'}}>Total Upah</div>
                      <div style={{fontWeight:600,fontSize:13}}>{fmt(stats.totalUpah)}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:'#1D9E75'}}>Sudah Ditarik</div>
                      <div style={{fontWeight:600,fontSize:13,color:'#1D9E75'}}>{fmt(stats.sudahDitarik)}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:'#BA7517'}}>Belum Ditarik</div>
                      <div style={{fontWeight:600,fontSize:13,color:'#BA7517'}}>{fmt(stats.belumDitarik)}</div>
                    </div>
                    <button className="btn btn-sm">{isExpanded?'▲':'▼'}</button>
                  </div>
                </div>

                {/* Summary bar */}
                {!isExpanded && stats.totalUpah>0 && (
                  <div style={{height:4,background:'#eee',borderRadius:99,overflow:'hidden',marginTop:8}}>
                    <div style={{width:Math.round(stats.sudahDitarik/stats.totalUpah*100)+'%',height:'100%',background:'#1D9E75',borderRadius:99}}></div>
                  </div>
                )}

                {isExpanded && (
                  <>
                    {/* Mini summary */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:'1rem'}}>
                      <div style={{background:'#f5f5f0',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                        <div style={{fontSize:11,color:'#888',marginBottom:3}}>Total Upah</div>
                        <div style={{fontSize:16,fontWeight:700}}>{fmt(stats.totalUpah)}</div>
                      </div>
                      <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                        <div style={{fontSize:11,color:'#085041',marginBottom:3}}>✓ Sudah Ditarik</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#1D9E75'}}>{fmt(stats.sudahDitarik)}</div>
                      </div>
                      <div style={{background:'#faeeda',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                        <div style={{fontSize:11,color:'#633806',marginBottom:3}}>⏳ Belum Ditarik</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#BA7517'}}>{fmt(stats.belumDitarik)}</div>
                      </div>
                    </div>

                    {/* Daftar pekerjaan selesai */}
                    {stats.jobs.length===0 && <div style={{textAlign:'center',color:'#aaa',padding:'1rem',fontSize:13}}>Belum ada pekerjaan selesai</div>}
                    {stats.jobs.map(j=>(
                      <div key={j.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #f0f0eb'}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:500,fontSize:13}}>{j.job_name}</div>
                          <div style={{fontSize:11,color:'#aaa'}}>{j.date}{j.hours?' · '+j.hours+' jam':''}</div>
                          {j.withdrawn && (
                            <div style={{fontSize:11,color:'#1D9E75',marginTop:2}}>
                              ✓ Masuk ke: <strong>{j.pockets?.name||'Kantong'}</strong>
                              {j.withdrawn_at && ' · '+new Date(j.withdrawn_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}
                            </div>
                          )}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{fontWeight:600,fontSize:14}}>{fmt(j.wage)}</div>
                          {j.withdrawn ? (
                            <div style={{display:'flex',gap:4,alignItems:'center'}}>
                              <span style={{fontSize:11,background:'#e1f5ee',color:'#085041',padding:'3px 10px',borderRadius:20,fontWeight:500}}>✓ Ditarik</span>
                              <button className="btn btn-sm" style={{fontSize:10,color:'#aaa'}} onClick={()=>undoWithdraw(j)}>Batal</button>
                            </div>
                          ) : (
                            <button className="btn btn-sm btn-primary" style={{fontSize:11,whiteSpace:'nowrap'}}
                              onClick={()=>{
                                setShowWithdrawWage(j)
                                setWithdrawForm({ pocket_id: wp[0]?.id||'', amount: String(j.wage) })
                              }}>
                              → Tarik ke Kantong
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ===== MODALS ===== */}

      {/* Add Pocket */}
      {showAddPocket && selectedWorker && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddPocket(false)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-title">Tambah Kantong — {selectedWorker.name}</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Nama Kantong</label>
                <input placeholder="cth. Tabungan Rumah" value={pocketForm.name} onChange={e=>setPocketForm({...pocketForm,name:e.target.value})} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group"><label>Tipe</label>
                  <select value={pocketForm.type} onChange={e=>setPocketForm({...pocketForm,type:e.target.value})}>
                    {POCKET_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Target Saldo (opsional)</label>
                  <input type="number" placeholder="cth. 5000000" value={pocketForm.goal} onChange={e=>setPocketForm({...pocketForm,goal:e.target.value})} />
                </div>
              </div>
              <div className="form-group"><label>Warna Kantong</label>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  {POCKET_COLORS.map(c=>(
                    <div key={c} onClick={()=>setPocketForm({...pocketForm,color:c})}
                      style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',
                        border:pocketForm.color===c?'3px solid #111':'3px solid transparent'}}></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddPocket(false)}>Batal</button>
              <button className="btn btn-primary" onClick={addPocket} disabled={saving}>{saving?'Menyimpan...':'Buat Kantong'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction */}
      {showTransaction && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowTransaction(null)}>
          <div className="modal" style={{width:380}}>
            <div className="modal-title">{txForm.type==='withdraw'?'Tarik Saldo':'Top Up'} — {showTransaction.name}</div>
            <div style={{background:'#f5f5f0',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13}}>
              Saldo saat ini: <strong>{fmt(showTransaction.balance)}</strong>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',gap:8}}>
                <button className={`btn${txForm.type==='top_up'?' btn-primary':''}`} style={{flex:1}} onClick={()=>setTxForm({...txForm,type:'top_up'})}>Top Up</button>
                <button className={`btn${txForm.type==='withdraw'?' btn-primary':''}`} style={{flex:1}} onClick={()=>setTxForm({...txForm,type:'withdraw'})}>Tarik</button>
              </div>
              <div className="form-group"><label>Jumlah (Rp)</label>
                <input type="number" placeholder="cth. 500000" value={txForm.amount} onChange={e=>setTxForm({...txForm,amount:e.target.value})} />
              </div>
              <div className="form-group"><label>Catatan (opsional)</label>
                <input placeholder="cth. Upah minggu ini" value={txForm.note} onChange={e=>setTxForm({...txForm,note:e.target.value})} />
              </div>
              {txForm.amount && (
                <div style={{background:txForm.type==='withdraw'?'#fff0f0':'#e1f5ee',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                  <span style={{color:txForm.type==='withdraw'?'#e24b4a':'#085041'}}>
                    Saldo setelah: <strong>{fmt(showTransaction.balance+(txForm.type==='withdraw'?-1:1)*(parseInt(txForm.amount)||0))}</strong>
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowTransaction(null)}>Batal</button>
              <button className="btn btn-primary" onClick={doTransaction} disabled={saving}>{saving?'Memproses...':'Konfirmasi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Wage to Pocket */}
      {showWithdrawWage && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowWithdrawWage(null)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-title">Tarik Upah ke Kantong</div>
            <div style={{background:'#f5f5f0',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600}}>{showWithdrawWage.job_name}</div>
              <div style={{fontSize:12,color:'#888',marginTop:2}}>{showWithdrawWage.date}</div>
              <div style={{fontSize:16,fontWeight:700,color:'#1D9E75',marginTop:4}}>{fmt(showWithdrawWage.wage)}</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Masuk ke Kantong</label>
                <select value={withdrawForm.pocket_id} onChange={e=>setWithdrawForm({...withdrawForm,pocket_id:e.target.value})}>
                  <option value="">Pilih kantong...</option>
                  {workerPockets(showWithdrawWage.worker_id).map(p=>(
                    <option key={p.id} value={p.id}>{p.name} — Saldo: {fmt(p.balance)}</option>
                  ))}
                </select>
                {workerPockets(showWithdrawWage.worker_id).length===0 && (
                  <div style={{fontSize:11,color:'#e24b4a',marginTop:4}}>Pekerja belum punya kantong. Buat dulu di tab Kantong.</div>
                )}
              </div>
              <div className="form-group"><label>Jumlah (Rp)</label>
                <input type="number" value={withdrawForm.amount} onChange={e=>setWithdrawForm({...withdrawForm,amount:e.target.value})}
                  max={showWithdrawWage.wage} />
                <span style={{fontSize:11,color:'#aaa'}}>Maks: {fmt(showWithdrawWage.wage)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowWithdrawWage(null)}>Batal</button>
              <button className="btn btn-primary" onClick={doWithdrawWage} disabled={saving||!withdrawForm.pocket_id}>
                {saving?'Memproses...':'Pindahkan ke Kantong'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer */}
      {showTransfer && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowTransfer(false)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-title">Transfer Antar Kantong</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Dari Kantong</label>
                <select value={tfForm.from_pocket_id} onChange={e=>setTfForm({...tfForm,from_pocket_id:e.target.value})}>
                  <option value="">Pilih kantong asal...</option>
                  {pockets.map(p=>{const w=workers.find(w=>w.id===p.worker_id);return <option key={p.id} value={p.id}>{w?.name} — {p.name} ({fmt(p.balance)})</option>})}
                </select>
              </div>
              <div className="form-group"><label>Ke Kantong</label>
                <select value={tfForm.to_pocket_id} onChange={e=>setTfForm({...tfForm,to_pocket_id:e.target.value})}>
                  <option value="">Pilih kantong tujuan...</option>
                  {pockets.filter(p=>p.id!==tfForm.from_pocket_id).map(p=>{const w=workers.find(w=>w.id===p.worker_id);return <option key={p.id} value={p.id}>{w?.name} — {p.name} ({fmt(p.balance)})</option>})}
                </select>
              </div>
              <div className="form-group"><label>Jumlah (Rp)</label>
                <input type="number" placeholder="cth. 200000" value={tfForm.amount} onChange={e=>setTfForm({...tfForm,amount:e.target.value})} />
              </div>
              <div className="form-group"><label>Catatan (opsional)</label>
                <input placeholder="cth. Bagi hasil" value={tfForm.note} onChange={e=>setTfForm({...tfForm,note:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowTransfer(false)}>Batal</button>
              <button className="btn btn-primary" onClick={doTransfer} disabled={saving}>{saving?'Memproses...':'Transfer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite */}
      {showInvite && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowInvite(null)}>
          <div className="modal" style={{width:380}}>
            <div className="modal-title">Buat Akun Login — {showInvite.name}</div>
            <p style={{fontSize:13,color:'#888',marginBottom:16}}>Pekerja bisa login untuk melihat kantong mereka sendiri.</p>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Email</label>
                <input type="email" placeholder="email@pekerja.com" value={inviteForm.email} onChange={e=>setInviteForm({...inviteForm,email:e.target.value})} />
              </div>
              <div className="form-group"><label>Password (min. 6 karakter)</label>
                <input type="password" placeholder="••••••" value={inviteForm.password} onChange={e=>setInviteForm({...inviteForm,password:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowInvite(null)}>Batal</button>
              <button className="btn btn-primary" onClick={inviteWorker} disabled={saving}>{saving?'Membuat...':'Buat Akun'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
