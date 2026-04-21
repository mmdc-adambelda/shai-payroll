import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, STATUS } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns'
import { FileText, Send, CheckCircle, XCircle, Clock } from 'lucide-react'

function CutoffSelector({ value, onChange }) {
  const now = new Date()
  const months = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy'),
    })
  }

  return (
    <div className="flex gap-3">
      <select className="input py-2 text-sm w-auto" value={value.month} onChange={e => onChange({ ...value, month: e.target.value })}>
        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select className="input py-2 text-sm w-auto" value={value.cutoff} onChange={e => onChange({ ...value, cutoff: e.target.value })}>
        <option value="1">1st Cut-off (1–15)</option>
        <option value="2">2nd Cut-off (16–End)</option>
      </select>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    [STATUS.DRAFT]: <span className="badge-draft">Draft</span>,
    [STATUS.SUBMITTED]: <span className="badge-pending">Submitted</span>,
    [STATUS.APPROVED]: <span className="badge-approved">Approved</span>,
    [STATUS.REJECTED]: <span className="badge-rejected">Rejected</span>,
    [STATUS.PROCESSED]: <span className="badge-processed">Processed</span>,
  }
  return map[status] || <span className="badge-draft">{status}</span>
}

export default function TimesheetPage() {
  const { profile } = useAuth()
  const [period, setPeriod] = useState({ month: format(new Date(), 'yyyy-MM'), cutoff: new Date().getDate() <= 15 ? '1' : '2' })
  const [attendance, setAttendance] = useState([])
  const [timesheet, setTimesheet] = useState(null)
  const [loading, setLoading] = useState(false)
  const [allTimesheets, setAllTimesheets] = useState([])
  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => {
    if (profile) {
      fetchTimesheetPeriod()
      if (isManager) fetchAllPending()
    }
  }, [period, profile])

  function getPeriodDates() {
    const [year, month] = period.month.split('-').map(Number)
    const start = period.cutoff === '1'
      ? new Date(year, month - 1, 1)
      : new Date(year, month - 1, 16)
    const end = period.cutoff === '1'
      ? new Date(year, month - 1, 15)
      : endOfMonth(new Date(year, month - 1, 1))
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
  }

  async function fetchTimesheetPeriod() {
    setLoading(true)
    const { start, end } = getPeriodDates()

    const [attResp, tsResp] = await Promise.all([
      supabase.from('attendance_records')
        .select('*')
        .eq('user_id', profile.id)
        .gte('date', start)
        .lte('date', end)
        .order('date'),
      supabase.from('timesheets')
        .select('*')
        .eq('user_id', profile.id)
        .eq('period_month', period.month)
        .eq('period_cutoff', period.cutoff)
        .single(),
    ])

    setAttendance(attResp.data || [])
    setTimesheet(tsResp.data || null)
    setLoading(false)
  }

  async function fetchAllPending() {
    const { data } = await supabase
      .from('timesheets')
      .select(`*, profiles:user_id(full_name, department)`)
      .in('status', [STATUS.SUBMITTED])
      .order('created_at', { ascending: false })
    setAllTimesheets(data || [])
  }

  async function submitTimesheet() {
    setLoading(true)
    const { start, end } = getPeriodDates()
    const totalHours = attendance.reduce((s, r) => s + (r.hours_worked || 0), 0)
    const daysPresent = attendance.filter(r => r.clock_in).length

    if (timesheet) {
      await supabase.from('timesheets').update({ status: STATUS.SUBMITTED }).eq('id', timesheet.id)
    } else {
      await supabase.from('timesheets').insert({
        user_id: profile.id,
        period_month: period.month,
        period_cutoff: period.cutoff,
        period_start: start,
        period_end: end,
        total_hours: parseFloat(totalHours.toFixed(2)),
        days_present: daysPresent,
        status: STATUS.SUBMITTED,
      })
    }
    fetchTimesheetPeriod()
    setLoading(false)
  }

  async function handleApprove(id) {
    await supabase.from('timesheets').update({ status: STATUS.APPROVED, approved_by: profile.id, approved_at: new Date().toISOString() }).eq('id', id)
    fetchAllPending()
  }

  async function handleReject(id) {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('timesheets').update({ status: STATUS.REJECTED, rejection_reason: reason }).eq('id', id)
    fetchAllPending()
  }

  const totalHours = attendance.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const canSubmit = timesheet?.status !== STATUS.SUBMITTED && timesheet?.status !== STATUS.APPROVED && timesheet?.status !== STATUS.PROCESSED

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="section-title">Timesheet</h1>
        <p className="text-slate-400 text-sm mt-0.5">Review and submit your timesheet for each cut-off period</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <CutoffSelector value={period} onChange={setPeriod} />
        {timesheet && <StatusBadge status={timesheet.status} />}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">{attendance.filter(r => r.clock_in).length}</div>
          <div className="text-xs text-slate-400 mt-1">Days Present</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-brand-400">{totalHours.toFixed(1)}h</div>
          <div className="text-xs text-slate-400 mt-1">Total Hours</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-400">
            {Math.max(0, (totalHours - attendance.filter(r => r.clock_in).length * 8)).toFixed(1)}h
          </div>
          <div className="text-xs text-slate-400 mt-1">Overtime Hours</div>
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
          <h3 className="font-display font-bold text-white">Daily Breakdown</h3>
          {(!timesheet || canSubmit) && attendance.length > 0 && (
            <button onClick={submitTimesheet} disabled={loading} className="btn-primary text-sm flex items-center gap-2">
              <Send className="w-3.5 h-3.5" />
              {loading ? 'Submitting...' : 'Submit Timesheet'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Date</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Day</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Clock In</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Clock Out</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Regular</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">OT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading...</td></tr>
              ) : attendance.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No records for this period.</td></tr>
              ) : (
                attendance.map(r => {
                  const regular = Math.min(r.hours_worked || 0, 8)
                  const ot = Math.max(0, (r.hours_worked || 0) - 8)
                  return (
                    <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">
                        {format(new Date(r.date + 'T00:00:00'), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">
                        {format(new Date(r.date + 'T00:00:00'), 'EEE')}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-300">
                        {r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-300">
                        {r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-emerald-400">{regular.toFixed(1)}h</td>
                      <td className="px-5 py-3 font-mono text-amber-400">{ot > 0 ? `+${ot.toFixed(1)}h` : '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manager: pending timesheets */}
      {isManager && allTimesheets.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h3 className="font-display font-bold text-white">Pending Approvals ({allTimesheets.length})</h3>
          </div>
          <div className="divide-y divide-slate-800/60">
            {allTimesheets.map(ts => (
              <div key={ts.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-sm font-medium text-white">{ts.profiles?.full_name}</div>
                  <div className="text-xs text-slate-400">{ts.profiles?.department} · {ts.period_month} {ts.period_cutoff === '1' ? '1st Cut-off' : '2nd Cut-off'}</div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">{ts.days_present} days · {ts.total_hours}h total</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(ts.id)} className="btn-success text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => handleReject(ts.id)} className="btn-danger text-xs flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
