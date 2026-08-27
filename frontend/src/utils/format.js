export const fmt = {
  dollar: (v) => {
    if (v == null) return '—'
    const abs = Math.abs(v)
    const s = abs >= 1_000_000
      ? `$${(abs / 1_000_000).toFixed(2)}M`
      : `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    return v < 0 ? `(${s})` : s
  },
  pct: (v, decimals = 1) =>
    v == null ? '—' : `${(v * 100).toFixed(decimals)}%`,
  pctRaw: (v, decimals = 1) =>
    v == null ? '—' : `${Number(v).toFixed(decimals)}%`,
  ratio: (v) => v == null ? '—' : v.toFixed(3),
  num: (v, decimals = 2) => v == null ? '—' : Number(v).toFixed(decimals),
}

export function statusMeta(status) {
  const map = {
    overfunded:    { label: 'Well Funded',  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', badge: 'badge-green' },
    fully_funded:  { label: 'Fully Funded', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', badge: 'badge-green' },
    at_risk:       { label: 'At Risk',      color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   bar: 'bg-amber-500',   badge: 'badge-amber' },
    underfunded:   { label: 'Underfunded',  color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     bar: 'bg-red-500',     badge: 'badge-red'   },
  }
  return map[status] || map.at_risk
}
