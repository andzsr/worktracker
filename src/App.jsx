import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import People from './pages/People'
import Compare from './pages/Compare'
import JobTypes from './pages/JobTypes'
import './App.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', component: Dashboard },
  { id: 'jobs', label: 'Daftar Pekerjaan', component: Jobs },
  { id: 'jobtypes', label: 'Jenis Pekerjaan', component: JobTypes },
  { id: 'people', label: 'Daftar Pekerja', component: People },
  { id: 'compare', label: 'Komparasi Pendapatan', component: Compare }
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [refresh, setRefresh] = useState(0)

  const triggerRefresh = () => setRefresh(r => r + 1)

  const ActiveComponent =
    TABS.find(t => t.id === activeTab)?.component

  const now = new Date()
  const monthLabel = now.toLocaleString('id-ID', {
    month: 'long',
    year: 'numeric'
  })



  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1 className="app-title">WorkTracker Pro</h1>
          <p className="app-sub">Pencatatan pekerjaan & upah</p>
        </div>
        <span className="badge-month">{monthLabel}</span>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {ActiveComponent ? (
          <ActiveComponent
            key={refresh}
            onRefresh={triggerRefresh}
          />
        ) : (
          <div>Halaman tidak ditemukan</div>
        )}
      </main>

      
      <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#888' }}>
        Andhi Rahman – Bellagio
      </div>


    </div>
  )
}
