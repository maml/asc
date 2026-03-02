"use client";

import { LayoutGrid, Radio } from "lucide-react";

export type TopologyMode = "example" | "live";

interface TopologyToggleProps {
  mode: TopologyMode;
  onChange: (mode: TopologyMode) => void;
}

export function TopologyToggle({ mode, onChange }: TopologyToggleProps) {
  return (
    <div className="flex items-center rounded-lg border border-border-subtle bg-surface overflow-hidden">
      <button
        onClick={() => onChange("example")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono transition-colors ${
          mode === "example"
            ? "bg-surface-raised text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutGrid size={12} />
        Example
      </button>
      <button
        onClick={() => onChange("live")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono transition-colors ${
          mode === "live"
            ? "bg-surface-raised text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Radio size={12} />
        Live
      </button>
    </div>
  );
}
