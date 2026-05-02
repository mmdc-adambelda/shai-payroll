import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  loadFaceModels, detectFace, findBestMatch,
  LivenessTracker, drawFaceOverlay, MATCH_THRESHOLD,
} from '../../lib/faceEngine'
import { format } from 'date-fns'
import { Scan, CheckCircle2, XCircle, Loader2, Clock, LogIn, LogOut } from 'lucide-react'

/**
 * FaceClockIn — standalone face clock-in/out panel.
 * Can be embedded in the attendance page or used as a full-screen kiosk.
 *
 * Props:
 *   onSuccess(record) — called after successful clock action
 *   compact           — smaller layout for embedding
 */
export default function FaceClockIn({ onSuccess, compact = false }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)
  const rafRef     = useRef(null)
  const trackerRef = useRef(new LivenessTracker())
  const scanningRef = useRef(false)

  const [phase, setPhase]     = useState('idle')   // idle|loading|scanning|matched|action|success|failed
  const [modelMsg, setMsg]    = useState('')
  const [liveness, setLive]   = useState(null)
  const [faceDetected, setFD] = useState(false)
  const [result, setResult]   = useState(null)     // { matchedUser, action, record }
  const [error, setError]     = useState('')
  const [enrolled, setEnrolled] = useState(null)

  useEffect(() => { return cleanup }, [])

  function cleanup() {
    scanningRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  async function startScan() {
    setPhase('loading'); setMsg('Loading AI models...'); setError('')

    const ok = await loadFaceModels(setMsg)
    if (!ok) { setError('Failed to load models.'); setPhase('failed'); return }

    setMsg('Loading employee faces...')
    const { data, error: dbErr } = await supabase
      .from('face_enrollments')
      .select('user_id, descriptors, profiles:user_id(full_name, employee_id, department)')
    if (dbErr || !data?.length) {
      setError(dbErr ? 'DB error loading faces.' : 'No enrolled employees found.')
      setPhase('failed'); return
    }

    const enrolledList = data.map(r => ({
      userId: r.user_id,
      label: r.profiles?.full_name || 'Unknown',
      employeeId: r.profiles?.employee_id,
      department: r.profiles?.department,
      descriptors: r.descriptors,
    }))
    setEnrolled(enrolledList)

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
      setError('Camera access denied.'); setPhase('failed'); return
    }

    trackerRef.current.reset()
    scanningRef.current = true
    setPhase('scanning')
    scanLoop(enrolledList)
  }

  async function scanLoop(enrolledList) {
    if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => scanLoop(enrolledList)); return
    }

    const det = await detectFace(videoRef.current, { minConfidence: 0.72, minFaceSize: 80 })
    const live = trackerRef.current.processFrame(det?.landmarks)
    setFD(!!det)
    setLive(live)
    drawFaceOverlay(canvasRef.current, videoRef.current, det,
      det ? (live?.isLive ? '#10b981' : '#4a5fff') : '#64748b')

    if (det && live?.isLive) {
      const match = findBestMatch(det.descriptor, enrolledList)
      if (match?.matched) {
        scanningRef.current = false
        cleanup()
        setPhase('action')
        await processClockAction(match, enrolledList)
        return
      }
    }
    rafRef.current = requestAnimationFrame(() => scanLoop(enrolledList))
  }

  async function processClockAction(match, enrolledList) {
    const matchedEmployee = enrolledList.find(e => e.userId === match.userId)
    const today = format(new Date(), 'yyyy-MM-dd')

    // Check today's record
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', match.userId)
      .eq('date', today)
      .single()

    const now = new Date()
    let action, record, dbError

    // Define shift start (configurable — default 8:00 AM)
    const shiftStart = new Date(now)
    shiftStart.setHours(8, 0, 0, 0)
    const isLate = now > shiftStart && !existing?.clock_in
    const minutesLate = isLate ? Math.floor((now - shiftStart) / 60000) : 0

    if (!existing?.clock_in) {
      // CLOCK IN
      action = 'clock_in'
      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          user_id: match.userId,
          date: today,
          clock_in: now.toISOString(),
          status: 'present',
          clock_in_method: 'face',
          is_late: isLate,
          minutes_late: minutesLate,
        })
        .select()
        .single()
      record = data; dbError = error
    } else if (!existing.clock_out) {
      // CLOCK OUT
      action = 'clock_out'
      const clockIn = new Date(existing.clock_in)
      const rawHours = (now - clockIn) / 3600000
      const hours = rawHours >= 5 ? rawHours - 1 : rawHours  // 1h lunch deduction

      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          clock_out: now.toISOString(),
          hours_worked: parseFloat(hours.toFixed(2)),
          clock_out_method: 'face',
        })
        .eq('id', existing.id)
        .select()
        .single()
      record = data; dbError = error
    } else {
      // Already clocked out today
      setResult({ matchedEmployee, action: 'already_done', existing })
      setPhase('success')
      return
    }

    // Log biometric event
    await supabase.from('biometric_audit_logs').insert({
      user_id: match.userId,
      action: action === 'clock_in' ? 'face_clock_in' : 'face_clock_out',
      metadata: {
        confidence: (1 - match.distance).toFixed(3),
        distance: match.distance.toFixed(3),
        is_late: isLate,
        minutes_late: minutesLate,
      },
    })

    if (dbError) { setError('Clock action failed: ' + dbError.message); setPhase('failed'); return }

    setResult({ matchedEmployee, action, record, isLate, minutesLate })
    setPhase('success')
    onSuccess?.({ matchedEmployee, action, record })
  }

  function reset() {
    cleanup()
    setPhase('idle'); setError(''); setResult(null); setLive(null); setFD(false)
    trackerRef.current.reset()
  }

  const h = compact ? '56' : '72'

  return (
    <div className="space-y-4">
      {/* Camera window */}
      <div className={`relative rounded-2xl overflow-hidden bg-slate-900/80 border border-slate-700/60 ${compact ? '' : ''}`}
        style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]" />

        {/* Face oval guide */}
        {phase === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-44 h-52 rounded-full border-2 transition-colors duration-300 ${
              faceDetected ? 'border-emerald-400/50' : 'border-slate-500/30'
            }`} />
          </div>
        )}

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-900/50 border border-brand-600/40 flex items-center justify-center">
              <Scan className="w-8 h-8 text-brand-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Face Recognition</p>
              <p className="text-slate-400 text-sm mt-0.5">Clock In / Clock Out</p>
            </div>
            <button onClick={startScan} className="btn-primary px-6 flex items-center gap-2">
              <Scan className="w-4 h-4" /> Start Scan
            </button>
          </div>
        )}

        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-slate-300 text-sm">{modelMsg}</p>
          </div>
        )}

        {phase === 'action' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-950/80 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-slate-300 text-sm">Processing attendance...</p>
          </div>
        )}

        {phase === 'success' && result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 gap-3 p-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-400" />
            <div className="text-center">
              <p className="text-white font-bold text-lg">{result.matchedEmployee?.label}</p>
              <div className={`flex items-center justify-center gap-1.5 mt-1 text-sm font-medium ${
                result.action === 'clock_in' ? 'text-emerald-300' : 'text-blue-300'
              }`}>
                {result.action === 'clock_in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                {result.action === 'clock_in' ? 'Clocked In' :
                 result.action === 'clock_out' ? 'Clocked Out' : 'Already Completed'}
              </div>
              <p className="text-slate-300 text-xs mt-1 font-mono">
                {format(new Date(), 'HH:mm:ss · MMM d, yyyy')}
              </p>
              {result.isLate && result.minutesLate > 0 && (
                <p className="text-amber-400 text-xs mt-1">⚠ {result.minutesLate} min late</p>
              )}
              {result.action === 'clock_out' && result.record?.hours_worked && (
                <p className="text-slate-400 text-xs mt-0.5">
                  {result.record.hours_worked}h worked today
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 gap-3 p-4">
            <XCircle className="w-10 h-10 text-red-400" />
            <p className="text-red-300 text-sm text-center">{error || 'Recognition failed. Please try again.'}</p>
          </div>
        )}

        {/* Live scanning feedback bar */}
        {phase === 'scanning' && liveness && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-xs text-slate-300 mb-1 flex justify-between">
              <span>
                {!faceDetected ? 'Position your face in frame...' :
                 !liveness.isLive ? liveness.hint : '✓ Liveness OK · Matching...'}
              </span>
              <span className="font-mono opacity-50">{liveness.blinkCount}↯</span>
            </div>
            <div className="h-1 rounded-full bg-slate-700">
              <div className="h-1 rounded-full bg-brand-500 transition-all duration-200"
                style={{ width: `${liveness.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(phase === 'success' || phase === 'failed') && (
        <button onClick={reset} className="btn-secondary w-full flex items-center justify-center gap-2">
          <Scan className="w-4 h-4" />
          {phase === 'success' ? 'Scan Another' : 'Try Again'}
        </button>
      )}

      {phase === 'scanning' && (
        <button onClick={reset} className="btn-secondary w-full text-sm">Cancel</button>
      )}

      {phase === 'idle' && (
        <p className="text-center text-slate-500 text-xs">
          Blink once when your face is detected to confirm liveness
        </p>
      )}
    </div>
  )
}
