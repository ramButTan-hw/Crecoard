interface LogoMarkProps {
  size?: number;
  /**
   * Badge mode: accent-colored rounded square background with a white clover.
   * Guarantees visibility regardless of the surrounding surface color.
   */
  badge?: boolean;
  /** Clover body color. Defaults to white in badge mode, var(--accent) otherwise. */
  bodyColor?: string;
  /** Eye dot color. Defaults to var(--accent) in badge mode, white otherwise. */
  eyeColor?: string;
  /** Badge background color (badge mode only). Defaults to var(--accent). */
  bgColor?: string;
  className?: string;
}

export function LogoMark({
  size = 24,
  badge = false,
  bodyColor,
  eyeColor,
  bgColor = "var(--accent)",
  className,
}: LogoMarkProps) {
  const body  = bodyColor ?? (badge ? "white"          : "var(--accent)");
  const eyes  = eyeColor  ?? (badge ? "var(--accent)"  : "white");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 375 375"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {badge && <rect width="375" height="375" rx="80" fill={bgColor} />}

      {/* Four petals + center overlap */}
      <circle cx="124.5" cy="127.1" r="78.2" fill={body} />
      <circle cx="255.4" cy="127.1" r="78.2" fill={body} />
      <circle cx="128.2" cy="236.0" r="78.2" fill={body} />
      <circle cx="255.4" cy="236.0" r="78.2" fill={body} />
      <circle cx="187.5" cy="187.5" r="78.2" fill={body} />

      {/* Eyes */}
      <circle cx="145.8" cy="164.5" r="17.6" fill={eyes} />
      <circle cx="237.8" cy="164.5" r="17.6" fill={eyes} />
    </svg>
  );
}
