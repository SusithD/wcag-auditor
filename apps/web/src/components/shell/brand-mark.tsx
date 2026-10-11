export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-md bg-navy dark:bg-[#2b2b8c]"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        focusable="false"
        aria-hidden="true"
      >
        <path
          d="M3 3.5h6.5M3 8h10M3 12.5h4"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="12" cy="3.5" r="1.4" fill="#fff" />
      </svg>
    </span>
  );
}
