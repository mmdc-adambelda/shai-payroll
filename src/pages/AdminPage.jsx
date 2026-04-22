import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, DEPARTMENTS, STATUS } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { Users, Settings, CheckCircle, XCircle, RefreshCw, CreditCard, FileText, Pencil, Save, Clock } from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    [ROLES.SUPER_ADMIN]: 'bg-brand-900/60 text-brand-300 border-brand-700/40',
    [ROLES.MANAGER]:     'bg-purple-900/60 text-purple-300 border-purple-700/40',
    [ROLES.STAFF]:       'bg-slate-800 text-slate-400 border-slate-700/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${map[role] || map[ROLES.STAFF]}`}>
      {role?.replace('_', ' ').toUpperCase() || 'STAFF'}
    </span>
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

// ─── Employee Edit Modal ────────────────────────────────────
function EditUserModal({ user, onClose, onSave }) {
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState({
    full_name:   user.full_name   || '',
    role:        user.role        || ROLES.STAFF,
    department:  user.department  || DEPARTMENTS.ADMIN,
    employee_id: user.employee_id || '',
    daily_rate:  user.daily_rate  || '',
    position:    user.position    || '',
    phone:       user.phone       || '',
  })
  const [credits, setCredits] = useState({
    leave_sick:      user.leave_sick      ?? 15,
    leave_vacation:  user.leave_vacation  ?? 15,
    leave_emergency: user.leave_emergency ?? 3,
    leave_maternity: user.leave_maternity ?? 60,
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    await onSave(user.id, { ...form, ...credits })
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-white">Edit Employee</h3>
            <p className="text-xs text-slate-400 mt-0.5">{user.full_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-1 p-1 bg-slate-900 rounded-xl mb-5">
          {[{ id: 'info', label: 'Info & Role' }, { id: 'credits', label: 'Leave Credits' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.id ? 'bg-brand-600/30 text-brand-300 border border-brand-600/30' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="space-y-3">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value={ROLES.STAFF}>Staff</option>
                  <option value={ROLES.MANAGER}>Manager</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                  {Object.values(DEPARTMENTS).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Employee ID</label>
                <input className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} placeholder="SHAI-001" />
              </div>
              <div>
                <label className="label">Position</label>
                <input className="input" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="e.g. Technician" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Daily Rate (₱)</label>
                <input type="number" className="input" value={form.daily_rate} onChange={e => setForm({ ...form, daily_rate: e.target.value })} placeholder="600" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+63..." />
              </div>
            </div>
          </div>
        )}

        {tab === 'credits' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 mb-1">Set the available leave credits for this employee.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'leave_sick',      label: 'Sick Leave' },
                { key: 'leave_vacation',  label: 'Vacation Leave' },
                { key: 'leave_emergency', label: 'Emergency Leave' },
                { key: 'leave_maternity', label: 'Maternity/Paternity' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="label">{label} (days)</label>
                  <input type="number" min="0" max="365" className="input"
                    value={credits[key]}
                    onChange={e => setCredits({ ...credits, [key]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-xs text-slate-400 space-y-1 mt-2">
              {[
                { key: 'leave_sick',      label: 'Sick Leave' },
                { key: 'leave_vacation',  label: 'Vacation Leave' },
                { key: 'leave_emergency', label: 'Emergency Leave' },
                { key: 'leave_maternity', label: 'Maternity/Paternity' },
              ].map(({ key, label }) => (
                <div key={key} className="flex justify-between">
                  <span>{label}</span><span className="text-white font-mono">{credits[key]} days</span>
                </div>
              ))}
              <div className="border-t border-slate-800/60 pt-1 flex justify-between font-medium">
                <span className="text-slate-300">Total Credits</span>
                <span className="text-brand-400 font-mono">
                  {credits.leave_sick + credits.leave_vacation + credits.leave_emergency + credits.leave_maternity} days
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Timesheet Edit Modal ───────────────────────────────────
function TimesheetEditModal({ timesheet, onClose, onSaved }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  useEffect(() => { fetchAttendance() }, [])

  async function fetchAttendance() {
    setLoading(true)
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', timesheet.user_id)
      .gte('date', timesheet.period_start)
      .lte('date', timesheet.period_end)
      .order('date')
    setRows(data || [])
    setLoading(false)
  }

  function buildISO(dateStr, timeStr) {
    if (!timeStr) return null
    return `${dateStr}T${timeStr}:00+08:00`
  }

  function toTimeInput(isoStr) {
    if (!isoStr) return ''
    try { return format(parseISO(isoStr), 'HH:mm') } catch { return '' }
  }

  function calcHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return 0
    try {
      const rawHours = (new Date(clockOut) - new Date(clockIn)) / 3600000
      // Deduct 1 hour unpaid lunch break for shifts of 5 hours or more
      const hours = rawHours >= 5 ? rawHours - 1 : rawHours
      return Math.max(0, parseFloat(hours.toFixed(2)))
    } catch { return 0 }
  }

  async function saveRow(row) {
    setSaving(true)
    const hours = calcHours(editingRow.clock_in, editingRow.clock_out)

    const { error } = await supabase
      .from('attendance_records')
      .update({
        clock_in:     editingRow.clock_in  || null,
        clock_out:    editingRow.clock_out || null,
        hours_worked: hours,
      })
      .eq('id', row.id)

    if (!error) {
      const updatedRows = rows.map(r =>
        r.id === row.id
          ? { ...r, clock_in: editingRow.clock_in, clock_out: editingRow.clock_out, hours_worked: hours }
          : r
      )
      setRows(updatedRows)

      const totalHours  = updatedRows.reduce((s, r) => s + (r.hours_worked || 0), 0)
      const daysPresent = updatedRows.filter(r => r.clock_in).length

      await supabase.from('timesheets').update({
        total_hours:  parseFloat(totalHours.toFixed(2)),
        days_present: daysPresent,
        updated_at:   new Date().toISOString(),
      }).eq('id', timesheet.id)
    }

    setEditingRow(null)
    setSaving(false)
  }

  const totalHours  = rows.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const daysPresent = rows.filter(r => r.clock_in).length

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl p-6 animate-in max-h-[90vh] flex flex-col">

        <div className="flex items-start justify-between mb-4 flex-shrink-0">
          <div>
            <h3 className="font-display font-bold text-white">Edit Timesheet</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {timesheet.profiles?.full_name} · {timesheet.period_month} · {timesheet.period_cutoff === '1' ? '1st Cut-off (1–15)' : '2nd Cut-off (16–End)'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-900/20 border border-amber-800/30 mb-4 flex-shrink-0">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            Click the <strong>✏ pencil</strong> on any row to correct clock-in/clock-out times. Each save immediately updates that row and recalculates the timesheet totals. When done, close this window and click <strong>Approve</strong>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4 flex-shrink-0">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-center">
            <div className="text-lg font-bold font-mono text-white">{daysPresent}</div>
            <div className="text-xs text-slate-400">Days Present</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-center">
            <div className="text-lg font-bold font-mono text-brand-400">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-slate-400">Total Hours</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-center">
            <div className="text-lg font-bold font-mono text-amber-400">
              {Math.max(0, totalHours - daysPresent * 8).toFixed(1)}h
            </div>
            <div className="text-xs text-slate-400">Overtime</div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 rounded-xl border border-slate-800/40">
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading attendance records...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No attendance records for this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Clock In</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Clock Out</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Regular</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">OT</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isEditing = editingRow?.id === r.id
                  const regular   = Math.min(r.hours_worked || 0, 8)
                  const ot        = Math.max(0, (r.hours_worked || 0) - 8)

                  return (
                    <tr key={r.id} className={`border-b border-slate-800/40 transition-colors ${isEditing ? 'bg-brand-900/10' : 'hover:bg-slate-800/20'}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                        {format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d')}
                      </td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="time" className="input py-1 px-2 text-xs w-28"
                            value={toTimeInput(editingRow.clock_in)}
                            onChange={e => setEditingRow({ ...editingRow, clock_in: buildISO(r.date, e.target.value) })} />
                        ) : (
                          <span className="font-mono text-slate-300">
                            {r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : <span className="text-slate-600">—</span>}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="time" className="input py-1 px-2 text-xs w-28"
                            value={toTimeInput(editingRow.clock_out)}
                            onChange={e => setEditingRow({ ...editingRow, clock_out: buildISO(r.date, e.target.value) })} />
                        ) : (
                          <span className="font-mono text-slate-300">
                            {r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : <span className="text-slate-600">—</span>}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-emerald-400 text-xs">{regular.toFixed(1)}h</td>
                      <td className="px-4 py-3 font-mono text-amber-400 text-xs">{ot > 0 ? `+${ot.toFixed(1)}h` : '—'}</td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => saveRow(r)} disabled={saving}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700/30 text-emerald-400 hover:bg-emerald-700/50 text-xs font-medium border border-emerald-700/40 transition-all disabled:opacity-50">
                              <Save className="w-3 h-3" /> {saving ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingRow(null)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs font-medium border border-slate-700/40 transition-all">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingRow({ id: r.id, clock_in: r.clock_in, clock_out: r.clock_out })}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-brand-400 transition-all"
                            title="Edit this row">
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-4 flex-shrink-0">
          <button onClick={() => { onSaved(); onClose() }} className="btn-secondary">
            Done — Back to Approvals
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main AdminPage ─────────────────────────────────────────
export default function AdminPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab]         = useState('employees')
  const [employees, setEmployees]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [editUser, setEditUser]           = useState(null)
  const [editTimesheet, setEditTimesheet] = useState(null)
  const [stats, setStats]                 = useState({})
  const [pendingTimesheets, setPendingTimesheets] = useState([])
  const [tsLoading, setTsLoading]         = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')

  useEffect(() => {
    fetchEmployees()
    fetchStats()
    fetchPendingTimesheets()
  }, [])

  async function fetchEmployees() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setEmployees(data || [])
    setLoading(false)
  }

  async function fetchStats() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const [present, leaves, ot, timesheets] = await Promise.all([
      supabase.from('attendance_records').select('id', { count: 'exact' }).eq('date', today).not('clock_in', 'is', null),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('overtime_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('timesheets').select('id', { count: 'exact' }).eq('status', 'submitted'),
    ])
    setStats({
      presentToday:       present.count    || 0,
      pendingLeaves:      leaves.count     || 0,
      pendingOT:          ot.count         || 0,
      pendingTimesheets:  timesheets.count || 0,
    })
  }

  async function fetchPendingTimesheets() {
    setTsLoading(true)
    const { data } = await supabase
      .from('timesheets')
      .select(`*, profiles:user_id(full_name, department, employee_id)`)
      .eq('status', STATUS.SUBMITTED)
      .order('created_at', { ascending: false })
    setPendingTimesheets(data || [])
    setTsLoading(false)
  }

  async function saveEmployee(id, form) {
    await supabase.from('profiles').update(form).eq('id', id)
    fetchEmployees()
    fetchStats()
  }

  async function handleApproveTimesheet(id) {
    await supabase.from('timesheets').update({
      status:      STATUS.APPROVED,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    fetchPendingTimesheets()
    fetchStats()
  }

  async function handleRejectTimesheet(id) {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('timesheets').update({
      status:           STATUS.REJECTED,
      rejection_reason: reason,
    }).eq('id', id)
    fetchPendingTimesheets()
    fetchStats()
  }

  const filteredEmployees = employees.filter(e =>
    e.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.position?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const byDept = filteredEmployees.reduce((acc, e) => {
    const key = e.department || 'Unassigned'
    acc[key] = acc[key] || []
    acc[key].push(e)
    return acc
  }, {})

  const mainTabs = [
    { id: 'employees',  label: 'Employees',           icon: Users,    count: employees.length },
    { id: 'timesheets', label: 'Timesheet Approvals', icon: FileText, count: stats.pendingTimesheets },
  ]

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="section-title">System Administration</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage employees, roles, leave credits, and timesheet approvals</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { value: employees.length,        label: 'Total Employees',    color: 'text-white' },
          { value: stats.presentToday,      label: 'Present Today',      color: 'text-emerald-400' },
          { value: stats.pendingLeaves,     label: 'Pending Leaves',     color: 'text-amber-400' },
          { value: stats.pendingTimesheets, label: 'Pending Timesheets', color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-800/40 w-fit">
        {mainTabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${activeTab === t.id ? 'bg-brand-600/30 text-brand-300' : 'bg-slate-800 text-slate-400'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── EMPLOYEES TAB ── */}
      {activeTab === 'employees' && (
        <>
          <div className="flex items-center gap-3">
            <input className="input max-w-xs text-sm" placeholder="Search by name, ID, or position..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button onClick={fetchEmployees} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="card p-12 text-center text-slate-500">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="card p-12 text-center text-slate-500">No employees found.</div>
          ) : (
            Object.entries(byDept).map(([dept, emps]) => (
              <div key={dept} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                  <h3 className="font-display font-bold text-white">{dept}</h3>
                  <span className="text-slate-500 text-sm">{emps.length} member{emps.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {emps.map(emp => {
                    const totalCredits = (emp.leave_sick ?? 15) + (emp.leave_vacation ?? 15) + (emp.leave_emergency ?? 3) + (emp.leave_maternity ?? 60)
                    return (
                      <div key={emp.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-800/20 transition-colors flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {emp.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{emp.full_name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                              <span>{emp.employee_id || 'No ID'}</span>
                              {emp.position && <><span>·</span><span>{emp.position}</span></>}
                              {emp.daily_rate > 0 && <><span>·</span><span className="text-brand-400">₱{emp.daily_rate}/day</span></>}
                              <span>·</span>
                              <span className="text-emerald-400">{totalCredits} leave days</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <RoleBadge role={emp.role} />
                          <button onClick={() => setEditUser(emp)}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                            title="Edit employee">
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          <div className="card p-5 border-emerald-800/30 bg-emerald-900/10">
            <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" /> Leave Credit Defaults
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-3">
              New employees get these default credits. Click ⚙ Edit on any employee → Leave Credits tab to adjust individually.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[{ label: 'Sick Leave', days: 15 }, { label: 'Vacation Leave', days: 15 }, { label: 'Emergency Leave', days: 3 }, { label: 'Maternity/Paternity', days: 60 }].map(c => (
                <div key={c.label} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40">
                  <div className="text-emerald-400 font-mono font-bold text-base">{c.days}</div>
                  <div className="text-slate-400 mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 border-brand-800/30 bg-brand-900/10">
            <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-brand-400">ℹ</span> Adding New Users
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Create accounts in <strong className="text-white">Supabase Authentication</strong> (Authentication → Users → Add User), then use the Edit button above to assign role, department, daily rate, and leave credits.
            </p>
          </div>
        </>
      )}

      {/* ── TIMESHEET APPROVALS TAB ── */}
      {activeTab === 'timesheets' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <h3 className="font-display font-bold text-white">
              Pending Timesheet Approvals
              {pendingTimesheets.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/40 font-mono">
                  {pendingTimesheets.length}
                </span>
              )}
            </h3>
            <button onClick={fetchPendingTimesheets} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {tsLoading ? (
            <div className="py-12 text-center text-slate-500">Loading...</div>
          ) : pendingTimesheets.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <div className="text-slate-400 font-medium">All caught up!</div>
              <div className="text-slate-600 text-sm mt-1">No timesheets awaiting approval.</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {pendingTimesheets.map(ts => (
                <div key={ts.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 hover:bg-slate-800/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {ts.profiles?.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{ts.profiles?.full_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {ts.profiles?.department}
                        {ts.profiles?.employee_id && <span className="ml-1">· {ts.profiles.employee_id}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono flex items-center gap-2 flex-wrap">
                        <span>{ts.period_month} · {ts.period_cutoff === '1' ? '1st Cut-off (1–15)' : '2nd Cut-off (16–End)'}</span>
                        <span>·</span>
                        <span className="text-emerald-400">{ts.days_present} days</span>
                        <span>·</span>
                        <span className="text-brand-400">{ts.total_hours}h</span>
                      </div>
                      <div className="mt-1"><StatusBadge status={ts.status} /></div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <button
                      onClick={() => setEditTimesheet(ts)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-brand-300 text-xs font-medium border border-slate-700/40 transition-all"
                      title="Edit attendance records before approving">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleApproveTimesheet(ts.id)}
                      className="btn-success text-xs flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleRejectTimesheet(ts.id)}
                      className="btn-danger text-xs flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={saveEmployee} />
      )}
      {editTimesheet && (
        <TimesheetEditModal
          timesheet={editTimesheet}
          onClose={() => setEditTimesheet(null)}
          onSaved={fetchPendingTimesheets}
        />
      )}
    </div>
  )
}
