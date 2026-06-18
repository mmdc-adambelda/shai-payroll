import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, HOLIDAY_TYPES, HOLIDAY_TYPE_LABELS } from '../lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import {
  CalendarDays, Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight,
  AlertTriangle, List, RefreshCw,
} from 'lucide-react'

// ── Badge ─────────────────────────────────────────────────────
function HolidayTypeBadge({ type }) {
  const map = {
    REGULAR:         'bg-red-900/40 text-red-300 border-red-800/40',
    SPECIAL:         'bg-amber-900/40 text-amber-300 border-amber-800/40',
    SPECIAL_WORKING: 'bg-blue-900/40 text-blue-300 border-blue-800/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[type] || map.REGULAR}`}>
      {HOLIDAY_TYPE_LABELS[type] || type}
    </span>
  )
}

// ── Add / Edit Modal ──────────────────────────────────────────
function HolidayModal({ holiday, onClose, onSave }) {
  const { profile } = useAuth()
  const isEdit = !!holiday?.id
  const [form, setForm] = useState({
    holiday_name: holiday?.holiday_name || '',
    holiday_date: holiday?.holiday_date || '',
    holiday_type: holiday?.holiday_type || HOLIDAY_TYPES.REGULAR,
    is_active:    holiday?.is_active    ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.holiday_name.trim()) { setError('Holiday name is required.'); return }
    if (!form.holiday_date)        { setError('Date is required.');          return }

    setLoading(true)
    let result
    if (isEdit) {
      result = await supabase.from('holidays')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', holiday.id)
    } else {
      result = await supabase.from('holidays')
        .insert({ ...form, created_by: profile.id })
    }
    setLoading(false)

    if (result.error) {
      setError(result.error.message.includes('unique') ? 'A holiday already exists on that date.' : result.error.message)
      return
    }
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">{isEdit ? 'Edit Holiday' : 'Add Holiday'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-800/40 text-red-300 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Holiday Name</label>
            <input className="input" required value={form.holiday_name}
              onChange={e => setForm({ ...form, holiday_name: e.target.value })}
              placeholder="e.g. Christmas Day" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" required value={form.holiday_date}
                onChange={e => setForm({ ...form, holiday_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Holiday Type</label>
              <select className="input" value={form.holiday_type}
                onChange={e => setForm({ ...form, holiday_type: e.target.value })}>
                {Object.entries(HOLIDAY_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <span className="text-sm text-slate-300 flex-1">Active (included in payroll computation)</span>
            <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}>
              {form.is_active
                ? <ToggleRight className="w-7 h-7 text-emerald-400" />
                : <ToggleLeft  className="w-7 h-7 text-slate-600" />}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-xs space-y-1 text-slate-400">
            <div className="font-medium text-slate-300 mb-1">Pay Multipliers:</div>
            {form.holiday_type === 'REGULAR' && (
              <>
                <div className="flex justify-between"><span>Absent (scheduled)</span><span className="text-emerald-400">100 %</span></div>
                <div className="flex justify-between"><span>Worked — Regular</span><span className="text-emerald-400">200 %</span></div>
                <div className="flex justify-between"><span>Worked — OT</span><span className="text-emerald-400">260 %</span></div>
                <div className="flex justify-between"><span>Rest Day + Holiday</span><span className="text-emerald-400">260 %</span></div>
                <div className="flex justify-between"><span>Rest Day + Holiday + OT</span><span className="text-emerald-400">338 %</span></div>
              </>
            )}
            {form.holiday_type === 'SPECIAL' && (
              <>
                <div className="flex justify-between"><span>Absent</span><span className="text-amber-400">No pay*</span></div>
                <div className="flex justify-between"><span>Worked — Regular</span><span className="text-amber-400">130 %</span></div>
                <div className="flex justify-between"><span>Worked — OT</span><span className="text-amber-400">169 %</span></div>
                <div className="flex justify-between"><span>Rest Day + Special</span><span className="text-amber-400">150 %</span></div>
                <div className="flex justify-between"><span>Rest Day + Special + OT</span><span className="text-amber-400">195 %</span></div>
                <div className="text-xs text-slate-500 mt-1">*Unless "Pay special if absent" setting is enabled</div>
              </>
            )}
            {form.holiday_type === 'SPECIAL_WORKING' && (
              <div className="flex justify-between"><span>Treated as a regular workday</span><span className="text-blue-400">100 % / OT 125 %</span></div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Holiday'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirmation ───────────────────────────────────────
function DeleteModal({ holiday, onClose, onDelete }) {
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    await supabase.from('holidays').delete().eq('id', holiday.id)
    setLoading(false)
    onDelete()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 animate-in">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-900/30 border border-red-800/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-display font-bold text-white">Delete Holiday?</h3>
            <p className="text-slate-400 text-sm mt-1">
              Permanently delete <span className="text-white font-medium">{holiday.holiday_name}</span> ({format(new Date(holiday.holiday_date + 'T00:00:00'), 'MMM d, yyyy')}).
              This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={confirm} disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 text-sm font-medium transition-all disabled:opacity-50">
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Calendar View ─────────────────────────────────────────────
function HolidayCalendar({ holidays, viewYear, viewMonth }) {
  const monthStart = startOfMonth(new Date(viewYear, viewMonth - 1, 1))
  const monthEnd   = endOfMonth(monthStart)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const holidayByDate = useMemo(() => {
    const map = {}
    for (const h of holidays) map[h.holiday_date] = h
    return map
  }, [holidays])

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const firstDow = getDay(monthStart)

  const calendarCells = [
    ...Array(firstDow).fill(null),
    ...days,
  ]

  const typeStyle = {
    REGULAR:         'bg-red-900/60 border-red-700/60 text-red-200',
    SPECIAL:         'bg-amber-900/60 border-amber-700/60 text-amber-200',
    SPECIAL_WORKING: 'bg-blue-900/60 border-blue-700/60 text-blue-200',
  }

  return (
    <div className="card p-5">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DOW.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const ds = format(day, 'yyyy-MM-dd')
          const holiday = holidayByDate[ds]
          return (
            <div key={ds}
              className={`min-h-[52px] rounded-xl border p-1.5 flex flex-col gap-0.5 transition-all
                ${holiday
                  ? `${typeStyle[holiday.holiday_type]} cursor-default`
                  : 'border-slate-800/40 bg-slate-900/40'
                }`}>
              <span className={`text-xs font-mono font-bold ${holiday ? '' : 'text-slate-500'}`}>
                {format(day, 'd')}
              </span>
              {holiday && (
                <span className="text-[9px] leading-tight font-medium break-words" title={holiday.holiday_name}>
                  {holiday.holiday_name.length > 18 ? holiday.holiday_name.slice(0, 16) + '…' : holiday.holiday_name}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        {Object.entries(HOLIDAY_TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full border ${
              type === 'REGULAR'         ? 'bg-red-700    border-red-600'    :
              type === 'SPECIAL'         ? 'bg-amber-700  border-amber-600'  :
                                           'bg-blue-700   border-blue-600'
            }`} />
            <span className="text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function HolidaysPage() {
  const [holidays, setHolidays]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [viewMode, setViewMode]       = useState('list')   // 'list' | 'calendar'
  const [showModal, setShowModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const now = new Date()
  const [filterYear,  setFilterYear]  = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(0)             // 0 = all months
  const [filterType,  setFilterType]  = useState('')            // '' = all types
  const [calMonth,    setCalMonth]    = useState(now.getMonth() + 1)

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => { fetchHolidays() }, [])

  async function fetchHolidays() {
    setLoading(true)
    const { data } = await supabase
      .from('holidays')
      .select('*')
      .order('holiday_date', { ascending: true })
    setHolidays(data || [])
    setLoading(false)
  }

  async function toggleActive(holiday) {
    await supabase.from('holidays')
      .update({ is_active: !holiday.is_active, updated_at: new Date().toISOString() })
      .eq('id', holiday.id)
    fetchHolidays()
  }

  // Apply filters
  const filtered = useMemo(() => holidays.filter(h => {
    const d = new Date(h.holiday_date + 'T00:00:00')
    if (d.getFullYear() !== filterYear)                         return false
    if (filterMonth && d.getMonth() + 1 !== filterMonth)       return false
    if (filterType  && h.holiday_type !== filterType)          return false
    return true
  }), [holidays, filterYear, filterMonth, filterType])

  // Calendar view: only show the current calendar month/year
  const calendarHolidays = useMemo(() => holidays.filter(h => {
    const d = new Date(h.holiday_date + 'T00:00:00')
    return d.getFullYear() === filterYear && d.getMonth() + 1 === calMonth
  }), [holidays, filterYear, calMonth])

  const MONTHS = [
    { value: 0,  label: 'All Months' },
    ...[...Array(12)].map((_, i) => ({
      value: i + 1,
      label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
    })),
  ]

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-brand-400" />
            Holiday Management
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Manage Philippine public holidays for payroll computation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchHolidays} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => { setEditTarget(null); setShowModal(true) }}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total',           value: filtered.length,                                    color: 'text-white' },
          { label: 'Regular',         value: filtered.filter(h => h.holiday_type === 'REGULAR').length,   color: 'text-red-400' },
          { label: 'Special Non-Work',value: filtered.filter(h => h.holiday_type === 'SPECIAL').length,   color: 'text-amber-400' },
          { label: 'Special Working', value: filtered.filter(h => h.holiday_type === 'SPECIAL_WORKING').length, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year */}
        <select className="input py-2 text-sm w-auto" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Month */}
        <select className="input py-2 text-sm w-auto" value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Type */}
        <select className="input py-2 text-sm w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(HOLIDAY_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="ml-auto flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-800/40">
          {[{ id: 'list', icon: List }, { id: 'calendar', icon: CalendarDays }].map(({ id, icon: Icon }) => (
            <button key={id} onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                viewMode === id
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="w-3.5 h-3.5" />{id}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select className="input py-2 text-sm w-auto" value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}>
              {MONTHS.slice(1).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span className="text-slate-400 text-sm">{filterYear}</span>
          </div>
          <HolidayCalendar holidays={calendarHolidays} viewYear={filterYear} viewMonth={calMonth} />
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h3 className="font-display font-bold text-white">
              Holiday List
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">{filtered.length}</span>
            </h3>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading holidays...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <CalendarDays className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <div className="text-slate-400 font-medium">No holidays found</div>
              <div className="text-slate-600 text-sm mt-1">Try adjusting the filters or add a new holiday.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60">
                    <th className="text-left px-5 py-3 text-slate-500 font-medium">Holiday</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium">Date</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium">Type</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium">Status</th>
                    <th className="px-5 py-3 text-slate-500 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => (
                    <tr key={h.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-white">{h.holiday_name}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-300 whitespace-nowrap">
                        {format(new Date(h.holiday_date + 'T00:00:00'), 'EEE, MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-3">
                        <HolidayTypeBadge type={h.holiday_type} />
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleActive(h)}
                          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                          title={h.is_active ? 'Click to disable' : 'Click to enable'}>
                          {h.is_active
                            ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">Active</span></>
                            : <><ToggleLeft  className="w-5 h-5 text-slate-600" /> <span className="text-slate-500">Disabled</span></>}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setEditTarget(h); setShowModal(true) }}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-brand-400 transition-all"
                            title="Edit">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDeleteTarget(h)}
                            className="w-7 h-7 rounded-lg bg-red-900/20 hover:bg-red-900/40 flex items-center justify-center text-red-500 hover:text-red-400 transition-all"
                            title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info panel */}
      <div className="card p-5 border-brand-800/30 bg-brand-900/10">
        <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-brand-400">ℹ</span> Philippine Holiday Pay Rules
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="space-y-1">
            <div className="font-medium text-red-300 mb-1">Regular Holiday</div>
            <div>Absent (scheduled) → 100 %</div>
            <div>Worked → 200 %</div>
            <div>Worked + OT → 260 %</div>
            <div>Rest Day → 260 %</div>
            <div>Rest Day + OT → 338 %</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-amber-300 mb-1">Special Non-Working</div>
            <div>Absent → No pay*</div>
            <div>Worked → 130 %</div>
            <div>Worked + OT → 169 %</div>
            <div>Rest Day → 150 %</div>
            <div>Rest Day + OT → 195 %</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-blue-300 mb-1">Special Working</div>
            <div>Treated as normal workday</div>
            <div>Regular → 100 %</div>
            <div>OT → 125 %</div>
            <div className="text-slate-500 mt-2">*Enable "Pay special if absent" in Payroll Settings to change this.</div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <HolidayModal
          holiday={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSave={() => { setShowModal(false); setEditTarget(null); fetchHolidays() }}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          holiday={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => { setDeleteTarget(null); fetchHolidays() }}
        />
      )}
    </div>
  )
}
