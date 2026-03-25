export function today() {
  return new Date().toISOString().split('T')[0];
}

export function fmtDate(d) {
  if (!d) return '';
  const p = d.split('-');
  return `${p[2]}.${p[1]}.${p[0]}`;
}

export function fmtDateLong(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function fmtDateFull(d) {
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function daysBetween(a, b) {
  return Math.floor((new Date(a) - new Date(b)) / 86400000);
}

export function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export function timeFromISO(isoStr) {
  if (!isoStr || !isoStr.includes('T')) return '';
  return isoStr.split('T')[1]?.slice(0, 5) || '';
}

export function dateFromISO(isoStr) {
  if (!isoStr) return '';
  return isoStr.split('T')[0];
}
