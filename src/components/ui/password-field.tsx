import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  required,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="relative">
        <Input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          value={value}
          required={required}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="pr-12"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}
