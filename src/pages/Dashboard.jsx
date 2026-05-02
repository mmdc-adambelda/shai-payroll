import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES } from '../lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Clock, TrendingUp, Calendar, Timer, Scan } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaceClockIn from '../components/face/FaceClockIn'

function StatCard({ icon: Icon, label, value, sub, color = 'brand', to }) {
  const colors = {
    brand:   'text-brand-400 bg-brand-900/30 border-brand-800/40',
    emerald: 'text-emerald-400 bg-emerald-900/30 border-emerald-800/40',
    amber:   'text-amber-400 bg-amber-900/30 border-amber-800/40',
    purple:  'text-purple-400 bg-purple-900/30 border-purple-800/40',
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

// ── Traditional clock-in widget (manual button) ───────────────
function ManualClockWidget({ profile, onRefresh }) {
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
      .from('attendance_records').select('*')
      .eq('user_id', profile.id).eq('date', today).single()
    setTodayRecord(data)
  }

  async function handleClockIn() {
    setLoading(true)
    const now = new Date()
    await supabase.from('attendance_records').insert({
      user_id: profile.id,
      date: format(now, 'yyyy-MM-dd'),
      clock_in: now.toISOString(),
      status: 'present',
      clock_in_method: 'manual',
    })
    fetchToday(); onRefresh?.(); setLoading(false)
  }

  async function handleClockOut() {
    setLoading(true)
    const now = new Date()
    const clockIn = new Date(todayRecord.clock_in)
    const rawHours = (now - clockIn) / 3600000
    const hours = rawHours >= 5 ? rawHours - 1 : rawHours
    await supabase.from('attendance_records').update({
      clock_out: now.toISOString(),
      hours_worked: parseFloat(hours.toFixed(2)),
      clock_out_method: 'manual',
    }).eq('id', todayRecord.id)
    fetchToday(); onRefresh?.(); setLoading(false)
  }

  const isClockedIn  = todayRecord?.clock_in && !todayRecord?.clock_out
  const isClockedOut = todayRecord?.clock_in && todayRecord?.clock_out

  return (
    <div className="flex flex-col items-center py-4">
      <div className={`w-28 h-28 rounded-full border-4 flex items-center justify-center mb-4 transition-all ${
        isClockedIn ? 'border-emerald-500/50 bg-emerald-900/20 clock-ring'
        : isClockedOut ? 'border-slate-600/50 bg-slate-800/30'
        : 'border-brand-500/30 bg-brand-900/10'
      }`}>
        <div className="text-center">
          <div className="font-mono font-bold text-2xl text-white">{format(time, 'HH:mm')}</div>
          <div className="font-mono text-xs text-slate-500">{format(time, 'ss')}s</div>
        </div>
      </div>
      {isClockedOut ? (
        <div className="text-center">
          <div className="text-emerald-400 font-medium text-sm mb-1">✓ Completed for today</div>
          <div className="text-slate-400 text-xs font-mono">
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
  )
}

// ── Combined clock widget with Face / Manual tabs ─────────────
function ClockWidget({ profile }) {
  const [clockTab, setClockTab] = useState('face')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-white">Today's Attendance</h3>
        <span className="text-slate-500 text-sm">{format(new Date(), 'EEE, MMM d')}</span>
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-lg bg-slate-800/60 p-0.5 mb-4 gap-0.5">
        <button onClick={() => setClockTab('face')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            clockTab === 'face' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}>
          <Scan className="w-3 h-3" /> Face ID
        </button>
        <button onClick={() => setClockTab('manual')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            clockTab === 'manual' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}>
          <Clock className="w-3 h-3" /> Manual
        </button>
      </div>

      {clockTab === 'face' ? (
        <FaceClockIn compact onSuccess={() => setRefreshKey(k => k + 1)} />
      ) : (
        <ManualClockWidget key={refreshKey} profile={profile} onRefresh={() => setRefreshKey(k => k + 1)} />
      )}
    </div>
  )
}

function PendingApprovals({ profile }) {
  const [counts, setCounts] = useState({ leaves: 0, overtime: 0, timesheets: 0 })
  useEffect(() => { fetchCounts() }, [])
  async function fetchCounts() {
    const [l, o, t] = await Promise.all([
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending').then(({ count }) => count || 0),
      supabase.from('overtime_requests').select('id', { count: 'exact' }).eq('status', 'pending').then(({ count }) => count || 0),
      supabase.from('timesheets').select('id', { count: 'exact' }).eq('status', 'submitted').then(({ count }) => count || 0),
    ])
    setCounts({ leaves: l, overtime: o, timesheets: t })
  }
  return (
    <div className="card p-6">
      <h3 className="font-display font-bold text-white mb-4">Pending Approvals</h3>
      <div className="space-y-3">
        {[
          { label: 'Leave Requests', count: counts.leaves, to: '/leave' },
          { label: 'Overtime Requests', count: counts.overtime, to: '/overtime' },
          { label: 'Submitted Timesheets', count: counts.timesheets, to: '/payroll' },
        ].map(item => (
          <Link key={item.label} to={item.to}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-all border border-slate-700/30">
            <span className="text-sm text-slate-300">{item.label}</span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              item.count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700/40 text-slate-500'
            }`}>{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function RecentActivity({ profile }) {
  const [records, setRecords] = useState([])
  useEffect(() => {
    supabase.from('attendance_records').select('*').eq('user_id', profile.id)
      .order('date', { ascending: false }).limit(5)
      .then(({ data }) => setRecords(data || []))
  }, [])
  return (
    <div className="card p-6">
      <h3 className="font-display font-bold text-white mb-4">Recent Attendance</h3>
      {records.length === 0 ? <p className="text-slate-500 text-sm">No recent records found.</p> : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
              <div>
                <div className="text-sm text-slate-200">{format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d')}</div>
                <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                  {r.clock_in ? format(new Date(r.clock_in), 'HH:mm') : '--:--'} →{' '}
                  {r.clock_out ? format(new Date(r.clock_out), 'HH:mm') : '--:--'}
                  {(r.clock_in_method === 'face' || r.clock_out_method === 'face') && (
                    <span className="text-brand-500 text-[10px]">· Face ID</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                {r.hours_worked
                  ? <span className="text-sm font-mono text-brand-400">{r.hours_worked}h</span>
                  : <span className="text-xs text-slate-500">Incomplete</span>}
                {r.is_late && <div className="text-[10px] text-amber-500">Late</div>}
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

  useEffect(() => { if (profile) fetchStats() }, [profile])

  async function fetchStats() {
    const now = new Date()
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')
    const [attendance, leaves] = await Promise.all([
      supabase.from('attendance_records').select('hours_worked').eq('user_id', profile.id).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('user_id', profile.id).eq('status', 'approved'),
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
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          <span className="text-brand-400">{profile?.full_name?.split(' ')[0]}</span> 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock}      label="Days This Month" value={stats.daysWorked}     sub="Present days"  color="brand" />
        <StatCard icon={TrendingUp} label="Hours Worked"    value={stats.totalHours}     sub="This month"    color="emerald" />
        <StatCard icon={Calendar}   label="Approved Leaves" value={stats.approvedLeaves} sub="This year"     color="amber" />
        <StatCard icon={Timer}      label="Department"      value={profile?.department?.split(' ')[0] || '—'} sub={profile?.department} color="purple" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ClockWidget profile={profile} />
        </div>
        {isManagerOrAdmin && (
          <div className="lg:col-span-1">
            <PendingApprovals profile={profile} />
          </div>
        )}
        <div className={isManagerOrAdmin ? 'lg:col-span-1' : 'lg:col-span-2'}>
          <RecentActivity profile={profile} />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold text-white mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/leave"     className="btn-secondary text-sm">📅 File Leave</Link>
          <Link to="/overtime"  className="btn-secondary text-sm">⏱ Log Overtime</Link>
          <Link to="/timesheet" className="btn-secondary text-sm">📋 View Timesheet</Link>
          <Link to="/payslips"  className="btn-secondary text-sm">💳 My Payslips</Link>
          <Link to="/attendance" className="btn-secondary text-sm">📊 Attendance Log</Link>
        </div>
      </div>
    </div>
  )
}
