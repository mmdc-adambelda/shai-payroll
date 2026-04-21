import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, STATUS } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, CheckCircle, XCircle, X, Timer } from 'lucide-react'

function StatusBadge({ status }) {
  const map = {
    [STATUS.PENDING]: <span className="badge-pending">Pending</span>,
    [STATUS.APPROVED]: <span className="badge-approved">Approved</span>,
    [STATUS.REJECTED]: <span className="badge-rejected">Rejected</span>,
  }
  return map[status] || <span className="badge-draft">{status}</span>
}

function OTModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), hours: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.date || !form.hours || !form.reason) return
    setLoading(true)
    await onSubmit(form)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">Log Overtime Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Overtime Hours</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 2.5"
              min="0.5"
              max="12"
              step="0.5"
              value={form.hours}
              onChange={e => setForm({ ...form, hours: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Reason / Work Performed</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Describe the overtime work done..."
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.date || !form.hours || !form.reason}
            className="btn-primary flex-1"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OvertimePage() {
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
      .from('overtime_requests')
      .select(`*, profiles:user_id(full_name, department)`)
      .order('date', { ascending: false })

    if (!isManager) {
      query = query.eq('user_id', profile.id)
    }

    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  async function handleSubmit(form) {
    await supabase.from('overtime_requests').insert({
      user_id: profile.id,
      date: form.date,
      hours_requested: parseFloat(form.hours),
      reason: form.reason,
      status: STATUS.PENDING,
    })
    fetchRequests()
  }

  async function handleApprove(id) {
    await supabase.from('overtime_requests').update({
      status: STATUS.APPROVED,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    fetchRequests()
  }

  async function handleReject(id) {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('overtime_requests').update({
      status: STATUS.REJECTED,
      rejection_reason: reason,
    }).eq('id', id)
    fetchRequests()
  }

  const totalApproved = requests
    .filter(r => r.user_id === profile?.id && r.status === STATUS.APPROVED)
    .reduce((s, r) => s + (r.hours_requested || 0), 0)

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Overtime Requests</h1>
          <p className="text-slate-400 text-sm mt-0.5">Log and track overtime hours</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Log Overtime
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">
            {requests.filter(r => r.status === STATUS.PENDING && (!isManager || r.user_id === profile?.id)).length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-400">{totalApproved.toFixed(1)}h</div>
          <div className="text-xs text-slate-400 mt-1">Approved OT Hours</div>
        </div>
        {isManager && (
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold font-mono text-brand-400">
              {requests.filter(r => r.status === STATUS.PENDING).length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Team Pending</div>
          </div>
        )}
      </div>

      {/* Requests */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h3 className="font-display font-bold text-white">
            {isManager ? `All Overtime Requests (${requests.length})` : 'My Overtime Requests'}
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No overtime requests found.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {requests.map(r => (
              <div key={r.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  {isManager && (
                    <div className="text-xs text-slate-400 mb-0.5">{r.profiles?.full_name} · {r.profiles?.department}</div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Timer className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-medium text-white font-mono">{r.hours_requested}h OT</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 font-mono">
                    {format(new Date(r.date + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
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

      {showModal && <OTModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />}
    </div>
  )
}
