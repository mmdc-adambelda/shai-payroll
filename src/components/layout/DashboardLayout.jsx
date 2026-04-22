import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROLES } from '../../lib/supabase'
import {
  LayoutDashboard, Clock, FileText, Calendar, Timer, DollarSign,
  Settings, LogOut, Menu, X, ChevronRight, KeyRound, Eye, EyeOff,
} from 'lucide-react'

const navItems = [
  { to: '/',           label: 'Dashboard',      icon: LayoutDashboard, exact: true,              roles: 'all' },
  { to: '/attendance', label: 'Attendance',      icon: Clock,                                     roles: 'all' },
  { to: '/timesheet',  label: 'Timesheet',       icon: FileText,                                  roles: 'all' },
  { to: '/leave',      label: 'Leave Requests',  icon: Calendar,                                  roles: 'all' },
  { to: '/overtime',   label: 'Overtime',        icon: Timer,                                     roles: 'all' },
  { to: '/payroll',    label: 'Payroll',         icon: DollarSign, roles: [ROLES.SUPER_ADMIN, ROLES.MANAGER] },
  { to: '/admin',      label: 'Admin',           icon: Settings,   roles: [ROLES.SUPER_ADMIN] },
]

function RoleBadge({ role }) {
  const map = {
    [ROLES.SUPER_ADMIN]: { label: 'Admin',   class: 'bg-brand-900/60 text-brand-300 border-brand-700/40' },
    [ROLES.MANAGER]:     { label: 'Manager', class: 'bg-purple-900/60 text-purple-300 border-purple-700/40' },
    [ROLES.STAFF]:       { label: 'Staff',   class: 'bg-slate-800 text-slate-400 border-slate-700/40' },
  }
  const r = map[role] || map[ROLES.STAFF]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${r.class}`}>
      {r.label}
    </span>
  )
}

// ─── Change Password Modal ──────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth()
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [show, setShow] = useState({ current: false, newPass: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  function toggleShow(field) {
    setShow(s => ({ ...s, [field]: !s[field] }))
  }

  function strength(pw) {
    if (!pw) return { score: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8)              score++
    if (/[A-Z]/.test(pw))            score++
    if (/[0-9]/.test(pw))            score++
    if (/[^A-Za-z0-9]/.test(pw))     score++
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
    const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500']
    return { score, label: labels[score], color: colors[score] }
  }

  const pw = strength(form.newPass)

  async function handleSubmit() {
    setError('')
    if (!form.newPass) { setError('New password is required.'); return }
    if (form.newPass.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (form.newPass !== form.confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error: err } = await changePassword(form.newPass)
    setLoading(false)

    if (err) {
      setError(err.message || 'Failed to change password. Please try again.')
    } else {
      setSuccess(true)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-bold text-white">Change Password</h3>
            <p className="text-xs text-slate-400 mt-0.5">Choose a strong new password</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-900/30 border border-emerald-700/40 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Password changed!</p>
            <p className="text-slate-400 text-sm mb-5">Your new password is active. Use it next time you sign in.</p>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          /* Form */
          <div className="space-y-4">

            {/* New password */}
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  type={show.newPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Enter new password"
                  value={form.newPass}
                  onChange={e => setForm({ ...form, newPass: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => toggleShow('newPass')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {show.newPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength meter */}
              {form.newPass && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${i <= pw.score ? pw.color : 'bg-slate-800'}`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${pw.score <= 1 ? 'text-red-400' : pw.score === 2 ? 'text-amber-400' : pw.score === 3 ? 'text-brand-400' : 'text-emerald-400'}`}>
                    {pw.label} password
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="label">Confirm New Password</label>
              <div className="relative">
                <input
                  type={show.confirm ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Re-enter new password"
                  value={form.confirm}
                  onChange={e => setForm({ ...form, confirm: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => toggleShow('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {show.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {form.confirm && (
                <p className={`text-xs mt-1 ${form.newPass === form.confirm ? 'text-emerald-400' : 'text-red-400'}`}>
                  {form.newPass === form.confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            {/* Requirements hint */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-xs text-slate-500 space-y-1">
              {[
                { text: 'At least 6 characters',         met: form.newPass.length >= 6 },
                { text: 'At least one uppercase letter', met: /[A-Z]/.test(form.newPass) },
                { text: 'At least one number',           met: /[0-9]/.test(form.newPass) },
                { text: 'At least one special character',met: /[^A-Za-z0-9]/.test(form.newPass) },
              ].map(req => (
                <div key={req.text} className={`flex items-center gap-2 ${req.met ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span>{req.met ? '✓' : '○'}</span>
                  <span>{req.text}</span>
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-800/30 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading || !form.newPass || !form.confirm}
                className="btn-primary flex-1"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Layout ─────────────────────────────────────────────────
export default function DashboardLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const visibleNav = navItems.filter(item =>
    item.roles === 'all' || (profile && item.roles.includes(profile.role))
  )

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 32 32" className="w-5 h-5 fill-brand-400" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4a10 10 0 110 20A10 10 0 0116 6zm-1 4v7.414l4.293 4.293 1.414-1.414L17 16.586V10h-2z"/>
            </svg>
          </div>
          <div>
            <div className="font-display text-base font-bold text-white leading-none">S.H.A.I.</div>
            <div className="text-slate-500 text-[10px] leading-none mt-0.5">Payroll & Attendance</div>
          </div>
        </div>
      </div>

      {/* User profile section */}
      <div className="px-4 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{profile?.full_name || 'Loading...'}</div>
            <RoleBadge role={profile?.role} />
          </div>
          {/* Change password button */}
          <button
            onClick={() => { setSidebarOpen(false); setShowChangePassword(true) }}
            title="Change password"
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-brand-400 transition-all flex-shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {item.label}
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: change password + sign out */}
      <div className="px-3 py-3 border-t border-slate-800/60 space-y-0.5">
        <button
          onClick={() => { setSidebarOpen(false); setShowChangePassword(true) }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-brand-400 hover:bg-brand-900/10 transition-all w-full"
        >
          <KeyRound className="w-4 h-4" />
          Change Password
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-900/10 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-950/80 border-r border-slate-800/60 fixed top-0 left-0 h-full z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800/60 flex flex-col z-50">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
              <span className="font-display font-bold text-white">S.H.A.I.</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold text-white">S.H.A.I.</span>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Change Password Modal — rendered outside sidebar so it overlays everything */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  )
}
