export function calcExpr(expr) {
  try {
    let s = expr.trim();
    const hasCurrency = /[€$]/.test(s);
    const curr = hasCurrency ? (s.includes('€') ? '€' : '$') : '';
    s = s.replace(/[€$]/g, '').trim();
    // "30% von 90" → 90 * 0.30
    const pctMatch = s.match(/^([\d.,]+)\s*%\s*von\s*([\d.,]+)$/i);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1].replace(',', '.'));
      const base = parseFloat(pctMatch[2].replace(',', '.'));
      return fmtCalcNum(base * pct / 100) + curr;
    }
    s = s.replace(/x/gi, '*').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
    if (!/^[\d.+\-*/() ]+$/.test(s)) return null;
    const result = Function('"use strict"; return (' + s + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return fmtCalcNum(result) + curr;
  } catch { return null; }
}

export function fmtCalcNum(n) {
  return n % 1 === 0
    ? n.toLocaleString('de-DE')
    : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
