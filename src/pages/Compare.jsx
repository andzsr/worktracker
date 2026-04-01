import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

export default function Compare() {
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const chartRef = useRef()
  const chartInst = useRef()

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

  useEffect(() => {
    if (loading || !chartRef.current) return
    if (chartInst.current) chartInst.current.destroy()
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: stats.map(s => s.name.split(' ')[0]),
        datasets: [
          { label: 'Total Pekerjaan', data: stats.map(s => s.count), backgroundColor: stats.map((_,i) => personColor(i)), borderRadius: 6, borderSkipped: false },
        ]
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
    return () => chartInst.current?.destroy()
  }, [loading, workers, jobs])

  if (loading) return <div className="loading">Memuat data...</div>

  const maxTotal = Math.max(...stats.map(s => s.total), 1)

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Komparasi Pendapatan per Orang</div>
        </div>
        {stats.map(s => (
          <div key={s.id} className="comp-row">
            <span className="comp-name">{s.name.split(' ')[0]}</span>
            <div className="comp-bar-bg">
              <div className="comp-bar-fill" style={{width: Math.round(s.total/maxTotal*100)+'%', background: personColor(s.idx), minWidth: s.total > 0 ? 4 : 0}}>
                {s.total/maxTotal > 0.2 && <span style={{fontSize:10,color:'white',fontWeight:500}}>{fmt(s.total)}</span>}
              </div>
            </div>
            <span className="comp-amount" style={{color: personColor(s.idx)}}>{fmt(s.total)}</span>
          </div>
        ))}
        {stats.length === 0 && <div style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada data</div>}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Perbandingan Jumlah Pekerjaan</div></div>
        <div className="chart-wrap" style={{height:220}}><canvas ref={chartRef}></canvas></div>
      </div>

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
                <td style={{fontWeight:500,color: personColor(s.idx)}}>{fmt(s.total)}</td>
                <td>{s.count ? fmt(Math.round(s.total/s.count)) : 'Rp 0'}</td>
              </tr>
            ))}
            {stats.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>Belum ada data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
