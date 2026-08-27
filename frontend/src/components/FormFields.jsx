import { forwardRef } from 'react'

export function Field({ label, required, hint, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export const Input = forwardRef(({ className = '', prefix, suffix, ...props }, ref) => {
  // Number fields get their spinners suppressed so the value itself has room —
  // critical in the narrow table columns where the spinner left ~2 visible chars.
  const noSpin = props.type === 'number' ? 'no-spinner' : ''

  if (prefix || suffix) {
    // The wrapper supplies the border, background and shadow. Strip the field
    // classes off the inner input or it renders a second border inside the
    // first, which is what made the affixed cells look boxed-in and cramped.
    const inner = className.replace(/\binput-field(-sm)?\b/g, '').trim()
    return (
      <div className="flex items-center rounded-md border border-slate-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {prefix && (
          <span className="pl-2.5 pr-0.5 text-slate-400 text-sm select-none shrink-0">{prefix}</span>
        )}
        <input
          ref={ref}
          className={`flex-1 min-w-0 w-full py-1.5 text-sm text-slate-800 bg-transparent outline-none px-1.5 ${noSpin} ${
            !prefix ? 'pl-2.5' : ''
          } ${!suffix ? 'pr-2.5' : ''} ${inner}`}
          {...props}
        />
        {suffix && (
          <span className="pr-2.5 pl-0.5 text-slate-400 text-sm select-none shrink-0">{suffix}</span>
        )}
      </div>
    )
  }
  return (
    <input
      ref={ref}
      className={`input-field ${noSpin} ${className}`}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export const Select = forwardRef(({ className = '', children, ...props }, ref) => (
  <select ref={ref} className={`select-field ${className}`} {...props}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function RadioGroup({ options, value, onChange, name }) {
  return (
    <div className="flex items-center gap-4">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-brand-600"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  )
}

export function SectionCard({ title, icon, action, children, collapsible = false, defaultOpen = true }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span className="section-title">
          {icon && <span className="text-base">{icon}</span>}
          {title}
        </span>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

export function AddRowButton({ onClick, label = 'Add Row' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
    >
      <span className="w-4 h-4 rounded border border-brand-400 flex items-center justify-center text-brand-600 font-bold leading-none">+</span>
      {label}
    </button>
  )
}

export function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-danger"
      title="Remove"
    >
      ✕
    </button>
  )
}

export function TableHeader({ cols }) {
  return (
    <div className={`grid gap-2 mb-1`} style={{ gridTemplateColumns: cols }}>
      {/* rendered by parent */}
    </div>
  )
}
