# S.H.A.I. v2.0 — Payroll & Attendance System
### Now with Face Recognition, Username Login & Self-Service Payslips

## What's New in v2.0

| Feature | Description |
|---|---|
| 🔐 Face Recognition Login | Log in by showing your face — no password needed |
| 👤 Username Login | Sign in with a short username instead of email |
| 📸 Face Clock-In / Out | Biometric attendance with liveness detection |
| 🛡️ Anti-Spoofing | Blink detection — rejects printed photos |
| 💳 My Payslips | Every employee views and prints their own payslips |
| 📋 Face Enrollment Admin | Admin tab to enroll 3-angle face per employee |
| 🔍 Audit Trail | Full biometric event log per employee |

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Download AI model weights (REQUIRED for face recognition)
```bash
bash scripts/download-models.sh
```
Downloads ~6MB of TensorFlow.js model files into public/models/. Served statically — no API calls at runtime.

### 3. Run Supabase schemas
In your Supabase SQL Editor, run in order:
1. supabase_schema.sql (original — skip if already done)
2. supabase_schema_v2.sql (v2 additions: face tables, username login, RPCs)

### 4. Deploy Edge Function (for face login)
```bash
npm install -g supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy face-login
```

### 5. Configure .env
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_EDGE_URL=https://your-project.supabase.co/functions/v1
```

### 6. Run locally
```bash
npm run dev
```

---

## Setting Up an Employee

### Create account in Supabase Auth
Authentication → Users → Add User → copy the UUID

### Set their profile
```sql
update public.profiles set
  full_name   = 'Juan dela Cruz',
  username    = 'jdelacruz',
  auth_email  = 'juan@shai.com',
  role        = 'staff',
  department  = 'Maintenance Team',
  employee_id = 'SHAI-001',
  daily_rate  = 610.00
where id = 'paste-uuid-here';
```

### Enroll their face
Admin → Admin Panel → Face Enrollment tab → Enroll Face (takes 30 seconds, 3 angles)

---

## Face Recognition Flow

1. Employee opens dashboard or attendance page
2. Camera activates — SSD MobileNet detects face in real time
3. FaceLandmark68Net tracks 68 points for blink/head detection
4. Employee blinks once → liveness confirmed
5. 128-dimensional face descriptor computed and compared to all enrolled faces
6. If distance < 0.45 → match found → clock in or out automatically
7. Event logged to biometric_audit_logs

### Anti-Spoofing
- Blink detection via Eye Aspect Ratio (EAR < 0.22 = closed eye)
- Head movement tracking via nose-to-cheek ratio changes
- Minimum face confidence: 0.72 — rejects blurry or dark frames
- Rate limiting: 5 face login attempts per minute per user

---

## Login Methods (3 options on login page)

| Tab | Method |
|---|---|
| Email | Standard email + password |
| Username | Short username (e.g. jdelacruz) + password |
| Face ID | Camera opens, face matched, auto sign-in |

---

## File Structure (v2 changes)

```
src/
  components/face/
    FaceClockIn.jsx      - attendance face scan widget
    FaceEnrollment.jsx   - admin face enrollment UI
  lib/
    faceEngine.js        - face-api wrapper + liveness tracker
  pages/
    LoginPage.jsx        - UPDATED: 3-tab login
    Dashboard.jsx        - UPDATED: face/manual clock tabs
    AdminPage.jsx        - UPDATED: Face Enrollment tab
    MyPayslipsPage.jsx   - NEW: self-service payslips
  hooks/
    useAuth.jsx          - UPDATED: username + face login
supabase/functions/
  face-login/index.ts    - Edge Function for face sessions
scripts/
  download-models.sh     - downloads AI model weights
supabase_schema_v2.sql   - run after original schema
```

---

## Security Notes

- No face images stored — only 128-d numerical descriptors (non-reversible)
- All DB access protected by Row Level Security
- Face tokens expire in 30 seconds, one-time use only
- Full biometric audit trail in biometric_audit_logs table
- GDPR: inform employees before collecting biometric data; provide opt-out (manual clock always available)

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Failed to load models" | Run bash scripts/download-models.sh |
| "Camera access denied" | Allow camera in browser; must be HTTPS or localhost |
| Face not recognized | Re-enroll in same lighting; check distance < 0.45 threshold |
| Username login fails | Ensure auth_email in profiles matches Supabase Auth email exactly |
| Face login no session | Deploy Edge Function: supabase functions deploy face-login |
