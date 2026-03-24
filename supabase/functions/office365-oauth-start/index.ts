import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

serve(async (_req) => {
  const redirectUri = `${SUPABASE_URL}/functions/v1/office365-oauth-callback`

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'https://graph.microsoft.com/Mail.Read offline_access',
    response_mode: 'query',
  })

  return Response.redirect(
    `https://login.microsoftonline.com/ae688e0c-3b3b-4a53-b9ea-98e0f1edfc3e/oauth2/v2.0/authorize?${params}`,
    302
  )
})
