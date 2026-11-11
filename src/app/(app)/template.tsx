"use client";

// Page transition: the module content fades in, rises 6 px and sharpens from a 2 px blur (220 ms). The shell around it stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
