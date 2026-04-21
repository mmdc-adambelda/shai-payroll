import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, DEPARTMENTS } from '../lib/supabase'
import { format } from 'date-fns'
import { Users, RefreshCw, Settings, ChevronRight } from 'lucide-react'

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

function EditUserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role || ROLES.STAFF,
    department: user.department || DEPARTMENTS.ADMIN,
    employee_id: user.employee_id || '',
    daily_rate: user.daily_rate || '',
    position: user.position || '',
    phone: user.phone || '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    await onSave(user.id, form)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">Edit Employee</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

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
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState(null)
  const [stats, setStats] = useState({})

  useEffect(() => {
    fetchEmployees()
    fetchStats()
  }, [])

  async function fetchEmployees() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setEmployees(data || [])
    setLoading(false)
  }

  async function fetchStats() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const [present, leaves, ot] = await Promise.all([
      supabase.from('attendance_records').select('id', { count: 'exact' }).eq('date', today).not('clock_in', 'is', null),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('overtime_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
    ])
    setStats({
      presentToday: present.count || 0,
      pendingLeaves: leaves.count || 0,
      pendingOT: ot.count || 0,
    })
  }

  async function saveEmployee(id, form) {
    await supabase.from('profiles').update(form).eq('id', id)
    fetchEmployees()
  }

  const byDept = employees.reduce((acc, e) => {
    acc[e.department || 'Unassigned'] = (acc[e.department || 'Unassigned'] || [])
    acc[e.department || 'Unassigned'].push(e)
    return acc
  }, {})

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="section-title">System Administration</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage employees, roles, and system settings</p>
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
          <div className="text-2xl font-bold font-mono text-purple-400">{stats.pendingOT}</div>
          <div className="text-xs text-slate-400 mt-1">Pending OT</div>
        </div>
      </div>

      {/* Employees by department */}
      {Object.entries(byDept).map(([dept, emps]) => (
        <div key={dept} className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <h3 className="font-display font-bold text-white">{dept}</h3>
            <span className="text-slate-500 text-sm">{emps.length} member{emps.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {emps.map(emp => (
              <div key={emp.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {emp.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{emp.full_name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>{emp.employee_id || 'No ID'}</span>
                      {emp.position && <><span>·</span><span>{emp.position}</span></>}
                      {emp.daily_rate && <><span>·</span><span className="text-brand-400">₱{emp.daily_rate}/day</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={emp.role} />
                  <button
                    onClick={() => setEditUser(emp)}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Supabase setup reminder */}
      <div className="card p-5 border-brand-800/30 bg-brand-900/10">
        <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-brand-400">ℹ</span> Adding New Users
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          To add new users, create accounts directly in your <strong className="text-white">Supabase Authentication dashboard</strong> 
          (Authentication → Users → Add User). After creating, use the Edit button above to assign their role, department, 
          and other details. Share the email/password you set with the employee.
        </p>
      </div>

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
