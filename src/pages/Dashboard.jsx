import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, badgeClass, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// ── helpers ──────────────────────────────────────────────────────────────────

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDOW(year, month) {
  // 0=Mon … 6=Sun (Monday-first)
  const d = new Date(year, month, 1).getDay()
  return (d + 6) % 7
}

function buildCalendarData(jobs, year, month) {
  const days = getDaysInMonth(year, month)
  const map = {}
  for (let d = 1; d <= days; d++) map[d] = []
  jobs.forEach(j => {
    const dt = new Date(j.date)
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const day = dt.getDate()
      if (map[day]) map[day].push(j)
    }
  })
  return map
}

function groupConsecutiveEmpty(emptyDays) {
  if (!emptyDays.length) return []
  const groups = []
  let cur = [emptyDays[0]]
  for (let i = 1; i < emptyDays.length; i++) {
    if (emptyDays[i] === emptyDays[i - 1] + 1) cur.push(emptyDays[i])
    else { groups.push(cur); cur = [emptyDays[i]] }
  }
  groups.push(cur)
  return groups
}

const DOW_LABELS = ['Sen','Sel','Rab','Kam','Jum','Sab','Min']
const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

// ── component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState('')

  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

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

  const filteredJobs = selectedWorker ? jobs.filter(j => j.worker_id === selectedWorker) : jobs
  const activeWorker = workers.find(w => w.id === selectedWorker)

  // ── charts ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (trendChart.current) trendChart.current.destroy()
    if (statusChart.current) statusChart.current.destroy()

    const weekTotals = [0, 0, 0, 0]
    const today = new Date()
    filteredJobs.forEach(j => {
      const diff = Math.floor((today - new Date(j.date)) / (7 * 24 * 3600 * 1000))
      if (diff >= 0 && diff < 4) weekTotals[3 - diff] += j.wage
    })

    trendChart.current = new Chart(trendRef.current, {
      type: 'bar',
      data: {
        labels: ['3 Mg lalu','2 Mg lalu','Mg lalu','Minggu ini'],
        datasets: [{
          data: weekTotals,
          backgroundColor: selectedWorker ? personColor(workers.findIndex(w => w.id === selectedWorker)) : '#5DCAA5',
          borderRadius: 6, borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => 'Rp' + Math.round(v / 1000) + 'rb', font: { size: 11 } }, grid: { color: '#f0f0eb' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    })

    const done = filteredJobs.filter(j => j.status === 'Selesai').length
    const prog = filteredJobs.filter(j => j.status === 'Berlangsung').length
    const pend = filteredJobs.filter(j => j.status === 'Pending').length
    statusChart.current = new Chart(statusRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Selesai','Berlangsung','Pending'],
        datasets: [{ data: [done, prog, pend], backgroundColor: ['#1D9E75','#378ADD','#BA7517'], borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } } },
      },
    })
    return () => { trendChart.current?.destroy(); statusChart.current?.destroy() }
  }, [loading, filteredJobs])

  // ── calendar data ────────────────────────────────────────────────────────────
  const calData = buildCalendarData(filteredJobs, calYear, calMonth)
  const daysInMonth = getDaysInMonth(calYear, calMonth)
  const firstDOW = getFirstDOW(calYear, calMonth)
  const todayDate = now.getDate()
  const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth()

  const emptyDays = []
  for (let d = 1; d <= daysInMonth; d++) {
    // Only count past days + today (future days aren't "empty" yet)
    const isPast = !isCurrentMonth || d <= todayDate
    if (isPast && calData[d].length === 0) emptyDays.push(d)
  }

  const activeDays = daysInMonth - (isCurrentMonth ? (daysInMonth - todayDate) : 0) - emptyDays.length
  const maxJobs = Math.max(...Object.values(calData).map(v => v.length), 1)
  const emptyGroups = groupConsecutiveEmpty(emptyDays)
  const longestStreak = emptyGroups.length ? Math.max(...emptyGroups.map(g => g.length)) : 0

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  function cellStyle(day) {
    const jobs = calData[day] || []
    const isPast = !isCurrentMonth || day <= todayDate
    const isToday = isCurrentMonth && day === todayDate

    if (!isPast) {
      // future: neutral
      return { bg: '#f5f5f0', border: '#e8e8e2', textColor: '#bbb', countColor: '#ccc' }
    }
    if (jobs.length === 0) {
      return { bg: '#FCEBEB', border: '#F7C1C1', textColor: '#A32D2D', countColor: '#E24B4A', outline: isToday ? '2px solid #E24B4A' : 'none' }
    }
    // active: intensity based on job count
    const intensity = Math.min(jobs.length / maxJobs, 1)
    const r = Math.round(225 - 50 * intensity)
    const g = Math.round(200 + 55 * intensity)
    const b = Math.round(238 - 100 * intensity)
    return {
      bg: `rgb(${r},${g},${b})`,
      border: intensity > 0.5 ? '#1D9E75' : '#9FE1CB',
      textColor: '#085041',
      countColor: '#0F6E56',
      outline: isToday ? '2px solid #378ADD' : 'none',
    }
  }

  // ── metrics ──────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading">Memuat data...</div>

  const total = filteredJobs.reduce((s, j) => s + j.wage, 0)
  const done = filteredJobs.filter(j => j.status === 'Selesai').length
  const pending = filteredJobs.filter(j => j.status === 'Pending').length

  const earnerMap = {}
  jobs.forEach(j => { earnerMap[j.worker_id] = (earnerMap[j.worker_id] || 0) + j.wage })
  const topId = Object.entries(earnerMap).sort((a, b) => b[1] - a[1])[0]
  const topWorker = workers.find(w => w.id === topId?.[0])
  const recent = [...filteredJobs].slice(0, 5)
  const workerStats = workers.map((w, i) => {
    const wjobs = jobs.filter(j => j.worker_id === w.id)
    return { ...w, idx: i, total: wjobs.reduce((s, j) => s + j.wage, 0), count: wjobs.length }
  }).sort((a, b) => b.total - a.total)
  const maxTotal = Math.max(...workerStats.map(s => s.total), 1)

  return (
    <div>
      {/* ── filter bar ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>Filter pekerja:</span>
          <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}
            style={{fontSize:13,padding:'7px 12px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#111',outline:'none',minWidth:180}}>
            <option value="">Semua Pekerja</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {selectedWorker && (
            <button onClick={() => setSelectedWorker('')}
              style={{fontSize:12,padding:'5px 10px',border:'1px solid #e0e0d8',borderRadius:8,background:'#fff',color:'#888',cursor:'pointer'}}>
              × Reset
            </button>
          )}
        </div>
        {selectedWorker && activeWorker && (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className={`avatar ${avClass(workers.findIndex(w => w.id === selectedWorker))}`} style={{width:28,height:28,fontSize:11}}>
              {getInitials(activeWorker.name)}
            </span>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>{activeWorker.name}</div>
              <div style={{fontSize:11,color:'#888'}}>{activeWorker.role || 'Pekerja'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── metric cards ── */}
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
              <div className="metric-val" style={{fontSize:15,paddingTop:2}}>{filteredJobs.length ? fmt(Math.round(total / filteredJobs.length)) : 'Rp 0'}</div>
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

      {/* ── trend + status charts ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Tren Upah Mingguan{selectedWorker && activeWorker ? ` — ${activeWorker.name.split(' ')[0]}` : ''}</div>
        </div>
        <div className="chart-wrap" style={{height:200}}><canvas ref={trendRef}></canvas></div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header"><div className="card-title">Status Pekerjaan</div></div>
          <div className="chart-wrap" style={{height:180}}><canvas ref={statusRef}></canvas></div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Pekerjaan Terbaru</div></div>
          {recent.length === 0 && <div style={{textAlign:'center',color:'#aaa',padding:'1rem',fontSize:13}}>Belum ada pekerjaan</div>}
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

      {/* ── ACTIVITY MONITOR ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Monitor Keaktifan Harian</div>
            <div style={{fontSize:11,color:'#aaa',marginTop:2}}>
              {selectedWorker && activeWorker ? activeWorker.name : 'Semua pekerja'}
            </div>
          </div>
          {/* Month navigator */}
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <button onClick={prevMonth}
              style={{width:28,height:28,border:'1px solid #e0e0d8',borderRadius:6,background:'#fff',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ‹
            </button>
            <span style={{fontSize:13,fontWeight:500,minWidth:110,textAlign:'center'}}>
              {MONTH_NAMES[calMonth]} {calYear}
            </span>
            <button onClick={nextMonth}
              style={{width:28,height:28,border:'1px solid #e0e0d8',borderRadius:6,background:'#fff',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ›
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:'1.25rem'}}>
          <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:11,color:'#085041',marginBottom:3}}>Hari aktif</div>
            <div style={{fontSize:20,fontWeight:600,color:'#1D9E75'}}>{activeDays}</div>
            <div style={{fontSize:11,color:'#0F6E56'}}>dari {isCurrentMonth ? todayDate : daysInMonth} hari</div>
          </div>
          <div style={{background:'#FCEBEB',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:11,color:'#A32D2D',marginBottom:3}}>Hari kosong</div>
            <div style={{fontSize:20,fontWeight:600,color:'#E24B4A'}}>{emptyDays.length}</div>
            <div style={{fontSize:11,color:'#A32D2D'}}>tidak ada pekerjaan</div>
          </div>
          <div style={{background:'#FAEEDA',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:11,color:'#633806',marginBottom:3}}>Kosong berturut</div>
            <div style={{fontSize:20,fontWeight:600,color:'#BA7517'}}>{longestStreak}</div>
            <div style={{fontSize:11,color:'#854F0B'}}>hari terpanjang</div>
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{marginBottom:'1rem'}}>
          {/* DOW headers */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>
            {DOW_LABELS.map(d => (
              <div key={d} style={{fontSize:10,color:'#aaa',textAlign:'center',padding:'2px 0',fontWeight:500}}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
            {/* Leading empty cells */}
            {Array.from({length: firstDOW}).map((_, i) => (
              <div key={'e'+i} style={{height:38,borderRadius:6,background:'#f5f5f0',opacity:0.4}}></div>
            ))}
            {/* Day cells */}
            {Array.from({length: daysInMonth}).map((_, i) => {
              const day = i + 1
              const count = calData[day]?.length || 0
              const isPast = !isCurrentMonth || day <= todayDate
              const s = cellStyle(day)
              return (
                <div key={day} style={{
                  height:38, borderRadius:6,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  outline: s.outline,
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center',
                  cursor: 'default',
                }}>
                  <span style={{fontSize:11,fontWeight:500,color:s.textColor,lineHeight:1.2}}>{day}</span>
                  <span style={{fontSize:9,color:s.countColor,lineHeight:1.1}}>
                    {isPast ? (count > 0 ? count+'j' : '0') : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:14,alignItems:'center',fontSize:11,color:'#888',marginBottom:'1.25rem',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:12,height:12,borderRadius:3,background:'#E1F5EE',border:'1px solid #9FE1CB'}}></div>
            <span>Aktif (ada pekerjaan)</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:12,height:12,borderRadius:3,background:'#FCEBEB',border:'1px solid #F7C1C1'}}></div>
            <span>Kosong (0 pekerjaan)</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:12,height:12,borderRadius:3,border:'2px solid #378ADD',background:'#fff'}}></div>
            <span>Hari ini</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:12,height:12,borderRadius:3,background:'#f5f5f0',border:'1px solid #e8e8e2'}}></div>
            <span>Belum terjadi</span>
          </div>
        </div>

        {/* Empty days list */}
        <div style={{borderTop:'1px solid #f0f0eb',paddingTop:'1rem'}}>
          <div style={{fontSize:13,fontWeight:500,color:'#111',marginBottom:10}}>
            Daftar hari tanpa aktivitas
            {emptyDays.length > 0 && (
              <span style={{fontSize:11,color:'#aaa',fontWeight:400,marginLeft:8}}>({emptyDays.length} hari)</span>
            )}
          </div>

          {emptyDays.length === 0 && (
            <div style={{textAlign:'center',color:'#1D9E75',padding:'1rem',fontSize:13,background:'#e1f5ee',borderRadius:8}}>
              Tidak ada hari kosong di bulan ini!
            </div>
          )}

          {emptyGroups.map((group, gi) => {
            const isMulti = group.length > 1
            const startDay = group[0]
            const endDay = group[group.length - 1]

            // day of week label
            const getDOW = (d) => DOW_LABELS[(firstDOW + d - 1) % 7]

            const label = isMulti
              ? `${startDay} – ${endDay} ${MONTH_NAMES[calMonth]} ${calYear}`
              : `${startDay} ${MONTH_NAMES[calMonth]} ${calYear} (${getDOW(startDay)})`

            return (
              <div key={gi} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'9px 0', borderBottom:'1px solid #f0f0eb',
              }}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:'#E24B4A',flexShrink:0}}></div>
                  <span style={{fontSize:13,color:'#222'}}>{label}</span>
                </div>
                {isMulti ? (
                  <span style={{fontSize:11,background:'#FAEEDA',color:'#633806',padding:'3px 10px',borderRadius:20,fontWeight:500,whiteSpace:'nowrap'}}>
                    {group.length} hari berturut
                  </span>
                ) : (
                  <span style={{fontSize:11,background:'#FCEBEB',color:'#A32D2D',padding:'3px 10px',borderRadius:20,fontWeight:500}}>
                    1 hari
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── per-worker summary ── */}
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
