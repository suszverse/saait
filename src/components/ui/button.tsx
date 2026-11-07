import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Primary (Sindoor) appears at most once per screen, only on the action that
 * commits a date. Urgent (Marigold) belongs to the urgent flow only.
 */
export type ButtonVariant = "primary" | "secondary" | "urgent" | "tertiary";
export type ButtonSize = "lg" | "md";

const base =
  "inline-flex items-center justify-center gap-2 font-sans font-bold whitespace-nowrap transition-colors " +
  "disabled:cursor-not-allowed disabled:bg-line disabled:text-disabled-text disabled:border-transparent " +
  "aria-disabled:pointer-events-none aria-disabled:bg-line aria-disabled:text-disabled-text aria-disabled:border-transparent";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-sindoor text-white hover:bg-sindoor-hover",
  secondary: "bg-white text-ink border border-ink hover:bg-tint",
  urgent: "bg-marigold text-ink hover:bg-marigold-hover",
  tertiary: "bg-tint text-ink font-semibold hover:bg-line",
};

const sizes: Record<ButtonSize, string> = {
  lg: "h-13 px-5.5 rounded-button text-body",
  md: "h-11 px-4 rounded-control text-label",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "lg", extra = "") {
  const s = variant === "tertiary" && size === "lg" ? sizes.md : sizes[size];
  return `${base} ${variants[variant]} ${s} ${extra}`.trim();
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; children: ReactNode; className?: string };

export function Button({ variant, size, className, children, ...rest }: Common & ComponentProps<"button">) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  disabled,
  ...rest
}: Common & ComponentProps<typeof Link> & { disabled?: boolean }) {
  // A disabled link is not a link: no href, not focusable, announced as disabled.
  if (disabled) {
    return (
      <span role="link" aria-disabled="true" aria-label={rest["aria-label"]} className={buttonClass(variant, size, className)}>
        {children}
      </span>
    );
  }
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
