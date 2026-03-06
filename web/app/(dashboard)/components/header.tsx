"use client";

import { usePathname } from "next/navigation";
import { Search, Command } from "lucide-react";

const breadcrumbMap: Record<string, string> = {
  "/": "Dashboard",
  "/providers": "Providers",
  "/agents": "Agents",
  "/consumers": "Consumers",
  "/tasks": "Tasks",
  "/events": "Events",
  "/traces": "Traces",
  "/sla": "SLA",
  "/quality": "Quality Gates",
  "/usage": "Usage",
  "/invoices": "Invoices",
};

export function Header() {
  const pathname = usePathname();

  // Build breadcrumb segments
  const segments = pathname === "/" ? ["/"] : pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const path = i === 0 && seg === "/" ? "/" : `/${segments.slice(0, i + 1).join("/")}`;
    return {
      label: breadcrumbMap[path] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
      path,
    };
  });

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-subtle bg-background/80 px-6 backdrop-blur-md">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm">
        <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">ASC</a>
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1.5">
            <span className="text-muted">/</span>
            <span
              className={
                i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground"
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-surface-hover">
          <Search size={14} />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="ml-4 hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted sm:flex">
            <Command size={10} />K
          </kbd>
        </button>

        {/* Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-muted-foreground ring-1 ring-border">
          U
        </div>
      </div>
    </header>
  );
}
