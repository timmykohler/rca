import { Field, Input, Select, AddRowButton, RemoveButton } from './FormFields'

const ACCOUNT_TYPES = [
  { value: 'taxable',          label: 'Taxable' },
  { value: 'traditional_ira',  label: 'Traditional IRA / Rollover' },
  { value: 'roth_ira',         label: 'Roth IRA' },
  { value: '401k',             label: '401(k) / 403(b)' },
  { value: 'roth_401k',        label: 'Roth 401(k)' },
  { value: 'other',            label: 'Other' },
]

const emptyRow = () => ({
  id: crypto.randomUUID(),
  account_number: '',
  label: '',
  account_type: 'taxable',
  present_value: '',
  cost_basis: '',
})

export default function PortfolioSection({ rows, onChange }) {
  const update = (id, key, val) =>
    onChange(rows.map(r => r.id === id ? { ...r, [key]: val } : r))
  const remove = (id) => onChange(rows.filter(r => r.id !== id))
  const add = () => onChange([...rows, emptyRow()])

  const total = rows.reduce((s, r) => s + (parseFloat(r.present_value) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm" style={{minWidth:'580px'}}>
          <colgroup>
            <col style={{width:'100px'}} />
            <col />
            <col style={{width:'160px'}} />
            <col style={{width:'130px'}} />
            <col style={{width:'130px'}} />
            <col style={{width:'32px'}} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-1 text-left text-xs font-medium text-neutral-600">Acct #</th>
              <th className="pb-1 text-left text-xs font-medium text-neutral-600">Label</th>
              <th className="pb-1 text-left text-xs font-medium text-neutral-600">Account Type</th>
              <th className="pb-1 text-right text-xs font-medium text-neutral-600">Present Value</th>
              <th className="pb-1 text-right text-xs font-medium text-neutral-600">Cost Basis</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-xs text-slate-400 italic">No portfolio assets added yet.</td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="group">
                  <td className="py-1.5 pr-2">
                    <Input
                      className="input-field-sm w-full"
                      value={row.account_number}
                      onChange={e => update(row.id, 'account_number', e.target.value)}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      className="input-field-sm w-full"
                      value={row.label}
                      onChange={e => update(row.id, 'label', e.target.value)}
                      placeholder="e.g. Schwab Brokerage"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select
                      className="text-sm py-1.5"
                      value={row.account_type}
                      onChange={e => update(row.id, 'account_type', e.target.value)}
                    >
                      {ACCOUNT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      className="input-field-sm w-full text-right"
                      prefix="$"
                      type="number"
                      min={0}
                      value={row.present_value}
                      onChange={e => update(row.id, 'present_value', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      className="input-field-sm w-full text-right"
                      prefix="$"
                      type="number"
                      min={0}
                      value={row.cost_basis}
                      onChange={e => update(row.id, 'cost_basis', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5">
                    <RemoveButton onClick={() => remove(row.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-slate-300">
                  <td colSpan={3} className="py-1.5 text-xs font-semibold text-slate-600 text-right pr-2">Total</td>
                  <td className="py-1.5 text-right text-sm font-semibold text-brand-700 pr-2">
                    ${total.toLocaleString()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
        </table>
      </div>
      <AddRowButton onClick={add} label="Add Portfolio Asset" />
    </div>
  )
}
