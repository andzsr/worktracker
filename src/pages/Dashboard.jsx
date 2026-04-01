import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, badgeClass, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (loading) return
    if (trendChart.current) trendChart.current.destroy()
    if (statusChart.current) statusChart.current.destroy()

    // Trend: group by week (last 4 weeks)
    const weekTotals = [0, 0, 0, 0]
    const now = new Date()
    jobs.forEach(j => {
      const diff = Math.floor((now - new Date(j.date)) / (7 * 24 * 3600 * 1000))
      if (diff >= 0 && diff < 4) weekTotals[3 - diff] += j.wage
    })

    trendChart.current = new Chart(trendRef.current, {
      type: 'bar',
      data: {
        labels: ['3 Mg lalu','2 Mg lalu','Mg lalu','Minggu ini'],
        datasets: [{ data: weekTotals, backgroundColor: '#5DCAA5', borderRadius: 6, borderSkipped: false }]
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

    const done = jobs.filter(j => j.status === 'Selesai').length
    const prog = jobs.filter(j => j.status === 'Berlangsung').length
    const pend = jobs.filter(j => j.status === 'Pending').length
    statusChart.current = new Chart(statusRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Selesai','Berlangsung','Pending'],
        datasets: [{ data: [done, prog, pend], backgroundColor: ['#1D9E75','#378ADD','#BA7517'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } } } }
    })
    return () => { trendChart.current?.destroy(); statusChart.current?.destroy() }
  }, [loading, jobs])

  if (loading) return <div className="loading">Memuat data...</div>

  const total = jobs.reduce((s,j) => s + j.wage, 0)
  const done = jobs.filter(j => j.status === 'Selesai').length

  // Top earner
  const earnerMap = {}
  jobs.forEach(j => { earnerMap[j.worker_id] = (earnerMap[j.worker_id] || 0) + j.wage })
  const topId = Object.entries(earnerMap).sort((a,b)=>b[1]-a[1])[0]
  const topWorker = workers.find(w => w.id === topId?.[0])

  const recent = [...jobs].slice(0, 5)

  return (
    <div>
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Total Upah</div>
          <div className="metric-val green">{fmt(total)}</div>
          <div className="metric-sub">{jobs.length} pekerjaan</div>
        </div>
        <div className="metric">
          <div className="metric-label">Selesai</div>
          <div className="metric-val blue">{done}</div>
          <div className="metric-sub">dari {jobs.length} total</div>
        </div>
        <div className="metric">
          <div className="metric-label">Rata-rata / orang</div>
          <div className="metric-val amber">{workers.length ? fmt(Math.round(total / workers.length)) : 'Rp 0'}</div>
          <div className="metric-sub">{workers.length} pekerja</div>
        </div>
        <div className="metric">
          <div className="metric-label">Pendapatan Tertinggi</div>
          <div className="metric-val" style={{fontSize:14,paddingTop:4}}>{topWorker?.name?.split(' ')[0] || '—'}</div>
          <div className="metric-sub">{topId ? fmt(topId[1]) : 'Rp 0'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Tren Upah Mingguan</div></div>
        <div className="chart-wrap" style={{height:200}}><canvas ref={trendRef}></canvas></div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header"><div className="card-title">Status Pekerjaan</div></div>
          <div className="chart-wrap" style={{height:180}}><canvas ref={statusRef}></canvas></div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Pekerjaan Terbaru</div></div>
          {recent.map(j => (
            <div key={j.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f0f0eb'}}>
              <div>
                <div style={{fontWeight:500,fontSize:13}}>{j.job_name}</div>
                <div style={{fontSize:11,color:'#888'}}>{j.workers?.name}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:12,fontWeight:500}}>{fmt(j.wage)}</div>
                <span className={`badge ${badgeClass(j.status)}`}>{j.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
