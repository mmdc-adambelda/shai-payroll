import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { Clock, Search, Plus, Pencil, Trash2, X, Users, Wifi, RefreshCw } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────
function StatusBadge({ record }) {
  if (!record.clock_in)  return <span className="badge-rejected">Absent</span>
  if (!record.clock_out) return <span className="badge-pending">Clocked In</span>
  return <span className="badge-approved">Present</span>
}

function formatTime(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'HH:mm') } catch { return '—' }
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

function elapsed(clockIn) {
  if (!clockIn) return ''
  const diff = (Date.now() - new Date(clockIn)) / 3600000
  const h = Math.floor(diff)
  const m = Math.floor((diff - h) * 60)
  return `${h}h ${m}m`
}

// ─── Log Entry Modal ─────────────────────────────────────────
function LogEntryModal({ record, userId, targetName, onClose, onSaved }) {
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
    if (!form.date)     { setError('Please select a date.'); return }
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
      ;({ error: err } = await supabase.from('attendance_records').update(payload).eq('id', record.id))
    } else {
      ;({ error: err } = await supabase.from('attendance_records').insert({ ...payload, user_id: userId, date: form.date }))
    }
    setLoading(false)
    if (err) {
      setError(err.code === '23505' ? 'A record already exists for this date. Edit the existing entry instead.' : err.message)
    } else { onSaved(); onClose() }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-bold text-white">{isEdit ? 'Edit Log Entry' : 'Log Hours'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {targetName
                ? <span>For <span className="text-brand-400 font-medium">{targetName}</span></span>
                : isEdit ? format(new Date(record.date + 'T00:00:00'), 'EEE, MMM d yyyy') : 'Add hours for any date'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} disabled={isEdit}
              onChange={e => setForm({ ...form, date: e.target.value })} />
            {isEdit && <p className="text-xs text-slate-500 mt-1">Date cannot be changed. Delete and re-add to change the date.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Clock In</label>
              <input type="time" className="input" value={form.clock_in} onChange={e => setForm({ ...form, clock_in: e.target.value })} />
            </div>
            <div>
              <label className="label">Clock Out <span className="text-slate-600">(optional)</span></label>
              <input type="time" className="input" value={form.clock_out} onChange={e => setForm({ ...form, clock_out: e.target.value })} />
            </div>
          </div>
          {hoursPreview !== null && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-brand-900/20 border border-brand-800/30 text-sm">
              <span className="text-slate-400">Calculated hours</span>
              <span className="font-mono font-bold text-brand-400">
                {hoursPreview}h
                {hoursPreview > 8 && <span className="ml-2 text-amber-400 text-xs">(+{(hoursPreview - 8).toFixed(2)}h OT)</span>}
              </span>
            </div>
          )}
          <div>
            <label className="label">Notes <span className="text-slate-600">(optional)</span></label>
            <input className="input" placeholder="e.g. Field work, WFH, etc." value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && <div className="p-3 rounded-xl bg-red-900/20 border border-red-800/30 text-xs text-red-400">{error}</div>}
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

// ─── Real-time Today Panel (Manager/Admin only) ──────────────
function TodayPanel() {
  const [liveRecords, setLiveRecords] = useState([])
  const [loading, setLoading]         = useState(true)
  const [, setTick]                   = useState(0)
  const channelRef                    = useRef(null)

  useEffect(() => {
    fetchToday()
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    channelRef.current = supabase
      .channel('today_attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, fetchToday)
      .subscribe()
    return () => {
      clearInterval(interval)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  async function fetchToday() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('attendance_records')
      .select('*, profiles:user_id(full_name, department, employee_id)')
      .eq('date', today)
      .order('clock_in', { ascending: false })
    setLiveRecords(data || [])
    setLoading(false)
  }

  const clockedIn  = liveRecords.filter(r => r.clock_in && !r.clock_out)
  const clockedOut = liveRecords.filter(r => r.clock_in && r.clock_out)

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="font-display font-bold text-white">Live — Today's Attendance</h3>
          <span className="text-xs text-slate-500">{format(new Date(), 'EEE, MMM d yyyy')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <Wifi className="w-3 h-3" /> Real-time
          </span>
          <button onClick={fetchToday} className="text-slate-500 hover:text-slate-300 transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-800/60 border-b border-slate-800/60">
        <div className="px-5 py-3 text-center">
          <div className="text-xl font-bold font-mono text-emerald-400">{clockedIn.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Currently In</div>
        </div>
        <div className="px-5 py-3 text-center">
          <div className="text-xl font-bold font-mono text-brand-400">{clockedOut.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Completed</div>
        </div>
        <div className="px-5 py-3 text-center">
          <div className="text-xl font-bold font-mono text-white">{liveRecords.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Present</div>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500 text-sm">Loading...</div>
      ) : liveRecords.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">No attendance logged today yet.</div>
      ) : (
        <div className="divide-y divide-slate-800/40 max-h-64 overflow-y-auto">
          {[...clockedIn, ...clockedOut].map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.clock_out ? 'bg-slate-600' : 'bg-emerald-400 animate-pulse'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{r.profiles?.full_name}</div>
                  <div className="text-xs text-slate-500">{r.profiles?.department}</div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-mono text-slate-300">
                  {formatTime(r.clock_in)}{r.clock_out ? ` → ${formatTime(r.clock_out)}` : ' → now'}
                </div>
                <div className={`text-xs font-mono mt-0.5 ${r.clock_out ? 'text-brand-400' : 'text-emerald-400'}`}>
                  {r.clock_out ? `${r.hours_worked}h logged` : `${elapsed(r.clock_in)} elapsed`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function AttendancePage() {
  const { profile } = useAuth()
  const [records, setRecords]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'))
  const [viewAll, setViewAll]         = useState(false)
  const [empFilter, setEmpFilter]     = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editRecord, setEditRecord]   = useState(null)
  const [logForUser, setLogForUser]   = useState(null)
  const [deleting, setDeleting]       = useState(null)
  const [employees, setEmployees]     = useState([])

  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => {
    if (profile) {
      fetchRecords()
      if (isManager) fetchEmployees()
    }
  }, [monthFilter, viewAll, empFilter, profile])

  async function fetchEmployees() {
    const { data } = await supabase.from('profiles').select('id, full_name, department').order('full_name')
    setEmployees(data || [])
  }

  async function fetchRecords() {
    if (!profile) return
    setLoading(true)
    let query = supabase
      .from('attendance_records')
      .select('*, profiles:user_id(full_name, department, employee_id)')
      .gte('date', `${monthFilter}-01`)
      .lte('date', `${monthFilter}-31`)
      .order('date', { ascending: false })

    if (!isManager || !viewAll) {
      query = query.eq('user_id', profile.id)
    } else if (empFilter) {
      query = query.eq('user_id', empFilter)
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

  // Managers and super_admin can edit/delete any record
  const canEditRecord = (r) => isManager || r.user_id === profile?.id

  const filtered = records.filter(r =>
    !search ||
    r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.date.includes(search)
  )

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Attendance Records</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track and log daily clock-in and clock-out hours</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && viewAll && (
            <select
              className="input py-2 text-sm w-auto"
              defaultValue=""
              onChange={e => {
                const emp = employees.find(x => x.id === e.target.value)
                if (emp) { setLogForUser({ id: emp.id, name: emp.full_name }); setEditRecord(null); setShowModal(true) }
                e.target.value = ''
              }}
            >
              <option value="" disabled>Log for employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          )}
          <button onClick={() => { setLogForUser(null); setEditRecord(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Log Hours
          </button>
        </div>
      </div>

      {/* Real-time today panel — managers/admin only */}
      {isManager && <TodayPanel />}

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-900/20 border border-brand-800/30">
        <Clock className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-brand-300 leading-relaxed">
          Use <strong>Log Hours</strong> to add or correct attendance for any date — past or future.
          Hover over any row and click the <strong>✏ pencil</strong> to edit.
          {isManager && <> As <strong>Manager/Admin</strong>, you can edit or delete any team member's records and log hours on their behalf.</>}
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
        <input type="month" className="input py-2 w-auto text-sm" value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)} />
        {isManager && (
          <>
            <button
              onClick={() => { setViewAll(v => !v); setEmpFilter('') }}
              className={`btn-secondary text-sm flex items-center gap-2 ${viewAll ? 'border-brand-600/50 text-brand-400' : ''}`}
            >
              <Users className="w-3.5 h-3.5" />
              {viewAll ? 'My Records' : 'All Team'}
            </button>
            {viewAll && (
              <select className="input py-2 text-sm w-auto" value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
                <option value="">All employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            )}
          </>
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
                    <button onClick={() => { setLogForUser(null); setEditRecord(null); setShowModal(true) }}
                      className="btn-primary text-sm inline-flex items-center gap-2">
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
                      {r.hours_worked > 8 && <span className="ml-1 text-xs text-amber-400">+{(r.hours_worked - 8).toFixed(1)}h OT</span>}
                    </td>
                    <td className="px-5 py-3"><StatusBadge record={r} /></td>
                    <td className="px-5 py-3">
                      {canEditRecord(r) && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setLogForUser(null); setEditRecord(r); setShowModal(true) }}
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
          userId={logForUser ? logForUser.id : profile?.id}
          targetName={logForUser ? logForUser.name : null}
          onClose={() => { setShowModal(false); setEditRecord(null); setLogForUser(null) }}
          onSaved={fetchRecords}
        />
      )}
    </div>
  )
}
