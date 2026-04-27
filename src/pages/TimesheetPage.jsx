import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, STATUS } from '../lib/supabase'
import { format, endOfMonth, parseISO } from 'date-fns'
import { FileText, Send, CheckCircle, XCircle, Trash2, AlertTriangle, Pencil, Save, X, Users, RefreshCw } from 'lucide-react'

// ─── Shared helpers ──────────────────────────────────────────
function CutoffSelector({ value, onChange }) {
  const now = new Date()
  const months = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') })
  }
  return (
    <div className="flex gap-3 flex-wrap">
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
  return map[status] || <span className="badge-draft">No Submission</span>
}

function buildISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  return `${dateStr}T${timeStr}:00+08:00`
}

function calcHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0
  const rawHours = (new Date(clockOut) - new Date(clockIn)) / 3600000
  const hours = rawHours >= 5 ? rawHours - 1 : rawHours
  return Math.max(0, parseFloat(hours.toFixed(2)))
}

function toTimeInput(isoStr) {
  if (!isoStr) return ''
  try { return format(parseISO(isoStr), 'HH:mm') } catch { return '' }
}

// ─── Delete Confirm Modal ────────────────────────────────────
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
              Permanently delete the submitted timesheet for <span className="text-white font-medium">{label}</span>.
              Attendance records are kept — the employee can re-submit after corrections.
            </p>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-800/30 text-xs text-amber-300 mb-5">
          ⚠ Only submitted timesheets can be deleted. Approved or processed timesheets cannot be removed.
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-600/30 text-sm font-medium transition-all disabled:opacity-50">
            {loading ? 'Deleting...' : 'Yes, Delete It'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline-editable daily breakdown (used in Team view) ─────
function DailyBreakdown({ userId, period, timesheetId, isManager, onTimesheetUpdate }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingRow, setEditingRow] = useState(null) // { id, clock_in, clock_out }
  const [saving, setSaving]     = useState(false)

  useEffect(() => { fetchRows() }, [userId, period])

  function getPeriodDates() {
    const [year, month] = period.month.split('-').map(Number)
    const start = period.cutoff === '1' ? new Date(year, month - 1, 1)  : new Date(year, month - 1, 16)
    const end   = period.cutoff === '1' ? new Date(year, month - 1, 15) : endOfMonth(new Date(year, month - 1, 1))
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
  }

  async function fetchRows() {
    setLoading(true)
    const { start, end } = getPeriodDates()
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date')
    setRows(data || [])
    setLoading(false)
  }

  async function saveRow(row) {
    setSaving(true)
    const hours = calcHours(editingRow.clock_in, editingRow.clock_out)
    await supabase.from('attendance_records').update({
      clock_in:     editingRow.clock_in  || null,
      clock_out:    editingRow.clock_out || null,
      hours_worked: hours,
    }).eq('id', row.id)

    const updatedRows = rows.map(r =>
      r.id === row.id ? { ...r, clock_in: editingRow.clock_in, clock_out: editingRow.clock_out, hours_worked: hours } : r
    )
    setRows(updatedRows)

    // If there's a linked timesheet, update its totals too
    if (timesheetId) {
      const totalHours  = updatedRows.reduce((s, r) => s + (r.hours_worked || 0), 0)
      const daysPresent = updatedRows.filter(r => r.clock_in).length
      await supabase.from('timesheets').update({
        total_hours:  parseFloat(totalHours.toFixed(2)),
        days_present: daysPresent,
        updated_at:   new Date().toISOString(),
      }).eq('id', timesheetId)
      if (onTimesheetUpdate) onTimesheetUpdate({ total_hours: parseFloat(totalHours.toFixed(2)), days_present: daysPresent })
    }

    setEditingRow(null)
    setSaving(false)
  }

  const totalHours  = rows.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const daysPresent = rows.filter(r => r.clock_in).length

  if (loading) return <div className="py-6 text-center text-slate-500 text-sm">Loading records...</div>
  if (rows.length === 0) return <div className="py-6 text-center text-slate-500 text-sm">No attendance records for this period.</div>

  return (
    <div>
      {/* Mini totals */}
      <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-800/40">
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{daysPresent}</div>
          <div className="text-xs text-slate-500">Days</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-brand-400">{totalHours.toFixed(1)}h</div>
          <div className="text-xs text-slate-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-amber-400">
            {Math.max(0, totalHours - daysPresent * 8).toFixed(1)}h
          </div>
          <div className="text-xs text-slate-500">OT</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/40">
              <th className="text-left px-5 py-2.5 text-slate-500 text-xs font-medium">Date</th>
              <th className="text-left px-5 py-2.5 text-slate-500 text-xs font-medium">In</th>
              <th className="text-left px-5 py-2.5 text-slate-500 text-xs font-medium">Out</th>
              <th className="text-left px-5 py-2.5 text-slate-500 text-xs font-medium">Reg</th>
              <th className="text-left px-5 py-2.5 text-slate-500 text-xs font-medium">OT</th>
              {isManager && <th className="px-5 py-2.5"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isEditing = editingRow?.id === r.id
              const regular   = Math.min(r.hours_worked || 0, 8)
              const ot        = Math.max(0, (r.hours_worked || 0) - 8)
              return (
                <tr key={r.id} className={`border-b border-slate-800/30 group ${isEditing ? 'bg-brand-900/10' : 'hover:bg-slate-800/20'} transition-colors`}>
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-300 whitespace-nowrap">
                    {format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d')}
                  </td>
                  <td className="px-5 py-2.5">
                    {isEditing ? (
                      <input type="time" className="input py-1 px-2 text-xs w-24"
                        value={toTimeInput(editingRow.clock_in)}
                        onChange={e => setEditingRow({ ...editingRow, clock_in: buildISO(r.date, e.target.value) })} />
                    ) : (
                      <span className="font-mono text-slate-300 text-xs">{r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    {isEditing ? (
                      <input type="time" className="input py-1 px-2 text-xs w-24"
                        value={toTimeInput(editingRow.clock_out)}
                        onChange={e => setEditingRow({ ...editingRow, clock_out: buildISO(r.date, e.target.value) })} />
                    ) : (
                      <span className="font-mono text-slate-300 text-xs">{r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-emerald-400 text-xs">{regular.toFixed(1)}h</td>
                  <td className="px-5 py-2.5 font-mono text-amber-400 text-xs">{ot > 0 ? `+${ot.toFixed(1)}h` : '—'}</td>
                  {isManager && (
                    <td className="px-5 py-2.5">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveRow(r)} disabled={saving}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-700/30 text-emerald-400 hover:bg-emerald-700/50 text-xs font-medium border border-emerald-700/40 disabled:opacity-50">
                            <Save className="w-3 h-3" />{saving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingRow(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs border border-slate-700/40">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingRow({ id: r.id, clock_in: r.clock_in, clock_out: r.clock_out })}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-brand-400 transition-all"
                          title="Edit this row"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Team Timesheet Card (Manager/Admin view) ────────────────
function TeamTimesheetCard({ emp, period, isManager }) {
  const [timesheet, setTimesheet] = useState(undefined) // undefined = loading
  const [expanded, setExpanded]   = useState(false)

  useEffect(() => { fetchTimesheet() }, [emp.id, period])

  async function fetchTimesheet() {
    setTimesheet(undefined)
    const { data } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', emp.id)
      .eq('period_month', period.month)
      .eq('period_cutoff', period.cutoff)
      .single()
    setTimesheet(data || null)
  }

  function handleTimesheetUpdate(updates) {
    setTimesheet(prev => prev ? { ...prev, ...updates } : prev)
  }

  return (
    <div className="border border-slate-800/60 rounded-xl overflow-hidden">
      {/* Header row — always visible */}
      <button
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-800/20 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {emp.full_name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{emp.full_name}</div>
            <div className="text-xs text-slate-500">{emp.department}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {timesheet === undefined ? (
            <span className="text-xs text-slate-600">Loading…</span>
          ) : (
            <>
              {timesheet && (
                <span className="text-xs font-mono text-slate-400">
                  {timesheet.days_present}d · {timesheet.total_hours}h
                </span>
              )}
              <StatusBadge status={timesheet?.status} />
            </>
          )}
          <span className={`text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {/* Expandable daily breakdown */}
      {expanded && (
        <div className="border-t border-slate-800/60 bg-slate-900/30">
          <DailyBreakdown
            userId={emp.id}
            period={period}
            timesheetId={timesheet?.id}
            isManager={isManager}
            onTimesheetUpdate={handleTimesheetUpdate}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function TimesheetPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab]   = useState('mine')
  const [period, setPeriod]         = useState({ month: format(new Date(), 'yyyy-MM'), cutoff: new Date().getDate() <= 15 ? '1' : '2' })
  const [attendance, setAttendance] = useState([])
  const [timesheet, setTimesheet]   = useState(null)
  const [loading, setLoading]       = useState(false)
  const [allTimesheets, setAllTimesheets] = useState([])
  const [deleteTarget, setDeleteTarget]  = useState(null)
  const [deleting, setDeleting]          = useState(false)
  const [employees, setEmployees]        = useState([])
  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => {
    if (profile) {
      fetchTimesheetPeriod()
      if (isManager) { fetchAllPending(); fetchEmployees() }
    }
  }, [period, profile])

  async function fetchEmployees() {
    const { data } = await supabase.from('profiles').select('id, full_name, department').order('full_name')
    setEmployees(data || [])
  }

  function getPeriodDates() {
    const [year, month] = period.month.split('-').map(Number)
    const start = period.cutoff === '1' ? new Date(year, month - 1, 1)  : new Date(year, month - 1, 16)
    const end   = period.cutoff === '1' ? new Date(year, month - 1, 15) : endOfMonth(new Date(year, month - 1, 1))
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
  }

  async function fetchTimesheetPeriod() {
    setLoading(true)
    const { start, end } = getPeriodDates()
    const [attResp, tsResp] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('user_id', profile.id).gte('date', start).lte('date', end).order('date'),
      supabase.from('timesheets').select('*').eq('user_id', profile.id).eq('period_month', period.month).eq('period_cutoff', period.cutoff).single(),
    ])
    setAttendance(attResp.data || [])
    setTimesheet(tsResp.data || null)
    setLoading(false)
  }

  async function fetchAllPending() {
    const { data } = await supabase
      .from('timesheets')
      .select('*, profiles:user_id(full_name, department)')
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
        user_id: profile.id, period_month: period.month, period_cutoff: period.cutoff,
        period_start: start, period_end: end,
        total_hours: parseFloat(totalHours.toFixed(2)), days_present: daysPresent,
        status: STATUS.SUBMITTED,
      })
    }
    fetchTimesheetPeriod()
    setLoading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('timesheets').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    fetchTimesheetPeriod()
    if (isManager) fetchAllPending()
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

  const totalHours   = attendance.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const canSubmit    = timesheet?.status !== STATUS.SUBMITTED && timesheet?.status !== STATUS.APPROVED && timesheet?.status !== STATUS.PROCESSED
  const canDeleteOwn = timesheet?.status === STATUS.SUBMITTED

  const tabs = isManager
    ? [{ id: 'mine', label: 'My Timesheet' }, { id: 'team', label: 'Team Timesheets' }, { id: 'pending', label: `Pending Approvals${allTimesheets.length ? ` (${allTimesheets.length})` : ''}` }]
    : []

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="section-title">Timesheet</h1>
        <p className="text-slate-400 text-sm mt-0.5">Review and submit your timesheet for each cut-off period</p>
      </div>

      {/* Tab bar — managers only */}
      {isManager && (
        <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-800/40 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Period selector — shown on My Timesheet and Team tabs */}
      {(activeTab === 'mine' || activeTab === 'team') && (
        <div className="flex flex-wrap items-center gap-4">
          <CutoffSelector value={period} onChange={setPeriod} />
          {activeTab === 'mine' && timesheet && <StatusBadge status={timesheet.status} />}
        </div>
      )}

      {/* ── MY TIMESHEET ── */}
      {activeTab === 'mine' && (
        <>
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

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-display font-bold text-white">Daily Breakdown</h3>
              <div className="flex items-center gap-2">
                {canDeleteOwn && (
                  <button onClick={() => setDeleteTarget({ id: timesheet.id, label: `${period.month} ${period.cutoff === '1' ? '1st Cut-off' : '2nd Cut-off'}` })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-800/30 text-sm font-medium transition-all">
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

            {timesheet?.status === STATUS.SUBMITTED && (
              <div className="px-5 py-3 bg-amber-900/10 border-b border-amber-800/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-300">
                  Submitted and awaiting approval. Click <strong>Delete Submission</strong> to withdraw and re-submit after corrections.
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
                          <td className="px-5 py-3 font-mono text-xs text-slate-300">{format(new Date(r.date + 'T00:00:00'), 'MMM d, yyyy')}</td>
                          <td className="px-5 py-3 text-slate-400 text-xs">{format(new Date(r.date + 'T00:00:00'), 'EEE')}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : '—'}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : '—'}</td>
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
        </>
      )}

      {/* ── TEAM TIMESHEETS (Manager/Admin) ── */}
      {activeTab === 'team' && isManager && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Click any employee row to expand their daily breakdown. Click ✏ on any row to edit clock-in/out times directly — even before a timesheet is submitted.
            </p>
            <button onClick={() => { fetchEmployees() }} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          {employees.length === 0 ? (
            <div className="card p-8 text-center text-slate-500">Loading employees...</div>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <TeamTimesheetCard key={emp.id} emp={emp} period={period} isManager={isManager} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PENDING APPROVALS (Manager/Admin) ── */}
      {activeTab === 'pending' && isManager && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <h3 className="font-display font-bold text-white">
              Pending Approvals
              {allTimesheets.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/40 font-mono">{allTimesheets.length}</span>
              )}
            </h3>
            <button onClick={fetchAllPending} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          {allTimesheets.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <div className="text-slate-400 font-medium">All caught up!</div>
              <div className="text-slate-600 text-sm mt-1">No timesheets awaiting approval.</div>
            </div>
          ) : (
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
                    <button
                      onClick={() => setDeleteTarget({ id: ts.id, label: `${ts.profiles?.full_name} — ${ts.period_month} ${ts.period_cutoff === '1' ? '1st Cut-off' : '2nd Cut-off'}` })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-800/30 text-xs font-medium transition-all">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal label={deleteTarget.label} loading={deleting} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
