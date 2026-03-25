import { state } from '../state.js';
import { esc } from '../lib/dom.js';
import { today, fmtDateLong, timeFromISO, dateFromISO } from '../lib/date.js';
import { CAL_COLORS } from '../services/calendar.js';

let calViewDate = new Date();
let calSelectedDate = today();

export function renderCalendar(container) {
  const calHidden = JSON.parse(localStorage.getItem('loom_cal_hidden') || localStorage.getItem('hub_cal_hidden') || '[]');
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
  const monthNames = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Grid
  const first = new Date(y, m, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const td = today();

  const visEvents = state.calendarEvents.filter(e => !calHidden.includes(e.calendar_name));
  const allCals = [...new Set(state.calendarEvents.map(e => e.calendar_name))].sort();

  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  let gridHTML = days.map(d => `<div class="cal-head">${d}</div>`).join('');

  for (let i = 0; i < 42; i++) {
    let day, dateStr, isOther = false;
    if (i < startDay) {
      day = prevDays - startDay + i + 1;
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      isOther = true;
    } else if (i - startDay >= daysInMonth) {
      day = i - startDay - daysInMonth + 1;
      const nm = m === 11 ? 0 : m + 1;
      const ny = m === 11 ? y + 1 : y;
      dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      isOther = true;
    } else {
      day = i - startDay + 1;
      dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const dayEvents = visEvents.filter(e => dateFromISO(e.start_at) === dateStr);
    const cls = ['cal-day', isOther ? 'other-month' : '', dateStr === td ? 'today' : '', dateStr === calSelectedDate ? 'selected' : ''].filter(Boolean).join(' ');
    const dots = dayEvents.slice(0, 5).map(e => `<div class="cal-day-dot" style="background:${CAL_COLORS[e.calendar_name] || 'var(--accent)'}"></div>`).join('');

    gridHTML += `<div class="${cls}" data-date="${dateStr}"><div class="cal-day-num">${day}</div><div class="cal-day-dots">${dots}</div></div>`;
  }

  // Selected day events
  const selectedEvents = state.calendarEvents.filter(e =>
    !calHidden.includes(e.calendar_name) && dateFromISO(e.start_at) === calSelectedDate
  ).sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));

  container.innerHTML = `
    <div class="page-inner">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="page-title">Kalender</div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-ghost" id="cal-prev">${'‹'}</button>
          <span style="font-size:var(--text-sm);font-weight:600;min-width:120px;text-align:center">${monthNames[m]} ${y}</span>
          <button class="btn btn-ghost" id="cal-next">${'›'}</button>
          <button class="btn btn-ghost" id="cal-today" style="margin-left:8px">Heute</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        ${allCals.map(c => {
          const col = CAL_COLORS[c] || 'var(--accent)';
          const active = !calHidden.includes(c);
          return `<div class="cal-filter-chip ${active ? 'active' : 'inactive'}" style="color:${col};background:${col}11" data-cal-filter="${c}"><div style="width:6px;height:6px;border-radius:3px;background:${col}"></div>${esc(c)}</div>`;
        }).join('')}
      </div>

      <div class="cal-grid" id="cal-grid">${gridHTML}</div>

      <div style="margin-top:24px">
        <div class="section-label" style="margin-bottom:10px">${fmtDateLong(calSelectedDate)} ${selectedEvents.length ? `(${selectedEvents.length})` : ''}</div>
        ${selectedEvents.length
          ? selectedEvents.map(e => {
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
            }).join('')
          : '<div style="color:var(--text-tertiary);font-size:var(--text-sm);padding:8px 0">Keine Termine</div>'}
      </div>
    </div>
  `;

  bindCalendarEvents(container, calHidden);
}

function bindCalendarEvents(container, calHidden) {
  container.querySelector('#cal-prev')?.addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() - 1);
    renderCalendar(container);
  });
  container.querySelector('#cal-next')?.addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() + 1);
    renderCalendar(container);
  });
  container.querySelector('#cal-today')?.addEventListener('click', () => {
    calViewDate = new Date();
    calSelectedDate = today();
    renderCalendar(container);
  });

  container.querySelectorAll('[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      calSelectedDate = el.dataset.date;
      renderCalendar(container);
    });
  });

  container.querySelectorAll('[data-cal-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const name = el.dataset.calFilter;
      const idx = calHidden.indexOf(name);
      if (idx > -1) calHidden.splice(idx, 1);
      else calHidden.push(name);
      localStorage.setItem('loom_cal_hidden', JSON.stringify(calHidden));
      renderCalendar(container);
    });
  });
}
