import type { ComponentProps, ReactNode } from "react";

/**
 * Label, 52 px field, helper. Error turns the border and helper Sindoor; the
 * message says what happened and what to do.
 */
export function TextField({
  id,
  label,
  helper,
  error,
  multiline,
  className,
  ...rest
}: {
  id: string;
  label: ReactNode;
  helper?: ReactNode;
  error?: string;
  multiline?: boolean;
  className?: string;
} & ComponentProps<"input"> & ComponentProps<"textarea">) {
  const described = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  const field =
    "w-full min-w-0 rounded-button bg-ground px-3.5 text-body text-ink placeholder:text-stone/70 outline-none " +
    (error
      ? "border-2 border-sindoor"
      : // Focus reads as a 2 px Ink border: 1 px border plus a 1 px inset ring, so text never shifts.
        "border border-line focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink");
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-small font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          rows={2}
          className={`${field} resize-none py-3 leading-field`}
          {...(rest as ComponentProps<"textarea">)}
        />
      ) : (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={`${field} h-13`}
          {...(rest as ComponentProps<"input">)}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-meta text-sindoor">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-meta text-stone">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
