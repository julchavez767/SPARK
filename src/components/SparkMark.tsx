/** The SPARK logo mark: a four-point spark. Decorative unless a label is given. */
export function SparkMark({ className = "h-5 w-5", label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10Z"
        fill="var(--ember)"
      />
    </svg>
  );
}
