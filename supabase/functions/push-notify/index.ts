import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const CAPTURE_SECRET = Deno.env.get('TASK_CAPTURE_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const USER_ID = '4d8c575a-6551-463f-818d-199bc86f3ee8'
const EXCLUDED_CALENDARS = ['Büro (Sandra)']
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function sendPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const { default: webpush } = await import('https://esm.sh/web-push@3.6.7')
  webpush.setVapidDetails('mailto:mhabeler92@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  await webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload)
}

async function sendToAll(notification: { title: string; body: string; tag: string }) {
  const { data: subs } = await sb.from('hub_push_subscriptions').select('*').eq('user_id', USER_ID)
  if (!subs?.length) return 0
  let sent = 0
  for (const sub of subs) {
    try {
      await sendPush(sub, JSON.stringify(notification))
      sent++
    } catch (err) {
      console.error('Push error:', err)
      if (String(err).includes('410') || String(err).includes('404')) {
        await sb.from('hub_push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }
  return sent
}

// ── Claude: Generate natural language briefing ──
async function generateBriefing(tasks: any[], events: any[], overdue: any[]): Promise<string> {
  const now = new Date()
  const h = now.getHours()
  const greeting = h < 12 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' })

  let context = `${greeting} Markus! Heute ist ${dayName}.\n\n`
  if (overdue.length) context += `Überfällige Tasks: ${overdue.map(t => t.title).join(', ')}\n`
  if (tasks.length) context += `Heute fällig: ${tasks.map(t => t.title).join(', ')}\n`
  if (events.length) context += `Termine heute: ${events.map(e => {
    const time = e.start_at?.split('T')[1]?.slice(0, 5) || 'Ganztägig'
    return `${time} ${e.title}${e.location ? ' (' + e.location + ')' : ''}`
  }).join(', ')}\n`

  if (!overdue.length && !tasks.length && !events.length) {
    return `${greeting} Markus! Heute steht nichts Besonderes an — genieß den ${dayName}! ☀️`
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Du bist Markus' persönlicher Assistent. Fasse seinen Tag in 2-3 Sätzen zusammen.
Natürlich, freundlich, auf Deutsch. Nicht förmlich. Keine Aufzählung, fließender Text. Max 200 Zeichen.
Verwende keine Emojis außer höchstens einem am Ende.

Daten:
${context}`,
      }],
    }),
  })
  const data = await res.json()
  let text = data.content?.[0]?.text || ''
  text = text.replace(/```[^`]*```/g, '').trim()
  return text || context.trim()
}

serve(async (req) => {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CAPTURE_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // Test notification
  if (action === 'test') {
    const sent = await sendToAll({
      title: 'Markus Hub',
      body: 'Push-Benachrichtigungen funktionieren!',
      tag: 'test',
    })
    return new Response(JSON.stringify({ ok: true, sent }))
  }

  // Daily briefing: Claude generates natural language summary
  if (action === 'daily') {
    const td = new Date().toISOString().split('T')[0]

    const { data: overdue } = await sb.from('hub_tasks')
      .select('title, due_date').eq('user_id', USER_ID).eq('done', false)
      .lt('due_date', td).not('due_date', 'is', null)

    const { data: todayTasks } = await sb.from('hub_tasks')
      .select('title').eq('user_id', USER_ID).eq('done', false).eq('due_date', td)

    const { data: allEvents } = await sb.from('hub_calendar_events')
      .select('title, start_at, location, calendar_name').eq('user_id', USER_ID)
      .gte('start_at', td).lt('start_at', td + 'T23:59')
    const events = (allEvents || []).filter(e => !EXCLUDED_CALENDARS.includes(e.calendar_name))

    const briefing = await generateBriefing(todayTasks || [], events, overdue || [])

    const sent = await sendToAll({
      title: '☀️ Dein Tag',
      body: briefing,
      tag: 'daily-briefing',
    })
    return new Response(JSON.stringify({ ok: true, sent, briefing }))
  }

  // Default (cron every 15 min): only calendar event reminders (30 min before)
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 60000)
  const nowStr = now.toISOString().replace('Z', '').slice(0, 16)
  const soonStr = soon.toISOString().replace('Z', '').slice(0, 16)

  const { data: allCronEvents } = await sb.from('hub_calendar_events')
    .select('title, start_at, calendar_name, location')
    .eq('user_id', USER_ID)
    .gte('start_at', nowStr)
    .lte('start_at', soonStr)
  const events = (allCronEvents || []).filter(e => !EXCLUDED_CALENDARS.includes(e.calendar_name))

  if (!events?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no upcoming events' }))
  }

  let sent = 0
  for (const ev of events) {
    const time = ev.start_at?.split('T')[1]?.slice(0, 5) || ''
    const loc = ev.location ? ` · ${ev.location}` : ''
    const s = await sendToAll({
      title: `📅 ${time} ${ev.title}`,
      body: `${ev.calendar_name}${loc}`,
      tag: `cal-${ev.start_at}`,
    })
    sent += s
  }

  return new Response(JSON.stringify({ ok: true, sent, events: events.length }))
})
