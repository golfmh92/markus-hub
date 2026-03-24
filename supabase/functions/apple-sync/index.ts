import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const ICLOUD_EMAIL = Deno.env.get('ICLOUD_EMAIL')!
const ICLOUD_APP_PASSWORD = Deno.env.get('ICLOUD_APP_PASSWORD')!
const CAPTURE_SECRET = Deno.env.get('TASK_CAPTURE_SECRET')!

const USER_ID = '4d8c575a-6551-463f-818d-199bc86f3ee8'
const CALDAV_BASE = 'https://p50-caldav.icloud.com'
const CALENDAR_HOME = '/8072496861/calendars/'

// Reminders lists (VTODO)
const REMINDER_LISTS = [
  { path: 'E8339E8D-515C-4D8C-8687-1CC215B7FE6B', name: 'Aufgaben' },
  { path: 'b565e960-3222-4a2e-a2db-d0878dc68e9c', name: 'Reminders' },
]

// Calendar collections (VEVENT) - skip subscribed/inbox/outbox
const CALENDARS = [
  { path: 'home', name: 'Privat' },
  { path: '4AE61C23-48FF-4CD8-8192-ABDECF0CA452', name: 'Arbeit' },
  { path: '3249B962-77FE-4DBA-8549-0E943B35B2B3', name: 'Events (Arbeit Markus)' },
  { path: '90EFFC27-AE52-4427-9471-870559C860B8', name: 'Turniere' },
  { path: 'F253ED41-5550-4C03-A11C-7F901C1CACA2', name: '👫🏼' },
  { path: '3f7e26d0949bca44aa5e0893d7ca8ba94b10e3655809f86d96ab4dc672f01c6b', name: 'Büro (Sandra)' },
]

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const authHeader = 'Basic ' + btoa(`${ICLOUD_EMAIL}:${ICLOUD_APP_PASSWORD}`)

// ── CalDAV helpers ──────────────────────────────────────────────────────────

async function caldavRequest(url: string, method: string, body: string, depth = '1'): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/xml; charset=utf-8',
      'Depth': depth,
    },
    body,
  })
  return await res.text()
}

// ── Parse iCal helpers ──────────────────────────────────────────────────────

function icalValue(ical: string, key: string): string | null {
  // Handles "KEY:value", "KEY;PARAM=val:value", and multi-line folding
  const regex = new RegExp(`^${key}[;:](.*)$`, 'm')
  const m = ical.match(regex)
  if (!m) return null
  let val = m[1]
  // For DTSTART/DTEND with TZID: "TZID=Europe/Vienna:20260324T163000" → take after last colon
  if ((key === 'DTSTART' || key === 'DTEND' || key === 'DUE') && val.includes('=') && val.includes(':')) {
    val = val.substring(val.lastIndexOf(':') + 1)
  }
  return val.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim()
}

function parseIcalDate(val: string | null): string | null {
  if (!val) return null
  // Format: 20260325T100000Z or 20260325T100000 or 20260325
  const clean = val.replace(/[^0-9T]/g, '')
  if (clean.length >= 8) {
    const y = clean.slice(0, 4)
    const mo = clean.slice(4, 6)
    const d = clean.slice(6, 8)
    if (clean.length >= 15) {
      const h = clean.slice(9, 11)
      const mi = clean.slice(11, 13)
      return `${y}-${mo}-${d}T${h}:${mi}:00`
    }
    return `${y}-${mo}-${d}`
  }
  return null
}

function isAllDay(ical: string): boolean {
  return /DTSTART;VALUE=DATE:/.test(ical)
}

function extractUid(ical: string): string | null {
  return icalValue(ical, 'UID')
}

// ── Calendar sync (read-only: Apple → Hub) ──────────────────────────────────

async function syncCalendars() {
  const now = new Date()
  const start = new Date(now); start.setDate(start.getDate() - 7)
  const end = new Date(now); end.setDate(end.getDate() + 60)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

  let totalEvents = 0

  for (const cal of CALENDARS) {
    const url = `${CALDAV_BASE}${CALENDAR_HOME}${cal.path}/`
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${fmt(start)}" end="${fmt(end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

    try {
      const res = await caldavRequest(url, 'REPORT', xml)
      const events = parseCalendarResponse(res, cal.name)
      for (const ev of events) {
        await upsertCalendarEvent(ev)
        totalEvents++
      }
    } catch (err) {
      console.error(`Calendar sync error (${cal.name}):`, err)
    }
  }
  return totalEvents
}

interface CalEvent {
  apple_uid: string
  apple_etag: string
  calendar_name: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  all_day: boolean
}

function parseCalendarResponse(xml: string, calName: string): CalEvent[] {
  const events: CalEvent[] = []
  // Split by <response> blocks
  const responses = xml.split(/<\/?response[^>]*>/i).filter(r => r.includes('calendar-data'))
  for (const block of responses) {
    const etagMatch = block.match(/<getetag[^>]*>([^<]+)</)
    const dataMatch = block.match(/<calendar-data[^>]*>([\s\S]*?)<\/calendar-data/i) ||
                      block.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data/i) ||
                      block.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data/i)
    if (!dataMatch) continue
    let ical = dataMatch[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const uid = extractUid(ical)
    if (!uid) continue

    const title = icalValue(ical, 'SUMMARY')
    const dtstart = icalValue(ical, 'DTSTART')
    const dtend = icalValue(ical, 'DTEND')
    if (!title || !dtstart) continue

    events.push({
      apple_uid: uid,
      apple_etag: etagMatch?.[1] || '',
      calendar_name: calName,
      title,
      description: icalValue(ical, 'DESCRIPTION'),
      location: icalValue(ical, 'LOCATION'),
      start_at: parseIcalDate(dtstart) || dtstart,
      end_at: parseIcalDate(dtend) || parseIcalDate(dtstart) || dtstart,
      all_day: isAllDay(ical),
    })
  }
  return events
}

async function upsertCalendarEvent(ev: CalEvent) {
  const { error } = await sb.from('hub_calendar_events').upsert({
    user_id: USER_ID,
    apple_uid: ev.apple_uid,
    apple_etag: ev.apple_etag,
    calendar_name: ev.calendar_name,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    start_at: ev.start_at,
    end_at: ev.end_at,
    all_day: ev.all_day,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'user_id,apple_uid' })
  if (error) console.error('Upsert calendar event error:', error)
}

// ── Reminders sync (bidirectional: Apple ↔ Hub) ─────────────────────────────

async function syncReminders() {
  let imported = 0
  let exported = 0

  // 1. Apple → Hub: fetch all VTODOs from reminder lists
  for (const list of REMINDER_LISTS) {
    const url = `${CALDAV_BASE}${CALENDAR_HOME}${list.path}/`
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

    try {
      const res = await caldavRequest(url, 'REPORT', xml)
      const todos = parseRemindersResponse(res, list.name)
      for (const todo of todos) {
        const didImport = await importReminder(todo)
        if (didImport) imported++
      }
    } catch (err) {
      console.error(`Reminders sync error (${list.name}):`, err)
    }
  }

  // 2. Hub → Apple: push unsynced hub tasks to first reminder list
  exported = await exportNewTasks()

  return { imported, exported }
}

interface Reminder {
  uid: string
  etag: string
  list_name: string
  title: string
  description: string | null
  due_date: string | null
  completed: boolean
  priority: string
}

function parseRemindersResponse(xml: string, listName: string): Reminder[] {
  const reminders: Reminder[] = []
  const responses = xml.split(/<\/?response[^>]*>/i).filter(r => r.includes('calendar-data'))
  for (const block of responses) {
    const etagMatch = block.match(/<getetag[^>]*>([^<]+)</)
    const dataMatch = block.match(/<calendar-data[^>]*>([\s\S]*?)<\/calendar-data/i) ||
                      block.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data/i) ||
                      block.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data/i)
    if (!dataMatch) continue
    let ical = dataMatch[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const uid = extractUid(ical)
    if (!uid) continue

    const title = icalValue(ical, 'SUMMARY')
    if (!title) continue

    const status = icalValue(ical, 'STATUS')
    const completed = status === 'COMPLETED' || ical.includes('COMPLETED:')
    const due = icalValue(ical, 'DUE')
    const priVal = icalValue(ical, 'PRIORITY')
    // iCal PRIORITY: 1-4 = high, 5 = normal, 6-9 = low
    let priority = 'normal'
    if (priVal) {
      const p = parseInt(priVal)
      if (p >= 1 && p <= 4) priority = 'high'
      else if (p >= 6) priority = 'low'
    }

    reminders.push({
      uid,
      etag: etagMatch?.[1] || '',
      list_name: listName,
      title,
      description: icalValue(ical, 'DESCRIPTION'),
      due_date: parseIcalDate(due),
      completed,
      priority,
    })
  }
  return reminders
}

async function importReminder(r: Reminder): Promise<boolean> {
  // Check if already imported
  const { data: existing } = await sb.from('hub_tasks')
    .select('id, done')
    .eq('user_id', USER_ID)
    .eq('external_id', r.uid)
    .maybeSingle()

  if (existing) {
    // Update done status if changed
    if (existing.done !== r.completed) {
      await sb.from('hub_tasks').update({
        done: r.completed,
        done_at: r.completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
    return false
  }

  // Don't import completed reminders
  if (r.completed) return false

  // Insert new task
  const { error } = await sb.from('hub_tasks').insert({
    user_id: USER_ID,
    title: r.title,
    description: r.description,
    category: 'Persönlich',
    priority: r.priority,
    due_date: r.due_date?.split('T')[0] || null,
    done: false,
    source: 'apple_reminders',
    external_id: r.uid,
  })
  if (error) console.error('Import reminder error:', error)
  return !error
}

async function cleanupOldExports(): Promise<void> {
  // Delete old @markus-hub VTODOs and reset external_ids so they get re-exported with proper format
  const { data: oldTasks } = await sb.from('hub_tasks')
    .select('id, external_id')
    .eq('user_id', USER_ID)
    .like('external_id', '%@markus-hub')

  if (!oldTasks?.length) return
  const listPath = REMINDER_LISTS[0].path
  for (const task of oldTasks) {
    // Delete old VTODO from CalDAV
    const url = `${CALDAV_BASE}${CALENDAR_HOME}${listPath}/${task.external_id}.ics`
    try { await fetch(url, { method: 'DELETE', headers: { 'Authorization': authHeader } }) } catch {}
    // Reset external_id
    await sb.from('hub_tasks').update({ external_id: null, source: 'manual' }).eq('id', task.id)
  }
  console.log(`Cleaned up ${oldTasks.length} old exports`)
}

async function exportNewTasks(): Promise<number> {
  // Find hub tasks without external_id that were created manually (source = manual or null)
  const { data: tasks } = await sb.from('hub_tasks')
    .select('*')
    .eq('user_id', USER_ID)
    .is('external_id', null)
    .eq('done', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!tasks?.length) return 0

  let exported = 0
  const listPath = REMINDER_LISTS[0].path // Export to "Aufgaben" list

  for (const task of tasks) {
    const uid = crypto.randomUUID().toUpperCase()
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace('Z', '') + 'Z'
    let vtodo = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//Markus Hub 1.0//EN\r\nCALSCALE:GREGORIAN\r\nBEGIN:VTODO\r\nUID:${uid}\r\nDTSTAMP:${now}\r\nCREATED:${now}\r\nLAST-MODIFIED:${now}\r\nSUMMARY:${task.title.replace(/,/g, '\\,').replace(/\n/g, '\\n')}\r\nSTATUS:NEEDS-ACTION\r\nSEQUENCE:0`

    if (task.description) {
      vtodo += `\r\nDESCRIPTION:${task.description.replace(/,/g, '\\,').replace(/\n/g, '\\n')}`
    }
    if (task.due_date) {
      vtodo += `\r\nDUE;VALUE=DATE:${task.due_date.replace(/-/g, '')}`
    }
    if (task.priority === 'high') vtodo += '\r\nPRIORITY:1'
    else if (task.priority === 'low') vtodo += '\r\nPRIORITY:9'

    vtodo += `\r\nEND:VTODO\r\nEND:VCALENDAR`

    const filename = `${uid}.ics`
    const url = `${CALDAV_BASE}${CALENDAR_HOME}${listPath}/${filename}`
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*',
        },
        body: vtodo,
      })
      if (res.ok || res.status === 201) {
        // Update task with external_id
        await sb.from('hub_tasks').update({
          external_id: uid,
          source: 'hub',
          updated_at: new Date().toISOString(),
        }).eq('id', task.id)
        exported++
      } else {
        console.error(`Export task failed (${res.status}):`, await res.text())
      }
    } catch (err) {
      console.error('Export task error:', err)
    }
  }
  return exported
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  // Auth
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CAPTURE_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const [calEvents, reminders] = await Promise.all([
      syncCalendars(),
      syncReminders(),
    ])

    return new Response(JSON.stringify({
      ok: true,
      calendar_events_synced: calEvents,
      reminders_imported: reminders.imported,
      tasks_exported: reminders.exported,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
