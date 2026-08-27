import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionCard, Field, Input, Select } from '../components/FormFields'
import InvestorInfoSection from '../components/InvestorInfoSection'
import PortfolioSection from '../components/PortfolioSection'
import SpendingGoalsSection from '../components/SpendingGoalsSection'
import {
  SSTable, RetirementIncomeTable, PrivateAssetsTable,
  LiabilitiesTable, FutureAssetsTable, FutureSavingsTable, emptyRow
} from '../components/IncomeSections'
import { calculateFundedRatio } from '../utils/api'
import { useResultsStore } from '../hooks/useResultsStore'

const DEFAULT_INFO = {
  description:'', investor_name:'', investor_dob:'', investor_age:'',
  investor_gender:'', has_co_investor:false,
  co_investor_name:'', co_investor_dob:'', co_investor_age:'', co_investor_gender:'',
  effective_income_tax_rate:'', long_term_gains_rate:'',
}

function toNum(v, fallback=0)  { return parseFloat(v) || fallback }
function toInt(v, fallback=null){ return (v !== '' && v != null) ? (parseInt(v) || fallback) : fallback }
function toRate(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n > 1 ? n/100 : n }

function buildPayload(info, portfolio, spending, ss, income, privateAssets, liabilities, futureAssets, futureSavings) {
  return {
    description: info.description || '',
    investor_name: info.investor_name,
    investor_dob: info.investor_dob || null,
    investor_age: toInt(info.investor_age, 65),
    investor_gender: info.investor_gender || 'female',
    has_co_investor: info.has_co_investor || false,
    co_investor_name: info.co_investor_name || null,
    co_investor_dob: info.co_investor_dob || null,
    co_investor_age: toInt(info.co_investor_age),
    co_investor_gender: info.co_investor_gender || null,
    effective_income_tax_rate: toRate(info.effective_income_tax_rate),
    long_term_gains_rate: toRate(info.long_term_gains_rate),

    portfolio_assets: portfolio.map(({id,...r}) => ({
      ...r,
      present_value: toNum(r.present_value),
      cost_basis:    toNum(r.cost_basis),
    })),

    spending_goals: spending.map(({id,...r}) => ({
      ...r,
      annual_amount:     toNum(r.annual_amount),
      annual_adjustment: toRate(r.annual_adjustment),
      start_age: toInt(r.start_age),
      end_age:   toInt(r.end_age),
    })),

    social_security: ss.map(({id,...r}) => ({
      ...r,
      annual_amount:     toNum(r.annual_amount),
      annual_adjustment: toRate(r.annual_adjustment),
      start_age: toInt(r.start_age, 67),
    })),

    retirement_income: income.map(({id,...r}) => ({
      ...r,
      annual_amount:          toNum(r.annual_amount),
      annual_adjustment:      toRate(r.annual_adjustment),
      start_age:              toInt(r.start_age),
      end_age:                toInt(r.end_age),
      survivorship_percentage: toNum(r.survivorship_percentage, 50) / 100,
    })),

    private_assets: privateAssets.map(({id,...r}) => ({
      ...r,
      value:      toNum(r.value),
      cost_basis: toNum(r.cost_basis),
      debt_owed:  toNum(r.debt_owed),
      tax_rate:   toRate(r.tax_rate),
    })),

    liabilities: liabilities.map(({id,...r}) => ({
      ...r,
      balance:          toNum(r.balance),
      monthly_payment:  toNum(r.monthly_payment),
      interest_rate:    toRate(r.interest_rate),
    })),

    future_assets: futureAssets.map(({id,...r}) => ({
      ...r,
      amount:        toNum(r.amount),
      expected_age:  toInt(r.expected_age, 75),
      tax_rate:      toRate(r.tax_rate),
    })),

    future_savings: futureSavings.map(({id,...r}) => ({
      ...r,
      annual_contribution: toNum(r.annual_contribution),
      annual_adjustment:   toRate(r.annual_adjustment),
      start_age: toInt(r.start_age, 50),
      end_age:   toInt(r.end_age, 65),
    })),

    // legacy fields empty — all income now in retirement_income
    annuities: [], pensions: [], other_income: [],
  }
}

function AddBtn({ onClick, label }) {
  return (
    <button type="button" className="btn-secondary text-xs py-1 px-3" onClick={onClick}>
      + {label}
    </button>
  )
}

function EmptyNote({ children }) {
  return <p className="text-xs text-slate-400 italic">{children}</p>
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A10 10 0 002 12h2z"/></svg>
}

// Convert a plan JSON (API format) back into form-state arrays with IDs
function hydratePlan(p) {
  if (!p) return null
  const uid = () => crypto.randomUUID()
  const fromRate = v => (v != null && v <= 1 && v > 0) ? Math.round(v * 10000) / 100 : (v != null && v > 1 ? Math.round(v * 100) / 100 : (v || ''))

  const info = {
    description:              p.description || '',
    investor_name:            p.investor_name || '',
    investor_dob:             p.investor_dob || '',
    investor_age:             p.investor_age ?? '',
    investor_gender:          p.investor_gender || '',
    has_co_investor:          p.has_co_investor || false,
    co_investor_name:         p.co_investor_name || '',
    co_investor_dob:          p.co_investor_dob || '',
    co_investor_age:          p.co_investor_age ?? '',
    co_investor_gender:       p.co_investor_gender || '',
    effective_income_tax_rate: fromRate(p.effective_income_tax_rate),
    long_term_gains_rate:      fromRate(p.long_term_gains_rate),
  }
  const portfolio = (p.portfolio_assets || []).map(a => ({
    id: uid(), label: a.label || '', account_number: a.account_number || '',
    account_type: a.account_type || 'taxable',
    present_value: a.present_value ?? '', cost_basis: a.cost_basis ?? '',
  }))
  const spending = (p.spending_goals || []).map(s => ({
    id: uid(), label: s.label || '', grouping: s.grouping || 'essential',
    annual_amount: s.annual_amount ?? '', annual_adjustment: fromRate(s.annual_adjustment),
    start_age: s.start_age ?? '', end_age: s.end_age ?? '',
  }))
  const ss = (p.social_security || []).map(s => ({
    id: uid(), label: s.label || '', owner: s.owner || 'investor',
    annual_amount: s.annual_amount ?? '', annual_adjustment: fromRate(s.annual_adjustment),
    start_age: s.start_age ?? '',
  }))
  const income = (p.retirement_income || []).map(r => ({
    id: uid(), label: r.label || '', income_type: r.income_type || 'pension',
    owner: r.owner || 'investor', annual_amount: r.annual_amount ?? '',
    annual_adjustment: fromRate(r.annual_adjustment),
    start_age: r.start_age ?? '', end_age: r.end_age ?? '',
    survivorship: r.survivorship || false,
    survivorship_percentage: r.survivorship_percentage != null ? (r.survivorship_percentage <= 1 ? Math.round(r.survivorship_percentage * 10000) / 100 : Math.round(r.survivorship_percentage * 100) / 100) : '50',
  }))
  const privateAssets = (p.private_assets || []).map(a => ({
    id: uid(), label: a.label || '', asset_type: a.asset_type || 'home',
    value: a.value ?? '', cost_basis: a.cost_basis ?? '',
    debt_owed: a.debt_owed ?? '', tax_rate: fromRate(a.tax_rate),
  }))
  const liabilities = (p.liabilities || []).map(l => ({
    id: uid(), label: l.label || '', liability_type: l.liability_type || 'mortgage_first',
    balance: l.balance ?? '', monthly_payment: l.monthly_payment ?? '',
    interest_rate: fromRate(l.interest_rate),
  }))
  const futureAssets = (p.future_assets || []).map(a => ({
    id: uid(), label: a.label || '', asset_type: a.asset_type || 'inheritance',
    owner: a.owner || 'investor', amount: a.amount ?? '',
    expected_age: a.expected_age ?? '', tax_rate: fromRate(a.tax_rate),
  }))
  const futureSavings = (p.future_savings || []).map(s => ({
    id: uid(), label: s.label || '', savings_type: s.savings_type || 'pre-tax',
    owner: s.owner || 'investor', annual_contribution: s.annual_contribution ?? '',
    annual_adjustment: fromRate(s.annual_adjustment),
    start_age: s.start_age ?? '', end_age: s.end_age ?? '',
  }))

  return { info, portfolio, spending, ss, income, privateAssets, liabilities, futureAssets, futureSavings }
}

export default function ManualInputPage() {
  const navigate = useNavigate()
  const { storeResult, planInput } = useResultsStore()

  // Only hydrate from planInput if a sample was just loaded (flag in sessionStorage)
  const shouldHydrate = typeof window !== 'undefined' && sessionStorage.getItem('rca_hydrate_manual') === '1'
  const hydrated = shouldHydrate ? hydratePlan(planInput) : null
  if (shouldHydrate) sessionStorage.removeItem('rca_hydrate_manual')

  const [info,          setInfo]          = useState(hydrated?.info          || DEFAULT_INFO)
  const [portfolio,     setPortfolio]     = useState(hydrated?.portfolio     || [])
  const [spending,      setSpending]      = useState(hydrated?.spending      || [])
  const [ss,            setSS]            = useState(hydrated?.ss            || [])
  const [income,        setIncome]        = useState(hydrated?.income        || [])
  const [privateAssets, setPrivateAssets] = useState(hydrated?.privateAssets || [])
  const [liabilities,   setLiabilities]  = useState(hydrated?.liabilities   || [])
  const [futureAssets,  setFutureAssets]  = useState(hydrated?.futureAssets  || [])
  const [futureSavings, setFutureSavings] = useState(hydrated?.futureSavings || [])

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = buildPayload(info, portfolio, spending, ss, income, privateAssets, liabilities, futureAssets, futureSavings)
      const result  = await calculateFundedRatio(payload)
      storeResult(result, payload)
      navigate('/results')
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Calculation failed.'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    if (!confirm('Clear all inputs?')) return
    setInfo(DEFAULT_INFO); setPortfolio([]); setSpending([])
    setSS([]); setIncome([]); setPrivateAssets([])
    setLiabilities([]); setFutureAssets([]); setFutureSavings([])
  }

  const add = (setter, type) => () => setter(prev => [...prev, emptyRow(type)])

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Top bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <label className="label">Description / Case Name</label>
          <Input value={info.description} onChange={e=>setInfo(p=>({...p,description:e.target.value}))} placeholder="e.g. Smith Family — Retirement Plan 2025" />
        </div>
        <div className="flex items-end gap-2 pb-0.5 mt-auto">
          <button type="button" onClick={handleClear} className="btn-secondary">Clear All</button>
          <button type="submit" className="btn-gold" disabled={loading}>
            {loading ? <><Spinner/> Calculating…</> : <>⚡ Evaluate Plan</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── REQUIRED ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Required Information</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <SectionCard title="Investor Info" icon="👤">
        <InvestorInfoSection data={info} onChange={setInfo} />
      </SectionCard>

      <SectionCard title="Tax Rates" icon="📊">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Effective Income Tax Rate" required>
            <Input suffix="%" type="number" min={0} max={60} step={0.1} value={info.effective_income_tax_rate} onChange={e=>setInfo(p=>({...p,effective_income_tax_rate:e.target.value}))} placeholder="24" />
          </Field>
          <Field label="Long-Term Gains Rate" required>
            <Input suffix="%" type="number" min={0} max={40} step={0.1} value={info.long_term_gains_rate} onChange={e=>setInfo(p=>({...p,long_term_gains_rate:e.target.value}))} placeholder="15" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Portfolio Assets (Investment Accounts)" icon="💼" action={<span className="text-xs text-slate-400">Required</span>}>
        <PortfolioSection rows={portfolio} onChange={setPortfolio} />
      </SectionCard>

      <SectionCard title="Spending Goals (Claims)" icon="🎯" action={<span className="text-xs text-slate-400">Required</span>}>
        <SpendingGoalsSection rows={spending} onChange={setSpending} investorAge={info.investor_age} />
      </SectionCard>

      {/* ── OPTIONAL ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Optional Information</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Social Security */}
      <SectionCard title="Social Security" icon="🏛️" action={<AddBtn onClick={add(setSS,'ss')} label="Add" />}>
        {ss.length > 0
          ? <div className="overflow-x-auto"><SSTable rows={ss} onChange={setSS} /></div>
          : <EmptyNote>No Social Security added.</EmptyNote>}
      </SectionCard>

      {/* Retirement Income — all other recurring income */}
      <SectionCard title="Retirement Income" icon="💵" action={<AddBtn onClick={add(setIncome,'income')} label="Add" />}>
        <p className="text-xs text-slate-400 mb-3">
          Pension, annuity, rental, royalties, part-time employment, alimony, trust income, reverse mortgage, deferred comp, and other recurring income.
        </p>
        {income.length > 0
          ? <div className="overflow-x-auto"><RetirementIncomeTable rows={income} onChange={setIncome} /></div>
          : <EmptyNote>No retirement income added.</EmptyNote>}
      </SectionCard>

      {/* Future Savings */}
      <SectionCard title="Future Savings" icon="💰" action={<AddBtn onClick={add(setFutureSavings,'savings')} label="Add" />}>
        {futureSavings.length > 0
          ? <div className="overflow-x-auto"><FutureSavingsTable rows={futureSavings} onChange={setFutureSavings} /></div>
          : <EmptyNote>No future savings added.</EmptyNote>}
      </SectionCard>

      {/* Other Assets */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Other Assets</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <SectionCard title="Home, Real Estate &amp; Business Assets" icon="🏠" action={<AddBtn onClick={add(setPrivateAssets,'private')} label="Add" />}>
        <p className="text-xs text-slate-400 mb-3">
          Primary home, rental properties, business interests, vehicles, cash value life insurance, and other personal assets. Enter debt on each asset — it is netted against the value.
        </p>
        {privateAssets.length > 0
          ? <div className="overflow-x-auto"><PrivateAssetsTable rows={privateAssets} onChange={setPrivateAssets} /></div>
          : <EmptyNote>No assets added.</EmptyNote>}
      </SectionCard>

      <SectionCard title="Future Assets" icon="🔮" action={<AddBtn onClick={add(setFutureAssets,'future_asset')} label="Add" />}>
        <p className="text-xs text-slate-400 mb-3">
          Expected one-time future inflows: inheritance, gifts, settlements, death benefits, stock award vesting, deferred compensation lump sums. Discounted to present value.
        </p>
        {futureAssets.length > 0
          ? <div className="overflow-x-auto"><FutureAssetsTable rows={futureAssets} onChange={setFutureAssets} /></div>
          : <EmptyNote>No future assets added.</EmptyNote>}
      </SectionCard>

      <SectionCard title="Liabilities" icon="📉" action={<AddBtn onClick={add(setLiabilities,'liability')} label="Add" />}>
        <p className="text-xs text-slate-400 mb-3">
          Standalone liabilities not already captured as debt on a specific asset above — credit cards, personal loans, margin, taxes owed, etc.
        </p>
        {liabilities.length > 0
          ? <div className="overflow-x-auto"><LiabilitiesTable rows={liabilities} onChange={setLiabilities} /></div>
          : <EmptyNote>No liabilities added.</EmptyNote>}
      </SectionCard>

      {/* Bottom CTA */}
      <div className="flex justify-end gap-3 pt-2 pb-8">
        <button type="button" onClick={handleClear} className="btn-secondary">Clear All</button>
        <button type="submit" className="btn-gold px-6" disabled={loading}>
          {loading ? <><Spinner/> Calculating…</> : <>⚡ Evaluate Plan</>}
        </button>
      </div>

    </form>
  )
}
