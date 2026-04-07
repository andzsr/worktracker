import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, getInitials, avClass, personColor } from '../helpers'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// ── date helpers ──────────────────────────────────────────────────────────────

function getMondayOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekRange(monday) {
  const start = new Date(monday)
  const end = new Date(monday)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatShort(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function addWeeks(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

// ── per-worker stats ──────────────────────────────────────────────────────────

function buildWorkerStats(worker, jobs, weekStart, weekEnd, prevStart, prevEnd) {
  const inRange = (j, s, e) => {
    const d = new Date(j.date)
    return d >= s && d <= e
  }

  const thisWeekJobs = jobs.filter(j => j.worker_id === worker.id && inRange(j, weekStart, weekEnd))
  const prevWeekJobs = jobs.filter(j => j.worker_id === worker.id && inRange(j, prevStart, prevEnd))

  // Basic counts
  const jobCount = thisWeekJobs.length
  const prevJobCount = prevWeekJobs.length
  const totalWage = thisWeekJobs.reduce((s, j) => s + j.wage, 0)
  const prevWage = prevWeekJobs.reduce((s, j) => s + j.wage, 0)
  const totalHours = thisWeekJobs.reduce((s, j) => s + (j.hours || 0), 0)
  const doneCount = thisWeekJobs.filter(j => j.status === 'Selesai').length

  // Job type variety
  const typeSet = new Set(thisWeekJobs.filter(j => j.job_type_id).map(j => j.job_type_id))
  const uniqueTypes = typeSet.size
  const typeNames = [...new Set(thisWeekJobs.map(j => j.job_types?.name).filter(Boolean))]

  // Daily breakdown (Mon–Sun)
  const dayMap = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    dayMap[isoDate(d)] = []
  }
  thisWeekJobs.forEach(j => { if (dayMap[j.date]) dayMap[j.date].push(j) })

  const dayEntries = Object.entries(dayMap) // [date, jobs[]]
  const activeDays = dayEntries.filter(([, jj]) => jj.length > 0)
  const emptyDays = dayEntries.filter(([, jj]) => jj.length === 0)
  const busiestDay = dayEntries.reduce((best, cur) => cur[1].length > best[1].length ? cur : best, dayEntries[0])
  const dailyCounts = dayEntries.map(([, jj]) => jj.length)
  const dailyWages = dayEntries.map(([, jj]) => jj.reduce((s, j) => s + j.wage, 0))

  // WoW deltas
  const wageDelta = totalWage - prevWage
  const wageDeltaPct = prevWage > 0 ? Math.round((wageDelta / prevWage) * 100) : null
  const jobDelta = jobCount - prevJobCount

  return {
    worker,
    thisWeekJobs, prevWeekJobs,
    jobCount, prevJobCount, jobDelta,
    totalWage, prevWage, wageDelta, wageDeltaPct,
    totalHours, doneCount,
    uniqueTypes, typeNames,
    dayEntries, dayMap, activeDays, emptyDays,
    busiestDay, dailyCounts, dailyWages,
  }
}

// ── WorkerCard component ──────────────────────────────────────────────────────

function WorkerCard({ stat, idx, expanded, onToggle }) {
  const chartRef = useRef()
  const chartInst = useRef()

  useEffect(() => {
    if (!expanded || !chartRef.current) return
    if (chartInst.current) chartInst.current.destroy()

    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: DOW,
        datasets: [
          {
            label: 'Upah',
            data: stat.dailyWages,
            backgroundColor: personColor(idx),
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y',
          },
          {
            label: 'Pekerjaan',
            data: stat.dailyCounts,
            backgroundColor: personColor(idx) + '44',
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y2',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            position: 'left',
            ticks: { callback: v => v >= 1000 ? 'Rp' + Math.round(v / 1000) + 'rb' : 'Rp' + v, font: { size: 10 } },
            grid: { color: '#f0f0eb' },
          },
          y2: {
            position: 'right',
            ticks: { stepSize: 1, font: { size: 10 } },
            grid: { display: false },
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    })
    return () => chartInst.current?.destroy()
  }, [expanded, stat])

  const { worker, jobCount, prevJobCount, jobDelta, totalWage, prevWage, wageDelta, wageDeltaPct,
    totalHours, doneCount, uniqueTypes, typeNames, activeDays, emptyDays, busiestDay, thisWeekJobs } = stat

  const wageUp = wageDelta >= 0
  const jobUp = jobDelta >= 0

  function DeltaBadge({ value, pct, suffix = '' }) {
    if (value === 0 && !pct) return <span style={{ fontSize: 11, color: '#aaa' }}>sama</span>
    const up = value >= 0
    return (
      <span style={{
        fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
        background: up ? '#e1f5ee' : '#FCEBEB',
        color: up ? '#085041' : '#A32D2D',
      }}>
        {up ? '▲' : '▼'} {up ? '+' : ''}{suffix === 'rp' ? fmt(Math.abs(value)) : Math.abs(value)}{pct != null ? ` (${Math.abs(pct)}%)` : ''}
      </span>
    )
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e2', borderRadius: 12,
      marginBottom: '1rem', overflow: 'hidden',
    }}>
      {/* ── Header row ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <span className={`avatar ${avClass(idx)}`} style={{ width: 40, height: 40, fontSize: 14, flexShrink: 0 }}>
          {getInitials(worker.name)}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{worker.name}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{worker.role || 'Pekerja'}</div>
        </div>

        {/* Quick stats inline */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Pekerjaan</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{jobCount}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Total Upah</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1D9E75' }}>{fmt(totalWage)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>vs minggu lalu</div>
            <DeltaBadge value={wageDelta} pct={wageDeltaPct} suffix="rp" />
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid #e0e0d8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#888', flexShrink: 0,
          }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f0f0eb', padding: '1rem 1.25rem' }}>

          {/* 4 metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: '1.25rem' }}>
            {[
              { label: 'Jumlah Pekerjaan', val: jobCount, sub: <DeltaBadge value={jobDelta} />, color: '#378ADD' },
              { label: 'Total Jam Kerja', val: totalHours > 0 ? totalHours + ' jam' : '—', sub: `${doneCount} selesai`, color: '#1D9E75' },
              { label: 'Jenis Pekerjaan', val: uniqueTypes || '—', sub: typeNames.slice(0, 2).join(', ') || 'tidak tercatat', color: '#BA7517' },
              { label: 'Total Upah', val: fmt(totalWage), sub: <DeltaBadge value={wageDelta} pct={wageDeltaPct} suffix="rp" />, color: '#1D9E75' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#f5f5f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.3px' }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: m.color, marginBottom: 3 }}>{m.val}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Two-col: bar chart + monitoring */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

            {/* Daily chart */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 8 }}>Aktivitas Harian (Upah & Pekerjaan)</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#888' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: personColor(idx), display: 'inline-block' }}></span>Upah
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#888' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: personColor(idx) + '44', display: 'inline-block' }}></span>Pekerjaan
                </span>
              </div>
              <div style={{ position: 'relative', height: 140 }}>
                <canvas ref={chartRef}></canvas>
              </div>
            </div>

            {/* Monitoring panel */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 8 }}>Monitoring Mingguan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Active days */}
                <div style={{ background: '#e1f5ee', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041', fontWeight: 500 }}>Hari aktif bekerja</div>
                    <div style={{ fontSize: 10, color: '#0F6E56', marginTop: 1 }}>
                      {activeDays.map(([d]) => DOW[(new Date(d).getDay() + 6) % 7]).join(', ') || '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#1D9E75' }}>{activeDays.length}</span>
                </div>

                {/* Empty days */}
                <div style={{ background: emptyDays.length > 0 ? '#FCEBEB' : '#f5f5f0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: emptyDays.length > 0 ? '#A32D2D' : '#888', fontWeight: 500 }}>Hari tanpa pekerjaan</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>
                      {emptyDays.length > 0
                        ? emptyDays.map(([d]) => DOW[(new Date(d).getDay() + 6) % 7]).join(', ')
                        : 'Aktif setiap hari minggu ini'}
                    </div>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: emptyDays.length > 0 ? '#E24B4A' : '#aaa' }}>{emptyDays.length}</span>
                </div>

                {/* Busiest day */}
                {busiestDay && busiestDay[1].length > 0 && (
                  <div style={{ background: '#e6f1fb', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#185FA5', fontWeight: 500 }}>Hari paling banyak kerja</div>
                      <div style={{ fontSize: 10, color: '#378ADD', marginTop: 1 }}>
                        {DOW[(new Date(busiestDay[0]).getDay() + 6) % 7]}, {formatShort(busiestDay[0])}
                      </div>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#378ADD' }}>{busiestDay[1].length}j</span>
                  </div>
                )}

                {/* Wage vs prev week */}
                <div style={{
                  background: wageDelta >= 0 ? '#e1f5ee' : '#FCEBEB',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <div style={{ fontSize: 11, color: wageDelta >= 0 ? '#085041' : '#A32D2D', fontWeight: 500, marginBottom: 3 }}>
                    {wageDelta >= 0 ? '▲ Pendapatan naik' : '▼ Pendapatan turun'} vs minggu lalu
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#888' }}>Minggu lalu: {fmt(prevWage)}</span>
                    <span style={{ fontWeight: 600, color: wageDelta >= 0 ? '#1D9E75' : '#E24B4A' }}>
                      {wageDelta >= 0 ? '+' : ''}{fmt(wageDelta)}
                      {wageDeltaPct != null ? ` (${wageDeltaPct > 0 ? '+' : ''}${wageDeltaPct}%)` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Job list for this week */}
          {thisWeekJobs.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f0eb', paddingTop: '1rem' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 8 }}>Detail Pekerjaan Minggu Ini</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Pekerjaan', 'Tanggal', 'Jam', 'Upah', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {thisWeekJobs.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid #f5f5f0' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 500 }}>
                          {j.job_name}
                          {j.job_types && <span style={{ fontSize: 10, color: '#1D9E75', marginLeft: 6 }}>{j.job_types.name}</span>}
                        </td>
                        <td style={{ padding: '7px 10px', color: '#888' }}>{j.date}</td>
                        <td style={{ padding: '7px 10px', color: '#888' }}>{j.hours ? j.hours + 'j' : '—'}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 500 }}>{fmt(j.wage)}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                            background: j.status === 'Selesai' ? '#e1f5ee' : j.status === 'Berlangsung' ? '#e6f1fb' : '#faeeda',
                            color: j.status === 'Selesai' ? '#085041' : j.status === 'Berlangsung' ? '#185FA5' : '#633806',
                          }}>{j.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Report page ──────────────────────────────────────────────────────────

export default function Report() {
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedAll, setExpandedAll] = useState(true)
  const [expanded, setExpanded] = useState({})

  const now = new Date()
  const currentMonday = getMondayOfWeek(now)
  const [weekStart, setWeekStart] = useState(currentMonday)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: w }, { data: j }] = await Promise.all([
      supabase.from('workers').select('*').order('name'),
      supabase.from('jobs').select('*, job_types(name)').order('date', { ascending: false }),
    ])
    setWorkers(w || [])
    setJobs(j || [])
    setLoading(false)
  }

  // Week navigation
  const { start: weekEnd } = (() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start: end }
  })()

  const prevStart = addWeeks(weekStart, -1)
  const prevEnd = addWeeks(weekEnd, -1)
  const isCurrentWeek = isoDate(weekStart) === isoDate(currentMonday)

  function prevWeek() { setWeekStart(addWeeks(weekStart, -1)) }
  function nextWeek() { if (!isCurrentWeek) setWeekStart(addWeeks(weekStart, 1)) }

  // Build stats for all workers
  const stats = workers.map((w, i) =>
    buildWorkerStats(w, jobs, weekStart, weekEnd, prevStart, prevEnd)
  )

  // Team-level summary
  const teamTotal = stats.reduce((s, st) => s + st.totalWage, 0)
  const teamPrevTotal = stats.reduce((s, st) => s + st.prevWage, 0)
  const teamJobCount = stats.reduce((s, st) => s + st.jobCount, 0)
  const teamDelta = teamTotal - teamPrevTotal
  const teamDeltaPct = teamPrevTotal > 0 ? Math.round((teamDelta / teamPrevTotal) * 100) : null
  const activeWorkers = stats.filter(st => st.jobCount > 0).length

  function toggleAll() {
    const next = !expandedAll
    setExpandedAll(next)
    const map = {}
    workers.forEach(w => { map[w.id] = next })
    setExpanded(map)
  }

  function toggleWorker(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Print handler
  function handlePrint() {
    window.print()
  }

  if (loading) return <div className="loading">Memuat data...</div>

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>Report Mingguan</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            Generate setiap Senin — ringkasan pekerjaan & pendapatan semua pekerja
          </div>
        </div>
        <button onClick={handlePrint}
          style={{ fontSize: 12, padding: '7px 16px', border: '1px solid #e0e0d8', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⎙ Cetak / Simpan PDF
        </button>
      </div>

      {/* ── Week selector ── */}
      <div style={{ background: '#fff', border: '1px solid #e8e8e2', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prevWeek}
            style={{ width: 32, height: 32, border: '1px solid #e0e0d8', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ‹
          </button>
          <div style={{ textAlign: 'center', minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {formatShort(weekStart)} – {formatShort(weekEnd)}
              {isCurrentWeek && (
                <span style={{ fontSize: 11, background: '#e1f5ee', color: '#085041', padding: '2px 8px', borderRadius: 20, marginLeft: 8, fontWeight: 500 }}>
                  Minggu ini
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
              vs {formatShort(prevStart)} – {formatShort(prevEnd)}
            </div>
          </div>
          <button onClick={nextWeek} disabled={isCurrentWeek}
            style={{ width: 32, height: 32, border: '1px solid #e0e0d8', borderRadius: 8, background: '#fff', cursor: isCurrentWeek ? 'not-allowed' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrentWeek ? '#ccc' : '#333' }}>
            ›
          </button>
        </div>
        <button onClick={toggleAll}
          style={{ fontSize: 12, padding: '6px 14px', border: '1px solid #e0e0d8', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#555' }}>
          {expandedAll ? 'Tutup Semua' : 'Buka Semua'}
        </button>
      </div>

      {/* ── Team summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Upah Tim', val: fmt(teamTotal), sub: teamDelta !== 0 ? `${teamDelta >= 0 ? '+' : ''}${fmt(teamDelta)} vs mgg lalu` : 'sama dgn mgg lalu', color: '#1D9E75', subColor: teamDelta >= 0 ? '#1D9E75' : '#E24B4A' },
          { label: 'Total Pekerjaan', val: teamJobCount, sub: `${workers.length} pekerja terdaftar`, color: '#378ADD', subColor: '#888' },
          { label: 'Pekerja Aktif', val: activeWorkers, sub: `dari ${workers.length} pekerja`, color: activeWorkers === workers.length ? '#1D9E75' : '#BA7517', subColor: '#888' },
          { label: 'Rata-rata / Pekerja', val: workers.length ? fmt(Math.round(teamTotal / workers.length)) : 'Rp 0', sub: teamDeltaPct != null ? `${teamDeltaPct >= 0 ? '+' : ''}${teamDeltaPct}% vs mgg lalu` : '—', color: '#BA7517', subColor: teamDeltaPct != null && teamDeltaPct >= 0 ? '#1D9E75' : '#E24B4A' },
        ].map((m, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e8e8e2', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.3px' }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: m.color, marginBottom: 3 }}>{m.val}</div>
            <div style={{ fontSize: 11, color: m.subColor }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Per-worker cards ── */}
      {stats.length === 0 && (
        <div style={{ textAlign: 'center', color: '#aaa', padding: '3rem', background: '#fff', borderRadius: 12, border: '1px solid #e8e8e2' }}>
          Belum ada pekerja terdaftar.
        </div>
      )}

      {stats.map((stat, idx) => (
        <WorkerCard
          key={stat.worker.id}
          stat={stat}
          idx={idx}
          expanded={expanded[stat.worker.id] !== undefined ? expanded[stat.worker.id] : expandedAll}
          onToggle={() => toggleWorker(stat.worker.id)}
        />
      ))}

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .tabs, .topbar button, header .btn, footer { display: none !important; }
          .card, div[style*="border-radius: 12px"] { break-inside: avoid; }
          body { font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
