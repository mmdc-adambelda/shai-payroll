import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase, ROLES } from '../../lib/supabase'
import {
  LayoutDashboard, Clock, FileText, Calendar, Timer, DollarSign,
  Settings, LogOut, Menu, X, ChevronRight, KeyRound, Eye, EyeOff,
  CreditCard, Scan, CalendarDays,
} from 'lucide-react'

const navItems = [
  { to: '/',          label: 'Dashboard',     icon: LayoutDashboard, exact: true,              roles: 'all' },
  { to: '/attendance', label: 'Attendance',   icon: Clock,                                      roles: 'all' },
  { to: '/timesheet',  label: 'Timesheet',    icon: FileText,                                   roles: 'all' },
  { to: '/leave',      label: 'Leave',        icon: Calendar,                                   roles: 'all' },
  { to: '/overtime',   label: 'Overtime',     icon: Timer,                                      roles: 'all' },
  { to: '/payslips',   label: 'My Payslips',  icon: CreditCard,                                 roles: 'all' },
  { to: '/payroll',    label: 'Payroll',      icon: DollarSign,  roles: [ROLES.SUPER_ADMIN, ROLES.MANAGER] },
  { to: '/holidays',   label: 'Holidays',     icon: CalendarDays,roles: [ROLES.SUPER_ADMIN] },
  { to: '/admin',      label: 'Admin',        icon: Settings,    roles: [ROLES.SUPER_ADMIN] },
]

function RoleBadge({ role }) {
  const map = {
    [ROLES.SUPER_ADMIN]: { label: 'Admin',   cls: 'bg-brand-900/60 text-brand-300 border-brand-700/40' },
    [ROLES.MANAGER]:     { label: 'Manager', cls: 'bg-purple-900/60 text-purple-300 border-purple-700/40' },
    [ROLES.STAFF]:       { label: 'Staff',   cls: 'bg-slate-800 text-slate-400 border-slate-700/40' },
  }
  const r = map[role] || map[ROLES.STAFF]
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${r.cls}`}>{r.label}</span>
}

function ChangePasswordModal({ onClose, forceChange = false }) {
  const { changePassword, fetchProfile, user } = useAuth()
  const [form, setForm]     = useState({ current: '', newPass: '', confirm: '' })
  const [show, setShow]     = useState({ current: false, newPass: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  function strength(pw) {
    if (!pw) return { score: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    return {
      score,
      label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score],
      color: ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500'][score],
    }
  }

  const pw = strength(form.newPass)

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if (form.newPass !== form.confirm) { setError('Passwords do not match.'); return }
    if (pw.score < 2) { setError('Password is too weak.'); return }
    setLoading(true)
    const { error } = await changePassword(form.newPass)
    if (error) { setError(error.message); setLoading(false); return }

    // Clear force_password_change flag if set
    if (user) {
      await supabase.from('profiles')
        .update({ force_password_change: false })
        .eq('id', user.id)
      await fetchProfile(user.id)
    }
    setLoading(false)
    setSuccess(true)
  }

  if (success) return (
    <ModalWrap onClose={forceChange ? null : onClose}>
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full bg-emerald-900/40 border border-emerald-700/40 flex items-center justify-center mx-auto mb-3">
          <KeyRound className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-white font-medium">Password updated!</p>
        <button onClick={onClose} className="btn-primary mt-4 px-8">Continue</button>
      </div>
    </ModalWrap>
  )

  return (
    <ModalWrap onClose={forceChange ? null : onClose}>
      <h3 className="font-display font-bold text-white mb-1">
        {forceChange ? 'Set New Password' : 'Change Password'}
      </h3>
      {forceChange && (
        <div className="mb-4 p-3 rounded-xl bg-amber-900/20 border border-amber-800/30 text-amber-300 text-xs">
          Your password has been reset by an administrator. Please set a new password to continue.
        </div>
      )}
      {error && <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-800/40 text-red-300 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { key: 'current', label: forceChange ? 'Temporary Password' : 'Current Password' },
          { key: 'newPass', label: 'New Password' },
          { key: 'confirm', label: 'Confirm New Password' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="label">{label}</label>
            <div className="relative">
              <input type={show[key] ? 'text' : 'password'} className="input pr-10"
                value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required />
              <button type="button" onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {key === 'newPass' && form.newPass && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pw.score ? pw.color : 'bg-slate-700'}`} />
                  ))}
                </div>
                <span className="text-xs text-slate-400">{pw.label}</span>
              </div>
            )}
          </div>
        ))}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </ModalWrap>
  )
}

function ModalWrap({ onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">
        <div className="flex justify-end mb-1">
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export default function DashboardLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)

  // Force password change gate: show modal if flag is set
  const forcePasswordChange = profile?.force_password_change === true
  useEffect(() => {
    if (forcePasswordChange) setShowPwModal(true)
  }, [forcePasswordChange])

  const visibleNav = navItems.filter(item =>
    item.roles === 'all' || (profile && item.roles.includes(profile.role))
  )

  async function handleSignOut() { await signOut(); navigate('/login') }

  const SidebarContent = () => (
    <>
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

      <div className="px-4 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{profile?.full_name || 'Loading...'}</div>
            <RoleBadge role={profile?.role} />
          </div>
        </div>
        <button onClick={() => setShowPwModal(true)}
          className="mt-2 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
          <KeyRound className="w-3 h-3" /> Change Password
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact} onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                isActive ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`
            }>
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

      <div className="px-3 py-3 border-t border-slate-800/60">
        <button onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-900/10 transition-all w-full">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex flex-col w-60 bg-slate-950/80 border-r border-slate-800/60 fixed top-0 left-0 h-full z-30">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800/60 flex flex-col z-50">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
              <span className="font-display font-bold text-white">S.H.A.I.</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <header className="lg:hidden sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white"><Menu className="w-5 h-5" /></button>
          <span className="font-display font-bold text-white">S.H.A.I.</span>
        </header>
        <main className="flex-1 p-4 lg:p-6"><Outlet /></main>
      </div>

      {showPwModal && (
        <ChangePasswordModal
          forceChange={forcePasswordChange}
          onClose={() => { if (!forcePasswordChange) setShowPwModal(false) }}
        />
      )}
    </div>
  )
}
