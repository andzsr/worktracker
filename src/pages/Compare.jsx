import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// Generate last N weeks labels & date ranges
function getWeeks(n = 8) {
  const weeks = []
  const now = new Date()
  // Find Monday of current week
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0,0,0,0)

  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday)
    start.setDate(monday.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23,59,59,999)
    const label = `${start.getDate()}/${start.getMonth()+1}`
    weeks.push({ label, start, end })
  }
  return weeks
}

export default function Compare() {
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekRange, setWeekRange] = useState(8) // how many weeks to show
  const [weeklyMode, setWeeklyMode] = useState('upah') // 'upah' | 'count'

  const jobCountRef = useRef()
  const weeklyRef = useRef()
  const jobCountInst = useRef()
  const weeklyInst = useRef()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: w }, { data: j }] = await Promise.all([
      supabase.from('workers').select('*').order('name'),
      supabase.from('jobs').select('*'),
    ])
    setWorkers(w || [])
    setJobs(j || [])
    setLoading(false)
  }

  const stats = workers.map((w, i) => {
    const wjobs = jobs.filter(j => j.worker_id === w.id)
    const total = wjobs.reduce((s,j) => s + j.wage, 0)
    const done = wjobs.filter(j => j.status === 'Selesai').length
    return { ...w, idx: i, wjobs, total, done, count: wjobs.length }
  }).sort((a,b) => b.total - a.total)

  // Build weekly data per worker
  const weeks = getWeeks(weekRange)

  function buildWeeklyDatasets(mode) {
    return stats.map((s, si) => {
      const data = weeks.map(wk => {
        const wkJobs = s.wjobs.filter(j => {
          const d = new Date(j.date)
          return d >= wk.start && d <= wk.end
        })
        return mode === 'upah'
          ? wkJobs.reduce((sum,j) => sum + j.wage, 0)
          : wkJobs.length
      })
      return {
        label: s.name.split(' ')[0],
        data,
        borderColor: personColor(si),
        backgroundColor: personColor(si) + '22',
        borderWidth: 2.5,
        pointBackgroundColor: personColor(si),
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      }
    })
  }

  // Draw job count bar chart
  useEffect(() => {
    if (loading || !jobCountRef.current) return
    if (jobCountInst.current) jobCountInst.current.destroy()
    jobCountInst.current = new Chart(jobCountRef.current, {
      type: 'bar',
      data: {
        labels: stats.map(s => s.name.split(' ')[0]),
        datasets: [{
          data: stats.map(s => s.count),
          backgroundColor: stats.map((_,i) => personColor(i)),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f0f0eb' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    })
    return () => jobCountInst.current?.destroy()
  }, [loading, workers, jobs])

  // Draw weekly line chart
  useEffect(() => {
    if (loading || !weeklyRef.current) return
    if (weeklyInst.current) weeklyInst.current.destroy()
    const datasets = buildWeeklyDatasets(weeklyMode)
    weeklyInst.current = new Chart(weeklyRef.current, {
      type: 'line',
      data: {
        labels: weeks.map(w => w.label),
        datasets,
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { font: { size: 11 }, boxWidth: 12, padding: 12, usePointStyle: true, pointStyleWidth: 10 }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.parsed.y
                return ` ${ctx.dataset.label}: ${weeklyMode==='upah' ? fmt(val) : val + ' tugas'}`
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => weeklyMode==='upah'
                ? (v>=1000000 ? 'Rp'+(v/1000000).toFixed(1)+'jt' : 'Rp'+Math.round(v/1000)+'rb')
                : v + ' tugas',
              font: { size: 11 }
            },
            grid: { color: '#f0f0eb' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, maxRotation: 0 }
          }
        }
      }
    })
    return () => weeklyInst.current?.destroy()
  }, [loading, workers, jobs, weekRange, weeklyMode])

  if (loading) return <div className="loading">Memuat data...</div>

  const maxTotal = Math.max(...stats.map(s => s.total), 1)

  return (
    <div>
      {/* Total income horizontal bars */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Komparasi Total Pendapatan</div>
          <span style={{fontSize:11,color:'#aaa'}}>semua waktu</span>
        </div>
        {stats.length === 0 && <div style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada data</div>}
        {stats.map(s => (
          <div key={s.id} className="comp-row">
            <div style={{display:'flex',alignItems:'center',gap:6,width:110}}>
              <span className={`avatar ${avClass(s.idx)}`} style={{width:22,height:22,fontSize:9,flexShrink:0}}>{getInitials(s.name)}</span>
              <span className="comp-name" style={{width:'auto'}}>{s.name.split(' ')[0]}</span>
            </div>
            <div className="comp-bar-bg">
              <div className="comp-bar-fill" style={{width:Math.round(s.total/maxTotal*100)+'%',background:personColor(s.idx),minWidth:s.total>0?4:0}}>
                {s.total/maxTotal > 0.25 && <span style={{fontSize:10,color:'white',fontWeight:600}}>{fmt(s.total)}</span>}
              </div>
            </div>
            <span className="comp-amount" style={{color:personColor(s.idx)}}>{fmt(s.total)}</span>
          </div>
        ))}
      </div>

      {/* Weekly trend line chart */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Tren Pendapatan Mingguan per Pekerja</div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {/* Mode toggle */}
            <div style={{display:'flex',gap:2,background:'#f0f0eb',borderRadius:6,padding:2}}>
              {[{id:'upah',label:'Upah'},{id:'count',label:'Tugas'}].map(m=>(
                <button key={m.id} onClick={()=>setWeeklyMode(m.id)}
                  style={{padding:'4px 10px',fontSize:11,fontWeight:500,border:'none',cursor:'pointer',borderRadius:4,
                    background:weeklyMode===m.id?'#fff':'transparent',
                    color:weeklyMode===m.id?'#111':'#888',
                    boxShadow:weeklyMode===m.id?'0 1px 2px rgba(0,0,0,.08)':'none'}}>
                  {m.label}
                </button>
              ))}
            </div>
            {/* Week range selector */}
            <select value={weekRange} onChange={e=>setWeekRange(Number(e.target.value))}
              style={{fontSize:11,padding:'4px 8px',border:'1px solid #e0e0d8',borderRadius:6,background:'#fff',color:'#333',outline:'none'}}>
              <option value={4}>4 Minggu</option>
              <option value={8}>8 Minggu</option>
              <option value={12}>12 Minggu</option>
              <option value={16}>16 Minggu</option>
            </select>
          </div>
        </div>

        {/* Custom legend with totals */}
        <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12}}>
          {stats.map((s,si) => (
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
              <div style={{width:12,height:12,borderRadius:'50%',background:personColor(si),flexShrink:0}}></div>
              <span style={{color:'#555'}}>{s.name.split(' ')[0]}</span>
              <span style={{color:personColor(si),fontWeight:600}}>
                {weeklyMode==='upah' ? fmt(s.total) : s.count+' tugas'}
              </span>
            </div>
          ))}
        </div>

        <div className="chart-wrap" style={{height:280}}><canvas ref={weeklyRef}></canvas></div>

        {/* Week breakdown table */}
        <div style={{marginTop:'1.25rem',overflowX:'auto'}}>
          <table style={{minWidth:500}}>
            <thead>
              <tr>
                <th style={{width:90}}>Minggu</th>
                {stats.map((s,si)=>(
                  <th key={s.id} style={{color:personColor(si),fontWeight:600}}>{s.name.split(' ')[0]}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((wk,wi) => {
                const rowData = stats.map(s => {
                  const wkJobs = s.wjobs.filter(j => {
                    const d = new Date(j.date)
                    return d >= wk.start && d <= wk.end
                  })
                  return weeklyMode==='upah'
                    ? wkJobs.reduce((sum,j)=>sum+j.wage,0)
                    : wkJobs.length
                })
                const rowTotal = rowData.reduce((s,v)=>s+v,0)
                const isCurrentWeek = wi === weeks.length - 1
                return (
                  <tr key={wi} style={{background:isCurrentWeek?'#f5fff9':''}}>
                    <td style={{fontSize:12,color:isCurrentWeek?'#1D9E75':'#888',fontWeight:isCurrentWeek?600:400}}>
                      {wk.label}{isCurrentWeek?' (ini)':''}
                    </td>
                    {rowData.map((val,i)=>(
                      <td key={i} style={{fontSize:12,fontWeight:val>0?500:400,color:val>0?personColor(i):'#ddd'}}>
                        {weeklyMode==='upah' ? (val>0?fmt(val):'—') : (val>0?val+' tugas':'—')}
                      </td>
                    ))}
                    <td style={{fontSize:12,fontWeight:600,color:rowTotal>0?'#111':'#ddd'}}>
                      {weeklyMode==='upah' ? (rowTotal>0?fmt(rowTotal):'—') : (rowTotal>0?rowTotal+' tugas':'—')}
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              <tr style={{borderTop:'2px solid #eee',background:'#fafaf7'}}>
                <td style={{fontSize:12,fontWeight:700,color:'#111'}}>Total</td>
                {stats.map((s,si)=>(
                  <td key={si} style={{fontSize:12,fontWeight:700,color:personColor(si)}}>
                    {weeklyMode==='upah' ? fmt(s.total) : s.count+' tugas'}
                  </td>
                ))}
                <td style={{fontSize:12,fontWeight:700,color:'#111'}}>
                  {weeklyMode==='upah'
                    ? fmt(stats.reduce((s,w)=>s+w.total,0))
                    : stats.reduce((s,w)=>s+w.count,0)+' tugas'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart: jumlah pekerjaan */}
      <div className="card">
        <div className="card-header"><div className="card-title">Perbandingan Jumlah Pekerjaan</div></div>
        <div className="chart-wrap" style={{height:220}}><canvas ref={jobCountRef}></canvas></div>
      </div>

      {/* Summary table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table>
          <thead><tr>
            <th>Nama</th><th>Total Tugas</th><th>Selesai</th><th>Total Upah</th><th>Rata-rata/tugas</th>
          </tr></thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.id}>
                <td>
                  <div className="person-row">
                    <span className={`avatar ${avClass(s.idx)}`}>{getInitials(s.name)}</span>
                    <div>
                      <div style={{fontWeight:500}}>{s.name}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>{s.role}</div>
                    </div>
                  </div>
                </td>
                <td>{s.count}</td>
                <td><span className="badge badge-done">{s.done}</span></td>
                <td style={{fontWeight:600,color:personColor(s.idx)}}>{fmt(s.total)}</td>
                <td>{s.count ? fmt(Math.round(s.total/s.count)) : 'Rp 0'}</td>
              </tr>
            ))}
            {stats.length===0 && <tr><td colSpan={5} style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
