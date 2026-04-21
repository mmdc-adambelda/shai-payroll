import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { Clock, Search, Download } from 'lucide-react'

function StatusBadge({ record }) {
  if (!record.clock_in) return <span className="badge-rejected">Absent</span>
  if (!record.clock_out) return <span className="badge-pending">Incomplete</span>
  return <span className="badge-approved">Present</span>
}

function formatTime(iso) {
  if (!iso) return '—'
  return format(parseISO(iso), 'HH:mm')
}

export default function AttendancePage() {
  const { profile } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'))
  const [viewAll, setViewAll] = useState(false) // managers can view all
  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => {
    fetchRecords()
  }, [monthFilter, viewAll, profile])

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
      // Managers see their department only
      query = query.eq('profiles.department', profile.department)
    }

    const { data } = await query
    setRecords(data || [])
    setLoading(false)
  }

  const filtered = records.filter(r =>
    !search ||
    r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.date.includes(search)
  )

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Attendance Records</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track daily clock-in and clock-out logs</p>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No records found for this period.</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 text-slate-200 font-mono text-xs">
                      {format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d yyyy')}
                    </td>
                    {(isManager && viewAll) && (
                      <td className="px-5 py-3">
                        <div className="text-slate-200 text-sm">{r.profiles?.full_name}</div>
                        <div className="text-slate-500 text-xs">{r.profiles?.department}</div>
                      </td>
                    )}
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {formatTime(r.clock_in)}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {formatTime(r.clock_out)}
                    </td>
                    <td className="px-5 py-3 font-mono text-brand-400">
                      {r.hours_worked ? `${r.hours_worked}h` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge record={r} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800/60 flex gap-6 text-sm text-slate-400">
            <span>Total days: <span className="text-white font-medium">{filtered.length}</span></span>
            <span>Total hours: <span className="text-brand-400 font-medium font-mono">
              {filtered.reduce((s, r) => s + (r.hours_worked || 0), 0).toFixed(1)}h
            </span></span>
          </div>
        )}
      </div>
    </div>
  )
}
