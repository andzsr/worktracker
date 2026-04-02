import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import People from './pages/People'
import Compare from './pages/Compare'
import JobTypes from './pages/JobTypes'
import Pockets from './pages/Pockets'
import Checklist from './pages/Checklist'
import WorkerPortal from './pages/WorkerPortal'
import './App.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', component: Dashboard },
  { id: 'jobs', label: 'Daftar Pekerjaan', component: Jobs },
  { id: 'jobtypes', label: 'Jenis Pekerjaan', component: JobTypes },
  { id: 'people', label: 'Daftar Pekerja', component: People },
  { id: 'pockets', label: 'Kantong', component: Pockets },
  { id: 'checklist', label: 'Checklist', component: Checklist },
  { id: 'compare', label: 'Komparasi Pendapatan', component: Compare },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [refresh, setRefresh] = useState(0)
  const [session, setSession] = useState(null)
  const [worker, setWorker] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  const triggerRefresh = () => setRefresh(r => r + 1)

  const now = new Date()
  const monthLabel = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadWorker(session.user.id)
      else setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadWorker(session.user.id)
      else { setWorker(null); setAuthLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadWorker(uid) {
    const { data } = await supabase.from('workers').select('*').eq('user_id', uid).single()
    setWorker(data || null)
    setAuthLoading(false)
  }

  if (authLoading) return <div className="loading" style={{paddingTop:'4rem'}}>Memuat...</div>

  if (session && worker) {
    return <WorkerPortal worker={worker} onLogout={() => supabase.auth.signOut()} />
  }

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1 className="app-title">Bellagio Work & Pay</h1>
          <p className="app-sub">Aplikasi Pencatatan Pekerjaan & Upah</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span className="badge-month">{monthLabel}</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowLogin(true)}>Login Pekerja</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab${activeTab===t.id?' active':''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {ActiveComponent
          ? <ActiveComponent key={refresh} onRefresh={triggerRefresh} />
          : <div>Halaman tidak ditemukan</div>}
      </main>

      <div style={{marginTop:24,textAlign:'center',fontSize:12,color:'#888'}}>
        Andhi Rahman – Bellagio
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

function LoginModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function login() {
    if (!email || !password) return setError('Isi email dan password!')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError('Email atau password salah.')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{width:380}}>
        <div className="modal-title">Login Pekerja</div>
        <p style={{fontSize:13,color:'#888',marginBottom:16}}>Masuk untuk melihat kantong & riwayat upah kamu</p>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="email@kamu.com" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password}
              onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} />
          </div>
          {error && <div style={{fontSize:12,color:'#e24b4a'}}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={login} disabled={loading}>{loading?'Masuk...':'Masuk'}</button>
        </div>
      </div>
    </div>
  )
}
