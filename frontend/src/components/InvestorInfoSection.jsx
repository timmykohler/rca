import { Field, Input, Select, Toggle } from './FormFields'

const GENDER_OPTIONS = [
  { value: '', label: '— Select —' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
]

export default function InvestorInfoSection({ data, onChange }) {
  const set = (key, val) => onChange({ ...data, [key]: val })

  return (
    <div className="space-y-5">
      {/* Primary investor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Investor Name" required>
          <Input
            value={data.investor_name || ''}
            onChange={e => set('investor_name', e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <Field label="Date of Birth" hint="Used to compute current age">
          <Input
            type="date"
            value={data.investor_dob || ''}
            onChange={e => {
              const dob = e.target.value
              set('investor_dob', dob)
              if (dob) {
                const age = calcAge(dob)
                if (age) onChange({ ...data, investor_dob: dob, investor_age: age })
              }
            }}
          />
        </Field>
        <Field label="Age" required>
          <Input
            type="number"
            min={18} max={100}
            value={data.investor_age || ''}
            onChange={e => set('investor_age', parseInt(e.target.value) || '')}
            placeholder="65"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Gender" required>
          <Select
            value={data.investor_gender || ''}
            onChange={e => set('investor_gender', e.target.value)}
          >
            {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <div className="flex items-end pb-1">
          <Toggle
            checked={data.has_co_investor || false}
            onChange={v => set('has_co_investor', v)}
            label="Add Co-Investor"
          />
        </div>
      </div>

      {/* Co-investor */}
      {data.has_co_investor && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Co-Investor</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Co-Investor Name">
              <Input
                value={data.co_investor_name || ''}
                onChange={e => set('co_investor_name', e.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Date of Birth">
              <Input
                type="date"
                value={data.co_investor_dob || ''}
                onChange={e => {
                  const dob = e.target.value
                  const age = calcAge(dob)
                  onChange({ ...data, co_investor_dob: dob, co_investor_age: age || data.co_investor_age })
                }}
              />
            </Field>
            <Field label="Age">
              <Input
                type="number"
                min={18} max={100}
                value={data.co_investor_age || ''}
                onChange={e => set('co_investor_age', parseInt(e.target.value) || '')}
                placeholder="63"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Gender">
              <Select
                value={data.co_investor_gender || ''}
                onChange={e => set('co_investor_gender', e.target.value)}
              >
                {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

function calcAge(dob) {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age > 0 && age < 120 ? age : null
}
