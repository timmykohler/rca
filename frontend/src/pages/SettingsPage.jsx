import { useState, useEffect } from 'react'
import api from '../utils/api'
import { fmt } from '../utils/format'

export default function SettingsPage() {
  const [curve, setCurve] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [overrideValues, setOverrideValues] = useState({})
  const [overrideNote, setOverrideNote] = useState('')
  const [showOverrideForm, setShowOverrideForm] = useState(false)

  useEffect(() => { fetchCurve() }, [])

  async function fetchCurve() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/yield-curve')
      setCurve(data)
      // Pre-populate override form with current values
      const vals = {}
      data.terms.forEach(t => { vals[t.term] = (t.yield * 100).toFixed(3) })
      setOverrideValues(vals)
    } catch (e) {
      setError('Could not load yield curve: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveOverride() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const yieldsDecimal = {}
      Object.entries(overrideValues).forEach(([term, val]) => {
        const n = parseFloat(val)
        if (!isNaN(n)) yieldsDecimal[parseInt(term)] = n > 1 ? n / 100 : n
      })
      await api.post('/yield-curve/override', { yields: yieldsDecimal, note: overrideNote || undefined })
      setSuccess('Yield curve override saved. All future calculations will use these values.')
      setShowOverrideForm(false)
      fetchCurve()
    } catch (e) {
      setError('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleRefreshFred() {
    setRefreshing(true)
    setError(null)
    setSuccess(null)
    try {
      const { data } = await api.post('/yield-curve/refresh')
      setCurve(data)
      const vals = {}
      data.terms.forEach(t => { vals[t.term] = (t.yield * 100).toFixed(3) })
      setOverrideValues(vals)
      setSuccess(`Live yields pulled from FRED (observation date ${data.fred_observation_date || 'n/a'}).`)
    } catch (e) {
      setError('FRED refresh failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleClearOverride() {
    setClearing(true)
    try {
      await api.delete('/yield-curve/override')
      setSuccess('Override cleared. Reverted to live FRED yields.')
      fetchCurve()
    } catch (e) {
      setError('Clear failed: ' + e.message)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-display font-semibold text-brand-700">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage the TIPS yield curve and calculation assumptions used across all analyses.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ {success}
        </div>
      )}

      {/* ── Yield Curve Card ──────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📈 Real TIPS Yield Curve</span>
          <div className="flex items-center gap-2">
            {curve && (
              <span className={`badge ${
                curve.source === 'override' ? 'badge-amber'
                : curve.source === 'fred_live' ? 'badge-green'
                : 'badge-red'
              }`}>
                {curve.source === 'override' ? '⚠ Override Active'
                  : curve.source === 'fred_live' ? '● Live from FRED'
                  : '⚠ Stale Fallback'}
              </span>
            )}
            <button
              className="btn-secondary text-xs py-1.5"
              onClick={handleRefreshFred}
              disabled={refreshing}
              title="Pull the latest TIPS yields from FRED"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh from FRED'}
            </button>
            {curve?.source === 'override' && (
              <button
                className="btn-danger"
                onClick={handleClearOverride}
                disabled={clearing}
              >
                {clearing ? '…' : '✕ Clear Override'}
              </button>
            )}
            <button
              className="btn-secondary text-xs py-1.5"
              onClick={() => setShowOverrideForm(v => !v)}
            >
              {showOverrideForm ? 'Cancel' : '✏ Edit Yields'}
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Info note */}
          {curve && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
              <span className="font-medium">Source:</span>{' '}
              {curve.source === 'override' ? `Manual override — set ${curve.as_of}`
                : curve.source === 'fred_live' ? `Live FRED data — observation date ${curve.as_of}`
                : `Embedded fallback (as of ${curve.as_of})`}
              {curve.note && <span className="ml-1 text-slate-400">— {curve.note}</span>}
              {curve.source === 'embedded' && (
                <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  <strong>These are not live yields.</strong>{' '}
                  {curve.fred_available
                    ? 'The last FRED fetch failed — funded ratios are being computed from stale fallback data.'
                    : 'FRED_API_KEY is not set on this server, so live yields cannot be fetched.'}
                  {curve.fred_error && (
                    <div className="mt-1 font-mono text-[11px] text-red-500">{curve.fred_error}</div>
                  )}
                </div>
              )}
              {curve.source === 'fred_live' && curve.is_stale && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                  Data is older than {curve.refresh_hours}h — a refresh is due.
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <div className="w-4 h-4 border-2 border-steel-300 border-t-brand-600 rounded-full animate-spin" />
              Loading yield curve…
            </div>
          ) : curve ? (
            <>
              {/* Current curve table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs">
                    <th className="pb-2 text-left font-medium text-slate-500">Term</th>
                    <th className="pb-2 text-right font-medium text-slate-500">Real Yield</th>
                    <th className="pb-2 text-right font-medium text-slate-500">Used In Calculations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {curve.terms.map(t => (
                    <tr key={t.term} className="group">
                      <td className="py-2 text-slate-700">{t.label}</td>
                      <td className="py-2 text-right font-mono text-slate-800">
                        {t.yield >= 0 ? '+' : ''}{t.yield_pct.toFixed(3)}%
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-block h-2 rounded-full bg-steel-200"
                          style={{ width: `${Math.max(4, (t.yield_pct + 2) * 20)}px` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Override form */}
              {showOverrideForm && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
                  <p className="text-sm font-semibold text-amber-800">
                    Manual Yield Override
                  </p>
                  <p className="text-xs text-amber-700">
                    Enter real TIPS yields as percentages (e.g. 2.2 for 2.2%). Changes apply to all 
                    future calculations until cleared or server restarts.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(overrideValues).map(([term, val]) => (
                      <div key={term}>
                        <label className="label">{TERM_LABELS[term] || `${term}-Year`}</label>
                        <div className="flex items-center rounded border border-slate-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                          <input
                            type="number"
                            step="0.001"
                            min="-5"
                            max="15"
                            value={val}
                            onChange={e => setOverrideValues(p => ({ ...p, [term]: e.target.value }))}
                            className="flex-1 min-w-0 py-1.5 px-2 text-sm bg-transparent outline-none"
                          />
                          <span className="pr-2 text-slate-400 text-sm">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="label">Note (optional)</label>
                    <input
                      type="text"
                      value={overrideNote}
                      onChange={e => setOverrideNote(e.target.value)}
                      placeholder="e.g. Updated from FRED — March 2026"
                      className="input-field"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary"
                      onClick={handleSaveOverride}
                      disabled={saving}
                    >
                      {saving ? '⏳ Saving…' : '✓ Save Override'}
                    </button>
                    <button className="btn-secondary" onClick={() => setShowOverrideForm(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* ── FRED Live Data ───────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">🔄 Live Yield Data (FRED)</span>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-600">
          <p>
            The server pulls live TIPS yields from the Federal Reserve's FRED API
            automatically — once when the app starts, then every{' '}
            <strong>{curve?.refresh_hours ?? 12} hours</strong> in the background.
            Use <strong>↻ Refresh from FRED</strong> above to force an update immediately.
          </p>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">FRED key configured</span>
              <span className={curve?.fred_available ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                {curve?.fred_available ? 'Yes' : 'No — set FRED_API_KEY'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last successful fetch</span>
              <span className="font-mono">{curve?.fred_fetched_at || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">FRED observation date</span>
              <span className="font-mono">{curve?.fred_observation_date || '—'}</span>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Series used: DFII5, DFII7, DFII10, DFII20, DFII30. Terms FRED does not
            publish (1, 2, 3, 15, 25yr) are interpolated from the fetched anchors.
            To set the key on Render: Dashboard → your service → Environment →
            add <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">FRED_API_KEY</code>, then redeploy.
            A free key has no meaningful rate limit for this use.
          </p>
        </div>
      </div>

      {/* ── Mortality Tables ──────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📋 Mortality Assumptions</span>
        </div>
        <div className="px-5 py-4 text-sm text-slate-600 space-y-2">
          <p>
            Calculations use the <strong>SSA 2022 Period Life Tables</strong> (Social Security Area Population).
            These reflect 2022 realized mortality rates and are the most current publicly available annual tables.
          </p>
          <p className="text-xs text-slate-400">
            Note: SSA period tables use realized mortality rates, not cohort projections. 
            For cohort-adjusted analysis incorporating improvement scales, contact the development team.
            Source: SSA 2025 Trustees Report, Table 4.C6.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">Table</p>
              <p className="font-medium text-brand-700">SSA 2022 Period</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Coverage</p>
              <p className="font-medium text-brand-700">Ages 0–119</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Genders</p>
              <p className="font-medium text-brand-700">Male &amp; Female</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-500 space-y-1.5">
        <p className="font-semibold text-slate-600">About This Tool</p>
        <p>
          Resources Claims Analysis Tool v1.1 — Internal.
          Calculation methodology based on Pittman, S. (2015),{' '}
          <em>"Use Your Client's Funded Ratio to Simplify and Improve Retirement Planning Decisions,"</em>{' '}
          The Journal of Retirement, Fall 2015.
        </p>
        <p>
          API documentation: <code className="bg-white px-1 rounded">http://localhost:8000/docs</code>
        </p>
      </div>
    </div>
  )
}

const TERM_LABELS = {
  1: '1-Year', 2: '2-Year', 3: '3-Year', 5: '5-Year', 7: '7-Year',
  10: '10-Year', 15: '15-Year', 20: '20-Year', 25: '25-Year', 30: '30-Year',
}
