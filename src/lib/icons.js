// Lucide-style SVG icons (18px, stroke-width 1.5)
const icon = (d, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// Loom logo (thread arcs)
export const loomLogo = (size = 32) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 192 192" fill="none">
    <defs><linearGradient id="loom-g" x1="0" y1="0" x2="192" y2="192" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>
    <rect width="192" height="192" rx="42" fill="url(#loom-g)"/>
    <path d="M48 140 C48 80, 80 52, 130 52" stroke="white" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M62 148 C62 84, 90 42, 144 42" stroke="rgba(255,255,255,0.5)" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M36 132 C36 78, 72 62, 118 62" stroke="rgba(255,255,255,0.25)" stroke-width="8" stroke-linecap="round" fill="none"/>
    <circle cx="130" cy="52" r="8" fill="white"/><circle cx="144" cy="42" r="6" fill="rgba(255,255,255,0.5)"/><circle cx="118" cy="62" r="5" fill="rgba(255,255,255,0.25)"/>
  </svg>`;

// Loom logo text (icon + "Loom" text)
export const loomLogoText = (iconSize = 28) =>
  `<span style="display:inline-flex;align-items:center;gap:8px">${loomLogo(iconSize)}<span style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.03em">Loom</span></span>`;

export const icons = {
  today: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
  tasks: icon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
  projects: icon('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>'),
  notes: icon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  calendar: icon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  meetings: icon('<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
  search: icon('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  plus: icon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  chevronLeft: icon('<polyline points="15 18 9 12 15 6"/>'),
  chevronRight: icon('<polyline points="9 18 15 12 9 6"/>'),
  chevronDown: icon('<polyline points="6 9 12 15 18 9"/>'),
  logout: icon('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  sort: icon('<path d="M3 6h18M3 12h12M3 18h6"/>'),
  pin: icon('<path d="M12 17v5"/><path d="M9 2h6l-1 7h-4L9 2z"/><path d="M7 9h10l-1 3H8L7 9z"/>'),
  trash: icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  edit: icon('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  menu: icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
  x: icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  user: icon('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  record: icon('<circle cx="12" cy="12" r="6"/>', 18),
  upload: icon('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
};
