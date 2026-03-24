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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || req.method

  // GET: Return unsynced tasks for the Shortcut to create as Reminders
  if (action === 'GET' || req.method === 'GET') {
    const { data: tasks } = await sb.from('hub_tasks')
      .select('id, title, description, priority, due_date, category')
      .eq('user_id', USER_ID)
      .eq('done', false)
      .is('external_id', null)
      .order('created_at', { ascending: false })
      .limit(50)

    return new Response(JSON.stringify(tasks || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // POST: Mark tasks as synced (Shortcut calls this after creating Reminders)
  if (action === 'mark' || req.method === 'POST') {
    try {
      const body = await req.json()
      const ids: string[] = body.ids || []
      if (!ids.length) {
        return new Response(JSON.stringify({ ok: true, marked: 0 }), { status: 200 })
      }
      const { error } = await sb.from('hub_tasks')
        .update({ external_id: 'reminder-synced', source: 'hub' })
        .in('id', ids)
        .eq('user_id', USER_ID)

      if (error) throw error
      return new Response(JSON.stringify({ ok: true, marked: ids.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 })
})
