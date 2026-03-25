import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Token refresh ────────────────────────────────────────────────────────────
async function refreshGmailToken(source: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: source.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await supabase.from('hub_email_sources').update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq('id', source.id)
  return data.access_token
}

// ─── Gmail E-Mails holen ──────────────────────────────────────────────────────
async function fetchGmailEmails(accessToken: string, lastEmailId: string | null) {
  // Nur ungelesene E-Mails der letzten 24h
  const query = 'is:unread newer_than:1d'
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const listData = await listRes.json()
  if (!listData.messages?.length) return []

  const emails = []
  for (const msg of listData.messages) {
    if (msg.id === lastEmailId) break // bereits verarbeitet

    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const detail = await detailRes.json()

    const headers = detail.payload?.headers ?? []
    const subject = headers.find((h: Record<string, string>) => h.name === 'Subject')?.value ?? '(kein Betreff)'
    const from = headers.find((h: Record<string, string>) => h.name === 'From')?.value ?? ''

    // Body extrahieren (plain text bevorzugt)
    let body = ''
    const parts = detail.payload?.parts ?? [detail.payload]
    for (const part of parts) {
      if (part?.mimeType === 'text/plain' && part.body?.data) {
        body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
        break
      }
    }

    emails.push({ id: msg.id, subject, from, body: body.slice(0, 1000) })
  }
  return emails
}

// ─── Claude: To-dos erkennen ──────────────────────────────────────────────────
async function extractTodos(emails: Array<{ subject: string; from: string; body: string }>) {
  if (!emails.length) return []

  const emailText = emails.map((e, i) =>
    `E-Mail ${i + 1}:\nVon: ${e.from}\nBetreff: ${e.subject}\nInhalt: ${e.body}`
  ).join('\n\n---\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analysiere diese E-Mails und extrahiere alle To-dos, Aufgaben oder Aktionspunkte.
Antworte NUR mit validem JSON, kein Markdown.

Format:
[
  {
    "title": "Kurze Aufgabenbeschreibung",
    "due_date": "YYYY-MM-DD oder null",
    "priority": "low|normal|high",
    "source_email": "Betreff der E-Mail"
  }
]

Wenn keine To-dos gefunden: leeres Array [].

E-Mails:
${emailText}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '[]'
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}

// ─── Hauptlogik ───────────────────────────────────────────────────────────────
serve(async (_req) => {
  const { data: sources } = await supabase
    .from('hub_email_sources')
    .select('*')
    .eq('enabled', true)
    .eq('provider', 'gmail')

  if (!sources?.length) {
    return new Response(JSON.stringify({ message: 'Keine aktiven E-Mail-Quellen' }), { status: 200 })
  }

  let totalEmailsChecked = 0
  let totalTasksCreated = 0

  for (const source of sources) {
    try {
      // Token erneuern falls abgelaufen
      let accessToken = source.access_token
      if (new Date(source.token_expires_at) <= new Date()) {
        accessToken = await refreshGmailToken(source)
      }

      // E-Mails holen
      const emails = await fetchGmailEmails(accessToken, source.last_email_id)
      totalEmailsChecked += emails.length

      if (!emails.length) continue

      // To-dos extrahieren
      const todos = await extractTodos(emails)

      // Tasks anlegen
      for (const todo of todos) {
        await supabase.from('hub_tasks').insert({
          user_id: source.user_id,
          title: todo.title,
          description: `Aus E-Mail: "${todo.source_email}"`,
          priority: todo.priority ?? 'normal',
          due_date: todo.due_date ?? null,
          category: 'E-Mail',
        })
        totalTasksCreated++
      }

      // Badge-Counter erhöhen
      if (todos.length > 0) {
        await supabase.rpc('increment_email_badge', {
          uid: source.user_id,
          count: todos.length,
        })
      }

      // Letzten Stand speichern
      await supabase.from('hub_email_sources').update({
        last_checked_at: new Date().toISOString(),
        last_email_id: emails[0]?.id ?? source.last_email_id,
      }).eq('id', source.id)

    } catch (err) {
      console.error(`Fehler bei ${source.email}:`, err)
    }
  }

  // Run loggen
  const { data: users } = await supabase.auth.admin.listUsers()
  const userId = users?.users?.[0]?.id
  await supabase.from('hub_email_runs').insert({
    user_id: userId,
    emails_checked: totalEmailsChecked,
    tasks_created: totalTasksCreated,
  })

  return new Response(JSON.stringify({
    emails_checked: totalEmailsChecked,
    tasks_created: totalTasksCreated,
  }), { status: 200 })
})
