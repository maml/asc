"use client";

import { SidebarProvider, useSidebar } from "./sidebar-context";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <>
      <Sidebar />
      <div className={`sidebar-transition ${collapsed ? "pl-16" : "pl-60"}`}>
        <Header />
        <main className="min-h-[calc(100vh-3.5rem)] p-6">{children}</main>
      </div>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
