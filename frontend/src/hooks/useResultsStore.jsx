import { createContext, useContext, useState, useCallback } from 'react'

const ResultsContext = createContext(null)

const KEY_RESULT = 'rca_result'
const KEY_PLAN   = 'rca_plan'
const KEY_SAVES  = 'rca_saved_plans'

// The active result lives in sessionStorage, not localStorage.
//
// It still survives a page refresh and tab navigation, but it is gone once the
// browser tab closes. Previously it persisted indefinitely, so opening the tool
// fresh showed "Results ready — <last client>" when nothing had been loaded.
// For an advisor running back-to-back client meetings that is both confusing
// and a quiet privacy problem: one client's figures sitting in the header while
// the next client is looking at the screen.
//
// Saved plans (History) are deliberate user actions, so those stay in
// localStorage and persist across sessions as before.
function readSS(key, fallback = null) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeSS(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {} }
function removeSS(key)       { try { sessionStorage.removeItem(key) } catch {} }

function readLS(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeLS(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
function removeLS(key)       { try { localStorage.removeItem(key) } catch {} }

// One-time cleanup: earlier versions wrote the active result to localStorage,
// where it would otherwise sit indefinitely holding client data.
function purgeLegacyLocalResult() {
  try {
    if (localStorage.getItem(KEY_RESULT) !== null || localStorage.getItem(KEY_PLAN) !== null) {
      localStorage.removeItem(KEY_RESULT)
      localStorage.removeItem(KEY_PLAN)
    }
  } catch {}
}

// ── Build component breakdown for attribution ─────────────────────────────────
// Extracts the resource sub-components from a result so we can diff two snapshots
function buildComponents(result) {
  const r = result.resources
  return {
    portfolio_after_tax:  r.portfolio_after_tax  || 0,
    private_assets_net:   r.private_assets_net   || 0,
    liabilities_total:    r.liabilities_total     || 0,
    social_security_pv:   r.social_security_pv   || 0,
    retirement_income_pv: (r.retirement_income_pv || 0) + (r.pension_pv || 0) + (r.annuity_pv || 0) + (r.other_income_pv || 0),
    future_assets_pv:     r.future_assets_pv      || 0,
    human_capital_pv:     r.human_capital_pv      || 0,
    total_resources:      r.total_resources        || 0,
    total_claims:         result.claims.total_claims || 0,
  }
}

export function ResultsProvider({ children }) {
  const [result,    setResult]    = useState(() => { purgeLegacyLocalResult(); return readSS(KEY_RESULT) })
  const [planInput, setPlanInput] = useState(() => readSS(KEY_PLAN))
  const [savedPlans, setSavedPlans] = useState(() => readLS(KEY_SAVES, []))

  const storeResult = useCallback((res, plan) => {
    setResult(res)
    setPlanInput(plan)
    writeSS(KEY_RESULT, res)
    writeSS(KEY_PLAN,   plan)
  }, [])

  const clearResult = useCallback(() => {
    setResult(null); setPlanInput(null)
    removeSS(KEY_RESULT); removeSS(KEY_PLAN)
  }, [])

  const savePlan = useCallback((name) => {
    if (!result || !planInput) return null
    const entry = {
      id:         crypto.randomUUID(),
      name:       name || planInput.investor_name || 'Untitled',
      savedAt:    new Date().toISOString(),
      result,
      planInput,
      components: buildComponents(result),   // pre-computed for attribution
    }
    setSavedPlans(prev => {
      const updated = [entry, ...prev]
      writeLS(KEY_SAVES, updated)
      return updated
    })
    return entry.id
  }, [result, planInput])

  const loadPlan = useCallback((id) => {
    const entry = savedPlans.find(p => p.id === id)
    if (!entry) return false
    setResult(entry.result); setPlanInput(entry.planInput)
    writeSS(KEY_RESULT, entry.result); writeSS(KEY_PLAN, entry.planInput)
    return true
  }, [savedPlans])

  const deleteSavedPlan = useCallback((id) => {
    setSavedPlans(prev => {
      const updated = prev.filter(p => p.id !== id)
      writeLS(KEY_SAVES, updated)
      return updated
    })
  }, [])

  return (
    <ResultsContext.Provider value={{
      result, planInput, storeResult, clearResult,
      savedPlans, savePlan, loadPlan, deleteSavedPlan,
    }}>
      {children}
    </ResultsContext.Provider>
  )
}

export function useResultsStore() {
  const ctx = useContext(ResultsContext)
  if (!ctx) throw new Error('useResultsStore must be used within ResultsProvider')
  return ctx
}
