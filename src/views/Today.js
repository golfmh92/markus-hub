import { state } from '../state.js';
import { esc, render } from '../lib/dom.js';
import { today, fmtDate, fmtDateFull, greeting, daysFromNow, timeFromISO, dateFromISO } from '../lib/date.js';
import { taskHTML, bindTaskEvents } from '../components/TaskItem.js';
import { CAL_COLORS } from '../services/calendar.js';
import { navigate } from '../router.js';

export function renderToday(container) {
  const td = today();
  const openTasks = state.tasks.filter(t => !t.done);
  const todayTasks = openTasks.filter(t => t.due_date === td);
  const weekStr = daysFromNow(7);
  const weekTasks = openTasks.filter(t => t.due_date && t.due_date > td && t.due_date <= weekStr);
  const overdue = openTasks.filter(t => t.due_date && t.due_date < td);
  const highPrio = openTasks.filter(t => t.priority === 'high' && t.due_date !== td && !(t.due_date && t.due_date < td));

  // Calendar events today
  const calHidden = JSON.parse(localStorage.getItem('loom_cal_hidden') || localStorage.getItem('hub_cal_hidden') || '[]');
  const calToday = state.calendarEvents.filter(e => {
    if (calHidden.includes(e.calendar_name)) return false;
    return dateFromISO(e.start_at) === td;
  }).sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));

  container.innerHTML = `
    <div class="page-inner">
      <div class="page-title">${greeting()}</div>
      <div class="page-subtitle">${fmtDateFull(new Date())}</div>

      <div class="stats-grid" style="margin-top: 24px;">
        <div class="stat-card">
          <div class="stat-num" style="color: var(--accent)">${todayTasks.length}</div>
          <div class="stat-label">Heute</div>
        </div>
        <div class="stat-card">
          <div class="stat-num" style="color: var(--orange)">${weekTasks.length}</div>
          <div class="stat-label">Diese Woche</div>
        </div>
        <div class="stat-card" style="cursor:pointer" id="overdue-stat">
          <div class="stat-num" style="color: var(--red)">${overdue.length}</div>
          <div class="stat-label">Überfällig</div>
        </div>
      </div>

      ${calToday.length ? `
        <div style="margin-bottom: 28px;">
          <div class="section-label" style="margin-bottom: 10px;">Termine heute</div>
          ${calToday.map(e => {
            const color = CAL_COLORS[e.calendar_name] || 'var(--accent)';
            const time = e.all_day ? 'Ganztägig' : timeFromISO(e.start_at);
            return `
              <div class="cal-event-item">
                <div class="cal-event-dot" style="background:${color}"></div>
                <div style="flex:1;min-width:0">
                  <div class="cal-event-title">${esc(e.title)}</div>
                  <div class="cal-event-meta">${esc(e.calendar_name)}${e.location ? ' · ' + esc(e.location) : ''}</div>
                </div>
                <div class="cal-event-time">${time}</div>
              </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${todayTasks.length ? `
        <div style="margin-bottom: 28px;">
          <div class="section-label" style="margin-bottom: 10px;">Heute fällig</div>
          <div id="today-tasks">
            ${todayTasks.sort(prioritySorter).map(t => taskHTML(t)).join('')}
          </div>
        </div>
      ` : ''}

      ${highPrio.length ? `
        <div style="margin-bottom: 28px;">
          <div class="section-label" style="margin-bottom: 10px; color: var(--red);">Hohe Priorität</div>
          <div id="high-prio-tasks">
            ${highPrio.map(t => taskHTML(t)).join('')}
          </div>
        </div>
      ` : ''}

      <div style="margin-bottom: 28px;">
        <div class="section-label" style="margin-bottom: 10px;">Nächste 7 Tage</div>
        <div id="week-tasks">
          ${[...overdue, ...weekTasks].length
            ? [...overdue, ...weekTasks].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).map(t => taskHTML(t)).join('')
            : '<div class="empty-state"><p>Keine anstehenden Deadlines</p></div>'}
        </div>
      </div>
    </div>
  `;

  bindTaskEvents(container);

  container.querySelector('#overdue-stat')?.addEventListener('click', () => navigate('tasks'));
}

function prioritySorter(a, b) {
  const order = { high: 0, normal: 1, low: 2 };
  return (order[a.priority] || 1) - (order[b.priority] || 1);
}
