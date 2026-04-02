import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass } from '../helpers'

const txLabel = { top_up:'Top Up', withdraw:'Tarik', transfer_in:'Transfer Masuk', transfer_out:'Transfer Keluar', from_wage:'Dari Upah' }
const txColor = { top_up:'#1D9E75', withdraw:'#e24b4a', transfer_in:'#378ADD', transfer_out:'#BA7517', from_wage:'#1D9E75' }

export default function WorkerPortal({ worker, onLogout }) {
  const [pockets, setPockets] = useState([])
  const [transactions, setTransactions] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('kantong')
  const [selectedPocket, setSelectedPocket] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: p }, { data: t }, { data: j }] = await Promise.all([
      supabase.from('pockets').select('*').eq('worker_id', worker.id).order('created_at'),
      supabase.from('pocket_transactions').select('*, pockets(name)').eq('worker_id', worker.id).order('created_at', { ascending: false }),
      supabase.from('jobs').select('*, job_types(name), pockets(name)').eq('worker_id', worker.id).order('date', { ascending: false }),
    ])
    setPockets(p || [])
    setTransactions(t || [])
    setJobs(j || [])
    setLoading(false)
  }

  const totalBalance = pockets.reduce((s,p) => s+p.balance, 0)
  const doneJobs = jobs.filter(j=>j.status==='Selesai')
  const totalEarned = doneJobs.reduce((s,j)=>s+j.wage, 0)
  const totalWithdrawn = doneJobs.filter(j=>j.withdrawn).reduce((s,j)=>s+j.wage, 0)
  const totalPending = totalEarned - totalWithdrawn
  const pocketTx = (pid) => transactions.filter(t => t.pocket_id === pid)

  if (loading) return <div className="loading" style={{paddingTop:'4rem'}}>Memuat...</div>

  return (
    <div className="app">
      {/* Header */}
      <header style={{background:'#1D9E75',borderRadius:12,padding:'1.25rem 1.5rem',marginBottom:'1.5rem',color:'white'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(255,255,255,.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700}}>
              {getInitials(worker.name)}
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:700}}>Halo, {worker.name.split(' ')[0]}!</div>
              <div style={{fontSize:12,opacity:.8}}>{worker.role||'Pekerja'} · Bellagio Work & Pay</div>
            </div>
          </div>
          <button onClick={onLogout} style={{background:'rgba(255,255,255,.2)',border:'none',color:'white',padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:500}}>
            Logout
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:'1.25rem'}}>
          <div style={{background:'rgba(255,255,255,.15)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:10,opacity:.8,marginBottom:3}}>Saldo Kantong</div>
            <div style={{fontSize:18,fontWeight:700}}>{fmt(totalBalance)}</div>
          </div>
          <div style={{background:'rgba(255,255,255,.15)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:10,opacity:.8,marginBottom:3}}>Sudah Ditarik</div>
            <div style={{fontSize:18,fontWeight:700}}>{fmt(totalWithdrawn)}</div>
          </div>
          <div style={{background:'rgba(255,255,255,.25)',borderRadius:10,padding:'10px 12px',border:'1px solid rgba(255,255,255,.3)'}}>
            <div style={{fontSize:10,opacity:.9,marginBottom:3}}>⏳ Belum Ditarik</div>
            <div style={{fontSize:18,fontWeight:700}}>{fmt(totalPending)}</div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {[{id:'kantong',label:'Kantong Saya'},{id:'riwayat',label:'Riwayat Upah'}].map(t=>(
          <button key={t.id} className={`tab${activeTab===t.id?' active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {/* KANTONG TAB */}
      {activeTab==='kantong' && (
        <div>
          {pockets.length===0 && (
            <div className="card" style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>
              <div style={{fontSize:36,marginBottom:12}}>💰</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Belum ada kantong</div>
              <div style={{fontSize:12}}>Minta admin untuk membuat kantong untukmu</div>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12,marginBottom:'1.5rem'}}>
            {pockets.map(p => {
              const pct = p.goal>0 ? Math.min(100,Math.round(p.balance/p.goal*100)) : 0
              const isSelected = selectedPocket?.id===p.id
              return (
                <div key={p.id} style={{background:'#fff',border:`2px solid ${isSelected?p.color:'#e8e8e2'}`,borderRadius:12,padding:16,cursor:'pointer',transition:'border-color .2s'}}
                  onClick={()=>setSelectedPocket(isSelected?null:p)}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:p.color}}>{p.name}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>{p.type}</div>
                    </div>
                    <div style={{width:10,height:10,borderRadius:'50%',background:p.color,marginTop:3}}></div>
                  </div>
                  <div style={{fontSize:22,fontWeight:700,color:'#111',marginBottom:6}}>{fmt(p.balance)}</div>
                  {p.goal>0 && (
                    <>
                      <div style={{fontSize:11,color:'#aaa',marginBottom:4}}>Target: {fmt(p.goal)} · {pct}%</div>
                      <div style={{height:5,background:'#eee',borderRadius:99,overflow:'hidden'}}>
                        <div style={{width:pct+'%',height:'100%',background:p.color,borderRadius:99}}></div>
                      </div>
                    </>
                  )}
                  <div style={{fontSize:11,color:'#aaa',marginTop:8}}>{pocketTx(p.id).length} transaksi · Klik detail</div>
                </div>
              )
            })}
          </div>

          {selectedPocket && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Riwayat — {selectedPocket.name}</div>
                <button className="btn btn-sm" onClick={()=>setSelectedPocket(null)}>Tutup</button>
              </div>
              {pocketTx(selectedPocket.id).length===0 && <div style={{textAlign:'center',color:'#aaa',padding:'1.5rem',fontSize:13}}>Belum ada transaksi</div>}
              {pocketTx(selectedPocket.id).map(t=>(
                <div key={t.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid #f0f0eb',fontSize:13}}>
                  <div>
                    <div style={{fontWeight:500,color:txColor[t.type]||'#333'}}>{txLabel[t.type]||t.type}</div>
                    {t.note && <div style={{fontSize:11,color:'#aaa'}}>{t.note}</div>}
                    <div style={{fontSize:11,color:'#ccc'}}>{new Date(t.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</div>
                  </div>
                  <div style={{fontWeight:700,fontSize:14,color:['withdraw','transfer_out'].includes(t.type)?'#e24b4a':'#1D9E75'}}>
                    {['withdraw','transfer_out'].includes(t.type)?'−':'+'}  {fmt(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RIWAYAT UPAH TAB */}
      {activeTab==='riwayat' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:'1rem'}}>
            <div className="metric"><div className="metric-label">Total Pekerjaan</div><div className="metric-val">{doneJobs.length}</div><div className="metric-sub">selesai</div></div>
            <div className="metric"><div className="metric-label">Sudah Ditarik</div><div className="metric-val green">{fmt(totalWithdrawn)}</div><div className="metric-sub">{doneJobs.filter(j=>j.withdrawn).length} pekerjaan</div></div>
            <div className="metric"><div className="metric-label">Belum Ditarik</div><div className="metric-val amber">{fmt(totalPending)}</div><div className="metric-sub">{doneJobs.filter(j=>!j.withdrawn).length} pekerjaan</div></div>
          </div>

          {/* Filter tabs */}
          <div style={{display:'flex',gap:4,background:'#f0f0eb',borderRadius:8,padding:3,marginBottom:'1rem',width:'fit-content'}}>
            {[{id:'all',label:'Semua'},{id:'pending',label:'⏳ Belum Ditarik'},{id:'withdrawn',label:'✓ Sudah Ditarik'}].map(v=>(
              <button key={v.id} onClick={()=>setSelectedPocket(v.id)}
                style={{padding:'5px 12px',fontSize:12,fontWeight:500,border:'none',cursor:'pointer',borderRadius:6,whiteSpace:'nowrap',
                  background:selectedPocket===v.id?'#fff':'transparent',color:selectedPocket===v.id?'#111':'#888',
                  boxShadow:selectedPocket===v.id?'0 1px 3px rgba(0,0,0,.1)':'none'}}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table>
              <thead><tr><th>Pekerjaan</th><th>Tanggal</th><th>Upah</th><th>Status Tarik</th></tr></thead>
              <tbody>
                {doneJobs
                  .filter(j => !selectedPocket||selectedPocket==='all' || (selectedPocket==='pending'&&!j.withdrawn) || (selectedPocket==='withdrawn'&&j.withdrawn))
                  .map(j=>(
                  <tr key={j.id}>
                    <td>
                      <div style={{fontWeight:500}}>{j.job_name}</div>
                      {j.job_types && <div style={{fontSize:11,color:'#1D9E75'}}>{j.job_types.name}</div>}
                      {j.hours ? <div style={{fontSize:11,color:'#aaa'}}>{j.hours} jam</div> : null}
                    </td>
                    <td style={{color:'#888',fontSize:12}}>{j.date}</td>
                    <td style={{fontWeight:600}}>{fmt(j.wage)}</td>
                    <td>
                      {j.withdrawn ? (
                        <div>
                          <span style={{fontSize:11,background:'#e1f5ee',color:'#085041',padding:'3px 10px',borderRadius:20,fontWeight:500,display:'inline-block'}}>✓ Ditarik</span>
                          {j.pockets && <div style={{fontSize:10,color:'#1D9E75',marginTop:3}}>→ {j.pockets.name}</div>}
                          {j.withdrawn_at && <div style={{fontSize:10,color:'#aaa'}}>{new Date(j.withdrawn_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</div>}
                        </div>
                      ) : (
                        <span style={{fontSize:11,background:'#faeeda',color:'#633806',padding:'3px 10px',borderRadius:20,fontWeight:500}}>⏳ Belum</span>
                      )}
                    </td>
                  </tr>
                ))}
                {doneJobs.length===0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada pekerjaan selesai</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{marginTop:24,textAlign:'center',fontSize:12,color:'#888'}}>Andhi Rahman – Bellagio</div>
    </div>
  )
}
