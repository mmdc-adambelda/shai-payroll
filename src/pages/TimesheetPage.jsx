import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, STATUS } from '../lib/supabase'
import { format, endOfMonth, parseISO } from 'date-fns'
import { FileText, Send, CheckCircle, XCircle, Trash2, AlertTriangle } from 'lucide-react'

function CutoffSelector({ value, onChange }) {
  const now = new Date()
  const months = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') })
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
    [STATUS.DRAFT]:     <span className="badge-draft">Draft</span>,
    [STATUS.SUBMITTED]: <span className="badge-pending">Submitted</span>,
    [STATUS.APPROVED]:  <span className="badge-approved">Approved</span>,
    [STATUS.REJECTED]:  <span className="badge-rejected">Rejected</span>,
    [STATUS.PROCESSED]: <span className="badge-processed">Processed</span>,
  }
  return map[status] || <span className="badge-draft">{status}</span>
}

// ── Confirm Delete Modal ────────────────────────────────────
function DeleteConfirmModal({ label, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-900/30 border border-red-800/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-display font-bold text-white">Delete Submission?</h3>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">
              This will permanently delete the submitted timesheet for <span className="text-white font-medium">{label}</span>.
              The attendance records are kept — you can re-submit after making corrections.
            </p>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-800/30 text-xs text-amber-300 mb-5">
          ⚠ Only submitted timesheets can be deleted. Approved or processed timesheets cannot be removed.
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-600/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Yes, Delete It'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────
export default function TimesheetPage() {
  const { profile } = useAuth()
  const [period, setPeriod]           = useState({ month: format(new Date(), 'yyyy-MM'), cutoff: new Date().getDate() <= 15 ? '1' : '2' })
  const [attendance, setAttendance]   = useState([])
  const [timesheet, setTimesheet]     = useState(null)
  const [loading, setLoading]         = useState(false)
  const [allTimesheets, setAllTimesheets] = useState([])
  const [deleteTarget, setDeleteTarget]  = useState(null) // { id, label }
  const [deleting, setDeleting]          = useState(false)
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
    const totalHours  = attendance.reduce((s, r) => s + (r.hours_worked || 0), 0)
    const daysPresent = attendance.filter(r => r.clock_in).length

    if (timesheet) {
      await supabase.from('timesheets').update({ status: STATUS.SUBMITTED }).eq('id', timesheet.id)
    } else {
      await supabase.from('timesheets').insert({
        user_id:       profile.id,
        period_month:  period.month,
        period_cutoff: period.cutoff,
        period_start:  start,
        period_end:    end,
        total_hours:   parseFloat(totalHours.toFixed(2)),
        days_present:  daysPresent,
        status:        STATUS.SUBMITTED,
      })
    }
    fetchTimesheetPeriod()
    setLoading(false)
  }

  // Delete a timesheet — only allowed when status = submitted
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('timesheets').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    // Refresh both views
    fetchTimesheetPeriod()
    if (isManager) fetchAllPending()
  }

  async function handleApprove(id) {
    await supabase.from('timesheets').update({
      status:      STATUS.APPROVED,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    fetchAllPending()
  }

  async function handleReject(id) {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('timesheets').update({ status: STATUS.REJECTED, rejection_reason: reason }).eq('id', id)
    fetchAllPending()
  }

  const totalHours = attendance.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const canSubmit  = timesheet?.status !== STATUS.SUBMITTED && timesheet?.status !== STATUS.APPROVED && timesheet?.status !== STATUS.PROCESSED
  // Own submitted timesheet can be deleted (not approved/processed)
  const canDeleteOwn = timesheet?.status === STATUS.SUBMITTED

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
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display font-bold text-white">Daily Breakdown</h3>
          <div className="flex items-center gap-2">
            {/* Delete submission button — only shows when own timesheet is submitted */}
            {canDeleteOwn && (
              <button
                onClick={() => setDeleteTarget({
                  id:    timesheet.id,
                  label: `${period.month} ${period.cutoff === '1' ? '1st Cut-off' : '2nd Cut-off'}`,
                })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-800/30 text-sm font-medium transition-all"
                title="Delete this submission so you can re-submit after corrections"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Submission
              </button>
            )}
            {(!timesheet || canSubmit) && attendance.length > 0 && (
              <button onClick={submitTimesheet} disabled={loading} className="btn-primary text-sm flex items-center gap-2">
                <Send className="w-3.5 h-3.5" />
                {loading ? 'Submitting...' : 'Submit Timesheet'}
              </button>
            )}
          </div>
        </div>

        {/* Submitted notice */}
        {timesheet?.status === STATUS.SUBMITTED && (
          <div className="px-5 py-3 bg-amber-900/10 border-b border-amber-800/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              This timesheet has been submitted and is awaiting approval. If you need to make corrections,
              click <strong>Delete Submission</strong> to withdraw it, fix your attendance records, then re-submit.
            </p>
          </div>
        )}

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
                  const ot      = Math.max(0, (r.hours_worked || 0) - 8)
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
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => handleApprove(ts.id)} className="btn-success text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => handleReject(ts.id)} className="btn-danger text-xs flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  {/* Manager/Admin can also delete a submitted timesheet */}
                  <button
                    onClick={() => setDeleteTarget({
                      id:    ts.id,
                      label: `${ts.profiles?.full_name} — ${ts.period_month} ${ts.period_cutoff === '1' ? '1st Cut-off' : '2nd Cut-off'}`,
                    })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-800/30 text-xs font-medium transition-all"
                    title="Delete this submission"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          label={deleteTarget.label}
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
