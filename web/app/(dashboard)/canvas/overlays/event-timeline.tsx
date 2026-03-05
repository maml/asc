"use client";

import { useState } from "react";
import { ScrollText, ChevronUp, ChevronDown } from "lucide-react";
import type { WsEvent } from "../hooks/use-websocket";

const typeColors: Record<string, string> = {
  task_created: "text-accent-blue",
  task_started: "text-accent-green",
  task_completed: "text-accent-green",
  task_failed: "text-accent-red",
  task_timeout: "text-accent-yellow",
  task_cancelled: "text-muted-foreground",
  circuit_opened: "text-accent-red",
  circuit_closed: "text-accent-green",
  circuit_state_change: "text-accent-yellow",
  connected: "text-muted-foreground",
  sla_violation: "text-accent-red",
};

interface EventTimelineProps {
  events: WsEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [expanded, setExpanded] = useState(true);

  const displayed = events.slice(0, 50);

  return (
    <div className="absolute bottom-4 left-4 z-20" style={{ width: 340 }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-t-lg border border-border-subtle bg-surface px-3 py-2 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <ScrollText size={13} className="text-accent-blue" />
          <span className="text-xs font-medium text-foreground">Event Timeline</span>
          <span className="rounded-full bg-accent-blue/10 px-1.5 py-0.5 text-[10px] font-mono text-accent-blue">
            {events.length}
          </span>
        </div>
        {expanded ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronUp size={13} className="text-muted-foreground" />}
      </button>

      {/* Event list */}
      {expanded && (
        <div className="max-h-56 overflow-y-auto rounded-b-lg border border-t-0 border-border-subtle bg-surface">
          {displayed.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No events yet — waiting for activity...
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {displayed.map((event, i) => (
                <li key={`${event.timestamp}-${i}`} className="px-3 py-1.5 flex items-start gap-2">
                  <span className={`mt-0.5 text-[10px] font-mono font-medium whitespace-nowrap ${typeColors[event.type] ?? "text-muted-foreground"}`}>
                    {event.type}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">
                    {summarizePayload(event.payload)}
                  </span>
                  <span className="text-[10px] font-mono text-muted whitespace-nowrap">
                    {formatTime(event.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function summarizePayload(payload: Record<string, unknown>): string {
  if (payload.taskId) return `task:${String(payload.taskId).slice(0, 8)}`;
  if (payload.agentId) return `agent:${String(payload.agentId)}`;
  if (payload.clientCount !== undefined) return `clients:${payload.clientCount}`;
  return "";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}
