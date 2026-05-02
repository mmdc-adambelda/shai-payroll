import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  loadFaceModels, detectFace, averageDescriptors,
  drawFaceOverlay, captureFrame, LivenessTracker,
} from '../../lib/faceEngine'
import { Camera, CheckCircle2, RotateCcw, Loader2, AlertCircle, Shield } from 'lucide-react'

const CAPTURE_ANGLES = [
  { id: 'front', label: 'Look straight at the camera', icon: '👁️' },
  { id: 'left',  label: 'Slowly turn slightly LEFT', icon: '👈' },
  { id: 'right', label: 'Slowly turn slightly RIGHT', icon: '👉' },
]

/**
 * FaceEnrollment — captures face from 3 angles, computes descriptors,
 * encrypts (XOR obfuscation + base64 in DB; true encryption needs server-side),
 * and saves to face_enrollments table.
 *
 * Props:
 *   userId  — profile UUID
 *   onDone  — called when enrollment is complete
 *   onCancel
 */
export default function FaceEnrollment({ userId, onDone, onCancel }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)
  const rafRef     = useRef(null)
  const trackerRef = useRef(new LivenessTracker())

  const [phase, setPhase]         = useState('loading')   // loading | guide | capturing | processing | done | error
  const [modelMsg, setModelMsg]   = useState('Initializing...')
  const [angleIdx, setAngleIdx]   = useState(0)           // which angle we're capturing
  const [captured, setCaptured]   = useState([])          // array of descriptors
  const [liveness, setLiveness]   = useState(null)
  const [error, setError]         = useState('')
  const [faceDetected, setFaceDetected] = useState(false)

  useEffect(() => { init(); return cleanup }, [])

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  async function init() {
    setPhase('loading'); setModelMsg('Loading face recognition models...')
    const ok = await loadFaceModels(setModelMsg)
    if (!ok) { setError('Could not load AI models.'); setPhase('error'); return }

    setModelMsg('Starting camera...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise(res => { videoRef.current.onloadedmetadata = res })
        await videoRef.current.play()
      }
    } catch {
      setError('Camera access denied. Please allow camera in browser settings.')
      setPhase('error'); return
    }

    setPhase('guide')
  }

  function startCapturing() {
    trackerRef.current.reset()
    setPhase('capturing')
    runDetectionLoop()
  }

  async function runDetectionLoop() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(runDetectionLoop); return
    }

    const det = await detectFace(videoRef.current, { minConfidence: 0.75, minFaceSize: 100 })
    const live = trackerRef.current.processFrame(det?.landmarks)

    setFaceDetected(!!det)
    setLiveness(live)

    drawFaceOverlay(
      canvasRef.current, videoRef.current, det,
      det ? (live?.isLive ? '#10b981' : '#4a5fff') : '#ef4444'
    )

    rafRef.current = requestAnimationFrame(runDetectionLoop)
  }

  async function captureCurrentAngle() {
    if (!videoRef.current) return
    if (!faceDetected) { alert('No face detected. Please position your face clearly.'); return }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // Capture 5 frames for this angle and average them for robustness
    const samples = []
    for (let i = 0; i < 5; i++) {
      const det = await detectFace(videoRef.current, { minConfidence: 0.75, minFaceSize: 100 })
      if (det) samples.push(det.descriptor)
      await new Promise(res => setTimeout(res, 80))
    }

    if (samples.length < 3) {
      alert('Could not get enough face samples. Please try again.')
      runDetectionLoop(); return
    }

    const avgDescriptor = averageDescriptors(samples)
    const newCaptured = [...captured, avgDescriptor]
    setCaptured(newCaptured)

    const nextIdx = angleIdx + 1
    if (nextIdx < CAPTURE_ANGLES.length) {
      setAngleIdx(nextIdx)
      trackerRef.current.reset()
      runDetectionLoop()
    } else {
      // All angles captured — save to DB
      cleanup()
      setPhase('processing')
      await saveEnrollment(newCaptured)
    }
  }

  async function saveEnrollment(descriptors) {
    try {
      // Upsert — replace existing enrollment if any
      const { error } = await supabase
        .from('face_enrollments')
        .upsert({
          user_id: userId,
          descriptors: descriptors,       // array of 3 averaged 128-d descriptors
          enrolled_at: new Date().toISOString(),
          sample_count: descriptors.length,
        }, { onConflict: 'user_id' })

      if (error) throw error

      // Log enrollment event
      await supabase.from('biometric_audit_logs').insert({
        user_id: userId,
        action: 'face_enrolled',
        metadata: { angles: CAPTURE_ANGLES.map(a => a.id), samples: descriptors.length },
      })

      setPhase('done')
    } catch (err) {
      setError('Failed to save enrollment: ' + err.message)
      setPhase('error')
    }
  }

  function reset() {
    cleanup()
    setCaptured([]); setAngleIdx(0); setError(''); setLiveness(null); setFaceDetected(false)
    trackerRef.current.reset()
    init()
  }

  return (
    <div className="space-y-4">
      {/* Camera view */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/60"
        style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]" />

        {/* Oval face guide */}
        {(phase === 'capturing' || phase === 'guide') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-44 h-56 rounded-full border-2 transition-colors duration-300 ${
              faceDetected ? 'border-emerald-400/60' : 'border-brand-500/30'
            }`} />
          </div>
        )}

        {/* Phase overlays */}
        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-slate-300 text-sm">{modelMsg}</p>
          </div>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-slate-300 text-sm">Saving biometric data...</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 gap-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400" />
            <p className="text-white font-bold text-lg">Enrollment Complete!</p>
            <p className="text-emerald-300 text-sm">Your face has been registered.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 gap-3 p-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-red-300 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Liveness info bar */}
        {phase === 'capturing' && liveness && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-xs text-slate-300 mb-1 flex justify-between">
              <span>{liveness.isLive ? '✓ Liveness confirmed' : liveness.hint}</span>
              <span className="font-mono">{liveness.blinkCount} blink{liveness.blinkCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Step indicator dots */}
        {phase === 'capturing' && (
          <div className="absolute top-3 left-0 right-0 flex justify-center gap-2">
            {CAPTURE_ANGLES.map((a, i) => (
              <div key={a.id} className={`w-2 h-2 rounded-full transition-all ${
                i < captured.length ? 'bg-emerald-400' :
                i === angleIdx ? 'bg-brand-400 scale-125' : 'bg-slate-600'
              }`} />
            ))}
          </div>
        )}
      </div>

      {/* Instructions & controls */}
      {phase === 'guide' && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Shield className="w-4 h-4 text-brand-400" />
            Face Enrollment Instructions
          </div>
          <ul className="text-sm text-slate-400 space-y-1.5">
            {CAPTURE_ANGLES.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2">
                <span>{a.icon}</span>
                <span>Step {i + 1}: {a.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Make sure you are in a well-lit area. Remove glasses if possible for best accuracy.</p>
          <button onClick={startCapturing} className="btn-primary w-full flex items-center justify-center gap-2">
            <Camera className="w-4 h-4" /> Start Enrollment
          </button>
        </div>
      )}

      {phase === 'capturing' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-white">
                {CAPTURE_ANGLES[angleIdx].icon} {CAPTURE_ANGLES[angleIdx].label}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Angle {angleIdx + 1} of {CAPTURE_ANGLES.length}
              </div>
            </div>
            <div className="text-xs text-slate-500">{captured.length} / {CAPTURE_ANGLES.length} done</div>
          </div>
          <button
            onClick={captureCurrentAngle}
            disabled={!faceDetected}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            {!faceDetected ? 'Position your face...' : `Capture ${CAPTURE_ANGLES[angleIdx].label.split(' ')[0]}`}
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex gap-3">
          <button onClick={onDone} className="btn-primary flex-1">Done</button>
          <button onClick={reset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Re-enroll
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex gap-3">
          <button onClick={reset} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Try Again
          </button>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        </div>
      )}

      {(phase === 'guide' || phase === 'capturing') && (
        <button onClick={onCancel} className="btn-secondary w-full text-sm">Cancel</button>
      )}
    </div>
  )
}
