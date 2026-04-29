import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Inbox, MailPlus, Plus, RefreshCw, Send, Shield, Trash2 } from 'lucide-react'
import './styles.css'

const API = import.meta.env.VITE_API_URL || ''

function request(path, options = {}) {
  const token = localStorage.getItem('mailhub_token')
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request gagal')
    return data
  })
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await request(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) })
      localStorage.setItem('mailhub_token', data.token)
      localStorage.setItem('mailhub_user', JSON.stringify(data.user))
      onAuthed(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <div className="brand-mark"><Shield size={28} /></div>
      <p className="eyebrow">Multi account email center</p>
      <h1>MailHub</h1>
      <p className="muted">Satu dashboard untuk banyak inbox IMAP dan SMTP sender.</p>
      <form onSubmit={submit} className="form-stack">
        <label>Email login website<input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="admin@mailhub.local" required /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength="6" placeholder="Minimal 6 karakter" required /></label>
        {error && <div className="alert">{error}</div>}
        <button disabled={loading}>{loading ? 'Memproses...' : mode === 'login' ? 'Login' : 'Register'}</button>
      </form>
      <button className="link-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Belum punya akun? Register' : 'Sudah punya akun? Login'}
      </button>
    </section>
  </main>
}

function AccountForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', emailAddress: '', username: '', password: '', imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 587, smtpSecure: false })

  function preset(kind) {
    if (kind === 'gmail') setForm(v => ({ ...v, imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false }))
    if (kind === 'outlook') setForm(v => ({ ...v, imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false }))
  }

  async function submit(e) {
    e.preventDefault(); setError('')
    try {
      const data = await request('/api/accounts', { method: 'POST', body: JSON.stringify(form) })
      onCreated(data.account); setOpen(false)
      setForm({ name: '', emailAddress: '', username: '', password: '', imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 587, smtpSecure: false })
    } catch (err) { setError(err.message) }
  }

  if (!open) return <button className="secondary" onClick={() => setOpen(true)}><Plus size={16}/> Tambah Email</button>
  return <section className="panel full">
    <div className="panel-head"><h2>Tambah akun email</h2><button className="ghost" onClick={() => setOpen(false)}>Tutup</button></div>
    <div className="preset-row"><button onClick={() => preset('gmail')}>Preset Gmail</button><button onClick={() => preset('outlook')}>Preset Outlook</button></div>
    <form onSubmit={submit} className="account-grid">
      <label>Nama tampil<input value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Gyoo Support" required /></label>
      <label>Alamat email<input value={form.emailAddress} onChange={e => setForm({...form, emailAddress:e.target.value, username:e.target.value})} type="email" placeholder="support@domain.com" required /></label>
      <label>Username IMAP/SMTP<input value={form.username} onChange={e => setForm({...form, username:e.target.value})} required /></label>
      <label>Password / App password<input value={form.password} onChange={e => setForm({...form, password:e.target.value})} type="password" required /></label>
      <label>IMAP host<input value={form.imapHost} onChange={e => setForm({...form, imapHost:e.target.value})} placeholder="imap.domain.com" required /></label>
      <label>IMAP port<input value={form.imapPort} onChange={e => setForm({...form, imapPort:Number(e.target.value)})} type="number" required /></label>
      <label>SMTP host<input value={form.smtpHost} onChange={e => setForm({...form, smtpHost:e.target.value})} placeholder="smtp.domain.com" required /></label>
      <label>SMTP port<input value={form.smtpPort} onChange={e => setForm({...form, smtpPort:Number(e.target.value)})} type="number" required /></label>
      <label className="check"><input type="checkbox" checked={form.imapSecure} onChange={e => setForm({...form, imapSecure:e.target.checked})}/> IMAP SSL</label>
      <label className="check"><input type="checkbox" checked={form.smtpSecure} onChange={e => setForm({...form, smtpSecure:e.target.checked})}/> SMTP SSL langsung</label>
      {error && <div className="alert span2">{error}</div>}
      <button className="span2">Simpan akun email</button>
    </form>
  </section>
}

function Composer({ accounts }) {
  const [form, setForm] = useState({ accountId: '', to: '', subject: '', text: '' })
  const [status, setStatus] = useState('')
  useEffect(() => { if (!form.accountId && accounts[0]) setForm(f => ({ ...f, accountId: accounts[0].id })) }, [accounts])
  async function sendMail(e) {
    e.preventDefault(); setStatus('Mengirim...')
    try {
      await request(`/api/accounts/${form.accountId}/send`, { method: 'POST', body: JSON.stringify(form) })
      setStatus('Terkirim ✅'); setForm(f => ({ ...f, to: '', subject: '', text: '' }))
    } catch (err) { setStatus(err.message) }
  }
  return <section className="panel">
    <div className="panel-head"><h2><Send size={18}/> Kirim email</h2></div>
    <form onSubmit={sendMail} className="form-stack">
      <label>Dari<select value={form.accountId} onChange={e => setForm({...form, accountId:e.target.value})} required>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.emailAddress}</option>)}</select></label>
      <label>Ke<input value={form.to} onChange={e => setForm({...form, to:e.target.value})} placeholder="tujuan@email.com" required /></label>
      <label>Subject<input value={form.subject} onChange={e => setForm({...form, subject:e.target.value})} required /></label>
      <label>Pesan<textarea value={form.text} onChange={e => setForm({...form, text:e.target.value})} rows="7" required /></label>
      <button disabled={!accounts.length}><MailPlus size={16}/> Kirim</button>
      {status && <p className="status">{status}</p>}
    </form>
  </section>
}

function InboxPanel({ accounts, setAccounts }) {
  const [accountId, setAccountId] = useState('')
  const [messages, setMessages] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const account = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId])
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id) }, [accounts])

  async function refresh() {
    if (!accountId) return
    setLoading(true); setError(''); setSelected(null)
    try {
      const data = await request(`/api/accounts/${accountId}/messages`)
      setMessages(data.messages)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function openMessage(uid) {
    setSelected({ loading: true })
    try { setSelected(await request(`/api/accounts/${accountId}/messages/${uid}`)) }
    catch (err) { setSelected({ error: err.message }) }
  }

  async function removeAccount(id) {
    if (!confirm('Hapus akun email ini dari dashboard?')) return
    await request(`/api/accounts/${id}`, { method: 'DELETE' })
    setAccounts(accounts.filter(a => a.id !== id)); setMessages([]); setSelected(null); setAccountId('')
  }

  return <section className="panel inbox-panel">
    <div className="panel-head"><h2><Inbox size={18}/> Inbox</h2><button onClick={refresh} disabled={!accountId || loading}><RefreshCw size={16}/> {loading ? 'Loading' : 'Refresh'}</button></div>
    <div className="inbox-controls">
      <select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Pilih akun</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.emailAddress}</option>)}</select>
      {account && <button className="danger" onClick={() => removeAccount(account.id)}><Trash2 size={15}/> Hapus</button>}
    </div>
    {error && <div className="alert">{error}</div>}
    <div className="mail-layout">
      <div className="message-list">{messages.length === 0 ? <p className="empty">Belum ada pesan. Klik Refresh.</p> : messages.map(m => <button key={m.uid} className="message-row" onClick={() => openMessage(m.uid)}><b>{m.subject}</b><span>{m.from}</span><small>{new Date(m.date).toLocaleString()}</small></button>)}</div>
      <article className="reader">{!selected ? <p className="empty">Pilih email untuk membaca isi.</p> : selected.loading ? <p>Loading...</p> : selected.error ? <div className="alert">{selected.error}</div> : <><h3>{selected.subject}</h3><p className="muted">From: {selected.from}</p><p className="muted">To: {selected.to}</p><pre>{selected.text || 'Email HTML tersedia, plain text kosong.'}</pre></>}</article>
    </div>
  </section>
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('mailhub_user') || 'null'))
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { if (user) request('/api/accounts').then(d => setAccounts(d.accounts)).catch(err => setError(err.message)) }, [user])
  if (!user) return <AuthScreen onAuthed={setUser} />
  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">MailHub Dashboard</p><h1>Multi Email Inbox & Sender</h1></div><button className="ghost" onClick={() => { localStorage.clear(); setUser(null) }}>Logout</button></header>
    {error && <div className="alert">{error}</div>}
    <AccountForm onCreated={(account) => setAccounts([...accounts, account])} />
    <div className="grid"><InboxPanel accounts={accounts} setAccounts={setAccounts}/><Composer accounts={accounts}/></div>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
