# S.H.A.I. — Payroll & Attendance Tracker System

A full-featured, web-based HR system for small teams (10–15 users) built with React + Vite + Supabase, deployable to Vercel.

---

## Features

| Feature | Staff | Manager | Admin |
|---|---|---|---|
| Clock In / Clock Out | ✅ | ✅ | ✅ |
| View own attendance log | ✅ | ✅ | ✅ |
| Submit timesheet per cut-off | ✅ | ✅ | ✅ |
| File leave requests | ✅ | ✅ | ✅ |
| Log overtime hours | ✅ | ✅ | ✅ |
| View team attendance | ❌ | ✅ (dept) | ✅ (all) |
| Approve timesheets | ❌ | ✅ | ✅ |
| Approve leave & OT | ❌ | ✅ | ✅ |
| Process payroll | ❌ | ✅ | ✅ |
| Generate payslips | ❌ | ✅ | ✅ |
| Manage employees | ❌ | ❌ | ✅ |

---

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Backend / DB**: Supabase (Auth + PostgreSQL + RLS)
- **Routing**: React Router v6
- **Deployment**: Vercel

---

## Setup Guide

### Step 1 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project (choose the Singapore region for PH users — closest)
3. Wait for the project to finish provisioning (~2 min)

### Step 2 — Run the Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste the entire contents of `supabase_schema.sql` (included in this repo)
4. Click **Run** — you should see "Success" with no errors

### Step 3 — Create User Accounts

**Do NOT use the app registration flow** — you as admin create all accounts.

1. In Supabase, go to **Authentication → Users**
2. Click **Add User** → **Create New User**
3. Enter the employee's email and a temporary password
4. Copy the UUID shown for that user

After creating each user, run this in the SQL Editor to set their details:

```sql
update public.profiles
set
  full_name   = 'Juan dela Cruz',
  role        = 'staff',            -- 'staff', 'manager', or 'super_admin'
  department  = 'Maintenance Team', -- or 'Admin Office Team'
  employee_id = 'SHAI-001',
  position    = 'Technician',
  daily_rate  = 610.00
where id = 'paste-uuid-here';
```

Roles available:
- `super_admin` — Overall System Administrator
- `manager` — Department Manager
- `staff` — Agent / Staff level

### Step 4 — Get Supabase Credentials

1. Go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public key** (the long `eyJ...` string)

### Step 5 — Configure Environment Variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

> ⚠️ Never commit this file. It's already in `.gitignore`.

### Step 6 — Run Locally (optional test)

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment to Vercel (Recommended)

### Option A — Deploy via Vercel CLI

```bash
npm install -g vercel
vercel
```

Follow the prompts, then add env vars when asked (or add them in the Vercel dashboard).

### Option B — Deploy via GitHub + Vercel Dashboard

1. Push this repo to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/shai-tracker.git
   git push -u origin main
   ```

2. Go to [https://vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. Framework: **Vite** (auto-detected)
5. Add Environment Variables:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
6. Click **Deploy**

Your app will be live at `https://shai-tracker.vercel.app` (or your custom domain).

### Why NOT GitHub Pages?

GitHub Pages serves only static files with no environment variable support — your Supabase keys would have to be hardcoded (insecure) or the build would fail. Vercel handles `.env` secrets properly and supports React Router's client-side routing via `vercel.json`.

---

## Usage Guide

### For Staff
1. **Log in** with credentials provided by the admin
2. **Clock In** from the Dashboard when you arrive
3. **Clock Out** before you leave — hours are auto-calculated
4. At each cut-off (15th and end of month), go to **Timesheet** and click **Submit Timesheet**
5. File **Leave Requests** or **Overtime** from their respective pages

### For Managers
- All staff features, plus:
- **Attendance**: toggle "All Team" to see department records
- **Timesheet**: pending submissions appear for approval
- **Leave / Overtime**: approve or reject with a reason
- **Payroll**: process approved timesheets, set rates, generate payslips

### For Super Admin
- All manager features, plus:
- **Admin Panel**: edit any employee's details, role, department, daily rate
- Can manage all departments, not just one

---

## Payroll Computation

The system computes per cut-off period:

```
Basic Pay       = Daily Rate × Days Present
Overtime Pay    = (Daily Rate ÷ 8) × 1.25 × Approved OT Hours
Gross Pay       = Basic Pay + Overtime Pay + Allowances
Total Deductions = SSS + PhilHealth + Pag-IBIG + Tax + Other
Net Pay         = Gross Pay − Total Deductions
```

Deduction amounts are entered manually per payroll run (no hardcoded tables, so you can adjust for actual contribution brackets). Payslips are generated as printable HTML and auto-open the print dialog.

---

## Cutoff Schedule

| Cut-off | Period | Coverage |
|---|---|---|
| 1st Cut-off | 1st–15th | Days 1–15 of the month |
| 2nd Cut-off | 16th–End | Days 16–30/31 of the month |

---

## File Structure

```
shai-tracker/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── layout/
│   │       └── DashboardLayout.jsx   # Sidebar + nav
│   ├── hooks/
│   │   └── useAuth.jsx               # Auth context
│   ├── lib/
│   │   └── supabase.js               # Supabase client + constants
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── Dashboard.jsx             # Home with clock-in widget
│   │   ├── AttendancePage.jsx        # Attendance log
│   │   ├── TimesheetPage.jsx         # Timesheet + approval
│   │   ├── LeavePage.jsx             # Leave requests
│   │   ├── OvertimePage.jsx          # OT requests
│   │   ├── PayrollPage.jsx           # Payroll + payslips
│   │   └── AdminPage.jsx             # User management
│   ├── App.jsx                       # Routes + auth guards
│   ├── main.jsx
│   └── index.css                     # Tailwind + custom styles
├── supabase_schema.sql               # Run this in Supabase first
├── vercel.json                       # SPA routing config
├── .env.example                      # Copy to .env and fill in
├── tailwind.config.js
├── vite.config.js
└── package.json
```

---

## Security Notes

- All data access is protected by **Row Level Security (RLS)** at the database level — even if someone gets the anon key, they can only access data their role permits
- Staff can only see their own records
- Managers see their department only
- Supabase anon key is safe to expose in frontend (it's designed for that) — RLS is the real security layer
- Never expose the `service_role` key in frontend code

---

## Support

For issues or feature requests, contact your system administrator or open a GitHub issue.
