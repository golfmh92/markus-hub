import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    return new Response(`OAuth Fehler: ${error ?? 'Kein Code erhalten'}`, { status: 400 })
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`

  // Code gegen Tokens tauschen
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return new Response(`Token-Fehler: ${err}`, { status: 500 })
  }

  const tokens = await tokenRes.json()

  // Gmail-Adresse holen
  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json()

  // In DB speichern (service role, da kein Auth-Header im OAuth-Callback)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Ersten User holen (single-user app)
  const { data: users } = await supabase.auth.admin.listUsers()
  const userId = users?.users?.[0]?.id

  if (!userId) {
    return new Response('Kein User gefunden', { status: 500 })
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('hub_email_sources').upsert({
    user_id: userId,
    provider: 'gmail',
    email: profile.emailAddress,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
    enabled: true,
  }, { onConflict: 'user_id,provider' })

  // Zurück zum Hub
  return Response.redirect('https://wmqmufxyovfhxorzvrzn.supabase.co', 302)
})
