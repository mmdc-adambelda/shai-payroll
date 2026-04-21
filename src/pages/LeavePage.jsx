import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, LEAVE_TYPES, STATUS } from '../lib/supabase'
import { format, differenceInCalendarDays } from 'date-fns'
import { Plus, CheckCircle, XCircle, X } from 'lucide-react'

function StatusBadge({ status }) {
  const map = {
    [STATUS.PENDING]: <span className="badge-pending">Pending</span>,
    [STATUS.APPROVED]: <span className="badge-approved">Approved</span>,
    [STATUS.REJECTED]: <span className="badge-rejected">Rejected</span>,
  }
  return map[status] || <span className="badge-draft">{status}</span>
}

function LeaveModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ type: LEAVE_TYPES[0], start: '', end: '', reason: '' })
  const [loading, setLoading] = useState(false)

  const days = form.start && form.end
    ? differenceInCalendarDays(new Date(form.end), new Date(form.start)) + 1
    : 0

  async function handleSubmit() {
    if (!form.start || !form.end || !form.reason) return
    setLoading(true)
    await onSubmit(form)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">File Leave Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Leave Type</label>
            <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={form.end} min={form.start} onChange={e => setForm({ ...form, end: e.target.value })} />
            </div>
          </div>
          {days > 0 && (
            <div className="p-3 rounded-xl bg-brand-900/20 border border-brand-800/30 text-sm text-brand-300">
              {days} day{days > 1 ? 's' : ''} of leave
            </div>
          )}
          <div>
            <label className="label">Reason</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Please describe your reason for leave..."
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !form.start || !form.end || !form.reason} className="btn-primary flex-1">
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LeavePage() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const isManager = [ROLES.SUPER_ADMIN, ROLES.MANAGER].includes(profile?.role)

  useEffect(() => {
    if (profile) fetchRequests()
  }, [profile])

  async function fetchRequests() {
    setLoading(true)
    let query = supabase
      .from('leave_requests')
      .select(`*, profiles:user_id(full_name, department)`)
      .order('created_at', { ascending: false })

    if (!isManager) {
      query = query.eq('user_id', profile.id)
    }

    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  async function handleSubmit(form) {
    const days = differenceInCalendarDays(new Date(form.end), new Date(form.start)) + 1
    await supabase.from('leave_requests').insert({
      user_id: profile.id,
      leave_type: form.type,
      start_date: form.start,
      end_date: form.end,
      days_requested: days,
      reason: form.reason,
      status: STATUS.PENDING,
    })
    fetchRequests()
  }

  async function handleApprove(id) {
    await supabase.from('leave_requests').update({
      status: STATUS.APPROVED,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    fetchRequests()
  }

  async function handleReject(id) {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('leave_requests').update({
      status: STATUS.REJECTED,
      rejection_reason: reason,
    }).eq('id', id)
    fetchRequests()
  }

  const pending = requests.filter(r => r.status === STATUS.PENDING)
  const myApproved = requests.filter(r => r.user_id === profile?.id && r.status === STATUS.APPROVED)
    .reduce((s, r) => s + (r.days_requested || 0), 0)

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Leave Requests</h1>
          <p className="text-slate-400 text-sm mt-0.5">File and track leave applications</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> File Leave
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">{pending.length}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-emerald-400">{myApproved}</div>
          <div className="text-xs text-slate-400 mt-1">Days Approved (Mine)</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-slate-400">{requests.filter(r => r.user_id === profile?.id).length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Requests</div>
        </div>
      </div>

      {/* Requests list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h3 className="font-display font-bold text-white">
            {isManager ? `All Leave Requests (${requests.length})` : 'My Leave Requests'}
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No leave requests found.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {requests.map(r => (
              <div key={r.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  {isManager && (
                    <div className="text-xs text-slate-400 mb-0.5">{r.profiles?.full_name} · {r.profiles?.department}</div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{r.leave_type}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 font-mono">
                    {format(new Date(r.start_date), 'MMM d')} → {format(new Date(r.end_date), 'MMM d, yyyy')}
                    <span className="ml-2 text-brand-400">{r.days_requested} day{r.days_requested > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate max-w-md">{r.reason}</div>
                  {r.rejection_reason && (
                    <div className="text-xs text-red-400 mt-0.5">Rejected: {r.rejection_reason}</div>
                  )}
                </div>

                {isManager && r.status === STATUS.PENDING && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => handleApprove(r.id)} className="btn-success text-xs flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleReject(r.id)} className="btn-danger text-xs flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && <LeaveModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />}
    </div>
  )
}
