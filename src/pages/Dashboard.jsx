import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, badgeClass, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState('') // '' = semua
  const trendRef = useRef(); const statusRef = useRef()
  const trendChart = useRef(); const statusChart = useRef()

  useEffect(() => {
    async function load() {
      const [{ data: j }, { data: w }] = await Promise.all([
        supabase.from('jobs').select('*, workers(name)').order('created_at', { ascending: false }),
        supabase.from('workers').select('*').order('name'),
      ])
      setJobs(j || [])
      setWorkers(w || [])
      setLoading(false)
    }
    load()
  }, [])

  // Jobs filtered by selected worker
  const filteredJobs = selectedWorker
    ? jobs.filter(j => j.worker_id === selectedWorker)
    : jobs

  const activeWorker = workers.find(w => w.id === selectedWorker)

  useEffect(() => {
    if (loading) return
    if (trendChart.current) trendChart.current.destroy()
    if (statusChart.current) statusChart.current.destroy()

    const weekTotals = [0, 0, 0, 0]
    const now = new Date()
    filteredJobs.forEach(j => {
      const diff = Math.floor((now - new Date(j.date)) / (7 * 24 * 3600 * 1000))
      if (diff >= 0 && diff < 4) weekTotals[3 - diff] += j.wage
    })

    trendChart.current = new Chart(trendRef.current, {
      type: 'bar',
      data: {
        labels: ['3 Mg lalu','2 Mg lalu','Mg lalu','Minggu ini'],
        datasets: [{
          data: weekTotals,
          backgroundColor: selectedWorker ? personColor(workers.findIndex(w=>w.id===selectedWorker)) : '#5DCAA5',
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => 'Rp' + Math.round(v/1000) + 'rb', font: { size: 11 } }, grid: { color: '#f0f0eb' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    })

    const done = filteredJobs.filter(j => j.status === 'Selesai').length
    const prog = filteredJobs.filter(j => j.status === 'Berlangsung').length
    const pend = filteredJobs.filter(j => j.status === 'Pending').length
    statusChart.current = new Chart(statusRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Selesai','Berlangsung','Pending'],
        datasets: [{ data: [done, prog, pend], backgroundColor: ['#1D9E75','#378ADD','#BA7517'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } } }
      }
    })
    return () => { trendChart.current?.destroy(); statusChart.current?.destroy() }
  }, [loading, filteredJobs])

  if (loading) return <div className="loading">Memuat data...</div>

  const total = filteredJobs.reduce((s,j) => s + j.wage, 0)
  const done = filteredJobs.filter(j => j.status === 'Selesai').length
  const pending = filteredJobs.filter(j => j.status === 'Pending').length

  // Top earner (only relevant when showing all)
  const earnerMap = {}
  jobs.forEach(j => { earnerMap[j.worker_id] = (earnerMap[j.worker_id] || 0) + j.wage })
  const topId = Object.entries(earnerMap).sort((a,b)=>b[1]-a[1])[0]
  const topWorker = workers.find(w => w.id === topId?.[0])

  const recent = [...filteredJobs].slice(0, 5)

  // Per-worker quick stats (only when showing all)
  const workerStats = workers.map((w,i) => {
    const wjobs = jobs.filter(j=>j.worker_id===w.id)
    return { ...w, idx:i, total: wjobs.reduce((s,j)=>s+j.wage,0), count: wjobs.length }
  }).sort((a,b)=>b.total-a.total)
  const maxTotal = Math.max(...workerStats.map(s=>s.total), 1)

  return (
    <div>
      {/* Filter bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>Filter pekerja:</span>
          <select
            value={selectedWorker}
            onChange={e => setSelectedWorker(e.target.value)}
            style={{fontSize:13,padding:'7px 12px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#111',outline:'none',minWidth:180}}>
            <option value="">Semua Pekerja</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {selectedWorker && (
            <button
              onClick={() => setSelectedWorker('')}
              style={{fontSize:12,padding:'5px 10px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#888',cursor:'pointer'}}>
              × Reset
            </button>
          )}
        </div>
        {selectedWorker && activeWorker && (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className={`avatar ${avClass(workers.findIndex(w=>w.id===selectedWorker))}`} style={{width:28,height:28,fontSize:11}}>
              {getInitials(activeWorker.name)}
            </span>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>{activeWorker.name}</div>
              <div style={{fontSize:11,color:'#888'}}>{activeWorker.role||'Pekerja'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Total Upah</div>
          <div className="metric-val green">{fmt(total)}</div>
          <div className="metric-sub">{filteredJobs.length} pekerjaan</div>
        </div>
        <div className="metric">
          <div className="metric-label">Selesai</div>
          <div className="metric-val blue">{done}</div>
          <div className="metric-sub">dari {filteredJobs.length} total</div>
        </div>
        <div className="metric">
          <div className="metric-label">{selectedWorker ? 'Pending' : 'Rata-rata / orang'}</div>
          <div className="metric-val amber">
            {selectedWorker ? pending : (workers.length ? fmt(Math.round(total / workers.length)) : 'Rp 0')}
          </div>
          <div className="metric-sub">{selectedWorker ? 'pekerjaan pending' : workers.length + ' pekerja'}</div>
        </div>
        <div className="metric">
          <div className="metric-label">{selectedWorker ? 'Rata-rata/pekerjaan' : 'Pendapatan Tertinggi'}</div>
          {selectedWorker ? (
            <>
              <div className="metric-val" style={{fontSize:15,paddingTop:2}}>{filteredJobs.length ? fmt(Math.round(total/filteredJobs.length)) : 'Rp 0'}</div>
              <div className="metric-sub">per pekerjaan</div>
            </>
          ) : (
            <>
              <div className="metric-val" style={{fontSize:14,paddingTop:4}}>{topWorker?.name?.split(' ')[0] || '—'}</div>
              <div className="metric-sub">{topId ? fmt(topId[1]) : 'Rp 0'}</div>
            </>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Tren Upah Mingguan {selectedWorker && activeWorker ? `— ${activeWorker.name.split(' ')[0]}` : ''}</div>
        </div>
        <div className="chart-wrap" style={{height:200}}><canvas ref={trendRef}></canvas></div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header"><div className="card-title">Status Pekerjaan</div></div>
          <div className="chart-wrap" style={{height:180}}><canvas ref={statusRef}></canvas></div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Pekerjaan Terbaru</div>
          </div>
          {recent.length === 0 && (
            <div style={{textAlign:'center',color:'#aaa',padding:'1rem',fontSize:13}}>Belum ada pekerjaan</div>
          )}
          {recent.map(j => (
            <div key={j.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f0f0eb'}}>
              <div>
                <div style={{fontWeight:500,fontSize:13}}>{j.job_name}</div>
                <div style={{fontSize:11,color:'#888'}}>{j.workers?.name} · {j.date}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:12,fontWeight:500}}>{fmt(j.wage)}</div>
                <span className={`badge ${badgeClass(j.status)}`}>{j.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mini komparasi — only when showing all workers */}
      {!selectedWorker && workerStats.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Ringkasan per Pekerja</div>
            <span style={{fontSize:11,color:'#aaa'}}>{workers.length} pekerja</span>
          </div>
          {workerStats.map(s => (
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,fontSize:13,cursor:'pointer'}}
              onClick={() => setSelectedWorker(s.id)}>
              <span className={`avatar ${avClass(s.idx)}`} style={{width:26,height:26,fontSize:10,flexShrink:0}}>{getInitials(s.name)}</span>
              <span style={{width:90,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#333'}}>{s.name.split(' ')[0]}</span>
              <div style={{flex:1,height:18,background:'#f0f0eb',borderRadius:4,overflow:'hidden'}}>
                <div style={{width:Math.round(s.total/maxTotal*100)+'%',height:'100%',background:personColor(s.idx),borderRadius:4,minWidth:s.total>0?4:0}}></div>
              </div>
              <span style={{fontSize:12,fontWeight:500,minWidth:80,textAlign:'right',color:personColor(s.idx)}}>{fmt(s.total)}</span>
              <span style={{fontSize:11,color:'#aaa',minWidth:50,textAlign:'right'}}>{s.count} tugas</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
