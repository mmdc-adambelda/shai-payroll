import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, DEPARTMENTS, STATUS } from '../lib/supabase'
import { format } from 'date-fns'
import { Users, Settings, CheckCircle, XCircle, RefreshCw, CreditCard, FileText } from 'lucide-react'

function RoleBadge({ role }) {
  const map = {
    [ROLES.SUPER_ADMIN]: 'bg-brand-900/60 text-brand-300 border-brand-700/40',
    [ROLES.MANAGER]: 'bg-purple-900/60 text-purple-300 border-purple-700/40',
    [ROLES.STAFF]: 'bg-slate-800 text-slate-400 border-slate-700/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${map[role] || map[ROLES.STAFF]}`}>
      {role?.replace('_', ' ').toUpperCase() || 'STAFF'}
    </span>
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

function EditUserModal({ user, onClose, onSave }) {
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role || ROLES.STAFF,
    department: user.department || DEPARTMENTS.ADMIN,
    employee_id: user.employee_id || '',
    daily_rate: user.daily_rate || '',
    position: user.position || '',
    phone: user.phone || '',
  })
  const [credits, setCredits] = useState({
    leave_sick: user.leave_sick ?? 15,
    leave_vacation: user.leave_vacation ?? 15,
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

  const tabs = [
    { id: 'info', label: 'Info & Role' },
    { id: 'credits', label: 'Leave Credits' },
  ]

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

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-slate-900 rounded-xl mb-5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.id
                  ? 'bg-brand-600/30 text-brand-300 border border-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
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
            <p className="text-xs text-slate-400 mb-1">Set the available leave credits for this employee. These represent the total days they are entitled to use.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sick Leave (days)</label>
                <input
                  type="number" min="0" max="365"
                  className="input"
                  value={credits.leave_sick}
                  onChange={e => setCredits({ ...credits, leave_sick: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="label">Vacation Leave (days)</label>
                <input
                  type="number" min="0" max="365"
                  className="input"
                  value={credits.leave_vacation}
                  onChange={e => setCredits({ ...credits, leave_vacation: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="label">Emergency Leave (days)</label>
                <input
                  type="number" min="0" max="365"
                  className="input"
                  value={credits.leave_emergency}
                  onChange={e => setCredits({ ...credits, leave_emergency: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="label">Maternity/Paternity (days)</label>
                <input
                  type="number" min="0" max="365"
                  className="input"
                  value={credits.leave_maternity}
                  onChange={e => setCredits({ ...credits, leave_maternity: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 text-xs text-slate-400 space-y-1 mt-2">
              <div className="flex justify-between"><span>Sick Leave</span><span className="text-white font-mono">{credits.leave_sick} days</span></div>
              <div className="flex justify-between"><span>Vacation Leave</span><span className="text-white font-mono">{credits.leave_vacation} days</span></div>
              <div className="flex justify-between"><span>Emergency Leave</span><span className="text-white font-mono">{credits.leave_emergency} days</span></div>
              <div className="flex justify-between"><span>Maternity/Paternity</span><span className="text-white font-mono">{credits.leave_maternity} days</span></div>
              <div className="border-t border-slate-800/60 pt-1 flex justify-between font-medium">
                <span className="text-slate-300">Total Credits</span>
                <span className="text-brand-400 font-mono">{credits.leave_sick + credits.leave_vacation + credits.leave_emergency + credits.leave_maternity} days</span>
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

export default function AdminPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('employees')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState(null)
  const [stats, setStats] = useState({})
  const [pendingTimesheets, setPendingTimesheets] = useState([])
  const [tsLoading, setTsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
      presentToday: present.count || 0,
      pendingLeaves: leaves.count || 0,
      pendingOT: ot.count || 0,
      pendingTimesheets: timesheets.count || 0,
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
      status: STATUS.APPROVED,
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
      status: STATUS.REJECTED,
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
    { id: 'employees', label: 'Employees', icon: Users, count: employees.length },
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
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">{employees.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Employees</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-emerald-400">{stats.presentToday}</div>
          <div className="text-xs text-slate-400 mt-1">Present Today</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-400">{stats.pendingLeaves}</div>
          <div className="text-xs text-slate-400 mt-1">Pending Leaves</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-purple-400">{stats.pendingTimesheets}</div>
          <div className="text-xs text-slate-400 mt-1">Pending Timesheets</div>
        </div>
      </div>

      {/* Main tab bar */}
      <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-800/40 w-fit">
        {mainTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                activeTab === t.id ? 'bg-brand-600/30 text-brand-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── EMPLOYEES TAB ── */}
      {activeTab === 'employees' && (
        <>
          {/* Search */}
          <div className="flex items-center gap-3">
            <input
              className="input max-w-xs text-sm"
              placeholder="Search by name, ID, or position..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
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
                          <button
                            onClick={() => setEditUser(emp)}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                            title="Edit employee"
                          >
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

          {/* Leave credits reference */}
          <div className="card p-5 border-emerald-800/30 bg-emerald-900/10">
            <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" /> Leave Credit Defaults
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-3">
              New employees are given these default leave credits. Click the <strong className="text-white">⚙ Edit</strong> button on any employee to adjust their individual credits under the <strong className="text-white">Leave Credits</strong> tab.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                { label: 'Sick Leave', days: 15 },
                { label: 'Vacation Leave', days: 15 },
                { label: 'Emergency Leave', days: 3 },
                { label: 'Maternity/Paternity', days: 60 },
              ].map(c => (
                <div key={c.label} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/40">
                  <div className="text-emerald-400 font-mono font-bold text-base">{c.days}</div>
                  <div className="text-slate-400 mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Adding users note */}
          <div className="card p-5 border-brand-800/30 bg-brand-900/10">
            <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-brand-400">ℹ</span> Adding New Users
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              To add new employees, create accounts in your <strong className="text-white">Supabase Authentication dashboard</strong> (Authentication → Users → Add User). After creating, use the Edit button above to assign their role, department, daily rate, and leave credits.
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
                      <div className="text-xs text-slate-500 mt-0.5 font-mono flex items-center gap-2">
                        <span>{ts.period_month} · {ts.period_cutoff === '1' ? '1st Cut-off (1–15)' : '2nd Cut-off (16–End)'}</span>
                        <span>·</span>
                        <span className="text-emerald-400">{ts.days_present} days present</span>
                        <span>·</span>
                        <span className="text-brand-400">{ts.total_hours}h total</span>
                      </div>
                      <div className="mt-1"><StatusBadge status={ts.status} /></div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproveTimesheet(ts.id)}
                      className="btn-success text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectTimesheet(ts.id)}
                      className="btn-danger text-xs flex items-center gap-1.5"
                    >
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
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={saveEmployee}
        />
      )}
    </div>
  )
}
