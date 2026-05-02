/**
 * S.H.A.I. Face Login Edge Function
 * Exchanges a verified face-login token for a real Supabase session.
 *
 * Deploy: supabase functions deploy face-login
 * URL: https://<project>.supabase.co/functions/v1/face-login
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // ← service role, never expose to frontend
  { auth: { autoRefreshToken: false, persistSession: false } }
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { token, userId } = await req.json()
    if (!token || !userId) {
      return Response.json({ error: 'Missing token or userId' }, { status: 400, headers: corsHeaders })
    }

    // Use the client's anon key to call the verify RPC
    // (client must be authenticated — or we use service role here)
    const { data: verifyResult, error: verifyErr } = await supabaseAdmin
      .rpc('verify_face_login_token', { p_token: token, p_user_id: userId })

    if (verifyErr || !verifyResult?.verified) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders })
    }

    // Generate a magic link OTP for this user — exchange for session on client
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: verifyResult.email,    // the verified user's email
    })

    if (linkErr || !linkData) {
      return Response.json({ error: 'Could not generate session' }, { status: 500, headers: corsHeaders })
    }

    // Extract the token_hash from the magic link
    const url = new URL(linkData.properties.action_link)
    const tokenHash = url.searchParams.get('token_hash')
    const emailRedirectTo = url.searchParams.get('redirect_to')

    // Verify the OTP to get a real session
    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.verifyOtp({
      token_hash: tokenHash!,
      type: 'magiclink',
    })

    if (sessionErr || !sessionData.session) {
      return Response.json({ error: 'Session creation failed' }, { status: 500, headers: corsHeaders })
    }

    return Response.json({
      access_token:  sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in:    sessionData.session.expires_in,
    }, { headers: corsHeaders })

  } catch (err) {
    console.error('Face login error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
})
