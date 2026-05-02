import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  loadFaceModels, detectFace, findBestMatch, LivenessTracker, drawFaceOverlay,
} from '../lib/faceEngine'
import { Mail, User, Scan, Eye, EyeOff, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

const TABS = [
  { id: 'email',    label: 'Email',    icon: Mail },
  { id: 'username', label: 'Username', icon: User },
  { id: 'face',     label: 'Face ID',  icon: Scan },
]

function Logo() {
  return (
    <div className="text-center mb-10">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-4">
        <svg viewBox="0 0 32 32" className="w-8 h-8 fill-brand-400" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4a10 10 0 110 20A10 10 0 0116 6zm-1 4v7.414l4.293 4.293 1.414-1.414L17 16.586V10h-2z"/>
        </svg>
      </div>
      <h1 className="font-display text-3xl font-bold text-white tracking-tight">S.H.A.I.</h1>
      <p className="text-slate-400 text-sm mt-1">Payroll & Attendance System</p>
    </div>
  )
}

function PasswordField({ value, onChange, show, onToggle }) {
  return (
    <div>
      <label className="label">Password</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} className="input pr-10" placeholder="••••••••"
          value={value} onChange={e => onChange(e.target.value)} required />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

function SubmitBtn({ loading, children }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-1">
      {loading
        ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</span>
        : children}
    </button>
  )
}

function ErrorBox({ msg }) {
  return msg ? <div className="p-3 rounded-xl bg-red-900/30 border border-red-800/40 text-red-300 text-sm">{msg}</div> : null
}

function EmailLogin() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) { setError('Invalid email or password.'); setLoading(false) }
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBox msg={error} />
      <div>
        <label className="label">Email address</label>
        <input type="email" className="input" placeholder="you@shai.com" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>
      <PasswordField value={password} onChange={setPassword} show={showPw} onToggle={() => setShowPw(v => !v)} />
      <SubmitBtn loading={loading}>Sign In</SubmitBtn>
    </form>
  )
}

function UsernameLogin() {
  const { signInWithUsername } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await signInWithUsername(username, password)
    if (error) { setError(error.message || 'Invalid credentials.'); setLoading(false) }
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBox msg={error} />
      <div>
        <label className="label">Username</label>
        <input type="text" className="input" placeholder="e.g. jdelacruz" value={username}
          onChange={e => setUsername(e.target.value)} required autoComplete="username" />
      </div>
      <PasswordField value={password} onChange={setPassword} show={showPw} onToggle={() => setShowPw(v => !v)} />
      <SubmitBtn loading={loading}>Sign In</SubmitBtn>
    </form>
  )
}

function FaceLogin() {
  const { signInWithFaceToken } = useAuth()
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const trackerRef = useRef(new LivenessTracker())
  const rafRef    = useRef(null)
  const scanningRef = useRef(false)

  const [phase, setPhase]     = useState('loading')
  const [modelMsg, setMsg]    = useState('Initializing...')
  const [liveness, setLive]   = useState(null)
  const [matched, setMatched] = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => { init(); return () => cleanup() }, [])

  async function cleanup() {
    scanningRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  async function init() {
    setPhase('loading'); setMsg('Loading AI models...')
    const ok = await loadFaceModels(setMsg)
    if (!ok) { setError('Failed to load models.'); setPhase('failed'); return }

    setMsg('Loading enrolled faces...')
    const { data, error: dbErr } = await supabase
      .from('face_enrollments')
      .select('user_id, descriptors, profiles:user_id(full_name)')
    if (dbErr) { setError('Could not load face data.'); setPhase('failed'); return }
    if (!data?.length) { setPhase('no_enroll'); return }

    const enrolled = data.map(r => ({
      userId: r.user_id,
      label: r.profiles?.full_name || 'Unknown',
      descriptors: r.descriptors,
    }))

    setMsg('Starting camera...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await new Promise(res => { videoRef.current.onloadedmetadata = res })
      await videoRef.current.play()
    } catch {
      setError('Camera access denied. Please allow camera permission and reload.')
      setPhase('failed'); return
    }

    trackerRef.current.reset()
    scanningRef.current = true
    setPhase('scanning')
    scan(enrolled)
  }

  async function scan(enrolled) {
    if (!scanningRef.current) return
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => scan(enrolled)); return
    }

    const det = await detectFace(videoRef.current, { minConfidence: 0.72, minFaceSize: 80 })
    const live = trackerRef.current.processFrame(det?.landmarks)
    setLive(live)
    drawFaceOverlay(canvasRef.current, videoRef.current, det, live?.isLive ? '#10b981' : '#4a5fff')

    if (det && live?.isLive) {
      const result = findBestMatch(det.descriptor, enrolled)
      if (result?.matched) {
        scanningRef.current = false
        cleanup()
        setMatched(result)
        setPhase('matched')
        const { error } = await signInWithFaceToken(result.userId)
        if (error) { setError('Verified but login failed. Use password.'); setPhase('failed') }
        return
      }
    }
    rafRef.current = requestAnimationFrame(() => scan(enrolled))
  }

  function retry() {
    cleanup()
    setError(''); setMatched(null); setLive(null)
    trackerRef.current.reset()
    init()
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/60" style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-slate-300 text-sm">{modelMsg}</p>
          </div>
        )}
        {phase === 'scanning' && liveness && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-xs text-slate-300 mb-1 flex justify-between">
              <span>{liveness.hint}</span>
              <span className="font-mono opacity-60">{liveness.blinkCount}↯</span>
            </div>
            <div className="h-1 rounded-full bg-slate-700">
              <div className="h-1 rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${liveness.progress}%` }} />
            </div>
          </div>
        )}
        {phase === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-44 h-52 rounded-full border-2 border-brand-500/25" />
          </div>
        )}
        {phase === 'matched' && matched && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 gap-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-white font-bold text-lg">Welcome, {matched.label}!</p>
            <p className="text-emerald-300 text-sm">Signing you in...</p>
          </div>
        )}
        {(phase === 'failed' || phase === 'no_enroll') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3 p-4">
            {phase === 'failed' ? <XCircle className="w-10 h-10 text-red-400" /> : <AlertCircle className="w-10 h-10 text-amber-400" />}
            <p className={`text-sm text-center ${phase === 'failed' ? 'text-red-300' : 'text-amber-300'}`}>
              {error || 'No faces enrolled. Ask your admin to enroll your face first.'}
            </p>
            {phase === 'failed' && <button onClick={retry} className="btn-primary text-sm px-6">Retry</button>}
          </div>
        )}
      </div>
      <p className="text-center text-slate-500 text-xs">
        Face your camera · Blink once to confirm liveness · Auto-detects in seconds
      </p>
    </div>
  )
}

export default function LoginPage() {
  const [tab, setTab] = useState('email')
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        <Logo />
        <div className="card p-8">
          <div className="flex rounded-xl bg-slate-800/60 p-1 mb-6 gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === t.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40' : 'text-slate-400 hover:text-slate-200'
                }`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>
          {tab === 'email'    && <EmailLogin />}
          {tab === 'username' && <UsernameLogin />}
          {tab === 'face'     && <FaceLogin />}
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">Contact your administrator if you need access</p>
      </div>
    </div>
  )
}
