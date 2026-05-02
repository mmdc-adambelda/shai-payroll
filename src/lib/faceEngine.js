/**
 * S.H.A.I. Face Recognition Engine
 * Uses @vladmandic/face-api (TensorFlow.js based, runs 100% in browser)
 * 
 * Architecture:
 *  - SSD MobileNet V1 for face detection (fast, mobile-friendly)
 *  - FaceLandmark68Net for 68-point landmarks (blink, head-pose detection)
 *  - FaceRecognitionNet for 128-d face descriptors
 *  - Anti-spoofing: blink detection + head movement + liveness scoring
 */

let faceapi = null
let modelsLoaded = false

// Model URLs — served from public/models/ (download instructions in README)
const MODEL_URL = '/models'

export async function loadFaceModels(onProgress) {
  if (modelsLoaded) return true

  try {
    // Lazy-load face-api to avoid blocking main bundle
    const fa = await import('@vladmandic/face-api')
    faceapi = fa

    onProgress?.('Loading face detection model...')
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)

    onProgress?.('Loading landmark model...')
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)

    onProgress?.('Loading recognition model...')
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)

    modelsLoaded = true
    onProgress?.('Ready')
    return true
  } catch (err) {
    console.error('Face model load error:', err)
    return false
  }
}

export function isModelsLoaded() {
  return modelsLoaded
}

/**
 * Detect a single face + compute its 128-d descriptor from a video element.
 * Returns null if no face found or face quality too low.
 */
export async function detectFace(videoEl, options = {}) {
  if (!faceapi || !modelsLoaded) throw new Error('Models not loaded')

  const { minConfidence = 0.7, minFaceSize = 80 } = options

  const detection = await faceapi
    .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence }))
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (!detection) return null

  // Reject if face box is too small (poor camera / too far away)
  const box = detection.detection.box
  if (box.width < minFaceSize || box.height < minFaceSize) return null

  return {
    descriptor: Array.from(detection.descriptor), // Float32Array → plain array for JSON storage
    landmarks: detection.landmarks,
    box,
    confidence: detection.detection.score,
  }
}

/**
 * Compare two descriptors. Returns Euclidean distance (lower = more similar).
 * Threshold: < 0.45 = same person (strict), < 0.55 = likely same person
 */
export function compareDescriptors(desc1, desc2) {
  if (!faceapi) throw new Error('Models not loaded')
  const d1 = new Float32Array(desc1)
  const d2 = new Float32Array(desc2)
  return faceapi.euclideanDistance(d1, d2)
}

export const MATCH_THRESHOLD = 0.45  // strict for attendance (production)
export const MATCH_THRESHOLD_LOOSE = 0.52  // for login with face

/**
 * Find best match from a list of labeled descriptors.
 * Returns { label, distance, matched } or null.
 */
export function findBestMatch(descriptor, labeledDescriptors) {
  if (!labeledDescriptors?.length) return null

  let best = { label: null, distance: Infinity }

  for (const entry of labeledDescriptors) {
    // entry.descriptors is an array of multiple sample descriptors (from multi-angle enrollment)
    const samples = entry.descriptors || [entry.descriptor]
    for (const sample of samples) {
      const dist = compareDescriptors(descriptor, sample)
      if (dist < best.distance) {
        best = { label: entry.label, userId: entry.userId, distance: dist }
      }
    }
  }

  return {
    ...best,
    matched: best.distance < MATCH_THRESHOLD,
  }
}

// ─── Anti-Spoofing / Liveness Detection ──────────────────────

/**
 * EAR = Eye Aspect Ratio — standard formula for blink detection.
 * If EAR < threshold, eye is closed (blink happening).
 */
function getEAR(eye) {
  // eye = array of 6 {x,y} points (landmark indices)
  const v1 = dist(eye[1], eye[5])
  const v2 = dist(eye[2], eye[4])
  const h  = dist(eye[0], eye[3])
  return (v1 + v2) / (2.0 * h)
}

function dist(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
}

const EAR_THRESHOLD = 0.22   // below this = blink
const EAR_CONSEC_FRAMES = 2  // frames eye must be closed to count as blink

/**
 * Liveness tracker — maintains state across frames.
 * Call reset() before a new session.
 */
export class LivenessTracker {
  constructor() {
    this.reset()
  }

  reset() {
    this.blinkCount = 0
    this.earFramesBelow = 0
    this.lastHeadYaw = null
    this.headMovements = []
    this.frameCount = 0
    this.brightnessOk = true
    this.isLive = false
    this.requiredBlinks = 1
    this.requiredHeadMoves = 1
  }

  /**
   * Process one frame's landmarks. Returns liveness state.
   */
  processFrame(landmarks) {
    if (!landmarks) return this._state()

    this.frameCount++
    const pts = landmarks.positions // array of 68 {x,y} points

    // ── Blink detection ──
    // Left eye: indices 36–41, Right eye: 42–47
    const leftEye  = pts.slice(36, 42)
    const rightEye = pts.slice(42, 48)
    const avgEAR = (getEAR(leftEye) + getEAR(rightEye)) / 2

    if (avgEAR < EAR_THRESHOLD) {
      this.earFramesBelow++
    } else {
      if (this.earFramesBelow >= EAR_CONSEC_FRAMES) {
        this.blinkCount++
      }
      this.earFramesBelow = 0
    }

    // ── Head yaw (left-right movement) ──
    // Nose tip = pt[30], left cheek ≈ pt[0], right cheek ≈ pt[16]
    const nose  = pts[30]
    const leftC = pts[0]
    const rightC = pts[16]
    const faceWidth = rightC.x - leftC.x
    if (faceWidth > 0) {
      const yaw = (nose.x - leftC.x) / faceWidth  // 0=turned left, 0.5=center, 1=turned right
      if (this.lastHeadYaw !== null) {
        const diff = Math.abs(yaw - this.lastHeadYaw)
        if (diff > 0.08) {  // significant movement
          this.headMovements.push({ yaw, time: Date.now() })
          // Keep last 20 movements only
          if (this.headMovements.length > 20) this.headMovements.shift()
        }
      }
      this.lastHeadYaw = yaw
    }

    // ── Brightness check via face region ──
    // We can't easily check pixel brightness here — done in the component level

    // ── Determine liveness ──
    const hasEnoughBlinks = this.blinkCount >= this.requiredBlinks
    const hasEnoughMoves  = this.headMovements.length >= this.requiredHeadMoves * 3

    this.isLive = hasEnoughBlinks || hasEnoughMoves

    return this._state()
  }

  _state() {
    return {
      isLive: this.isLive,
      blinkCount: this.blinkCount,
      headMovements: this.headMovements.length,
      requiredBlinks: this.requiredBlinks,
      frameCount: this.frameCount,
      hint: this._hint(),
      progress: this._progress(),
    }
  }

  _hint() {
    if (this.blinkCount < this.requiredBlinks && this.headMovements.length < 3) {
      return 'Please blink naturally or slowly move your head'
    }
    if (this.blinkCount < this.requiredBlinks) return 'Please blink once'
    return 'Liveness verified ✓'
  }

  _progress() {
    const blinkScore = Math.min(this.blinkCount / this.requiredBlinks, 1)
    const moveScore  = Math.min(this.headMovements.length / (this.requiredHeadMoves * 3), 1)
    return Math.max(blinkScore, moveScore) * 100
  }
}

/**
 * Draw face detection overlay on a canvas element.
 */
export function drawFaceOverlay(canvas, videoEl, detection, color = '#4a5fff') {
  if (!faceapi || !canvas || !videoEl) return

  const ctx = canvas.getContext('2d')
  canvas.width  = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!detection) return

  const { box, confidence } = detection

  // Draw face box
  ctx.strokeStyle = color
  ctx.lineWidth   = 2
  ctx.strokeRect(box.x, box.y, box.width, box.height)

  // Corner decorations
  const cs = 16 // corner size
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  // TL
  ctx.beginPath(); ctx.moveTo(box.x, box.y + cs); ctx.lineTo(box.x, box.y); ctx.lineTo(box.x + cs, box.y); ctx.stroke()
  // TR
  ctx.beginPath(); ctx.moveTo(box.x + box.width - cs, box.y); ctx.lineTo(box.x + box.width, box.y); ctx.lineTo(box.x + box.width, box.y + cs); ctx.stroke()
  // BL
  ctx.beginPath(); ctx.moveTo(box.x, box.y + box.height - cs); ctx.lineTo(box.x, box.y + box.height); ctx.lineTo(box.x + cs, box.y + box.height); ctx.stroke()
  // BR
  ctx.beginPath(); ctx.moveTo(box.x + box.width - cs, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height - cs); ctx.stroke()

  // Confidence label
  ctx.fillStyle = color
  ctx.font = '11px monospace'
  ctx.fillText(`${(confidence * 100).toFixed(0)}%`, box.x, box.y - 5)
}

/**
 * Capture a frame from a video element as a base64 PNG.
 */
export function captureFrame(videoEl, quality = 0.85) {
  const canvas = document.createElement('canvas')
  canvas.width  = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Average multiple descriptors into one (for enrollment with multiple angles).
 */
export function averageDescriptors(descriptors) {
  if (!descriptors?.length) return null
  const len = descriptors[0].length
  const avg = new Array(len).fill(0)
  for (const desc of descriptors) {
    for (let i = 0; i < len; i++) avg[i] += desc[i]
  }
  return avg.map(v => v / descriptors.length)
}
