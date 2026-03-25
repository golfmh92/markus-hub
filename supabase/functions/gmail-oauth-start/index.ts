import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

serve(async (_req) => {
  const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
  })

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302
  )
})
