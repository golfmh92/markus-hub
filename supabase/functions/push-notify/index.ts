import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const CAPTURE_SECRET = Deno.env.get('TASK_CAPTURE_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

const USER_ID = '4d8c575a-6551-463f-818d-199bc86f3ee8'
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Web Push crypto helpers
async function sendPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  // Use web-push compatible implementation
  const { default: webpush } = await import('https://esm.sh/web-push@3.6.7')
  webpush.setVapidDetails('mailto:mhabeler92@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  await webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload)
}

serve(async (req) => {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CAPTURE_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // Test: send a test notification
  if (action === 'test') {
    const { data: subs } = await sb.from('hub_push_subscriptions')
      .select('*').eq('user_id', USER_ID)
    if (!subs?.length) {
      return new Response(JSON.stringify({ error: 'No push subscriptions found' }), { status: 404 })
    }
    let sent = 0
    for (const sub of subs) {
      try {
        await sendPush(sub, JSON.stringify({
          title: 'Markus Hub',
          body: 'Push-Benachrichtigungen funktionieren!',
          tag: 'test',
        }))
        sent++
      } catch (err) {
        console.error('Push error:', err)
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }))
  }

  // Default: check for tasks due today and upcoming calendar events
  const td = new Date().toISOString().split('T')[0]
  const notifications: { title: string; body: string; tag: string }[] = []

  // Overdue tasks
  const { data: overdue } = await sb.from('hub_tasks')
    .select('title, due_date')
    .eq('user_id', USER_ID).eq('done', false)
    .lt('due_date', td)
    .not('due_date', 'is', null)
  if (overdue?.length) {
    notifications.push({
      title: `${overdue.length} überfällige Task${overdue.length > 1 ? 's' : ''}`,
      body: overdue.slice(0, 3).map(t => t.title).join(', '),
      tag: 'overdue',
    })
  }

  // Tasks due today
  const { data: todayTasks } = await sb.from('hub_tasks')
    .select('title')
    .eq('user_id', USER_ID).eq('done', false).eq('due_date', td)
  if (todayTasks?.length) {
    notifications.push({
      title: `${todayTasks.length} Task${todayTasks.length > 1 ? 's' : ''} heute fällig`,
      body: todayTasks.slice(0, 3).map(t => t.title).join(', '),
      tag: 'today-tasks',
    })
  }

  // Calendar events in next 30 minutes
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 60000)
  const nowStr = now.toISOString().replace('Z', '')
  const soonStr = soon.toISOString().replace('Z', '')
  const { data: events } = await sb.from('hub_calendar_events')
    .select('title, start_at, calendar_name')
    .eq('user_id', USER_ID)
    .gte('start_at', nowStr.slice(0, 16))
    .lte('start_at', soonStr.slice(0, 16))
  if (events?.length) {
    for (const ev of events) {
      const time = ev.start_at?.split('T')[1]?.slice(0, 5) || ''
      notifications.push({
        title: `${time} ${ev.title}`,
        body: ev.calendar_name || '',
        tag: `cal-${ev.start_at}`,
      })
    }
  }

  if (!notifications.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nothing to notify' }))
  }

  // Send to all subscriptions
  const { data: subs } = await sb.from('hub_push_subscriptions')
    .select('*').eq('user_id', USER_ID)
  if (!subs?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no subscriptions' }))
  }

  let sent = 0
  for (const notif of notifications) {
    for (const sub of subs) {
      try {
        await sendPush(sub, JSON.stringify(notif))
        sent++
      } catch (err) {
        console.error('Push error:', err)
        // Remove invalid subscriptions
        if (String(err).includes('410') || String(err).includes('404')) {
          await sb.from('hub_push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, notifications: notifications.length }))
})
