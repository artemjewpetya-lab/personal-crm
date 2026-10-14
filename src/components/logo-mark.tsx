// Logo mark shared with the landing (personal-crm-landing/design/icons/logo-mark.svg)
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </svg>
  );
}
