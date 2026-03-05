"use client";

import { Inbox } from "lucide-react";

export function CanvasEmptyState() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-border-subtle bg-surface/90 backdrop-blur-sm px-8 py-6 text-center max-w-sm">
        <Inbox size={32} className="mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground mb-1">No entities registered</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Register providers and consumers to see your live topology.
        </p>
        <div className="flex gap-3 justify-center text-xs">
          <a href="/providers" className="text-emerald-500 hover:text-emerald-400 underline underline-offset-2">
            Add Provider
          </a>
          <a href="/consumers" className="text-emerald-500 hover:text-emerald-400 underline underline-offset-2">
            Add Consumer
          </a>
        </div>
      </div>
    </div>
  );
}
