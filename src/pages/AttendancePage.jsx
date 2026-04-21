import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { Clock, Search, Plus, Pencil, Save, X, Trash2 } from 'lucide-react'

function StatusBadge({ record }) {
  if (!record.clock_in) return <span className="badge-rejected">Absent</span>
  if (!record.clock_out) return <span className="badge-pending">Incomplete</span>
  return <span className="badge-approved">Present</span>
}

function formatTime(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'HH:mm') } catch { return '—' }
}

// Build a full ISO timestamp from a date string + HH:mm input
function buildISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  return `${dateStr}T${timeStr}:00+08:00`
}

function calcHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0
  const diff = (new Date(clockOut) - new Date(clockIn)) / 3600000
  return Math.max(0, parseFloat(diff.toFixed(2)))
}

// ─── Log Entry Modal (add or edit a record) ────────────────
function LogEntryModal({ record, userId, onClose, onSaved }) {
  const isEdit = !!record
  const [form, setForm] = useState({
    date:      record?.date      || format(new Date(), 'yyyy-MM-dd'),
    clock_in:  record?.clock_in  ? format(parseISO(record.clock_in),  'HH:mm') : '',
    clock_out: record?.clock_out ? format(parseISO(record.clock_out), 'HH:mm') : '',
    notes:     record?.notes     || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const hoursPreview = form.clock_in && form.clock_out
    ? calcHours(buildISO(form.date, form.clock_in), buildISO(form.date, form.clock_out))
    : null

  async function handleSave() {
    setError('')
    if (!form.date) { setError('Please select a date.'); return }
    if (!form.clock_in) { setError('Clock-in time is required.'); return }
    if (form.clock_out && form.clock_in >= form.clock_out) {
      setError('Clock-out must be after clock-in.'); return
    }

    setLoading(true)
    const payload = {
      clock_in:     buildISO(form.date, form.clock_in),
      clock_out:    form.clock_out ? buildISO(form.date, form.clock_out) : null,
      hours_worked: hoursPreview || 0,
      notes:        form.notes || null,
      status:       'present',
    }

    let err
    if (isEdit) {
      ;({ error: err } = await supabase
        .from('attendance_records')
        .update(payload)
        .eq('id', record.id))
    } else {
      ;({ error: err } = await supabase
        .from('attendance_records')
        .insert({ ...payload, user_id: userId, date: form.date }))
    }

    setLoading(false)
    if (err) {
      if (err.code === '23505') {
        setError('A record already exists for this date. Edit the existing entry instead.')
      } else {
        setError(err.message)
      }
    } else {
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-bold text-white">
              {isEdit ? 'Edit Log Entry' : 'Log Hours'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? `Editing ${format(new Date(record.date + 'T00:00:00'), 'EEE, MMM d yyyy')}` : 'Add hours for any date'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* Date picker */}
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={form.date}
              disabled={isEdit} // date is fixed when editing
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
            {isEdit && <p className="text-xs text-slate-500 mt-1">Date cannot be changed. Delete and re-add to change the date.</p>}
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Clock In</label>
              <input
                type="time"
                className="input"
                value={form.clock_in}
                onChange={e => setForm({ ...form, clock_in: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Clock Out <span className="text-slate-600">(optional)</span></label>
              <input
                type="time"
                className="input"
                value={form.clock_out}
                onChange={e => setForm({ ...form, clock_out: e.target.value })}
              />
            </div>
          </div>

          {/* Hours preview */}
          {hoursPreview !== null && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-brand-900/20 border border-brand-800/30 text-sm">
              <span className="text-slate-400">Calculated hours</span>
              <span className="font-mono font-bold text-brand-400">
                {hoursPreview}h
                {hoursPreview > 8 && (
                  <span className="ml-2 text-amber-400 text-xs">(+{(hoursPreview - 8).toFixed(2)}h OT)</span>
                )}
              </span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-slate-600">(optional)</span></label>
            <input
              className="input"
              placeholder="e.g. Field work, WFH, etc."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-900/20 border border-red-800/30 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Log Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function AttendancePage() {
  const { profile } = useAuth()
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'))
  const [viewAll, setViewAll]     = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [deleting, setDeleting]   = useState(null)

  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => { if (profile) fetchRecords() }, [monthFilter, viewAll, profile])

  async function fetchRecords() {
    if (!profile) return
    setLoading(true)
    let query = supabase
      .from('attendance_records')
      .select(`*, profiles:user_id(full_name, department, employee_id)`)
      .gte('date', `${monthFilter}-01`)
      .lte('date', `${monthFilter}-31`)
      .order('date', { ascending: false })

    if (!isManager || !viewAll) {
      query = query.eq('user_id', profile.id)
    } else if (profile.role === ROLES.MANAGER) {
      query = query.eq('profiles.department', profile.department)
    }

    const { data } = await query
    setRecords(data || [])
    setLoading(false)
  }

  async function handleDelete(record) {
    if (!window.confirm(`Delete attendance record for ${format(new Date(record.date + 'T00:00:00'), 'MMM d, yyyy')}? This cannot be undone.`)) return
    setDeleting(record.id)
    await supabase.from('attendance_records').delete().eq('id', record.id)
    setDeleting(null)
    fetchRecords()
  }

  const filtered = records.filter(r =>
    !search ||
    r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.date.includes(search)
  )

  const canEditRecord = (r) => {
    // User can edit their own; super_admin can edit any
    if (profile?.role === ROLES.SUPER_ADMIN) return true
    return r.user_id === profile?.id
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Attendance Records</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track and log daily clock-in and clock-out hours</p>
        </div>
        <button
          onClick={() => { setEditRecord(null); setShowModal(true) }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Log Hours
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-900/20 border border-brand-800/30">
        <Clock className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-brand-300 leading-relaxed">
          Use <strong>Log Hours</strong> to add or correct attendance for any date — past or future. Click the <strong>✏ pencil</strong> on any row to edit an existing entry. The Dashboard clock-in button is a quick shortcut for today only.
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 text-sm flex-1"
            placeholder="Search by name or date..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <input
          type="month"
          className="input py-2 w-auto text-sm"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
        />
        {isManager && (
          <button
            onClick={() => setViewAll(!viewAll)}
            className={`btn-secondary text-sm ${viewAll ? 'border-brand-600/50 text-brand-400' : ''}`}
          >
            {viewAll ? 'My Records' : 'All Team'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Date</th>
                {(isManager && viewAll) && <th className="text-left px-5 py-3 text-slate-500 font-medium">Employee</th>}
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Clock In</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Clock Out</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Hours</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="text-slate-500 mb-3">No records found for this period.</div>
                    <button
                      onClick={() => { setEditRecord(null); setShowModal(true) }}
                      className="btn-primary text-sm inline-flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Log Hours for This Month
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors group">
                    <td className="px-5 py-3 text-slate-200 font-mono text-xs whitespace-nowrap">
                      {format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d yyyy')}
                    </td>
                    {(isManager && viewAll) && (
                      <td className="px-5 py-3">
                        <div className="text-slate-200 text-sm">{r.profiles?.full_name}</div>
                        <div className="text-slate-500 text-xs">{r.profiles?.department}</div>
                      </td>
                    )}
                    <td className="px-5 py-3 font-mono text-slate-300">{formatTime(r.clock_in)}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">{formatTime(r.clock_out)}</td>
                    <td className="px-5 py-3 font-mono text-brand-400">
                      {r.hours_worked ? `${r.hours_worked}h` : '—'}
                      {r.hours_worked > 8 && (
                        <span className="ml-1 text-xs text-amber-400">+{(r.hours_worked - 8).toFixed(1)}h OT</span>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge record={r} /></td>
                    <td className="px-5 py-3">
                      {canEditRecord(r) && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditRecord(r); setShowModal(true) }}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-brand-400 transition-all"
                            title="Edit this entry"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            disabled={deleting === r.id}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-red-900/40 flex items-center justify-center text-slate-500 hover:text-red-400 transition-all"
                            title="Delete this entry"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800/60 flex flex-wrap gap-6 text-sm text-slate-400">
            <span>Total days: <span className="text-white font-medium">{filtered.filter(r => r.clock_in).length}</span></span>
            <span>Total hours: <span className="text-brand-400 font-medium font-mono">
              {filtered.reduce((s, r) => s + (r.hours_worked || 0), 0).toFixed(1)}h
            </span></span>
            <span>Overtime: <span className="text-amber-400 font-medium font-mono">
              {Math.max(0, filtered.reduce((s, r) => s + Math.max(0, (r.hours_worked || 0) - 8), 0)).toFixed(1)}h
            </span></span>
          </div>
        )}
      </div>

      {showModal && (
        <LogEntryModal
          record={editRecord}
          userId={profile?.id}
          onClose={() => { setShowModal(false); setEditRecord(null) }}
          onSaved={fetchRecords}
        />
      )}
    </div>
  )
}
