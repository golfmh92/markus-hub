import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const CAPTURE_SECRET = Deno.env.get('TASK_CAPTURE_SECRET')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const CATEGORIES = ['Business', 'Persönlich', 'Golf', 'Strokes App', 'EM', 'E-Mail']
const TODAY = () => new Date().toISOString().split('T')[0]

async function parseWithClaude(text: string): Promise<{
  title: string
  description: string | null
  category: string
  priority: string
  due_date: string | null
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Analysiere diesen diktierten Text und extrahiere einen Task daraus.
Heute ist ${TODAY()}.

Antworte NUR mit validem JSON, kein Markdown, keine Erklärung.

Format:
{
  "title": "Kurzer, prägnanter Task-Titel (max 80 Zeichen)",
  "description": "Zusätzliche Details falls vorhanden, sonst null",
  "category": "Eine von: ${CATEGORIES.join(', ')}",
  "priority": "low|normal|high",
  "due_date": "YYYY-MM-DD falls ein Datum genannt wird (z.B. 'morgen', 'nächsten Freitag', 'am 15.'), sonst null"
}

Regeln:
- Titel soll eine klare Aufgabe sein, nicht der ganze Text
- Wenn relative Daten genannt werden ('morgen', 'übermorgen', 'nächste Woche Montag'), berechne das absolute Datum
- Wenn keine Kategorie passt, nimm "Persönlich"
- Nur "high" priority wenn explizit dringend/wichtig/asap genannt

Text: "${text}"`,
      }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Claude API error:', res.status, JSON.stringify(data).slice(0, 300))
    return { title: text.slice(0, 80), description: text.length > 80 ? text : null, category: 'Persönlich', priority: 'normal', due_date: null }
  }
  let raw = data.content?.[0]?.text ?? '{}'
  // Strip markdown code fences if present
  raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    return { title: text.slice(0, 80), description: text.length > 80 ? text : null, category: 'Persönlich', priority: 'normal', due_date: null }
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // Auth via custom secret (no JWT needed — works from Apple Shortcuts)
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CAPTURE_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const body = await req.json()
    const text = body.text?.trim() || body.title?.trim()
    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 })
    }

    // Single-user app — hardcoded user ID
    const userId = '4d8c575a-6551-463f-818d-199bc86f3ee8'

    // Parse with Claude
    const parsed = await parseWithClaude(text)

    const { data, error } = await supabase.from('hub_tasks').insert({
      user_id: userId,
      title: parsed.title,
      description: parsed.description,
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'Persönlich',
      priority: ['low', 'normal', 'high'].includes(parsed.priority) ? parsed.priority : 'normal',
      due_date: parsed.due_date,
    }).select().single()

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, task: data, parsed }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
