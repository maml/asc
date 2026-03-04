"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./sidebar-context";
import {
  Building2,
  Bot,
  Users,
  ListTodo,
  Activity,
  GitBranch,
  ShieldCheck,
  Gauge,
  BarChart3,
  FileText,
  ChevronLeft,
  ChevronRight,
  Zap,
  LayoutDashboard,
  Workflow,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    title: "System",
    items: [
      { label: "System Canvas", href: "/canvas", icon: LayoutDashboard },
    ],
  },
  {
    title: "Registry",
    items: [
      { label: "Providers", href: "/providers", icon: Building2 },
      { label: "Marketplace", href: "/agents", icon: Bot },
      { label: "Consumers", href: "/consumers", icon: Users },
    ],
  },
  {
    title: "Coordination",
    items: [
      { label: "Tasks", href: "/tasks", icon: ListTodo },
      { label: "Pipelines", href: "/pipelines", icon: Workflow },
      { label: "Events", href: "/events", icon: Activity },
    ],
  },
  {
    title: "Observability",
    items: [
      { label: "Traces", href: "/traces", icon: GitBranch },
      { label: "SLA", href: "/sla", icon: ShieldCheck },
      { label: "Quality Gates", href: "/quality", icon: Gauge },
    ],
  },
  {
    title: "Billing",
    items: [
      { label: "Usage", href: "/usage", icon: BarChart3 },
      { label: "Invoices", href: "/invoices", icon: FileText },
    ],
  },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  return (
    <aside
      className={`sidebar-transition fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-border-subtle bg-surface ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border-subtle px-4">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-green/10">
            <Zap size={15} className="text-accent-green" />
          </div>
          {!collapsed && (
            <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
              ASC
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navigation.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                        isActive
                          ? "nav-active font-medium"
                          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      } ${collapsed ? "justify-center" : ""}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={16} className="shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border-subtle p-2">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
