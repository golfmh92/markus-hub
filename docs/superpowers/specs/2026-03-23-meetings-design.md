# Meetings Feature — Design Spec
**Date:** 2026-03-23
**Project:** Markus Hub (Single-page app, Supabase backend)

---

## Overview

A new "Meetings" tab in the main navigation. Users can record audio directly in the browser or upload an audio file (mp3/m4a/wav). The audio is transcribed via OpenAI Whisper, then Claude generates a structured meeting protocol and a short summary. Action items from the meeting can be imported into the Hub as Tasks with one click.

---

## Architecture

- **Frontend:** New tab `v-meetings` added to the existing single `index.html`
- **Transcription:** OpenAI Whisper API (`/v1/audio/transcriptions`) — handles German and mixed-language audio well
- **Summarization:** Claude API (`claude-sonnet-4-6`) — takes transcript and produces structured JSON output
- **Storage:** Audio files stored in Supabase Storage bucket `meeting-audio` (private); transcript and protocol stored as text/jsonb in Supabase DB
- **API calls:** Both OpenAI and Anthropic APIs are called directly from the browser. This is a known, accepted tradeoff for a single-user personal app behind Supabase auth — the keys are scoped to the authenticated user and not exposed publicly. If security requirements change, calls should be moved to Supabase Edge Functions.
- **Audio size limit:** Hard cap of 25 MB per upload with a clear user message ("Aufnahme zu lang — bitte auf unter ~90 Minuten kürzen"). No client-side chunking — complexity not justified for a personal app.

---

## API Keys

Stored per-user in `hub_profiles` as plain text columns. Protected by RLS (user can only read/write their own row). Accepted risk for single-user personal app — documented above.

```sql
alter table hub_profiles add column openai_key text;
alter table hub_profiles add column anthropic_key text;
```

Entered once in the Profil tab (existing settings area).

---

## Database Schema

```sql
create table hub_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references hub_projects(id) on delete set null,
  title text not null,
  meeting_date date not null,
  duration_seconds integer,         -- populated from <audio>.duration after file load / from recording timer
  audio_path text,                  -- Supabase Storage path
  transcript text,                  -- Raw Whisper output
  summary text,                     -- Short AI summary (2-3 sentences)
  protocol jsonb,                   -- Structured: see below
  status text default 'draft' check (status in ('draft','new','transcribing','summarizing','done','error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_meetings enable row level security;
create policy "own meetings select" on hub_meetings for select using (auth.uid() = user_id);
create policy "own meetings insert" on hub_meetings for insert with check (auth.uid() = user_id);
create policy "own meetings update" on hub_meetings for update using (auth.uid() = user_id);
create policy "own meetings delete" on hub_meetings for delete using (auth.uid() = user_id);
```

Supabase Storage bucket `meeting-audio`:
```sql
-- Created via Supabase dashboard or CLI: private bucket "meeting-audio"
-- Storage RLS policy: user can only access their own files (path prefix = user_id)
create policy "own audio" on storage.objects for all
  using (bucket_id = 'meeting-audio' and auth.uid()::text = (storage.foldername(name))[1]);
```

`protocol` JSONB structure:
```json
{
  "participants": ["Name 1", "Name 2"],
  "agenda": ["Topic 1", "Topic 2"],
  "decisions": ["Decision 1"],
  "action_items": [
    { "text": "Follow up with supplier", "assignee": "Markus", "due": null }
  ]
}
```

---

## UI Flow

### 1. Meeting List (Tab: Meetings)
- Card grid, sorted by date descending
- Each card: title, date, duration, project badge, status indicator (transcribing / done / error)
- Filter by project (dropdown)
- "+ Neues Meeting" button opens the New Meeting modal

**Mobile tab bar:** The existing 5 tabs already fill the bar. Adding a 6th tab requires either removing the label text from the Meetings tab (icon only) or reducing padding across all tabs. Chosen approach: all tabs show icon only on mobile (< 500px), label only visible on desktop sidebar — this is already how the sidebar vs. tab-bar split works.

### 2. New Meeting Modal
Fields:
- Titel (text input)
- Datum (date, defaults to today)
- Projekt (dropdown, optional)

On save: creates a `draft` record in DB, then opens the meeting detail view with audio capture options. If the user navigates away before adding audio, the draft record is deleted on next app load (cleanup on `loadMeetings`: delete all `draft` records older than 1 hour).

### 3. Audio Capture (in Meeting Detail)
Two options shown after creating a draft meeting:
- **🎙 Aufnehmen** — browser microphone via `MediaRecorder` API (webm/opus output). Start/Stop/Discard controls. Duration tracked via timer. On stop: file available as Blob.
- **📁 Datei hochladen** — file picker accepting mp3, m4a, wav, mp4, webm. Max 25 MB enforced client-side. `duration_seconds` read from `<audio>.duration` after file loads.

After audio is ready: "Transkribieren & Zusammenfassen" button starts the pipeline.

### 4. Processing Pipeline

Status updated in DB at each step; UI polls `status` field or updates optimistically.

1. Upload audio Blob to Supabase Storage at path `{user_id}/{meeting_id}.{ext}` → save `audio_path`
2. Call Whisper API (`/v1/audio/transcriptions`, model: `whisper-1`, language: `de`) → save `transcript`, set status: `transcribing`
3. Call Claude API with transcript + prompt below → parse JSON → save `summary` + `protocol`, set status: `summarizing`
4. Set status: `done`

On any error: set status: `error`, show inline retry button.

**Claude prompt:**
```
Du bist ein Assistent der Meeting-Protokolle erstellt.
Analysiere das folgende Transkript und antworte NUR mit validem JSON (kein Markdown, keine Erklärung).

Format:
{
  "summary": "2-3 Sätze Zusammenfassung",
  "participants": ["Name"],
  "agenda": ["Thema"],
  "decisions": ["Beschluss"],
  "action_items": [{ "text": "Aufgabe", "assignee": "Person oder null", "due": "YYYY-MM-DD oder null" }]
}

Transkript:
{transcript}
```

Claude response is parsed with `JSON.parse()`. On parse error: status → `error`, raw response logged for debugging.

### 5. Meeting Detail View

- **Header:** title, date, duration, project badge, edit/delete
- **Audio Player:** `<audio controls>` with signed URL (generated via `supabase.storage.from('meeting-audio').createSignedUrl(path, 3600)` on load)
- **Zusammenfassung:** highlighted box with AI summary
- **Protokoll:** Teilnehmer · Agenda · Beschlüsse · Action Items
- **Action Items:** each with "→ Als Task übernehmen" button
- **Transkript:** collapsible section, full raw text

### 6. Action Item → Task

Clicking "→ Als Task übernehmen" opens the existing Task Modal pre-filled:
- Titel: action item text
- Projekt: meeting's project (if set)
- Priorität: Normal
- Fällig am: action item `due` date if set, otherwise today

---

## Error Handling

- File > 25 MB → inline message before upload attempt
- No microphone permission → friendly message with instructions
- Whisper API error → inline error on detail view, retry button
- Claude API error → error shown in protocol section, transcript still accessible
- Claude returns invalid JSON → error shown, raw response visible for manual copy

---

## Out of Scope (YAGNI)

- Speaker diarization (who said what)
- Real-time live transcription during recording
- Sharing meetings with other users
- Calendar integration
- Client-side audio chunking for files > 25 MB
