import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const OPEN = 9, CLOSE = 17
const tm = d => new Date(d).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
const dt = d => new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
const ymd = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const at = (day, mins) => { const d = new Date(`${day}T00:00:00`); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0); return d }
const plus = (d, m) => new Date(+d + m * 60000)
const SLOTS = []; for (let m = OPEN * 60; m < CLOSE * 60; m += 30) SLOTS.push(m)
const errMsg = (e, fallback) => (e.code === '23P01' ? fallback : e.message)

function Tag({ children }) { return <span className={`tag t-${children}`}>{children}</span> }

function Auth({ onMsg }) {
  const [up, setUp] = useState(false)
  const [f, setF] = useState({ name: '', email: '', pw: '' })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = async e => {
    e.preventDefault()
    const { error } = up
      ? await supabase.auth.signUp({ email: f.email, password: f.pw, options: { data: { full_name: f.name } } })
      : await supabase.auth.signInWithPassword({ email: f.email, password: f.pw })
    if (error) onMsg(error.message)
    else if (up) onMsg('Account created. If email confirmation is on, check your inbox, then log in.')
  }
  return (
    <main className="auth card">
      <h1>{up ? 'Create your account' : 'Log in'}</h1>
      <form onSubmit={submit}>
        {up && <label>Full name<input required value={f.name} onChange={set('name')} autoComplete="name" /></label>}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Password<input type="password" minLength={6} required value={f.pw} onChange={set('pw')} autoComplete={up ? 'new-password' : 'current-password'} /></label>
        <button className="pri" type="submit">{up ? 'Sign up' : 'Log in'}</button>
      </form>
      <p style={{ marginTop: 12 }}><button className="ghost" onClick={() => setUp(!up)}>{up ? 'I already have an account' : 'Create an account'}</button></p>
    </main>
  )
}

function Client({ user, onMsg }) {
  const [services, setServices] = useState([])
  const [sid, setSid] = useState(null)
  const [day, setDay] = useState(ymd(new Date()))
  const [busy, setBusy] = useState([])
  const [start, setStart] = useState(null)
  const [mine, setMine] = useState([])
  const svc = services.find(s => s.id === sid)

  const loadMine = async () => {
    const { data } = await supabase.from('appointments').select('*, services(name,minutes,price)').eq('client_id', user.id).order('starts_at', { ascending: false })
    setMine(data || [])
  }
  const loadBusy = async () => {
    const { data } = await supabase.rpc('busy_slots', { day_start: at(day, 0).toISOString(), day_end: at(day, 1439).toISOString() })
    setBusy(data || [])
  }
  useEffect(() => {
    supabase.from('services').select('*').order('id').then(({ data }) => { setServices(data || []); if (data?.length) setSid(data[0].id) })
    loadMine()
  }, [])
  useEffect(() => { loadBusy(); setStart(null) }, [day, sid])

  const free = m => {
    if (!svc) return false
    const s = at(day, m), e = plus(s, svc.minutes)
    if (s < new Date() || s.getDay() === 0 || m + svc.minutes > CLOSE * 60) return false
    return !busy.some(b => new Date(b.starts_at) < e && s < new Date(b.ends_at))
  }
  const book = async () => {
    const s = at(day, start)
    const { error } = await supabase.from('appointments').insert({ client_id: user.id, service_id: sid, starts_at: s.toISOString(), ends_at: plus(s, svc.minutes).toISOString() })
    onMsg(error ? errMsg(error, 'That time was just taken. Pick another slot.') : `Booked ${svc.name} on ${dt(s)} at ${tm(s)}.`)
    setStart(null); loadMine(); loadBusy()
  }
  const cancel = async id => {
    await supabase.from('appointments').update({ status: 'Cancelled' }).eq('id', id)
    onMsg('Booking cancelled.'); loadMine(); loadBusy()
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Book an appointment</h2>
        <label>Service
          <select value={sid ?? ''} onChange={e => setSid(+e.target.value)}>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.minutes} min, ${s.price})</option>)}
          </select>
        </label>
        <label>Date<input type="date" min={ymd(new Date())} value={day} onChange={e => e.target.value && setDay(e.target.value)} /></label>
        <p className="mu">Open 9 am to 5 pm, Monday to Saturday. Crossed-out times are unavailable.</p>
        <div className="slots">
          {SLOTS.map(m => <button key={m} disabled={!free(m)} aria-pressed={start === m} onClick={() => setStart(m)}>{tm(at(day, m))}</button>)}
        </div>
        <button className="pri" disabled={start == null} onClick={book}>{start == null ? 'Choose a time' : `Book ${tm(at(day, start))}`}</button>
      </section>
      <section>
        <h2>My bookings</h2>
        {mine.map(a => (
          <article key={a.id} className="card row">
            <div><h3>{a.services.name}</h3><p className="mu">{dt(a.starts_at)}, {tm(a.starts_at)} to {tm(a.ends_at)}</p></div>
            <div className="acts"><Tag>{a.status}</Tag><Tag>{a.paid ? 'Paid' : 'Unpaid'}</Tag>
              {a.status === 'Booked' && <button className="ghost" onClick={() => cancel(a.id)}>Cancel booking</button>}</div>
          </article>
        ))}
        {!mine.length && <p className="mu">No bookings yet. Choose a service and time to make your first one.</p>}
      </section>
    </div>
  )
}

function Edit({ a, onDone, onMsg }) {
  const s0 = new Date(a.starts_at)
  const [day, setDay] = useState(ymd(s0))
  const [time, setTime] = useState(s0.getHours() * 60 + s0.getMinutes())
  const [status, setStatus] = useState(a.status)
  const [paid, setPaid] = useState(a.paid)
  const [notes, setNotes] = useState(a.notes || '')
  const save = async () => {
    const s = at(day, time)
    const { error } = await supabase.from('appointments').update({ starts_at: s.toISOString(), ends_at: plus(s, a.services.minutes).toISOString(), status, paid, notes }).eq('id', a.id)
    if (error) onMsg(errMsg(error, 'That time overlaps another booking.'))
    else { onMsg('Appointment updated.'); onDone() }
  }
  return (
    <article className="card">
      <h3>{a.profiles?.full_name}: {a.services.name}</h3>
      <div className="grid2" style={{ marginTop: 10 }}>
        <label>Date<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
        <label>Start time<select value={time} onChange={e => setTime(+e.target.value)}>{SLOTS.map(m => <option key={m} value={m}>{tm(at(day, m))}</option>)}</select></label>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{['Booked', 'Completed', 'Cancelled'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="chk"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> Paid</label>
      </div>
      <label>Job notes<input value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <div className="acts"><button className="pri" onClick={save}>Save changes</button><button className="ghost" onClick={onDone}>Discard</button></div>
    </article>
  )
}

function Admin({ onMsg }) {
  const [view, setView] = useState('cal')
  const [rows, setRows] = useState([])
  const [wk, setWk] = useState(0)
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const load = async () => {
    const { data } = await supabase.from('appointments').select('*, services(name,minutes,price), profiles(full_name)').order('starts_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])
  const togglePaid = async a => { await supabase.from('appointments').update({ paid: !a.paid }).eq('id', a.id); load() }

  const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + wk * 7)
  const days = [0, 1, 2, 3, 4, 5].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })

  const Row = ({ a }) => edit === a.id ? <Edit a={a} onMsg={onMsg} onDone={() => { setEdit(null); load() }} /> : (
    <article className="card row">
      <div><h3>{a.profiles?.full_name}: {a.services.name}</h3>
        <p className="mu">{dt(a.starts_at)}, {tm(a.starts_at)} to {tm(a.ends_at)}. ${a.services.price}</p>{a.notes && <p>Note: {a.notes}</p>}</div>
      <div className="acts"><Tag>{a.status}</Tag>
        <button className={`tag t-${a.paid ? 'Paid' : 'Unpaid'}`} onClick={() => togglePaid(a)}>{a.paid ? 'Paid' : 'Unpaid'}</button>
        <button className="ghost" onClick={() => setEdit(a.id)}>Edit</button></div>
    </article>
  )

  const now = new Date()
  const upcoming = rows.filter(a => new Date(a.ends_at) >= now), earlier = rows.filter(a => new Date(a.ends_at) < now).reverse()
  const byClient = {}
  rows.forEach(a => { (byClient[a.client_id] ||= { name: a.profiles?.full_name || 'Unnamed', list: [] }).list.push(a) })
  const clients = Object.values(byClient).filter(c => c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <nav className="nav">{[['cal', 'Calendar'], ['list', 'Appointments'], ['cli', 'Clients']].map(([k, l]) =>
        <button key={k} aria-pressed={view === k} onClick={() => { setView(k); setEdit(null) }}>{l}</button>)}</nav>
      {view === 'cal' && <>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Week of {dt(mon)}</h2>
          <div className="acts"><button onClick={() => setWk(wk - 1)}>Previous week</button><button onClick={() => setWk(0)}>This week</button><button onClick={() => setWk(wk + 1)}>Next week</button></div>
        </div>
        <div className="week">{days.map(d => (
          <div className="day" key={+d}><h3>{dt(d)}</h3>
            {rows.filter(a => a.status !== 'Cancelled' && ymd(a.starts_at) === ymd(d)).map(a =>
              <div className="ev" key={a.id}><b>{tm(a.starts_at)}</b> {a.profiles?.full_name}<br />{a.services.name}, {a.paid ? 'Paid' : 'Unpaid'}</div>)}
          </div>))}</div>
      </>}
      {view === 'list' && <><h2>Upcoming</h2>{upcoming.map(a => <Row key={a.id} a={a} />)}{!upcoming.length && <p className="mu">No upcoming appointments.</p>}
        <h2>Earlier</h2>{earlier.map(a => <Row key={a.id} a={a} />)}{!earlier.length && <p className="mu">Nothing earlier yet.</p>}</>}
      {view === 'cli' && <><label>Look up a client<input type="search" placeholder="Name" value={q} onChange={e => setQ(e.target.value)} /></label>
        {clients.map(c => (
          <article className="card" key={c.name}><h3>{c.name}</h3>
            <p className="mu">{c.list.length} bookings, ${c.list.filter(a => a.status !== 'Cancelled' && !a.paid).reduce((n, a) => n + Number(a.services.price), 0)} unpaid.</p>
            <ul>{c.list.map(a => <li key={a.id}>{dt(a.starts_at)}, {tm(a.starts_at)}: {a.services.name}, {a.status}, {a.paid ? 'Paid' : 'Unpaid'}</li>)}</ul></article>))}
        {!clients.length && <p className="mu">No clients match that search.</p>}</>}
    </>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProfile(data))
  }, [session])

  if (!ready) return <p>Loading…</p>
  return (
    <>
      <header className="top">
        <b className="brand">Local Business Portal</b>
        {profile && <><span>{profile.full_name}</span><span className="tag">{profile.role === 'admin' ? 'Owner' : 'Client'}</span></>}
        {session && <button className="ghost" onClick={() => supabase.auth.signOut()}>Log out</button>}
      </header>
      {msg && <p className="msg" role="status">{msg}</p>}
      {!session ? <Auth onMsg={setMsg} /> : !profile ? <p>Loading your account…</p>
        : profile.role === 'admin' ? <Admin onMsg={setMsg} /> : <Client user={session.user} onMsg={setMsg} />}
    </>
  )
}
