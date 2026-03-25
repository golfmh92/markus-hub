import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { today, fmtDate, fmtDateFull, greeting, daysFromNow, timeFromISO, dateFromISO } from '../lib/date.js';
import { taskHTML, bindTaskEvents } from '../components/TaskItem.js';
import { CAL_COLORS } from '../services/calendar.js';
import { navigate } from '../router.js';

let todayFilter = null; // null = alles, 'today', 'week', 'overdue'

export function renderToday(container) {
  const td = today();
  const allTodayTasks = state.tasks.filter(t => t.due_date === td);
  const doneTodayTasks = allTodayTasks.filter(t => t.done);
  const progressPct = allTodayTasks.length > 0 ? Math.round(doneTodayTasks.length / allTodayTasks.length * 100) : 0;
  const openTasks = state.tasks.filter(t => !t.done);
  const todayTasks = openTasks.filter(t => t.due_date === td);
  const weekStr = daysFromNow(7);
  const weekTasks = openTasks.filter(t => t.due_date && t.due_date > td && t.due_date <= weekStr);
  const overdue = openTasks.filter(t => t.due_date && t.due_date < td);
  const highPrio = openTasks.filter(t => t.priority === 'high' && t.due_date !== td && !(t.due_date && t.due_date < td));
  const pinnedNotes = state.notes.filter(n => n.pinned).slice(0, 4);

  const calHidden = JSON.parse(localStorage.getItem('loom_cal_hidden') || localStorage.getItem('hub_cal_hidden') || '[]');
  const calToday = state.calendarEvents.filter(e => {
    if (calHidden.includes(e.calendar_name)) return false;
    return dateFromISO(e.start_at) === td;
  }).sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));

  container.innerHTML = `
    <div class="page-inner">
      <div style="margin-bottom:20px">
        <div class="page-title">${greeting()}</div>
        <div class="page-subtitle">${fmtDateFull(new Date())}</div>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-pill ${todayFilter === 'today' ? 'stat-pill-active' : ''}" style="cursor:pointer" data-stat-filter="today">
          <div class="stat-pill-icon" style="background:var(--accent-bg);color:var(--accent)">📋</div>
          <div>
            <div class="stat-pill-num" style="color:var(--accent)">${todayTasks.length}</div>
            <div class="stat-pill-label">Heute offen</div>
          </div>
        </div>
        <div class="stat-pill ${todayFilter === 'week' ? 'stat-pill-active' : ''}" style="cursor:pointer" data-stat-filter="week">
          <div class="stat-pill-icon" style="background:var(--orange-bg);color:var(--orange)">📅</div>
          <div>
            <div class="stat-pill-num" style="color:var(--orange)">${weekTasks.length}</div>
            <div class="stat-pill-label">Diese Woche</div>
          </div>
        </div>
        <div class="stat-pill ${todayFilter === 'overdue' ? 'stat-pill-active' : ''}" style="cursor:pointer" data-stat-filter="overdue">
          <div class="stat-pill-icon" style="background:var(--red-bg);color:var(--red)">⚠</div>
          <div>
            <div class="stat-pill-num" style="color:var(--red)">${overdue.length}</div>
            <div class="stat-pill-label">Überfällig</div>
          </div>
        </div>
      </div>
      ${todayFilter ? `<div style="margin-bottom:12px"><button class="btn btn-ghost" data-stat-filter="" style="font-size:var(--text-xs)">✕ Filter aufheben</button></div>` : ''}

      ${allTodayTasks.length > 0 ? `
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary)">${doneTodayTasks.length}/${allTodayTasks.length} erledigt</span>
            <span style="font-size:var(--text-xs);color:var(--text-tertiary)">${progressPct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${progressPct}%;${progressPct === 100 ? 'background:var(--green)' : ''}"></div>
          </div>
        </div>
      ` : ''}

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- Calendar Widget (always visible) -->
        ${calToday.length ? `
          <div class="widget">
            <div class="widget-header">
              <div class="widget-header-title">📅 Termine <span class="widget-header-count">${calToday.length}</span></div>
            </div>
            <div class="widget-body-flush">
              ${calToday.map(e => {
                const color = CAL_COLORS[e.calendar_name] || 'var(--accent)';
                const time = e.all_day ? 'Ganztägig' : timeFromISO(e.start_at);
                return `
                  <div class="cal-event-row">
                    <div class="cal-event-time">${time}</div>
                    <div class="cal-event-dot" style="background:${color}"></div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:var(--text-sm);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
                      <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(e.calendar_name)}</div>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${todayFilter === 'overdue' ? `
          <!-- Filtered: Overdue only -->
          <div class="widget" style="grid-column:1/-1">
            <div class="widget-header">
              <div class="widget-header-title" style="color:var(--red)">⚠ Überfällige Tasks <span class="widget-header-count">${overdue.length}</span></div>
            </div>
            <div class="widget-body-flush task-list-widget">
              ${overdue.length
                ? overdue.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).map(t => taskHTML(t)).join('')
                : '<div class="widget-empty">Keine überfälligen Tasks 🎉</div>'}
            </div>
          </div>

        ` : todayFilter === 'today' ? `
          <!-- Filtered: Today only -->
          <div class="widget" style="grid-column:1/-1">
            <div class="widget-header">
              <div class="widget-header-title">✅ Heute fällig <span class="widget-header-count">${todayTasks.length}</span></div>
            </div>
            <div class="widget-body-flush task-list-widget">
              ${todayTasks.length
                ? todayTasks.sort(prioritySorter).map(t => taskHTML(t)).join('')
                : '<div class="widget-empty">Keine Tasks für heute</div>'}
            </div>
          </div>

        ` : todayFilter === 'week' ? `
          <!-- Filtered: Week only -->
          <div class="widget" style="grid-column:1/-1">
            <div class="widget-header">
              <div class="widget-header-title">📆 Nächste 7 Tage <span class="widget-header-count">${weekTasks.length}</span></div>
            </div>
            <div class="widget-body-flush task-list-widget">
              ${weekTasks.length
                ? weekTasks.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).map(t => taskHTML(t)).join('')
                : '<div class="widget-empty">Keine Deadlines diese Woche 🎉</div>'}
            </div>
          </div>

        ` : `
          <!-- No filter: Show all widgets -->
          ${highPrio.length ? `
            <div class="widget">
              <div class="widget-header">
                <div class="widget-header-title" style="color:var(--red)">🔴 Hohe Priorität <span class="widget-header-count">${highPrio.length}</span></div>
              </div>
              <div class="widget-body-flush task-list-widget">
                ${highPrio.slice(0, 5).map(t => taskHTML(t)).join('')}
              </div>
            </div>
          ` : ''}

          ${todayTasks.length ? `
            <div class="widget">
              <div class="widget-header">
                <div class="widget-header-title">✅ Heute fällig <span class="widget-header-count">${todayTasks.length}</span></div>
              </div>
              <div class="widget-body-flush task-list-widget">
                ${todayTasks.sort(prioritySorter).map(t => taskHTML(t)).join('')}
              </div>
            </div>
          ` : ''}

          <div class="widget">
            <div class="widget-header">
              <div class="widget-header-title">📆 Nächste 7 Tage <span class="widget-header-count">${weekTasks.length}</span></div>
              <button class="btn btn-ghost" style="font-size:var(--text-xs)" data-goto="tasks">Alle →</button>
            </div>
            <div class="widget-body-flush task-list-widget">
              ${weekTasks.length
                ? weekTasks.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 8).map(t => taskHTML(t)).join('')
                : '<div class="widget-empty">Keine Deadlines diese Woche 🎉</div>'}
            </div>
          </div>

          ${pinnedNotes.length ? `
            <div class="widget">
              <div class="widget-header">
                <div class="widget-header-title">📌 Angepinnt</div>
                <button class="btn btn-ghost" style="font-size:var(--text-xs)" data-goto="notes">Alle →</button>
              </div>
              <div class="widget-body" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                ${pinnedNotes.map(n => `
                  <div class="note-card" style="cursor:pointer;margin:0;padding:10px 12px" data-pinned-note="${n.id}">
                    <div style="font-size:var(--text-xs);line-height:1.5;color:var(--text-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;white-space:pre-wrap">${esc(n.content.split('\n').slice(0, 3).join('\n'))}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `;

  bindTaskEvents(container);

  // Stat filter clicks
  container.querySelectorAll('[data-stat-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const f = el.dataset.statFilter;
      todayFilter = (f === todayFilter || f === '') ? null : f;
      renderToday(container);
    });
  });

  // Navigation
  container.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.goto));
  });
  container.querySelectorAll('[data-pinned-note]').forEach(el => {
    el.addEventListener('click', () => navigate(`notes/${el.dataset.pinnedNote}`));
  });
}

function prioritySorter(a, b) {
  const order = { high: 0, normal: 1, low: 2 };
  return (order[a.priority] || 1) - (order[b.priority] || 1);
}
