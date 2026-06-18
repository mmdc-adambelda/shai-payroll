/**
 * Philippine Labor Law — Holiday Pay Computation Engine
 *
 * Multipliers are based on the Labor Code of the Philippines (PD 442)
 * and DOLE guidelines for holiday pay.
 *
 * REST DAY: assumed to be Sunday (day-of-week 0). Extend via restDays[] if needed.
 */

// ── Philippine Labor Law multipliers ─────────────────────────────────────────

/**
 * Returns the gross multiplier applied to the employee's base daily pay.
 *
 * @param {'REGULAR'|'SPECIAL'|'SPECIAL_WORKING'} holidayType
 * @param {boolean} worked          - employee actually clocked in
 * @param {boolean} isRestDay       - the day falls on a rest day
 * @param {boolean} isOT            - hours exceeded the regular shift cap
 * @param {boolean} specialPaidIfAbsent - payroll setting: pay special holiday even if absent
 * @returns {number}  multiplier (e.g. 2.0 means 200 % of daily rate)
 */
export function getHolidayMultiplier(holidayType, worked, isRestDay, isOT, specialPaidIfAbsent = false) {
  if (holidayType === 'REGULAR') {
    if (!worked) return 1.0              // absent-but-scheduled → 100 %
    if (isRestDay && isOT) return 3.38  // rest day + OT            → 338 %
    if (isRestDay)         return 2.6   // rest day (no OT)         → 260 %
    if (isOT)              return 2.6   // OT only                  → 260 %
    return 2.0                          // worked normal            → 200 %
  }

  if (holidayType === 'SPECIAL') {
    if (!worked) return specialPaidIfAbsent ? 1.0 : 0  // absent: setting-dependent
    if (isRestDay && isOT) return 1.95   // rest day + OT → 195 %
    if (isRestDay)         return 1.5    // rest day       → 150 %
    if (isOT)              return 1.69   // OT only        → 169 %
    return 1.3                           // worked normal  → 130 %
  }

  // SPECIAL_WORKING — treated exactly like a regular working day
  if (holidayType === 'SPECIAL_WORKING') {
    if (isOT) return 1.25  // standard OT rate
    return 1.0
  }

  return 1.0
}

// ── Holiday detection helpers ─────────────────────────────────────────────────

/**
 * Build a Map<'YYYY-MM-DD', holiday> from an array of holiday rows.
 */
export function buildHolidayMap(holidays) {
  const map = new Map()
  for (const h of holidays) {
    if (h.is_active) map.set(h.holiday_date, h)
  }
  return map
}

/**
 * Returns true when `dateStr` ('YYYY-MM-DD') falls on a rest day.
 * Default rest day: Sunday (0).  Saturday (6) is also a common rest day
 * for Mon–Fri shift workers; pass restDayNumbers to customise.
 */
export function isRestDay(dateStr, restDayNumbers = [0]) {
  const d = new Date(dateStr + 'T00:00:00')
  return restDayNumbers.includes(d.getDay())
}

// ── Per-day pay breakdown ─────────────────────────────────────────────────────

/**
 * Compute holiday pay for a single attendance record (or absent day).
 *
 * @param {object} params
 *   @param {object|null} attendance     - attendance_records row (null if absent)
 *   @param {object}      holiday        - holidays row
 *   @param {number}      hourlyRate     - daily_rate / default_daily_hours
 *   @param {number}      defaultHours   - standard shift hours (usually 8)
 *   @param {number[]}    restDayNumbers - day-of-week numbers considered rest days
 *   @param {boolean}     specialPaidIfAbsent
 * @returns {object}  breakdown record
 */
export function computeDayHolidayPay({
  attendance,
  holiday,
  hourlyRate,
  defaultHours = 8,
  restDayNumbers = [0],
  specialPaidIfAbsent = false,
}) {
  const worked     = !!(attendance?.clock_in)
  const hoursWorked = worked ? (attendance.hours_worked || 0) : 0
  const regularHours = Math.min(hoursWorked, defaultHours)
  const otHours      = Math.max(0, hoursWorked - defaultHours)
  const restDay      = isRestDay(holiday.holiday_date, restDayNumbers)

  const regularMultiplier = getHolidayMultiplier(
    holiday.holiday_type, worked, restDay, false, specialPaidIfAbsent
  )
  const otMultiplier = otHours > 0
    ? getHolidayMultiplier(holiday.holiday_type, worked, restDay, true, specialPaidIfAbsent)
    : 0

  // For unworked regular holidays, pay is 1 full day (defaultHours × hourlyRate × 1.0)
  const paidHours = worked ? regularHours : (regularMultiplier > 0 ? defaultHours : 0)

  const regularPay = paidHours   * hourlyRate * regularMultiplier
  const otPay      = otHours     * hourlyRate * otMultiplier

  return {
    date:              holiday.holiday_date,
    holiday_name:      holiday.holiday_name,
    holiday_type:      holiday.holiday_type,
    worked,
    hours_worked:      hoursWorked,
    regular_hours:     paidHours,
    overtime_hours:    otHours,
    base_hourly_rate:  hourlyRate,
    multiplier:        regularMultiplier,
    ot_multiplier:     otMultiplier,
    rest_day_flag:     restDay,
    regular_pay:       parseFloat(regularPay.toFixed(4)),
    overtime_pay:      parseFloat(otPay.toFixed(4)),
    computed_pay:      parseFloat((regularPay + otPay).toFixed(4)),
    auto_credited:     !worked && holiday.holiday_type === 'REGULAR' && regularMultiplier > 0,
  }
}

// ── Full period computation ───────────────────────────────────────────────────

/**
 * Determine which days in the pay period are holidays, compute pay for each,
 * and identify auto-credited regular holidays (scheduled but no clock-in).
 *
 * @param {object} params
 *   @param {string}   periodStart           - 'YYYY-MM-DD'
 *   @param {string}   periodEnd             - 'YYYY-MM-DD'
 *   @param {object[]} attendanceRecords     - attendance_records for this user/period
 *   @param {object[]} holidays              - active holidays from DB
 *   @param {object}   employeeProfile       - profiles row
 *   @param {object[]} approvedLeaves        - approved leave_requests overlapping period
 *   @param {object}   settings              - payroll_settings row
 * @returns {{ breakdowns: object[], totalHolidayPay: number, autoCreditedHours: number }}
 */
export function computePeriodHolidayPay({
  periodStart,
  periodEnd,
  attendanceRecords,
  holidays,
  employeeProfile,
  approvedLeaves = [],
  settings,
}) {
  const {
    default_daily_hours:            defaultHours   = 8,
    special_holiday_paid_if_absent: specialPaidIfAbsent = false,
    auto_credit_regular_holiday:    autoCreditEnabled   = true,
    enable_holiday_ot_rules:        otRulesEnabled      = true,
  } = settings || {}

  const hourlyRate = (employeeProfile.daily_rate || 0) / defaultHours
  const hasShift   = !!(employeeProfile.shift_start && employeeProfile.shift_end)

  // Employee statuses that disqualify auto-credit
  const BLOCKED_STATUSES = new Set(['awol', 'suspended', 'terminated', 'resigned'])
  const statusBlocked = BLOCKED_STATUSES.has(employeeProfile.employment_status || 'active')

  // Build attendance lookup keyed by date string
  const attendanceByDate = {}
  for (const a of attendanceRecords) attendanceByDate[a.date] = a

  // Build leave date set
  const leaveDates = new Set()
  for (const leave of approvedLeaves) {
    const start = new Date(leave.start_date + 'T00:00:00')
    const end   = new Date(leave.end_date   + 'T00:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveDates.add(d.toISOString().slice(0, 10))
    }
  }

  // Filter holidays within this pay period
  const start = new Date(periodStart + 'T00:00:00')
  const end   = new Date(periodEnd   + 'T00:00:00')

  const periodHolidays = holidays.filter(h => {
    if (!h.is_active) return false
    const hd = new Date(h.holiday_date + 'T00:00:00')
    return hd >= start && hd <= end
  })

  const breakdowns = []

  for (const holiday of periodHolidays) {
    const attendance = attendanceByDate[holiday.holiday_date] || null
    const onLeave    = leaveDates.has(holiday.holiday_date)
    const worked     = !!(attendance?.clock_in)

    // For SPECIAL_WORKING: treat like a normal day — skip holiday logic
    if (holiday.holiday_type === 'SPECIAL_WORKING') continue

    // Absent on regular holiday: auto-credit if conditions met
    if (!worked && !onLeave && holiday.holiday_type === 'REGULAR') {
      if (!autoCreditEnabled || statusBlocked || !hasShift) continue

      const breakdown = computeDayHolidayPay({
        attendance: null,
        holiday,
        hourlyRate,
        defaultHours,
        specialPaidIfAbsent,
      })
      breakdowns.push({ ...breakdown, auto_credited: true })
      continue
    }

    // Absent on special holiday: skip (no pay) unless setting is on
    if (!worked && holiday.holiday_type === 'SPECIAL') {
      if (!specialPaidIfAbsent) continue
    }

    // Worked or special-paid-absent
    const breakdown = computeDayHolidayPay({
      attendance,
      holiday,
      hourlyRate,
      defaultHours,
      restDayNumbers: [0],      // Sunday; extend for custom rest days
      specialPaidIfAbsent,
    })

    // Without OT rules enabled, cap multiplier at base worked rate
    if (!otRulesEnabled && breakdown.overtime_hours > 0) {
      const baseMultiplier = getHolidayMultiplier(
        holiday.holiday_type, true, false, false, specialPaidIfAbsent
      )
      breakdown.overtime_pay = breakdown.overtime_hours * hourlyRate * baseMultiplier * 1.25
      breakdown.computed_pay = parseFloat((breakdown.regular_pay + breakdown.overtime_pay).toFixed(4))
    }

    breakdowns.push(breakdown)
  }

  const totalHolidayPay   = breakdowns.reduce((s, b) => s + b.computed_pay, 0)
  const autoCreditedHours = breakdowns
    .filter(b => b.auto_credited)
    .reduce((s, b) => s + b.regular_hours, 0)

  return {
    breakdowns,
    totalHolidayPay:   parseFloat(totalHolidayPay.toFixed(2)),
    autoCreditedHours: parseFloat(autoCreditedHours.toFixed(2)),
  }
}

// ── Password strength (shared utility) ───────────────────────────────────────

export function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)          score++
  if (/[A-Z]/.test(pw))        score++
  if (/[0-9]/.test(pw))        score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return {
    score,
    label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score],
    color: ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500'][score],
  }
}

export function generateTempPassword() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let pw = ''
  // Guarantee at least one of each required character class
  pw += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]
  pw += 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 22)]
  pw += '23456789'[Math.floor(Math.random() * 8)]
  pw += '!@#$'[Math.floor(Math.random() * 4)]
  for (let i = 4; i < 12; i++) {
    pw += charset[Math.floor(Math.random() * charset.length)]
  }
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

// ── Unit-testable exports for pure functions ──────────────────────────────────

export const __test__ = {
  getHolidayMultiplier,
  computeDayHolidayPay,
  isRestDay,
  buildHolidayMap,
  passwordStrength,
  generateTempPassword,
}
