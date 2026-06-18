// Supabase Edge Function — Admin Password Reset
// Requires SUPABASE_SERVICE_ROLE_KEY Deno secret.
// Only callable by authenticated super_admin users.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SERVICE_ROLE_KEY')!
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verify caller is an authenticated super_admin ──
    const authHeader = req.headers.get('Authorization') || ''
    const callerToken = authHeader.replace('Bearer ', '')

    if (!callerToken) {
      return jsonError('Unauthorized', 401)
    }

    // Client using caller's JWT — can only read what RLS allows
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    })

    const { data: { user: callerUser }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !callerUser) return jsonError('Unauthorized', 401)

    // Check super_admin role in profiles
    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || callerProfile?.role !== 'super_admin') {
      return jsonError('Forbidden: Super Admin only', 403)
    }

    // ── 2. Parse request body ─────────────────────────────
    const { target_user_id, new_password, admin_user_id } = await req.json()

    if (!target_user_id || !new_password) {
      return jsonError('Missing required fields: target_user_id, new_password', 400)
    }

    if (new_password.length < 8) {
      return jsonError('Password must be at least 8 characters', 400)
    }

    // Prevent resetting own password via this endpoint
    if (target_user_id === callerUser.id) {
      return jsonError('Use the Change Password flow to update your own password', 400)
    }

    // ── 3. Reset password using admin SDK ─────────────────
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: resetErr } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    )

    if (resetErr) {
      return jsonError(`Password reset failed: ${resetErr.message}`, 500)
    }

    // ── 4. Set force_password_change flag on the target ───
    await adminClient
      .from('profiles')
      .update({ force_password_change: true })
      .eq('id', target_user_id)

    // ── 5. Get caller IP for audit log ────────────────────
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null

    // Log to admin_audit_logs (using admin client to bypass RLS insert)
    await adminClient.from('admin_audit_logs').insert({
      admin_user_id:  admin_user_id || callerUser.id,
      target_user_id: target_user_id,
      action:         'password_reset',
      metadata:       { initiated_by: callerUser.id },
      ip_address:     ip,
    })

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    return jsonError(`Internal error: ${err.message}`, 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  )
}
