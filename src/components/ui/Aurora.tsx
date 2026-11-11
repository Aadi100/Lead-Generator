// Fixed full-viewport canvas behind the whole app. Pure CSS/SVG (see .aurora in globals.css), no JS cost:
// quiet colour fields, a dot grid that fades out, faint radar rings top-right and a fine film grain.
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
      <i className="aurora-grid" />
      <svg className="aurora-rings" viewBox="0 0 760 760" fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="380" cy="380" r="90" />
        <circle cx="380" cy="380" r="170" />
        <circle cx="380" cy="380" r="250" />
        <circle cx="380" cy="380" r="330" />
        <circle cx="380" cy="380" r="375" strokeDasharray="2 6" />
        <path d="M380 0V760M0 380H760" />
      </svg>
      <i className="aurora-grain" />
    </div>
  );
}
