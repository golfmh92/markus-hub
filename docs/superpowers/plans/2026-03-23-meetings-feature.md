# Meetings Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Meetings tab to Markus Hub that records or accepts audio, transcribes via Whisper, summarizes via Claude, and lets action items flow into Tasks.

**Architecture:** Everything lives in `index.html` (single-file app pattern). Supabase handles DB (`hub_meetings`, `hub_profiles`) and Storage (`meeting-audio` bucket). API calls to OpenAI Whisper and Anthropic Claude are made directly from the browser — accepted risk for a single-user personal app.

**Tech Stack:** Vanilla JS, Supabase JS v2, Web MediaRecorder API, OpenAI Whisper REST API, Anthropic Claude API (`claude-sonnet-4-6`)

**Spec:** `docs/superpowers/specs/2026-03-23-meetings-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `index.html` | All HTML, CSS, and JS changes (existing pattern) |
| `schema.sql` | Append new SQL for `hub_meetings`, `hub_profiles`, Storage policy |

---

## Task 1: Database & Storage Setup

**Files:**
- Modify: `schema.sql` (append)
- Run SQL in Supabase SQL Editor

- [ ] **Step 1: Append meetings schema to schema.sql**

Note: `hub_profiles` does NOT exist yet in `schema.sql` — create it fresh. The spec mentioned `ALTER TABLE` as an option, but since the table doesn't exist, `CREATE TABLE` is correct.

Add to the bottom of `schema.sql`:

```sql
-- =============================================================================
-- Meetings Feature
-- =============================================================================

-- API keys stored per user (accepted risk: single-user personal app behind RLS)
-- hub_profiles is new — created here for the first time
create table hub_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  openai_key text,
  anthropic_key text,
  updated_at timestamptz default now()
);

alter table hub_profiles enable row level security;
create policy "own profile select" on hub_profiles for select using (auth.uid() = id);
create policy "own profile insert" on hub_profiles for insert with check (auth.uid() = id);
create policy "own profile update" on hub_profiles for update using (auth.uid() = id);

-- Meetings table
create table hub_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references hub_projects(id) on delete set null,
  title text not null,
  meeting_date date not null,
  duration_seconds integer,
  audio_path text,
  transcript text,
  summary text,
  protocol jsonb,
  status text default 'draft' check (status in ('draft','new','transcribing','summarizing','done','error')),
  error_raw text,                   -- raw API response on JSON parse failure, shown in UI
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_meetings enable row level security;
create policy "own meetings select" on hub_meetings for select using (auth.uid() = user_id);
create policy "own meetings insert" on hub_meetings for insert with check (auth.uid() = user_id);
create policy "own meetings update" on hub_meetings for update using (auth.uid() = user_id);
create policy "own meetings delete" on hub_meetings for delete using (auth.uid() = user_id);

create index idx_meetings_user_id on hub_meetings(user_id);
create index idx_meetings_date    on hub_meetings(user_id, meeting_date desc);
```

- [ ] **Step 2: Run the SQL in Supabase**

Open Supabase Dashboard → SQL Editor → paste the block above → Run.

Expected: no errors, tables `hub_profiles` and `hub_meetings` appear in Table Editor.

- [ ] **Step 3: Create Storage bucket**

In Supabase Dashboard → Storage → New bucket:
- Name: `meeting-audio`
- Public: **OFF** (private)
- Click Create

Then in SQL Editor run:
```sql
create policy "own audio"
  on storage.objects for all
  using (bucket_id = 'meeting-audio' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'meeting-audio' and auth.uid()::text = (storage.foldername(name))[1]);
```

Expected: bucket `meeting-audio` listed in Storage, no policy errors.

- [ ] **Step 4: Commit schema changes**

```bash
cd "markus-hub"
git add schema.sql
git commit -m "feat: add hub_meetings and hub_profiles schema with RLS and Storage policy"
```

---

## Task 2: API Key Settings in Profil Tab

**Files:**
- Modify: `index.html` (Profil HTML section + `renderProfile` + new profile load/save functions)

No test framework exists — verification is done by opening the app in the browser, going to Profil tab, and checking console output.

- [ ] **Step 1: Add state variable and profile load function**

Find the state variables block (around line 682) and add after `let notes = [];`:
```js
let meetings = [];
let userProfile = { openai_key: '', anthropic_key: '' };
```

Add after `loadNotes()` function:
```js
async function loadProfile() {
  const { data } = await sb.from('hub_profiles').select('*').eq('id', currentUser.id).single();
  if (data) userProfile = data;
}

async function saveProfile() {
  const openaiKey = $('profile-openai-key').value.trim();
  const anthropicKey = $('profile-anthropic-key').value.trim();
  await sb.from('hub_profiles').upsert({
    id: currentUser.id,
    openai_key: openaiKey || null,
    anthropic_key: anthropicKey || null,
    updated_at: new Date().toISOString()
  });
  userProfile.openai_key = openaiKey;
  userProfile.anthropic_key = anthropicKey;
  $('profile-save-msg').textContent = 'Gespeichert ✓';
  setTimeout(() => { $('profile-save-msg').textContent = ''; }, 2000);
}
```

- [ ] **Step 2: Add loadProfile to loadAll()**

Find `loadAll()`:
```js
async function loadAll() {
  await Promise.all([loadTasks(), loadProjects(), loadNotes()]);
  renderCurrentView();
}
```

Change to:
```js
async function loadAll() {
  await Promise.all([loadTasks(), loadProjects(), loadNotes(), loadMeetings(), loadProfile()]);
  renderCurrentView();
}
```

(`loadMeetings` will be added in Task 3 — add a stub now):
```js
async function loadMeetings() {
  const { data, error } = await sb.from('hub_meetings')
    .select('*')
    .eq('user_id', currentUser.id)
    .neq('status', 'draft')
    .order('meeting_date', { ascending: false });
  if (error) console.error('[loadMeetings]', error);
  meetings = data || [];
  // Cleanup: delete draft records older than 1 hour
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  await sb.from('hub_meetings').delete()
    .eq('user_id', currentUser.id)
    .eq('status', 'draft')
    .lt('created_at', cutoff);
}
```

- [ ] **Step 3: Add API key fields to Profil tab HTML**

Find the Profil view HTML (`<div id="v-profil">`). Locate the closing `</div>` of the view and insert before it:

```html
<!-- API Keys section -->
<div style="margin-top:24px">
  <div class="section-title">KI-Integration</div>
  <div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)">
    <div class="form-group">
      <label>OpenAI API Key (für Transkription)</label>
      <input id="profile-openai-key" class="input" type="password" placeholder="sk-...">
    </div>
    <div class="form-group">
      <label>Anthropic API Key (für Protokoll)</label>
      <input id="profile-anthropic-key" class="input" type="password" placeholder="sk-ant-...">
    </div>
    <button class="btn btn-primary" onclick="saveProfile()" style="width:100%">Speichern</button>
    <div id="profile-save-msg" style="text-align:center;margin-top:8px;font-size:13px;color:var(--green)"></div>
  </div>
</div>
```

- [ ] **Step 4: Populate key fields in renderProfile()**

Find `renderProfile()` and add at the end of the function body:
```js
  $('profile-openai-key').value = userProfile.openai_key || '';
  $('profile-anthropic-key').value = userProfile.anthropic_key || '';
```

- [ ] **Step 5: Verify in browser**

Open app → Profil tab. Check:
- "KI-Integration" section is visible
- Enter test keys → click Speichern → "Gespeichert ✓" appears
- Reload page → keys are still populated (loaded from Supabase)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: API key settings in Profil tab with Supabase persistence"
```

---

## Task 3: Meetings Tab Navigation & Skeleton View

**Files:**
- Modify: `index.html` (sidebar nav, mobile tab bar, views container, renderCurrentView, switchTab)

- [ ] **Step 1: Add Meetings nav item to desktop sidebar**

Find the sidebar nav block. After the Notizen sidebar-item, add:
```html
<button class="sidebar-item" onclick="switchTab('meetings',this)" data-tab="meetings">
  <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  <span>Meetings</span>
</button>
```

- [ ] **Step 2: Add Meetings tab to mobile tab bar**

Find the `.tab-bar` nav. After the Notizen tab, add:
```html
<button class="tab" onclick="switchTab('meetings',this)" data-tab="meetings">
  <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
</button>
```

Note: per the spec, mobile tabs show icon only (no label text). Verify existing tabs still show correctly — the spec chose to drop labels on mobile tab bar for all tabs to keep them fitting.

- [ ] **Step 3: Hide tab labels on mobile tab bar**

Find the CSS for `.tab` (around line 69). Add:
```css
.tab span{display:none}
```
Labels are already absent in the existing tab HTML (tabs have no `<span>` children) — confirm this before adding the rule. If labels exist, this hides them.

- [ ] **Step 4: Add Meetings view HTML**

In the views container, after the `v-notizen` view and before `v-profil`, add:
```html
<!-- ===== Meetings ===== -->
<div id="v-meetings" class="view">
  <h1 id="meetings-header" style="font-size:28px;font-weight:800;margin-bottom:16px">Meetings</h1>
  <div id="meetings-filter-row" style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
    <select id="meeting-project-filter" class="input" style="flex:1;max-width:200px" onchange="renderMeetings()">
      <option value="all">Alle Projekte</option>
    </select>
    <button class="btn btn-primary btn-sm" onclick="openMeetingModal()">+ Neues Meeting</button>
  </div>
  <div id="meetings-list"></div>
  <div id="meeting-detail-view"><!-- filled in Task 5 --></div>
</div>
```

Note: `id="meetings-header"` and `id="meetings-filter-row"` are required by Task 5's `openMeetingDetail`/`closeMeetingDetail`. Add them now.

- [ ] **Step 5: Add stub renderMeetings() function**

Define `renderMeetings()` BEFORE adding it to the switch statement (Step 6), to avoid ReferenceError if `renderCurrentView()` is called in between.

After `renderNotes()` or at the end of the render functions block, add:
```js
// ── Render: Meetings ──
function renderMeetings() {
  // Populate project filter
  const sel = $('meeting-project-filter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="all">Alle Projekte</option>' +
    projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  sel.value = currentVal;

  const projectFilter = sel.value;
  let filtered = meetings;
  if (projectFilter !== 'all') {
    filtered = filtered.filter(m => m.project_id === projectFilter);
  }

  $('meetings-list').innerHTML = filtered.length
    ? filtered.map(m => meetingCardHTML(m)).join('')
    : '<div class="empty"><div class="empty-icon">🎙</div><h3>Noch keine Meetings</h3><p>Tippe auf "+ Neues Meeting" um loszulegen</p></div>';
}

function meetingCardHTML(m) {
  const proj = projects.find(p => p.id === m.project_id);
  const dur = m.duration_seconds ? `${Math.floor(m.duration_seconds/60)} Min` : '';
  const statusBadge = {
    transcribing: '<span style="color:var(--amber);font-size:12px">⏳ Transkribiere...</span>',
    summarizing:  '<span style="color:var(--amber);font-size:12px">⏳ Protokoll...</span>',
    error:        '<span style="color:var(--red);font-size:12px">⚠ Fehler</span>',
    done:         '',
    new:          '<span style="color:var(--text3);font-size:12px">Kein Audio</span>',
  }[m.status] || '';
  return `
    <div class="card" style="margin-bottom:10px;cursor:pointer" onclick="openMeetingDetail('${m.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span>📅 ${fmtDate(m.meeting_date)}</span>
            ${dur ? `<span>⏱ ${dur}</span>` : ''}
            ${proj ? `<span class="badge" style="background:${proj.color}22;color:${proj.color}">${esc(proj.name)}</span>` : ''}
            ${statusBadge}
          </div>
        </div>
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      ${m.summary ? `<div style="font-size:13px;color:var(--text2);margin-top:10px;line-height:1.5;border-top:1px solid var(--separator);padding-top:10px">${esc(m.summary)}</div>` : ''}
    </div>`;
}
```

- [ ] **Step 6: Add 'meetings' to renderCurrentView switch**

Find `renderCurrentView()` switch statement, add:
```js
case 'meetings': renderMeetings(); break;
```

Find `switchTab()` — the FAB show/hide line:
```js
$('fab').style.display = (tab === 'heute' || tab === 'tasks') ? 'flex' : 'none';
```
No change needed (FAB hidden on meetings tab — "+ Neues Meeting" button is inline).

- [ ] **Step 7: Add stub for openMeetingDetail (placeholder)**

```js
function openMeetingDetail(id) {
  // Implemented in Task 5
  console.log('openMeetingDetail', id);
}
```

- [ ] **Step 8: Verify in browser**

Open app → tap Meetings tab. Check:
- Tab is visible and active state works on both mobile and desktop
- Empty state shows "Noch keine Meetings"
- Project filter dropdown is populated
- "+ Neues Meeting" button is visible

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: meetings tab navigation and list skeleton"
```

---

## Task 4: New Meeting Modal

**Files:**
- Modify: `index.html` (modal HTML + openMeetingModal + saveMeeting)

- [ ] **Step 1: Add Meeting modal HTML**

After the existing `<!-- Project Modal -->` block, add:
```html
<!-- ==================== Meeting Modal ==================== -->
<div class="modal-overlay" id="meeting-modal">
  <div class="modal">
    <div class="modal-handle"></div>
    <h2>Neues Meeting</h2>
    <div class="form-group">
      <label>Titel</label>
      <input id="mm-title" class="input" placeholder="Worum ging es?">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Datum</label>
        <input id="mm-date" class="input" type="date">
      </div>
      <div class="form-group">
        <label>Projekt</label>
        <select id="mm-project" class="input"></select>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" onclick="closeModal('meeting-modal')">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveMeeting()">Weiter →</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add openMeetingModal function**

```js
// ── Meeting Modal ──
function openMeetingModal() {
  populateProjectSelect('mm-project');
  $('mm-title').value = '';
  $('mm-date').value = today();
  $('mm-project').value = '';
  openModal('meeting-modal');
}
```

- [ ] **Step 3: Add saveMeeting function**

```js
async function saveMeeting() {
  const title = $('mm-title').value.trim();
  if (!title) return;
  const { data, error } = await sb.from('hub_meetings').insert({
    title,
    meeting_date: $('mm-date').value,
    project_id: $('mm-project').value || null,
    status: 'draft',
    user_id: currentUser.id
  }).select('id').single();
  if (error) { console.error('[saveMeeting]', error); return; }
  closeModal('meeting-modal');
  openMeetingDetail(data.id);
}
```

- [ ] **Step 4: Verify in browser**

Tap "+ Neues Meeting" → fill title → click "Weiter →". Check:
- Modal appears with correct fields
- After saving, modal closes and `openMeetingDetail` is called (console log visible)
- Record created in Supabase DB with status `draft`

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: new meeting modal with Supabase draft record creation"
```

---

## Task 5: Meeting Detail View

**Files:**
- Modify: `index.html` (detail view HTML + CSS + openMeetingDetail + closeMeetingDetail)

The meeting detail is a full-screen overlay (same pattern as `projekte-detail-view`).

- [ ] **Step 1: Add CSS for meeting detail**

In the CSS block (before `</style>`), add:
```css
/* -- Meeting Detail -- */
#meeting-detail-view{position:absolute;inset:0;background:var(--bg);overflow-y:auto;padding:16px 16px calc(var(--tab-h) + var(--safe-bottom) + 16px);z-index:10;display:none}
.meeting-detail-back{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--text2);margin-bottom:16px;cursor:pointer;padding:4px 0}
.meeting-detail-back svg{width:18px;height:18px;stroke:var(--text2);fill:none;stroke-width:2}
.protocol-section{background:var(--card);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:var(--shadow)}
.protocol-section h3{font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.action-item-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--separator)}
.action-item-row:last-child{border-bottom:none}
.summary-box{background:rgba(0,122,255,.08);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;font-size:14px;line-height:1.6;color:var(--text)}
.audio-capture-box{background:var(--card);border-radius:var(--radius);padding:20px;margin-bottom:16px;box-shadow:var(--shadow);text-align:center}
.record-btn{width:72px;height:72px;border-radius:50%;background:var(--red);color:#fff;border:none;font-size:28px;cursor:pointer;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 12px rgba(255,59,48,.3)}
.record-btn:active{transform:scale(.93)}
.record-btn.recording{animation:pulse 1.2s infinite}
@keyframes pulse{0%,100%{box-shadow:0 4px 12px rgba(255,59,48,.3)}50%{box-shadow:0 4px 24px rgba(255,59,48,.6)}}
.pipeline-status{text-align:center;padding:20px;color:var(--text2);font-size:14px}
.pipeline-progress{height:4px;background:var(--card2);border-radius:2px;margin:12px 0;overflow:hidden}
.pipeline-progress-bar{height:100%;background:var(--accent);border-radius:2px;transition:width .5s ease}
@media(min-width:768px){
  #meeting-detail-view{padding:32px 40px 40px;max-width:1100px;margin:0 auto}
}
```

- [ ] **Step 2: Add meeting detail view HTML**

The `id="meeting-detail-view"` placeholder was already added in Task 3 Step 4. Replace it with the real content:
```html
<div id="meeting-detail-view" style="display:none">
  <div class="meeting-detail-back" onclick="closeMeetingDetail()">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    Zurück
  </div>
  <div id="meeting-detail-content"></div>
</div>
```

- [ ] **Step 3: Add openMeetingDetail, closeMeetingDetail, and currentMeeting state**

Replace the stub `openMeetingDetail`. The `id` attributes added in Task 3 Step 4 (`meetings-header`, `meetings-filter-row`) allow clean show/hide without fragile `querySelector` selectors.

```js
let currentMeetingId = null;
let currentMeeting = null; // fresh DB data, used by importActionItem

function openMeetingDetail(id) {
  currentMeetingId = id;
  $('meetings-header').style.display = 'none';
  $('meetings-filter-row').style.display = 'none';
  $('meetings-list').style.display = 'none';
  $('meeting-detail-view').style.display = 'block';
  renderMeetingDetail();
}

function closeMeetingDetail() {
  currentMeetingId = null;
  currentMeeting = null;
  $('meeting-detail-view').style.display = 'none';
  $('meetings-header').style.display = '';
  $('meetings-filter-row').style.display = '';
  $('meetings-list').style.display = '';
  loadMeetings().then(() => renderMeetings());
}
```

- [ ] **Step 4: Add renderMeetingDetail function**

```js
async function renderMeetingDetail() {
  // Always fetch fresh from DB (status may have changed)
  const { data: m } = await sb.from('hub_meetings').select('*').eq('id', currentMeetingId).single();
  if (!m) { closeMeetingDetail(); return; }
  currentMeeting = m; // stored for importActionItem to use without stale meetings array

  const proj = projects.find(p => p.id === m.project_id);
  const dur = m.duration_seconds ? `${Math.floor(m.duration_seconds / 60)} Min ${m.duration_seconds % 60} Sek` : '';

  let audioHTML = '';
  if (m.audio_path) {
    // Signed URL generated in renderMeetingDetail — valid 1h
    const { data: signedData } = await sb.storage.from('meeting-audio').createSignedUrl(m.audio_path, 3600);
    audioHTML = signedData?.signedUrl
      ? `<audio controls style="width:100%;margin-bottom:16px;border-radius:var(--radius-sm)" src="${signedData.signedUrl}"></audio>`
      : '';
  }

  // Status: show pipeline progress OR capture UI OR results
  let mainContent = '';
  if (m.status === 'draft' || m.status === 'new') {
    mainContent = renderAudioCaptureUI(m);
  } else if (m.status === 'transcribing' || m.status === 'summarizing') {
    const pct = m.status === 'transcribing' ? 40 : 75;
    const label = m.status === 'transcribing' ? 'Transkribiere Audio...' : 'Erstelle Protokoll...';
    mainContent = `
      <div class="pipeline-status">
        <div class="spinner"></div>
        <div>${label}</div>
        <div class="pipeline-progress"><div class="pipeline-progress-bar" style="width:${pct}%"></div></div>
      </div>`;
    // Poll every 3 seconds
    setTimeout(() => { if (currentMeetingId === m.id) renderMeetingDetail(); }, 3000);
  } else if (m.status === 'error') {
    // Show raw Claude/Whisper response if stored, for manual inspection
    const rawBlock = m.error_raw
      ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text2)">Rohe Antwort anzeigen</summary><pre style="font-size:11px;white-space:pre-wrap;margin-top:6px;padding:8px;background:var(--card2);border-radius:6px">${esc(m.error_raw)}</pre></details>`
      : '';
    mainContent = `
      <div style="background:rgba(255,59,48,.1);border-radius:var(--radius);padding:16px;margin-bottom:16px">
        <div style="color:var(--red);font-weight:600;margin-bottom:8px">⚠ Fehler bei der Verarbeitung</div>
        ${rawBlock}
        <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="retryPipeline('${m.id}')">Erneut versuchen</button>
      </div>
      ${audioHTML}`;
  } else if (m.status === 'done') {
    mainContent = renderMeetingResults(m, audioHTML);
  }

  $('meeting-detail-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h2 style="font-size:22px;font-weight:800">${esc(m.title)}</h2>
        <div style="font-size:13px;color:var(--text2);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
          <span>📅 ${fmtDate(m.meeting_date)}</span>
          ${dur ? `<span>⏱ ${dur}</span>` : ''}
          ${proj ? `<span class="badge" style="background:${proj.color}22;color:${proj.color}">${esc(proj.name)}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteMeeting('${m.id}')">Löschen</button>
    </div>
    ${mainContent}
  `;
}

function renderMeetingResults(m, audioHTML) {
  const p = m.protocol || {};
  const participants = (p.participants || []).join(', ') || '–';
  const agenda = (p.agenda || []).map(a => `<li>${esc(a)}</li>`).join('') || '<li>–</li>';
  const decisions = (p.decisions || []).map(d => `<li>${esc(d)}</li>`).join('') || '<li>–</li>';
  const actionItems = (p.action_items || []).map((ai, i) => `
    <div class="action-item-row">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px">${esc(ai.text)}</div>
        ${ai.assignee ? `<div style="font-size:12px;color:var(--text2)">👤 ${esc(ai.assignee)}</div>` : ''}
        ${ai.due ? `<div style="font-size:12px;color:var(--text2)">📅 ${fmtDate(ai.due)}</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="importActionItem(${i},'${m.id}')">→ Task</button>
    </div>`).join('') || '<div style="color:var(--text3);font-size:13px">Keine Action Items</div>';

  const transcriptHTML = m.transcript ? `
    <details style="margin-top:16px">
      <summary style="cursor:pointer;font-size:13px;color:var(--text2);padding:8px 0">Transkript anzeigen</summary>
      <div style="font-size:13px;line-height:1.7;color:var(--text2);margin-top:8px;white-space:pre-wrap">${esc(m.transcript)}</div>
    </details>` : '';

  return `
    ${audioHTML}
    ${m.summary ? `<div class="summary-box">${esc(m.summary)}</div>` : ''}
    <div class="protocol-section"><h3>Teilnehmer</h3><div>${esc(participants)}</div></div>
    <div class="protocol-section"><h3>Agenda</h3><ul style="padding-left:16px">${agenda}</ul></div>
    <div class="protocol-section"><h3>Beschlüsse</h3><ul style="padding-left:16px">${decisions}</ul></div>
    <div class="protocol-section"><h3>Action Items</h3>${actionItems}</div>
    ${transcriptHTML}
  `;
}
```

- [ ] **Step 5: Add deleteMeeting function**

```js
async function deleteMeeting(id) {
  const m = meetings.find(m => m.id === id) || { id };
  if (m.audio_path) {
    await sb.storage.from('meeting-audio').remove([m.audio_path]);
  }
  await sb.from('hub_meetings').delete().eq('id', id);
  closeMeetingDetail();
}
```

- [ ] **Step 6: Add importActionItem stub**

```js
function importActionItem(index, meetingId) {
  // Implemented in Task 9
  console.log('importActionItem', index, meetingId);
}
```

- [ ] **Step 7: Add retryPipeline stub**

```js
async function retryPipeline(id) {
  // Implemented in Task 8
  console.log('retryPipeline', id);
}
```

- [ ] **Step 8: Verify in browser**

Create a test meeting → verify detail view opens with audio capture UI. Navigate back → meetings list visible. Open a non-existent meeting → verify graceful close.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: meeting detail view with protocol display and navigation"
```

---

## Task 6: Audio Recording (MediaRecorder)

**Files:**
- Modify: `index.html` (renderAudioCaptureUI + recording state + MediaRecorder functions)

- [ ] **Step 1: Add recording state variables**

After `let currentMeetingId = null;`, add:
```js
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let pendingAudioBlob = null;
let pendingAudioDuration = 0;
let pendingAudioExt = 'webm';
```

- [ ] **Step 2: Add renderAudioCaptureUI function**

```js
function renderAudioCaptureUI(m) {
  return `
    <div class="audio-capture-box">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">Audio hinzufügen</div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <div style="text-align:center">
          <button id="record-btn" class="record-btn" onclick="toggleRecording()">🎙</button>
          <div id="record-timer" style="font-size:13px;color:var(--text2)">Aufnehmen</div>
        </div>
        <div style="text-align:center">
          <label style="display:inline-flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:28px">📁</div>
            <div style="font-size:13px;color:var(--text2)">Datei</div>
            <input type="file" accept=".mp3,.m4a,.wav,.mp4,.webm,audio/*" style="display:none" onchange="handleAudioFile(this)">
          </label>
        </div>
      </div>
      <div id="audio-preview" style="margin-top:16px;display:none">
        <audio id="audio-preview-player" controls style="width:100%;border-radius:var(--radius-sm)"></audio>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="discardAudio()">Verwerfen</button>
          <button class="btn btn-primary" style="flex:1" onclick="startPipeline()">Transkribieren & Zusammenfassen</button>
        </div>
      </div>
      <div id="audio-error" style="color:var(--red);font-size:13px;margin-top:8px;display:none"></div>
    </div>`;
}
```

- [ ] **Step 3: Add toggleRecording function**

```js
async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    recordingSeconds = 0;
    // Safari does not support audio/webm — fall back to audio/mp4
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const recExt = mimeType === 'audio/webm' ? 'webm' : 'mp4';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: mimeType });
      pendingAudioBlob = blob;
      pendingAudioDuration = recordingSeconds;
      pendingAudioExt = recExt;
      showAudioPreview(blob);
    };
    mediaRecorder.start(1000); // collect data every second
    $('record-btn').classList.add('recording');
    $('record-btn').textContent = '⏹';
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const m = Math.floor(recordingSeconds / 60).toString().padStart(2,'0');
      const s = (recordingSeconds % 60).toString().padStart(2,'0');
      $('record-timer').textContent = `${m}:${s}`;
    }, 1000);
  } catch(e) {
    const errEl = $('audio-error');
    if (errEl) {
      errEl.textContent = 'Mikrofonzugriff verweigert — bitte in den Browser-Einstellungen erlauben.';
      errEl.style.display = 'block';
    }
  }
}

function stopRecording() {
  if (mediaRecorder) mediaRecorder.stop();
  clearInterval(recordingTimer);
  $('record-btn').classList.remove('recording');
  $('record-btn').textContent = '🎙';
  $('record-timer').textContent = 'Aufnehmen';
}

function showAudioPreview(blob) {
  const url = URL.createObjectURL(blob);
  $('audio-preview-player').src = url;
  $('audio-preview').style.display = 'block';
}

function discardAudio() {
  pendingAudioBlob = null;
  pendingAudioDuration = 0;
  $('audio-preview').style.display = 'none';
  $('audio-preview-player').src = '';
}
```

- [ ] **Step 4: Verify in browser**

Open a draft meeting detail → click record button → speak → click stop. Check:
- Timer counts up during recording
- Audio preview player appears with the recorded audio
- "Verwerfen" clears the preview
- Microphone denied shows friendly error

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: browser audio recording with MediaRecorder API"
```

---

## Task 7: Audio File Upload

**Files:**
- Modify: `index.html` (handleAudioFile + size validation + duration reading)

- [ ] **Step 1: Add handleAudioFile function**

```js
function handleAudioFile(input) {
  const file = input.files[0];
  if (!file) return;
  const errEl = $('audio-error');

  // 25 MB hard cap
  if (file.size > 25 * 1024 * 1024) {
    errEl.textContent = 'Aufnahme zu groß (max. 25 MB, ~90 Minuten). Bitte kürzen.';
    errEl.style.display = 'block';
    input.value = '';
    return;
  }
  errEl.style.display = 'none';

  const ext = file.name.split('.').pop().toLowerCase() || 'mp3';
  pendingAudioExt = ext;
  pendingAudioBlob = file;

  // Read duration via hidden audio element
  const tempAudio = document.createElement('audio');
  tempAudio.preload = 'metadata';
  const url = URL.createObjectURL(file);
  tempAudio.src = url;
  tempAudio.onloadedmetadata = () => {
    pendingAudioDuration = Math.round(tempAudio.duration) || 0;
    URL.revokeObjectURL(url);
  };

  showAudioPreview(file);
}
```

- [ ] **Step 2: Verify in browser**

Open draft meeting detail → click folder icon → select an audio file:
- File < 25 MB → preview appears with player
- File > 25 MB → error message, no preview
- After loading, `pendingAudioDuration` populated (check via `console.log(pendingAudioDuration)` in browser console)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: audio file upload with 25MB size validation and duration reading"
```

---

## Task 8: Processing Pipeline (Whisper + Claude)

**Files:**
- Modify: `index.html` (startPipeline + transcribeAudio + summarizeWithClaude + retryPipeline)

- [ ] **Step 1: Add startPipeline function**

```js
async function startPipeline() {
  if (!pendingAudioBlob) return;
  if (!userProfile.openai_key) {
    alert('Bitte zuerst den OpenAI API Key im Profil speichern.');
    return;
  }
  if (!userProfile.anthropic_key) {
    alert('Bitte zuerst den Anthropic API Key im Profil speichern.');
    return;
  }

  const id = currentMeetingId;
  const blob = pendingAudioBlob;
  const duration = pendingAudioDuration;
  const ext = pendingAudioExt;
  pendingAudioBlob = null;

  // 1. Upload to Supabase Storage
  const audioPath = `${currentUser.id}/${id}.${ext}`;
  const { error: uploadError } = await sb.storage.from('meeting-audio').upload(audioPath, blob, {
    contentType: blob.type || `audio/${ext}`,
    upsert: true
  });
  if (uploadError) {
    await setMeetingError(id, uploadError.message);
    renderMeetingDetail();
    return;
  }

  // Save audio_path and duration, set status → transcribing
  await sb.from('hub_meetings').update({
    audio_path: audioPath,
    duration_seconds: duration || null,
    status: 'transcribing',
    updated_at: new Date().toISOString()
  }).eq('id', id);
  renderMeetingDetail(); // shows progress UI

  // 2. Transcribe
  const transcript = await transcribeAudio(blob, ext, id);
  if (!transcript) return; // error already set

  // 3. Summarize
  await sb.from('hub_meetings').update({
    transcript,
    status: 'summarizing',
    updated_at: new Date().toISOString()
  }).eq('id', id);

  const result = await summarizeWithClaude(transcript, id);
  if (!result) return;

  // 4. Save results
  await sb.from('hub_meetings').update({
    summary: result.summary,
    protocol: result,
    status: 'done',
    updated_at: new Date().toISOString()
  }).eq('id', id);
  await loadMeetings();
  if (currentMeetingId === id) renderMeetingDetail();
}

async function setMeetingError(id, msg, rawResponse = null) {
  console.error('[pipeline error]', msg);
  await sb.from('hub_meetings').update({
    status: 'error',
    error_raw: rawResponse || null,
    updated_at: new Date().toISOString()
  }).eq('id', id);
}
```

- [ ] **Step 2: Add transcribeAudio function**

```js
async function transcribeAudio(blob, ext, meetingId) {
  try {
    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'de');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userProfile.openai_key}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.text();
      await setMeetingError(meetingId, `Whisper error: ${err}`);
      if (currentMeetingId === meetingId) renderMeetingDetail();
      return null;
    }
    const data = await res.json();
    return data.text || '';
  } catch(e) {
    await setMeetingError(meetingId, e.message);
    if (currentMeetingId === meetingId) renderMeetingDetail();
    return null;
  }
}
```

- [ ] **Step 3: Add summarizeWithClaude function**

```js
async function summarizeWithClaude(transcript, meetingId) {
  const prompt = `Du bist ein Assistent der Meeting-Protokolle erstellt.
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
${transcript}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': userProfile.anthropic_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      await setMeetingError(meetingId, `Claude error: ${err}`);
      if (currentMeetingId === meetingId) renderMeetingDetail();
      return null;
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    try {
      return JSON.parse(text);
    } catch(parseErr) {
      console.error('[claude] Invalid JSON:', text);
      // Pass raw response so it's shown in the error UI for manual inspection
      await setMeetingError(meetingId, 'Claude returned invalid JSON', text);
      if (currentMeetingId === meetingId) renderMeetingDetail();
      return null;
    }
  } catch(e) {
    await setMeetingError(meetingId, e.message);
    if (currentMeetingId === meetingId) renderMeetingDetail();
    return null;
  }
}
```

- [ ] **Step 4: Implement retryPipeline**

Replace stub:
```js
async function retryPipeline(id) {
  // Re-fetch the meeting to get audio_path
  const { data: m } = await sb.from('hub_meetings').select('*').eq('id', id).single();
  if (!m || !m.audio_path) return;
  if (!userProfile.openai_key || !userProfile.anthropic_key) {
    alert('Bitte API Keys im Profil prüfen.');
    return;
  }

  // Download the audio from storage to re-run pipeline
  const { data: fileData, error } = await sb.storage.from('meeting-audio').download(m.audio_path);
  if (error || !fileData) { alert('Audio nicht mehr verfügbar.'); return; }

  const ext = m.audio_path.split('.').pop();
  pendingAudioBlob = fileData;
  pendingAudioDuration = m.duration_seconds || 0;
  pendingAudioExt = ext;
  // IMPORTANT: set currentMeetingId before calling startPipeline —
  // startPipeline reads currentMeetingId at the top of its body
  currentMeetingId = id;
  await startPipeline();
}
```

- [ ] **Step 5: Verify in browser (end-to-end test)**

Prerequisites: API keys set in Profil tab.

1. Create a new meeting
2. Record 10 seconds of speech or upload a short audio file
3. Click "Transkribieren & Zusammenfassen"
4. Watch status transition: uploading → "Transkribiere..." → "Erstelle Protokoll..." → done
5. Verify in Supabase Table Editor: `hub_meetings` row has transcript, summary, protocol JSON, status = 'done'
6. Verify the detail view shows summary box, protocol sections, action items

Error path: temporarily use a wrong API key → verify error state shows with retry button → fix key → retry → succeeds.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Whisper transcription and Claude summarization pipeline"
```

---

## Task 9: Action Items → Tasks Integration

**Files:**
- Modify: `index.html` (importActionItem function)

- [ ] **Step 1: Implement importActionItem**

Replace stub. Use `currentMeeting` (set by `renderMeetingDetail`) instead of the `meetings` array, which may be stale if the meeting was just processed:
```js
function importActionItem(index, meetingId) {
  // Use currentMeeting (fresh from DB via renderMeetingDetail) rather than
  // the meetings[] array which may not have the latest protocol data
  const m = currentMeeting && currentMeeting.id === meetingId ? currentMeeting : meetings.find(m => m.id === meetingId);
  if (!m) return;
  const ai = (m.protocol?.action_items || [])[index];
  if (!ai) return;

  // Pre-fill task modal fields before opening
  populateCategorySelect('tm-cat');
  populateProjectSelect('tm-project');
  $('task-modal-title').textContent = 'Neuer Task';
  $('tm-delete-btn').style.display = 'none';
  $('task-edit-id').value = '';
  $('tm-title').value = ai.text || '';
  $('tm-desc').value = '';
  $('tm-cat').value = categories[0]?.name || '';
  $('tm-priority').value = 'normal';
  $('tm-due').value = ai.due || today();
  $('tm-project').value = m.project_id || '';
  openModal('task-modal');
}
```

- [ ] **Step 2: Verify in browser**

Open a completed meeting with action items → click "→ Task" button on an action item:
- Task modal opens pre-filled with the action item text
- Due date set if available, otherwise today
- Project pre-selected if meeting had a project
- Save → task appears in Tasks tab

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: import meeting action items into Tasks with pre-filled modal"
```

---

## Task 10: Polish & Final Verification

**Files:**
- Modify: `index.html` (minor CSS tweaks, edge case handling)

- [ ] **Step 1: Verify meetings show on list after completing pipeline**

Navigate away from meeting detail → back to meetings list → completed meeting shows with summary preview.

- [ ] **Step 2: Verify meetings tab on mobile**

Test on mobile viewport:
- 6-tab bar fits without overflow (all icon-only)
- Meeting cards are readable
- Recording button is large enough to tap
- Detail view scrolls correctly

- [ ] **Step 3: Verify draft cleanup**

Manually create a draft meeting via `openMeetingModal()` → cancel → wait (or temporarily reduce cutoff to 1 minute in `loadMeetings`) → reload app → draft record deleted.

- [ ] **Step 4: Test error paths**

- Upload a file > 25 MB → size error message
- Deny microphone → friendly error
- Enter wrong OpenAI key → Whisper error shown, retry available

- [ ] **Step 5: Push to GitHub**

```bash
git push
```

---

## Summary Checklist

| Task | Feature |
|------|---------|
| 1 | Database: `hub_meetings`, `hub_profiles`, Storage bucket |
| 2 | API key settings in Profil tab |
| 3 | Meetings tab navigation + list skeleton |
| 4 | New Meeting modal |
| 5 | Meeting detail view (results display) |
| 6 | Browser audio recording (MediaRecorder) |
| 7 | Audio file upload + size validation |
| 8 | Whisper + Claude processing pipeline |
| 9 | Action Items → Tasks integration |
| 10 | Polish + final verification + push |
