import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { FileDown, Printer, Receipt, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'

// ── Payslip HTML generator (same quality as admin version) ────
function generatePayslipHTML(payroll, employee) {
  const gross      = payroll.basic_pay + payroll.overtime_pay + payroll.allowances
  const deductions = payroll.sss + payroll.philhealth + payroll.pagibig + payroll.tax + (payroll.other_deductions || 0)
  const net        = gross - deductions

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Payslip — ${employee.full_name} — ${payroll.period_label}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Outfit',sans-serif;background:#fff;color:#0f172a;padding:48px;max-width:760px;margin:auto}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #e2e8f0;margin-bottom:28px}
    .brand{font-size:26px;font-weight:800;color:#3040f5;letter-spacing:-0.5px}
    .brand-sub{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
    .payslip-label{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1.5px}
    .payslip-period{font-size:16px;font-weight:700;color:#0f172a;margin-top:2px}
    .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#f8faff;border-radius:14px;padding:20px;margin-bottom:28px;border:1px solid #e2e8f0}
    .info-item .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
    .info-item .val{font-size:13px;font-weight:600;color:#0f172a}
    .section{margin-bottom:20px}
    .section-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;padding:8px 14px;background:#f1f5f9;border-radius:8px;margin-bottom:2px}
    table{width:100%;border-collapse:collapse}
    td{padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px}
    td:last-child{text-align:right;font-family:'JetBrains Mono',monospace;font-weight:500}
    .total-row td{font-weight:700;background:#f8faff;font-size:13px}
    .net-box{background:linear-gradient(135deg,#3040f5,#6366f1);border-radius:14px;padding:22px 28px;display:flex;justify-content:space-between;align-items:center;margin-top:24px;color:#fff}
    .net-label{font-size:13px;opacity:.85;font-weight:600}
    .net-sub{font-size:10px;opacity:.6;margin-top:2px}
    .net-amount{font-size:30px;font-weight:800;font-family:'JetBrains Mono',monospace}
    .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
    .badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;background:#dcfce7;color:#16a34a;letter-spacing:.5px}
    @media print{body{padding:24px}@page{size:A4 portrait;margin:1cm}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">S.H.A.I.</div>
      <div class="brand-sub">Official Payslip</div>
    </div>
    <div style="text-align:right">
      <div class="payslip-label">Pay Period</div>
      <div class="payslip-period">${payroll.period_label}</div>
      <div style="margin-top:6px"><span class="badge">PROCESSED</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item"><div class="lbl">Employee Name</div><div class="val">${employee.full_name}</div></div>
    <div class="info-item"><div class="lbl">Employee ID</div><div class="val">${employee.employee_id || '—'}</div></div>
    <div class="info-item"><div class="lbl">Department</div><div class="val">${employee.department || '—'}</div></div>
    <div class="info-item"><div class="lbl">Position</div><div class="val">${employee.position || '—'}</div></div>
    <div class="info-item"><div class="lbl">Days Present</div><div class="val">${payroll.days_present} days</div></div>
    <div class="info-item"><div class="lbl">OT Hours</div><div class="val">${payroll.overtime_hours || 0}h</div></div>
  </div>

  <div class="section">
    <div class="section-head">Earnings</div>
    <table>
      <tr><td>Basic Pay <span style="font-size:11px;color:#94a3b8">(${payroll.days_present} days × ₱${payroll.daily_rate?.toFixed(2)}/day)</span></td><td>₱ ${payroll.basic_pay.toFixed(2)}</td></tr>
      <tr><td>Overtime Pay</td><td>₱ ${payroll.overtime_pay.toFixed(2)}</td></tr>
      <tr><td>Allowances</td><td>₱ ${payroll.allowances.toFixed(2)}</td></tr>
      <tr class="total-row"><td>Gross Pay</td><td>₱ ${gross.toFixed(2)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-head">Deductions</div>
    <table>
      <tr><td>SSS</td><td>₱ ${payroll.sss.toFixed(2)}</td></tr>
      <tr><td>PhilHealth</td><td>₱ ${payroll.philhealth.toFixed(2)}</td></tr>
      <tr><td>Pag-IBIG</td><td>₱ ${payroll.pagibig.toFixed(2)}</td></tr>
      <tr><td>Withholding Tax</td><td>₱ ${payroll.tax.toFixed(2)}</td></tr>
      ${payroll.other_deductions > 0 ? `<tr><td>Other Deductions</td><td>₱ ${payroll.other_deductions.toFixed(2)}</td></tr>` : ''}
      <tr class="total-row"><td>Total Deductions</td><td>₱ ${deductions.toFixed(2)}</td></tr>
    </table>
  </div>

  <div class="net-box">
    <div>
      <div class="net-label">Net Pay</div>
      <div class="net-sub">Philippine Peso · Take-Home Pay</div>
    </div>
    <div class="net-amount">₱ ${net.toFixed(2)}</div>
  </div>

  <div class="footer">
    <span>Generated ${format(new Date(), 'MMMM d, yyyy · HH:mm')} · S.H.A.I. Payroll System</span>
    <span>This is a computer-generated document. No signature required.</span>
  </div>
</body>
</html>`
}

function PayslipCard({ payroll, profile }) {
  const [expanded, setExpanded] = useState(false)

  const gross      = payroll.basic_pay + payroll.overtime_pay + payroll.allowances
  const deductions = payroll.sss + payroll.philhealth + payroll.pagibig + payroll.tax + (payroll.other_deductions || 0)
  const net        = payroll.net_pay || (gross - deductions)

  function openPayslip() {
    const html = generatePayslipHTML(payroll, profile)
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-900/40 border border-brand-800/40 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{payroll.period_label}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {payroll.days_present} days · {payroll.total_hours}h worked
              {(payroll.overtime_hours > 0) && <span className="text-amber-400"> · +{payroll.overtime_hours}h OT</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-emerald-400 font-mono font-bold text-base">₱{net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-slate-500">Net Pay</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-800/60 px-5 py-4 animate-in">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Earnings */}
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Earnings</div>
              <div className="space-y-1.5">
                {[
                  ['Basic Pay', payroll.basic_pay],
                  ['Overtime Pay', payroll.overtime_pay],
                  ['Allowances', payroll.allowances],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono text-slate-200">₱{(val || 0).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-slate-700/40">
                  <span className="text-slate-300">Gross Pay</span>
                  <span className="font-mono text-white">₱{gross.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Deductions</div>
              <div className="space-y-1.5">
                {[
                  ['SSS',       payroll.sss],
                  ['PhilHealth', payroll.philhealth],
                  ['Pag-IBIG',  payroll.pagibig],
                  ['Tax',       payroll.tax],
                  ...(payroll.other_deductions > 0 ? [['Other', payroll.other_deductions]] : []),
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono text-red-400">-₱{(val || 0).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-slate-700/40">
                  <span className="text-slate-300">Total Deductions</span>
                  <span className="font-mono text-red-400">-₱{deductions.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net pay highlight */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-900/20 border border-emerald-800/30 mb-4">
            <span className="text-sm font-semibold text-emerald-300">Net Pay (Take-Home)</span>
            <span className="font-mono font-bold text-emerald-400 text-lg">
              ₱{net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Actions */}
          <button
            onClick={openPayslip}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print / Download Payslip
          </button>
        </div>
      )}
    </div>
  )
}

export default function MyPayslipsPage() {
  const { profile } = useAuth()
  const [payrolls, setPayrolls]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString())

  const years = ['2026', '2025', '2024']

  useEffect(() => {
    if (profile) fetchPayrolls()
  }, [profile, yearFilter])

  async function fetchPayrolls() {
    setLoading(true)
    const { data } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('user_id', profile.id)
      .like('period_month', `${yearFilter}%`)
      .order('period_month', { ascending: false })
    setPayrolls(data || [])
    setLoading(false)
  }

  const totalNet   = payrolls.reduce((s, r) => s + (r.net_pay || 0), 0)
  const totalGross = payrolls.reduce((s, r) => s + ((r.basic_pay + r.overtime_pay + r.allowances) || 0), 0)
  const totalDays  = payrolls.reduce((s, r) => s + (r.days_present || 0), 0)

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-400" /> My Payslips
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">View and download your payroll records</p>
        </div>
        <select
          className="input py-2 text-sm w-auto"
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-xl font-bold font-mono text-emerald-400">
            ₱{totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">Total Net Pay ({yearFilter})</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold font-mono text-white">{payrolls.length}</div>
          <div className="text-xs text-slate-400 mt-1">Payroll Periods</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold font-mono text-brand-400">{totalDays}</div>
          <div className="text-xs text-slate-400 mt-1">Total Days Paid</div>
        </div>
      </div>

      {/* Payslip list */}
      {loading ? (
        <div className="card p-12 text-center text-slate-500">Loading payslips...</div>
      ) : payrolls.length === 0 ? (
        <div className="card p-12 text-center">
          <Receipt className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No payslips found for {yearFilter}.</p>
          <p className="text-slate-500 text-sm mt-1">Payslips appear here once your manager processes payroll.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payrolls.map(p => (
            <PayslipCard key={p.id} payroll={p} profile={profile} />
          ))}
        </div>
      )}
    </div>
  )
}
