import { Input, Select, AddRowButton, RemoveButton } from './FormFields'

const GROUPINGS = [
  { value: 'essential',     label: 'Essential' },
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'healthcare',    label: 'Healthcare' },
  { value: 'housing',       label: 'Housing' },
  { value: 'travel',        label: 'Travel / Lifestyle' },
  { value: 'other',         label: 'Other' },
]

const emptyRow = () => ({
  id: crypto.randomUUID(),
  label: '',
  grouping: 'essential',
  annual_amount: '',
  annual_adjustment: '',
  start_age: '',
  end_age: '',
})

export default function SpendingGoalsSection({ rows, onChange, investorAge }) {
  const update = (id, key, val) =>
    onChange(rows.map(r => r.id === id ? { ...r, [key]: val } : r))
  const remove = (id) => onChange(rows.filter(r => r.id !== id))
  const add = () => onChange([...rows, emptyRow()])

  const total = rows.reduce((s, r) => s + (parseFloat(r.annual_amount) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto" style={{overflowX:"auto"}}>
          <table className="w-full text-sm" style={{minWidth:"620px"}}>
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-1 text-left text-xs font-medium text-neutral-600">Label</th>
                <th className="pb-1 text-left text-xs font-medium text-neutral-600 w-36">Grouping</th>
                <th className="pb-1 text-right text-xs font-medium text-neutral-600 w-36">Annual Amount</th>
                <th className="pb-1 text-right text-xs font-medium text-neutral-600 w-32">Annual Adj %</th>
                <th className="pb-1 text-right text-xs font-medium text-neutral-600 w-24">Start Age</th>
                <th className="pb-1 text-right text-xs font-medium text-neutral-600 w-24">End Age</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => (
                <tr key={row.id} className="group">
                  <td className="py-1.5 pr-2">
                    <Input
                      className="input-field-sm w-full"
                      value={row.label}
                      onChange={e => update(row.id, 'label', e.target.value)}
                      placeholder="e.g. Core Living Expenses"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select
                      className="text-sm py-1.5"
                      value={row.grouping}
                      onChange={e => update(row.id, 'grouping', e.target.value)}
                    >
                      {GROUPINGS.map(g => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      prefix="$"
                      type="number"
                      min={0}
                      className="input-field-sm w-full"
                      value={row.annual_amount}
                      onChange={e => update(row.id, 'annual_amount', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      suffix="%"
                      type="number"
                      min={0}
                      step={0.1}
                      className="input-field-sm w-full"
                      value={row.annual_adjustment}
                      onChange={e => update(row.id, 'annual_adjustment', e.target.value)}
                      placeholder="0.0"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="input-field-sm w-full"
                      value={row.start_age}
                      onChange={e => update(row.id, 'start_age', e.target.value)}
                      placeholder={investorAge || '65'}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      type="number"
                      min={0}
                      max={110}
                      className="input-field-sm w-full"
                      value={row.end_age}
                      onChange={e => update(row.id, 'end_age', e.target.value)}
                      placeholder="100"
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
                  <td colSpan={2} className="py-1.5 text-xs font-semibold text-slate-600 text-right pr-2">Total Annual</td>
                  <td className="py-1.5 text-right text-sm font-semibold text-brand-700 pr-2">
                    ${total.toLocaleString()}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      {rows.length === 0 && (
        <p className="text-xs text-slate-400 italic">No spending goals added yet.</p>
      )}
      <AddRowButton onClick={add} label="Add Spending Goal" />
    </div>
  )
}
