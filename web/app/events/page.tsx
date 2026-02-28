"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface CoordEvent {
  coordinationId: string;
  traceId: string;
  payload: { type: string; [key: string]: unknown };
  timestamp: string;
}

const eventTypeColors: Record<string, string> = {
  task_created: "text-accent-blue",
  task_started: "text-accent-blue",
  task_completed: "text-accent-green",
  task_failed: "text-accent-red",
  task_timeout: "text-accent-yellow",
  task_cancelled: "text-muted",
  circuit_opened: "text-accent-red",
  circuit_closed: "text-accent-green",
  sla_violation: "text-accent-yellow",
};

export default function EventsPage() {
  const [events, setEvents] = useState<CoordEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch recent tasks to get coordination IDs, then fetch their events
    fetch(`${API_BASE}/api/tasks?limit=20`)
      .then((r) => r.json())
      .then(async (res) => {
        const tasks = res.data?.tasks ?? [];
        const coordIds = [...new Set(tasks.map((t: { coordinationId: string }) => t.coordinationId))] as string[];

        const allEvents: CoordEvent[] = [];
        for (const id of coordIds.slice(0, 10)) {
          try {
            const evRes = await fetch(`${API_BASE}/api/coordinations/${id}/events?limit=50`);
            const evData = await evRes.json();
            allEvents.push(...(evData.data?.events ?? []));
          } catch { /* skip */ }
        }

        // Sort by timestamp descending
        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEvents(allEvents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Coordination lifecycle events across all tasks
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No events yet"
          description="Events will appear here as coordination requests are processed."
        />
      ) : (
        <div className="space-y-1">
          {events.map((ev, i) => (
            <div
              key={`${ev.coordinationId}-${ev.timestamp}-${i}`}
              className="flex items-center gap-4 rounded-lg px-4 py-2.5 transition-colors hover:bg-surface"
            >
              <span className="w-40 shrink-0 font-mono text-xs text-muted">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
              <span className={`w-32 shrink-0 text-xs font-medium ${eventTypeColors[ev.payload.type] ?? "text-muted-foreground"}`}>
                {ev.payload.type.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {ev.coordinationId.slice(0, 8)}
              </span>
              <span className="truncate text-xs text-muted">
                {JSON.stringify(ev.payload).slice(0, 120)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
