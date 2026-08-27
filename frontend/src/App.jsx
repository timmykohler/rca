import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useResultsStore } from './hooks/useResultsStore'

function NavTab({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          isActive
            ? 'border-gold-500 text-brand-700'
            : 'border-transparent text-neutral-500 hover:text-brand-600 hover:border-neutral-300'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  const { result, savedPlans, planInput, clearResult } = useResultsStore()
  const navigate = useNavigate()

  // Name shown in the header. Collapses a shared surname:
  // "Frank Martinez" + "Linda Martinez" → "Frank and Linda Martinez"
  const displayName = (() => {
    if (!result) return ''
    if (!planInput?.has_co_investor || !planInput?.co_investor_name) {
      return result.investor_name
    }
    const pP = (result.investor_name || '').trim().split(' ')
    const cP = (planInput.co_investor_name || '').trim().split(' ')
    return pP[pP.length - 1] === cP[cP.length - 1]
      ? `${pP[0]} and ${planInput.co_investor_name}`
      : `${result.investor_name} and ${planInput.co_investor_name}`
  })()

  function handleClear() {
    clearResult()
    navigate('/manual')
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-sm tracking-wide" style={{ color: '#598A7D' }}>
              Resources Claims Analysis
            </span>
          </div>
          {result && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
              <span>Results ready — {displayName}</span>
              <button
                type="button"
                onClick={handleClear}
                title={`Clear results for ${displayName}`}
                className="ml-1 rounded px-1.5 py-0.5 text-neutral-400 leading-none transition-colors
                           hover:bg-neutral-100 hover:text-neutral-700
                           focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                ✕<span className="sr-only">Clear results</span>
              </button>
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto px-6 flex items-center gap-1 -mb-px overflow-x-auto">
          <NavTab to="/manual">Manual Input</NavTab>
          <NavTab to="/import">Import from MGP</NavTab>
          <NavTab to="/json-import">Sample Plans</NavTab>
          <NavTab to="/scenarios">Scenarios</NavTab>
          {result && <NavTab to="/results">Results ✦</NavTab>}
          {savedPlans.length > 0 && <NavTab to="/history">History ({savedPlans.length})</NavTab>}
          <NavTab to="/multi-scenario">Compare</NavTab>
          <div className="flex-1" />
          <NavTab to="/settings">Settings</NavTab>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 print:px-0 print:py-0">
        <Outlet />
      </main>
    </div>
  )
}
