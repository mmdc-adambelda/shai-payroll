import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES } from '../lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Clock, Users, FileText, CheckCircle, AlertCircle, TrendingUp, Calendar, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'

function StatCard({ icon: Icon, label, value, sub, color = 'brand', to }) {
  const colors = {
    brand: 'text-brand-400 bg-brand-900/30 border-brand-800/40',
    emerald: 'text-emerald-400 bg-emerald-900/30 border-emerald-800/40',
    amber: 'text-amber-400 bg-amber-900/30 border-amber-800/40',
    purple: 'text-purple-400 bg-purple-900/30 border-purple-800/40',
    red: 'text-red-400 bg-red-900/30 border-red-800/40',
  }
  const Wrapper = to ? Link : 'div'
  return (
    <Wrapper to={to} className={`stat-card ${to ? 'card-hover cursor-pointer' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-white font-mono">{value ?? '—'}</div>
        <div className="text-sm font-medium text-slate-300 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </Wrapper>
  )
}

function ClockWidget({ profile }) {
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    fetchToday()
    return () => clearInterval(t)
  }, [])

  async function fetchToday() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', profile.id)
      .eq('date', today)
      .single()
    setTodayRecord(data)
  }

  async function handleClockIn() {
    setLoading(true)
    const now = new Date()
    const { error } = await supabase.from('attendance_records').insert({
      user_id: profile.id,
      date: format(now, 'yyyy-MM-dd'),
      clock_in: now.toISOString(),
      status: 'present',
    })
    if (!error) fetchToday()
    setLoading(false)
  }

  async function handleClockOut() {
    setLoading(true)
    const now = new Date()
    const clockIn = new Date(todayRecord.clock_in)
    const rawHours = (now - clockIn) / 3600000
    // Deduct 1 hr unpaid lunch break for shifts >= 5 hours
    const hours = rawHours >= 5 ? rawHours - 1 : rawHours
    const { error } = await supabase
      .from('attendance_records')
      .update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours.toFixed(2)) })
      .eq('id', todayRecord.id)
    if (!error) fetchToday()
    setLoading(false)
  }

  const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out
  const isClockedOut = todayRecord?.clock_in && todayRecord?.clock_out

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-white">Today's Attendance</h3>
        <span className="text-slate-500 text-sm">{format(time, 'EEEE, MMM d')}</span>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center py-6">
        <div className={`w-28 h-28 rounded-full border-4 flex items-center justify-center mb-4 transition-all ${
          isClockedIn
            ? 'border-emerald-500/50 bg-emerald-900/20 clock-ring'
            : isClockedOut
            ? 'border-slate-600/50 bg-slate-800/30'
            : 'border-brand-500/30 bg-brand-900/10'
        }`}>
          <div className="text-center">
            <div className="font-mono font-bold text-2xl text-white">{format(time, 'HH:mm')}</div>
            <div className="font-mono text-xs text-slate-500">{format(time, 'ss')}s</div>
          </div>
        </div>

        {isClockedOut ? (
          <div className="text-center">
            <div className="text-emerald-400 font-medium text-sm mb-1">✓ Completed</div>
            <div className="text-slate-400 text-xs">
              {format(new Date(todayRecord.clock_in), 'HH:mm')} → {format(new Date(todayRecord.clock_out), 'HH:mm')}
              <span className="ml-2 text-brand-400">{todayRecord.hours_worked}h</span>
            </div>
          </div>
        ) : isClockedIn ? (
          <div className="text-center">
            <div className="text-emerald-400 text-sm mb-2">Clocked in at {format(new Date(todayRecord.clock_in), 'HH:mm')}</div>
            <button onClick={handleClockOut} disabled={loading} className="btn-danger px-6">
              {loading ? 'Processing...' : 'Clock Out'}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-slate-400 text-sm mb-2">Not yet clocked in</div>
            <button onClick={handleClockIn} disabled={loading} className="btn-primary px-6">
              {loading ? 'Processing...' : 'Clock In'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PendingApprovals({ profile }) {
  const [counts, setCounts] = useState({ leaves: 0, overtime: 0, timesheets: 0 })

  useEffect(() => {
    fetchCounts()
  }, [])

  async function fetchCounts() {
    const deptFilter = profile.role === ROLES.MANAGER ? { department: profile.department } : {}

    const [leaves, overtime, timesheets] = await Promise.all([
      supabase.from('leave_requests').select('id', { count: 'exact' })
        .eq('status', 'pending')
        .then(({ count }) => count || 0),
      supabase.from('overtime_requests').select('id', { count: 'exact' })
        .eq('status', 'pending')
        .then(({ count }) => count || 0),
      supabase.from('timesheets').select('id', { count: 'exact' })
        .eq('status', 'submitted')
        .then(({ count }) => count || 0),
    ])
    setCounts({ leaves, overtime, timesheets })
  }

  return (
    <div className="card p-6">
      <h3 className="font-display font-bold text-white mb-4">Pending Approvals</h3>
      <div className="space-y-3">
        {[
          { label: 'Leave Requests', count: counts.leaves, to: '/leave', color: 'amber' },
          { label: 'Overtime Requests', count: counts.overtime, to: '/overtime', color: 'purple' },
          { label: 'Submitted Timesheets', count: counts.timesheets, to: '/payroll', color: 'brand' },
        ].map(item => (
          <Link key={item.label} to={item.to}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-all border border-slate-700/30">
            <span className="text-sm text-slate-300">{item.label}</span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              item.count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700/40 text-slate-500'
            }`}>
              {item.count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function RecentActivity({ profile }) {
  const [records, setRecords] = useState([])

  useEffect(() => {
    supabase.from('attendance_records')
      .select('*')
      .eq('user_id', profile.id)
      .order('date', { ascending: false })
      .limit(5)
      .then(({ data }) => setRecords(data || []))
  }, [])

  return (
    <div className="card p-6">
      <h3 className="font-display font-bold text-white mb-4">Recent Attendance</h3>
      {records.length === 0 ? (
        <p className="text-slate-500 text-sm">No recent records found.</p>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
              <div>
                <div className="text-sm text-slate-200">{format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d')}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {r.clock_in ? format(new Date(r.clock_in), 'HH:mm') : '--:--'} →{' '}
                  {r.clock_out ? format(new Date(r.clock_out), 'HH:mm') : '--:--'}
                </div>
              </div>
              <div className="text-right">
                {r.hours_worked ? (
                  <span className="text-sm font-mono text-brand-400">{r.hours_worked}h</span>
                ) : (
                  <span className="text-xs text-slate-500">Incomplete</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({})

  useEffect(() => {
    if (!profile) return
    fetchStats()
  }, [profile])

  async function fetchStats() {
    const now = new Date()
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

    const [attendance, leaves] = await Promise.all([
      supabase.from('attendance_records')
        .select('hours_worked')
        .eq('user_id', profile.id)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase.from('leave_requests')
        .select('id', { count: 'exact' })
        .eq('user_id', profile.id)
        .eq('status', 'approved'),
    ])

    const totalHours = (attendance.data || []).reduce((s, r) => s + (r.hours_worked || 0), 0)
    setStats({
      daysWorked: (attendance.data || []).filter(r => r.hours_worked > 0).length,
      totalHours: parseFloat(totalHours.toFixed(1)),
      approvedLeaves: leaves.count || 0,
    })
  }

  const isManagerOrAdmin = profile?.role === ROLES.SUPER_ADMIN || profile?.role === ROLES.MANAGER

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          <span className="text-brand-400">{profile?.full_name?.split(' ')[0]}</span> 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Days This Month" value={stats.daysWorked} sub="Present days" color="brand" />
        <StatCard icon={TrendingUp} label="Hours Worked" value={stats.totalHours} sub="This month" color="emerald" />
        <StatCard icon={Calendar} label="Approved Leaves" value={stats.approvedLeaves} sub="This year" color="amber" />
        <StatCard icon={Timer} label="Department" value={profile?.department?.split(' ')[0] || '—'} sub={profile?.department} color="purple" />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Clock In/Out widget */}
        <div className="lg:col-span-1">
          <ClockWidget profile={profile} />
        </div>

        {/* Pending approvals for managers/admin */}
        {isManagerOrAdmin && (
          <div className="lg:col-span-1">
            <PendingApprovals profile={profile} />
          </div>
        )}

        {/* Recent activity */}
        <div className={isManagerOrAdmin ? 'lg:col-span-1' : 'lg:col-span-2'}>
          <RecentActivity profile={profile} />
        </div>
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <h3 className="font-display font-bold text-white mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/leave" className="btn-secondary text-sm">📅 File Leave</Link>
          <Link to="/overtime" className="btn-secondary text-sm">⏱ Log Overtime</Link>
          <Link to="/timesheet" className="btn-secondary text-sm">📋 View Timesheet</Link>
          <Link to="/attendance" className="btn-secondary text-sm">📊 Attendance Log</Link>
        </div>
      </div>
    </div>
  )
}
