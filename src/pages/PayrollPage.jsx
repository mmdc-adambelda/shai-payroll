import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ROLES, STATUS } from '../lib/supabase'
import { format } from 'date-fns'
import { DollarSign, FileDown, CheckCircle, Play, X } from 'lucide-react'

// Simple payslip generator using browser print
function generatePayslipHTML(payroll, employee) {
  const gross = payroll.basic_pay + payroll.overtime_pay + payroll.allowances
  const deductions = payroll.sss + payroll.philhealth + payroll.pagibig + payroll.tax + (payroll.other_deductions || 0)
  const net = gross - deductions

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payslip - ${employee.full_name}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
        .header { text-align: center; border-bottom: 3px solid #4a5fff; padding-bottom: 20px; margin-bottom: 24px; }
        .logo { font-size: 28px; font-weight: 800; color: #4a5fff; letter-spacing: -0.5px; }
        .subtitle { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px; }
        .payslip-title { font-size: 18px; font-weight: 700; margin: 16px 0 4px; color: #1a1a2e; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f5f7ff; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
        .info-item { }
        .info-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .info-value { font-size: 13px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; padding: 8px 12px; background: #f5f7ff; }
        td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
        .amount { text-align: right; font-family: monospace; font-weight: 500; }
        .total-row td { font-weight: 700; background: #f5f7ff; }
        .net-pay { background: #4a5fff; color: white; border-radius: 12px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
        .net-pay-label { font-size: 14px; opacity: 0.9; }
        .net-pay-amount { font-size: 28px; font-weight: 800; font-family: monospace; }
        .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 16px; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">S.H.A.I.</div>
        <div class="subtitle">Official Payslip</div>
      </div>
      
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Employee Name</div>
          <div class="info-value">${employee.full_name}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Employee ID</div>
          <div class="info-value">${employee.employee_id || '—'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Department</div>
          <div class="info-value">${employee.department}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Pay Period</div>
          <div class="info-value">${payroll.period_label}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Days Present</div>
          <div class="info-value">${payroll.days_present}</div>
        </div>
        <div class="info-item">
          <div class="info-label">OT Hours</div>
          <div class="info-value">${payroll.overtime_hours || 0}h</div>
        </div>
      </div>

      <table>
        <thead><tr><th>Earnings</th><th class="amount">Amount (PHP)</th></tr></thead>
        <tbody>
          <tr><td>Basic Pay</td><td class="amount">${payroll.basic_pay.toFixed(2)}</td></tr>
          <tr><td>Overtime Pay</td><td class="amount">${payroll.overtime_pay.toFixed(2)}</td></tr>
          <tr><td>Allowances</td><td class="amount">${payroll.allowances.toFixed(2)}</td></tr>
          <tr class="total-row"><td>Gross Pay</td><td class="amount">${gross.toFixed(2)}</td></tr>
        </tbody>
      </table>

      <table>
        <thead><tr><th>Deductions</th><th class="amount">Amount (PHP)</th></tr></thead>
        <tbody>
          <tr><td>SSS</td><td class="amount">${payroll.sss.toFixed(2)}</td></tr>
          <tr><td>PhilHealth</td><td class="amount">${payroll.philhealth.toFixed(2)}</td></tr>
          <tr><td>Pag-IBIG</td><td class="amount">${payroll.pagibig.toFixed(2)}</td></tr>
          <tr><td>Withholding Tax</td><td class="amount">${payroll.tax.toFixed(2)}</td></tr>
          ${payroll.other_deductions ? `<tr><td>Other Deductions</td><td class="amount">${payroll.other_deductions.toFixed(2)}</td></tr>` : ''}
          <tr class="total-row"><td>Total Deductions</td><td class="amount">${deductions.toFixed(2)}</td></tr>
        </tbody>
      </table>

      <div class="net-pay">
        <div><div class="net-pay-label">Net Pay</div><div style="font-size:11px;opacity:.7">Philippine Peso</div></div>
        <div class="net-pay-amount">₱ ${net.toFixed(2)}</div>
      </div>

      <div class="footer">
        Generated on ${format(new Date(), 'MMMM d, yyyy')} · S.H.A.I. Payroll System · This is a system-generated payslip.
      </div>
    </body>
    </html>
  `
}

function PayslipButton({ payroll, employee }) {
  function openPayslip() {
    const html = generatePayslipHTML(payroll, employee)
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <button onClick={openPayslip} className="btn-secondary text-xs flex items-center gap-1.5">
      <FileDown className="w-3.5 h-3.5" /> Payslip
    </button>
  )
}

function ProcessModal({ employees, period, onClose, onProcess }) {
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    daily_rate: '',
    allowances: '0',
    sss: '0',
    philhealth: '0',
    pagibig: '0',
    tax: '0',
    other_deductions: '0',
  })
  const [loading, setLoading] = useState(false)

  async function handleProcess() {
    if (!selected) return
    setLoading(true)
    await onProcess(selected, form)
    setLoading(false)
    onClose()
  }

  const dailyRate = parseFloat(form.daily_rate) || 0
  const basicPay = selected ? dailyRate * selected.days_present : 0
  const otPay = selected ? (dailyRate / 8) * 1.25 * (selected.overtime_hours || 0) : 0
  const allowances = parseFloat(form.allowances) || 0
  const deductions = ['sss', 'philhealth', 'pagibig', 'tax', 'other_deductions'].reduce((s, k) => s + (parseFloat(form[k]) || 0), 0)
  const net = basicPay + otPay + allowances - deductions

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl p-6 animate-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">Process Payroll</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="mb-4">
          <label className="label">Select Employee</label>
          <select className="input" value={selected?.id || ''} onChange={e => setSelected(employees.find(em => em.id === e.target.value))}>
            <option value="">— Select employee —</option>
            {employees.map(em => (
              <option key={em.id} value={em.id}>{em.full_name} ({em.department})</option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-sm text-slate-300 mb-4 flex gap-4">
            <span>Days: <strong className="text-white">{selected.days_present}</strong></span>
            <span>Hours: <strong className="text-white">{selected.total_hours}h</strong></span>
            <span>OT: <strong className="text-amber-400">{selected.overtime_hours || 0}h</strong></span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Daily Rate (₱)</label>
            <input type="number" className="input" value={form.daily_rate} onChange={e => setForm({ ...form, daily_rate: e.target.value })} placeholder="600.00" />
          </div>
          <div>
            <label className="label">Allowances (₱)</label>
            <input type="number" className="input" value={form.allowances} onChange={e => setForm({ ...form, allowances: e.target.value })} />
          </div>
        </div>

        <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Deductions</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {['sss', 'philhealth', 'pagibig', 'tax'].map(k => (
            <div key={k}>
              <label className="label">{k.toUpperCase()} (₱)</label>
              <input type="number" className="input" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mb-4">
          <label className="label">Other Deductions (₱)</label>
          <input type="number" className="input" value={form.other_deductions} onChange={e => setForm({ ...form, other_deductions: e.target.value })} />
        </div>

        {/* Preview */}
        {selected && dailyRate > 0 && (
          <div className="p-4 rounded-xl bg-brand-900/20 border border-brand-800/30 mb-5">
            <div className="text-xs text-slate-400 mb-2">Pay Preview</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-slate-400 text-xs">Gross</div><div className="text-white font-mono font-bold">₱{(basicPay + otPay + allowances).toFixed(2)}</div></div>
              <div><div className="text-slate-400 text-xs">Deductions</div><div className="text-red-400 font-mono font-bold">-₱{deductions.toFixed(2)}</div></div>
              <div><div className="text-slate-400 text-xs">Net Pay</div><div className="text-emerald-400 font-mono font-bold text-base">₱{net.toFixed(2)}</div></div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleProcess} disabled={loading || !selected || !form.daily_rate} className="btn-primary flex-1">
            {loading ? 'Processing...' : 'Process & Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PayrollPage() {
  const { profile } = useAuth()
  const [payrolls, setPayrolls] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [period, setPeriod] = useState({ month: format(new Date(), 'yyyy-MM'), cutoff: new Date().getDate() <= 15 ? '1' : '2' })

  useEffect(() => {
    fetchData()
  }, [period])

  async function fetchData() {
    setLoading(true)
    const [pr, ts] = await Promise.all([
      supabase.from('payroll_records')
        .select(`*, profiles:user_id(full_name, department, employee_id)`)
        .eq('period_month', period.month)
        .eq('period_cutoff', period.cutoff)
        .order('created_at', { ascending: false }),
      supabase.from('timesheets')
        .select(`*, profiles:user_id(full_name, department, employee_id)`)
        .eq('period_month', period.month)
        .eq('period_cutoff', period.cutoff)
        .eq('status', STATUS.APPROVED),
    ])
    setPayrolls(pr.data || [])

    // Enrich timesheets with approved OT hours
    const enriched = await Promise.all((ts.data || []).map(async t => {
      const { data: otData } = await supabase.from('overtime_requests')
        .select('hours_requested')
        .eq('user_id', t.user_id)
        .eq('status', STATUS.APPROVED)
        .gte('date', t.period_start)
        .lte('date', t.period_end)
      const otHours = (otData || []).reduce((s, r) => s + r.hours_requested, 0)
      return { ...t, overtime_hours: otHours }
    }))
    setTimesheets(enriched)
    setLoading(false)
  }

  async function processPayroll(employee, form) {
    const dailyRate = parseFloat(form.daily_rate)
    const basicPay = dailyRate * employee.days_present
    const otPay = (dailyRate / 8) * 1.25 * (employee.overtime_hours || 0)
    const allowances = parseFloat(form.allowances) || 0

    const periodLabel = `${format(new Date(period.month + '-01'), 'MMMM yyyy')} ${period.cutoff === '1' ? '1st' : '2nd'} Cut-off`

    await supabase.from('payroll_records').insert({
      user_id: employee.user_id,
      timesheet_id: employee.id,
      period_month: period.month,
      period_cutoff: period.cutoff,
      period_label: periodLabel,
      days_present: employee.days_present,
      total_hours: employee.total_hours,
      overtime_hours: employee.overtime_hours || 0,
      daily_rate: dailyRate,
      basic_pay: basicPay,
      overtime_pay: otPay,
      allowances,
      sss: parseFloat(form.sss) || 0,
      philhealth: parseFloat(form.philhealth) || 0,
      pagibig: parseFloat(form.pagibig) || 0,
      tax: parseFloat(form.tax) || 0,
      other_deductions: parseFloat(form.other_deductions) || 0,
      net_pay: basicPay + otPay + allowances - (['sss','philhealth','pagibig','tax','other_deductions'].reduce((s, k) => s + (parseFloat(form[k]) || 0), 0)),
      processed_by: profile.id,
      status: STATUS.PROCESSED,
    })

    // Mark timesheet as processed
    await supabase.from('timesheets').update({ status: STATUS.PROCESSED }).eq('id', employee.id)
    fetchData()
  }

  const processedIds = new Set(payrolls.map(p => p.timesheet_id))
  const unprocessed = timesheets.filter(t => !processedIds.has(t.id))

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Payroll Processing</h1>
          <p className="text-slate-400 text-sm mt-0.5">Compute and process payroll from approved timesheets</p>
        </div>
        {unprocessed.length > 0 && (
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Play className="w-4 h-4" /> Process Payroll
          </button>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-3">
        <input type="month" className="input py-2 text-sm w-auto" value={period.month} onChange={e => setPeriod({ ...period, month: e.target.value })} />
        <select className="input py-2 text-sm w-auto" value={period.cutoff} onChange={e => setPeriod({ ...period, cutoff: e.target.value })}>
          <option value="1">1st Cut-off (1–15)</option>
          <option value="2">2nd Cut-off (16–End)</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ₱{payrolls.reduce((s, r) => s + (r.net_pay || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">Total Net Pay</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">{payrolls.length}</div>
          <div className="text-xs text-slate-400 mt-1">Processed</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-400">{unprocessed.length}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
      </div>

      {/* Unprocessed timesheets */}
      {unprocessed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h3 className="font-display font-bold text-white">Approved Timesheets — Ready to Process ({unprocessed.length})</h3>
          </div>
          <div className="divide-y divide-slate-800/60">
            {unprocessed.map(ts => (
              <div key={ts.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-sm font-medium text-white">{ts.profiles?.full_name}</div>
                  <div className="text-xs text-slate-400">{ts.profiles?.department} · {ts.days_present} days · {ts.total_hours}h</div>
                  {ts.overtime_hours > 0 && <div className="text-xs text-amber-400">+{ts.overtime_hours}h approved OT</div>}
                </div>
                <span className="badge-approved">Approved</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processed payrolls */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h3 className="font-display font-bold text-white">Processed Payroll Records</h3>
        </div>
        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading...</div>
        ) : payrolls.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No payroll records for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Employee</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Days</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Basic Pay</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">OT Pay</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Deductions</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Net Pay</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.map(r => {
                  const deductions = r.sss + r.philhealth + r.pagibig + r.tax + (r.other_deductions || 0)
                  return (
                    <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-5 py-3">
                        <div className="text-sm text-white">{r.profiles?.full_name}</div>
                        <div className="text-xs text-slate-500">{r.profiles?.department}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-300">{r.days_present}</td>
                      <td className="px-5 py-3 font-mono text-slate-300">₱{r.basic_pay?.toFixed(2)}</td>
                      <td className="px-5 py-3 font-mono text-amber-400">₱{r.overtime_pay?.toFixed(2)}</td>
                      <td className="px-5 py-3 font-mono text-red-400">-₱{deductions.toFixed(2)}</td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-400">₱{r.net_pay?.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <PayslipButton payroll={r} employee={r.profiles} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ProcessModal
          employees={unprocessed}
          period={period}
          onClose={() => setShowModal(false)}
          onProcess={processPayroll}
        />
      )}
    </div>
  )
}
