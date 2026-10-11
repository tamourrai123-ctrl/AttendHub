import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, className = "", ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <label htmlFor={inputId} className="flex cursor-pointer select-none items-center gap-2">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className={[
            "h-4 w-4 rounded border-slate-300 text-brand-600",
            "focus:outline-none focus:ring-2 focus:ring-brand-500/40",
            className,
          ].join(" ")}
          {...rest}
        />
        {label && <span className="text-sm text-slate-700">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
