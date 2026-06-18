import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  MANAGER: 'manager',
  STAFF: 'staff',
}

export const DEPARTMENTS = {
  MAINTENANCE: 'Maintenance Team',
  ADMIN: 'Admin Office Team',
}

export const LEAVE_TYPES = ['Sick Leave', 'Vacation Leave', 'Emergency Leave', 'Maternity/Paternity Leave', 'Unpaid Leave']

export const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUBMITTED: 'submitted',
  DRAFT: 'draft',
  PROCESSED: 'processed',
}

export const CUTOFF_PERIODS = [
  { label: '1st Cut-off (1–15)', start: 1, end: 15 },
  { label: '2nd Cut-off (16–End)', start: 16, end: 31 },
]

export const HOLIDAY_TYPES = {
  REGULAR:          'REGULAR',
  SPECIAL:          'SPECIAL',
  SPECIAL_WORKING:  'SPECIAL_WORKING',
}

export const HOLIDAY_TYPE_LABELS = {
  REGULAR:         'Regular Holiday',
  SPECIAL:         'Special Non-Working',
  SPECIAL_WORKING: 'Special Working',
}

export const EMPLOYMENT_STATUS = {
  ACTIVE:     'active',
  SUSPENDED:  'suspended',
  TERMINATED: 'terminated',
  RESIGNED:   'resigned',
  AWOL:       'awol',
}
