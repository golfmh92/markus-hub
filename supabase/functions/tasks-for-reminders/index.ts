import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const CAPTURE_SECRET = Deno.env.get('TASK_CAPTURE_SECRET')!

const USER_ID = '4d8c575a-6551-463f-818d-199bc86f3ee8'
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

serve(async (req) => {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CAPTURE_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'reset') {
    const { data } = await sb.from('hub_tasks')
      .update({ external_id: null, source: 'manual' })
      .eq('user_id', USER_ID).eq('done', false)
      .not('external_id', 'is', null).select('id')
    return new Response(`Reset ${data?.length || 0} tasks`)
  }

  if (action === 'mark') {
    const { data } = await sb.from('hub_tasks')
      .update({ external_id: 'reminder-synced', source: 'hub' })
      .eq('user_id', USER_ID).eq('done', false)
      .is('external_id', null).select('id')
    return new Response(`Marked ${data?.length || 0} tasks`)
  }

  // Default: return just task titles, one per line
  const { data: tasks } = await sb.from('hub_tasks')
    .select('title')
    .eq('user_id', USER_ID)
    .eq('done', false)
    .is('external_id', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!tasks?.length) {
    return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const lines = tasks.map(t => t.title).join('\n')
  return new Response(lines, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})
