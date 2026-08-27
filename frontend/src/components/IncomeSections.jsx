import { Input, Select, AddRowButton, RemoveButton, RadioGroup } from './FormFields'

const OWNER_OPTS = [
  { value: 'investor',    label: 'Investor' },
  { value: 'co-investor', label: 'Co-Investor' },
]

export const INCOME_TYPES = [
  { value: 'pension',           label: 'Pension' },
  { value: 'annuity',           label: 'Annuity Income' },
  { value: 'rental',            label: 'Rental Property Income' },
  { value: 'royalties',         label: 'Royalties' },
  { value: 'part_time',         label: 'Part-Time Employment' },
  { value: 'alimony',           label: 'Alimony' },
  { value: 'trust_income',      label: 'Irrevocable Trust Income' },
  { value: 'reverse_mortgage',  label: 'Reverse Mortgage Proceeds' },
  { value: 'deferred_comp_now', label: 'Deferred Comp (receiving now)' },
  { value: 'other',             label: 'Other Income' },
]

export const PRIVATE_ASSET_TYPES = [
  { value: 'home',            label: 'Primary Home' },
  { value: 'real_estate',     label: 'Real Estate / Rental Property' },
  { value: 'business',        label: 'Business Interest' },
  { value: 'vehicle',         label: 'Vehicle' },
  { value: 'collectible',     label: 'Collectible' },
  { value: 'cash_value_life', label: 'Cash Value Life Insurance' },
  { value: 'personal',        label: 'Personal Property' },
  { value: 'other',           label: 'Other Asset' },
]

export const LIABILITY_TYPES = [
  { value: 'mortgage_first',  label: '1st Mortgage' },
  { value: 'mortgage_second', label: '2nd Mortgage' },
  { value: 'equity_line',     label: 'Equity Line / HELOC' },
  { value: 'auto_loan',       label: 'Auto / Vehicle Loan' },
  { value: 'business_loan',   label: 'Business Loan' },
  { value: 'credit_card',     label: 'Credit Card' },
  { value: 'student_loan',    label: 'Student Loan' },
  { value: 'personal_note',   label: 'Personal Note / Line of Credit' },
  { value: 'margin',          label: 'Margin Loan' },
  { value: 'taxes_owed',      label: 'Taxes Owed' },
  { value: 'other',           label: 'Other Liability' },
]

export const FUTURE_ASSET_TYPES = [
  { value: 'inheritance',   label: 'Inheritance' },
  { value: 'gift',          label: 'Gift' },
  { value: 'settlement',    label: 'Settlement / Award' },
  { value: 'death_benefit', label: 'Death Benefit / Life Insurance' },
  { value: 'deferred_comp', label: 'Deferred Comp (future)' },
  { value: 'stock_award',   label: 'Stock Options / Restricted Stock' },
  { value: 'other',         label: 'Other Future Asset' },
]

function R({ children, w = '' }) {
  return <td className={`py-2 pr-3 align-middle ${w}`}>{children}</td>
}

function Hdr({ cols }) {
  return (
    <thead>
      <tr className="border-b border-slate-200">
        {cols.map(c => <th key={c} className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-3 whitespace-nowrap">{c}</th>)}
      </tr>
    </thead>
  )
}

// ── Social Security ────────────────────────────────────────────────────────────
export function SSTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))
  return (
    <table className="w-full text-sm" style={{minWidth:"780px"}}>
      <Hdr cols={['Label','Owner','Annual Amount','COLA %','Start Age','']} />
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id}>
            <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="Social Security" /></R>
            <R w="w-32"><Select className="text-sm py-1.5" value={row.owner} onChange={e=>upd(row.id,'owner',e.target.value)}>{OWNER_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.annual_amount} onChange={e=>upd(row.id,'annual_amount',e.target.value)} placeholder="0" /></R>
            <R w="w-32"><Input suffix="%" type="number" step={0.1} className="w-full" value={row.annual_adjustment} onChange={e=>upd(row.id,'annual_adjustment',e.target.value)} placeholder="2.3" /></R>
            <R w="w-24"><Input type="number" min={62} max={72} className="input-field-sm w-full" value={row.start_age} onChange={e=>upd(row.id,'start_age',e.target.value)} placeholder="67" /></R>
            <R><RemoveButton onClick={()=>rem(row.id)} /></R>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Retirement Income (unified) ───────────────────────────────────────────────
export function RetirementIncomeTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))

  // Which types have survivorship?
  const hasSurv = (type) => ['pension','annuity'].includes(type)
  // Which types have an end age (finite term)?
  const hasEnd = (type) => ['part_time','alimony','rental','royalties','reverse_mortgage','deferred_comp_now','other'].includes(type)

  return (
    <table className="w-full text-sm" style={{minWidth:"780px"}}>
      <Hdr cols={['Label','Type','Owner','Annual Amount','Adj %','Start Age','End Age','Surv.','Surv %','']} />
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id}>
            <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="Label" /></R>
            <R w="w-44">
              <Select className="text-sm py-1.5" value={row.income_type||'other'} onChange={e=>upd(row.id,'income_type',e.target.value)}>
                {INCOME_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </R>
            <R w="w-28"><Select className="text-sm py-1.5" value={row.owner} onChange={e=>upd(row.id,'owner',e.target.value)}>{OWNER_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.annual_amount} onChange={e=>upd(row.id,'annual_amount',e.target.value)} placeholder="0" /></R>
            <R w="w-28"><Input suffix="%" type="number" step={0.1} className="w-full" value={row.annual_adjustment} onChange={e=>upd(row.id,'annual_adjustment',e.target.value)} placeholder="0.0" /></R>
            <R w="w-28"><Input type="number" min={0} max={100} className="input-field-sm w-full" value={row.start_age} onChange={e=>upd(row.id,'start_age',e.target.value)} placeholder="65" /></R>
            <R w="w-24">
              {hasEnd(row.income_type||'other')
                ? <Input type="number" min={0} max={110} className="input-field-sm w-full" value={row.end_age||''} onChange={e=>upd(row.id,'end_age',e.target.value)} placeholder="85" />
                : <span className="text-xs text-slate-400 italic">life</span>}
            </R>
            <R w="w-20">
              {hasSurv(row.income_type||'other')
                ? <RadioGroup name={`surv-${row.id}`} options={[{value:'yes',label:'Y'},{value:'no',label:'N'}]}
                    value={row.survivorship?'yes':'no'} onChange={v=>upd(row.id,'survivorship',v==='yes')} />
                : <span className="text-xs text-slate-400">—</span>}
            </R>
            <R w="w-28">
              {hasSurv(row.income_type||'other') && row.survivorship
                ? <Input suffix="%" type="number" min={0} max={100} className="w-full" value={row.survivorship_percentage||'50'} onChange={e=>upd(row.id,'survivorship_percentage',e.target.value)} placeholder="50" />
                : <span className="text-xs text-slate-400">—</span>}
            </R>
            <R><RemoveButton onClick={()=>rem(row.id)} /></R>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Private / Physical Assets ─────────────────────────────────────────────────
export function PrivateAssetsTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))
  return (
    <table className="w-full text-sm" style={{minWidth:"780px"}}>
      <Hdr cols={['Label','Type','Value','Cost Basis','Debt Owed','Tax Rate %','']} />
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id}>
            <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="e.g. Primary Residence" /></R>
            <R w="w-44">
              <Select className="text-sm py-1.5" value={row.asset_type||'other'} onChange={e=>upd(row.id,'asset_type',e.target.value)}>
                {PRIVATE_ASSET_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.value} onChange={e=>upd(row.id,'value',e.target.value)} placeholder="0" /></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.cost_basis} onChange={e=>upd(row.id,'cost_basis',e.target.value)} placeholder="0" /></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.debt_owed} onChange={e=>upd(row.id,'debt_owed',e.target.value)} placeholder="0" /></R>
            <R w="w-28"><Input suffix="%" type="number" min={0} max={50} className="w-full" value={row.tax_rate} onChange={e=>upd(row.id,'tax_rate',e.target.value)} placeholder="15" /></R>
            <R><RemoveButton onClick={()=>rem(row.id)} /></R>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Liabilities ───────────────────────────────────────────────────────────────
export function LiabilitiesTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))
  const total = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0)
  return (
    <>
      <table className="w-full text-sm" style={{minWidth:"780px"}}>
        <Hdr cols={['Label','Type','Balance','Monthly Payment','Interest Rate %','']} />
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => (
            <tr key={row.id}>
              <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="e.g. Credit card, Auto loan" /></R>
              <R w="w-44">
                <Select className="text-sm py-1.5" value={row.liability_type||'other'} onChange={e=>upd(row.id,'liability_type',e.target.value)}>
                  {LIABILITY_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </R>
              <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.balance} onChange={e=>upd(row.id,'balance',e.target.value)} placeholder="0" /></R>
              <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.monthly_payment||''} onChange={e=>upd(row.id,'monthly_payment',e.target.value)} placeholder="0" /></R>
              <R w="w-32"><Input suffix="%" type="number" min={0} max={30} step={0.01} className="w-full" value={row.interest_rate||''} onChange={e=>upd(row.id,'interest_rate',e.target.value)} placeholder="0.0" /></R>
              <R><RemoveButton onClick={()=>rem(row.id)} /></R>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t border-slate-300">
              <td colSpan={2} className="py-1.5 text-xs font-semibold text-slate-600 text-right pr-2">Total Liabilities</td>
              <td className="py-1.5 text-right text-sm font-semibold text-red-700 pr-2">${total.toLocaleString()}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
      <p className="text-xs text-slate-400 mt-2">Liability balances are netted against assets in the funded ratio calculation.</p>
    </>
  )
}

// ── Future Assets ─────────────────────────────────────────────────────────────
export function FutureAssetsTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))
  return (
    <table className="w-full text-sm" style={{minWidth:"780px"}}>
      <Hdr cols={['Label','Type','Owner','Expected Amount','At Age (investor)','Tax Rate %','']} />
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id}>
            <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="e.g. Inheritance" /></R>
            <R w="w-44">
              <Select className="text-sm py-1.5" value={row.asset_type||'other'} onChange={e=>upd(row.id,'asset_type',e.target.value)}>
                {FUTURE_ASSET_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </R>
            <R w="w-28"><Select className="text-sm py-1.5" value={row.owner||'investor'} onChange={e=>upd(row.id,'owner',e.target.value)}>{OWNER_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.amount} onChange={e=>upd(row.id,'amount',e.target.value)} placeholder="0" /></R>
            <R w="w-24"><Input type="number" min={0} max={100} className="input-field-sm w-full" value={row.expected_age} onChange={e=>upd(row.id,'expected_age',e.target.value)} placeholder="75" /></R>
            <R w="w-24"><Input suffix="%" type="number" min={0} max={50} className="w-full" value={row.tax_rate||''} onChange={e=>upd(row.id,'tax_rate',e.target.value)} placeholder="0" /></R>
            <R><RemoveButton onClick={()=>rem(row.id)} /></R>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Future Savings ────────────────────────────────────────────────────────────
export function FutureSavingsTable({ rows, onChange }) {
  const upd = (id, k, v) => onChange(rows.map(r => r.id === id ? { ...r, [k]: v } : r))
  const rem = id => onChange(rows.filter(r => r.id !== id))
  const TYPES = [{value:'pre-tax',label:'Pre-Tax'},{value:'roth',label:'Roth'},{value:'taxable',label:'Taxable'},{value:'other',label:'Other'}]
  return (
    <table className="w-full text-sm" style={{minWidth:"780px"}}>
      <Hdr cols={['Label','Type','Owner','Annual Contribution','Adj %','Start Age','End Age','']} />
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id}>
            <R><Input className="input-field-sm w-full" value={row.label} onChange={e=>upd(row.id,'label',e.target.value)} placeholder="401(k)" /></R>
            <R w="w-28"><Select className="text-sm py-1.5" value={row.savings_type||'pre-tax'} onChange={e=>upd(row.id,'savings_type',e.target.value)}>{TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</Select></R>
            <R w="w-28"><Select className="text-sm py-1.5" value={row.owner||'investor'} onChange={e=>upd(row.id,'owner',e.target.value)}>{OWNER_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></R>
            <R w="w-36"><Input prefix="$" type="number" min={0} className="w-full" value={row.annual_contribution} onChange={e=>upd(row.id,'annual_contribution',e.target.value)} placeholder="0" /></R>
            <R w="w-28"><Input suffix="%" type="number" step={0.1} className="w-full" value={row.annual_adjustment} onChange={e=>upd(row.id,'annual_adjustment',e.target.value)} placeholder="0.0" /></R>
            <R w="w-28"><Input type="number" min={0} max={100} className="input-field-sm w-full" value={row.start_age} onChange={e=>upd(row.id,'start_age',e.target.value)} placeholder="50" /></R>
            <R w="w-24"><Input type="number" min={0} max={100} className="input-field-sm w-full" value={row.end_age} onChange={e=>upd(row.id,'end_age',e.target.value)} placeholder="65" /></R>
            <R><RemoveButton onClick={()=>rem(row.id)} /></R>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Empty row factories ───────────────────────────────────────────────────────
export function emptyRow(type) {
  const id = crypto.randomUUID()
  if (type === 'ss')      return { id, label:'', owner:'investor', annual_amount:'', annual_adjustment:'', start_age:'' }
  if (type === 'income')  return { id, label:'', income_type:'pension', owner:'investor', annual_amount:'', annual_adjustment:'', start_age:'', end_age:'', survivorship:false, survivorship_percentage:'50' }
  if (type === 'private') return { id, label:'', asset_type:'home', value:'', cost_basis:'', debt_owed:'', tax_rate:'' }
  if (type === 'liability') return { id, label:'', liability_type:'mortgage_first', balance:'', monthly_payment:'', interest_rate:'' }
  if (type === 'future_asset') return { id, label:'', asset_type:'inheritance', owner:'investor', amount:'', expected_age:'', tax_rate:'' }
  if (type === 'savings') return { id, label:'', savings_type:'pre-tax', owner:'investor', annual_contribution:'', annual_adjustment:'', start_age:'', end_age:'' }
  return { id }
}
