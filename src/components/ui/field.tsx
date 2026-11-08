import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, KeyboardEvent, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-md border border-border bg-background-deep text-foreground transition-colors duration-100 " +
  "[@media(hover:hover)]:hover:border-border-strong focus:border-accent disabled:opacity-50 aria-invalid:border-danger";

export function Input({ className = "", ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(CONTROL, "h-10 px-3 text-sm touch:h-11", className)} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-24 resize-y px-3 py-2 text-sm leading-relaxed", className)} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "h-10 px-2.5 text-sm touch:h-11", className)} {...props}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

const LABEL = "text-[0.8125rem] font-medium text-foreground";

export function Field({ label, htmlFor, hint, error, children, className = "" }: FieldProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={LABEL}>
          {label}
        </label>
      ) : (
        <span className={LABEL}>{label}</span>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          name={label}
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 m-0 cursor-[inherit] opacity-0"
        />
        <span
          aria-hidden="true"
          className={`block h-[1.375rem] w-[2.375rem] rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
            checked ? "border-accent bg-accent" : "border-border-strong bg-background-deep"
          }`}
        >
          <span
            className={`mt-[2px] block size-4 rounded-full transition-[transform,background-color] duration-150 ease-out ${
              checked ? "translate-x-[1.125rem] bg-on-accent" : "translate-x-[2px] bg-muted"
            }`}
          />
        </span>
      </span>
    </label>
  );
}

const RADIO_STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** A radio group is one tab stop: arrow keys move through it and select as they go. */
export function moveRadio(event: KeyboardEvent<HTMLElement>): void {
  const step = RADIO_STEPS[event.key];
  if (!step) return;
  const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current === -1) return;
  event.preventDefault();
  const next = radios[(current + step + radios.length) % radios.length];
  next?.focus();
  next?.click();
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={moveRadio} className="inline-flex w-fit max-w-full flex-wrap self-start rounded-md border border-border bg-background-deep p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          className={`press h-8 rounded-[7px] px-3 text-[0.8125rem] font-medium transition-colors duration-100 touch:h-11 ${
            option.value === value ? "bg-surface-hover text-foreground" : "text-muted [@media(hover:hover)]:hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
