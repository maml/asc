"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, Plus, Zap, Clock, X, Loader2 } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Agent {
  id: string;
  providerId: string;
  name: string;
  description: string;
  version: string;
  status: string;
  capabilities: { name: string }[];
  pricing: { type: string };
  sla: { maxLatencyMs: number; uptimePercentage: number };
  supportsStreaming: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  status: string;
}

function PricingBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-accent-blue/10 px-2 py-0.5 text-[11px] font-medium text-accent-blue">
      {type.replace(/_/g, " ")}
    </span>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [pricingType, setPricingType] = useState("per_invocation");
  const [maxLatencyMs, setMaxLatencyMs] = useState("5000");
  const [supportsStreaming, setSupportsStreaming] = useState(false);
  const [capabilityName, setCapabilityName] = useState("");

  const fetchAgents = useCallback(() => {
    fetch(`${API_BASE}/api/agents?limit=50`)
      .then((r) => r.json())
      .then((res) => setAgents(res.data?.agents ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/providers?limit=50`).then((r) => r.json()),
    ])
      .then(([agentRes, providerRes]) => {
        setAgents(agentRes.data?.agents ?? []);
        setProviders(providerRes.data?.providers ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateAgentStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchAgents();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const pricing = pricingType === "per_invocation"
        ? { type: "per_invocation", pricePerCall: { amountCents: 10, currency: "USD" } }
        : pricingType === "per_token"
        ? { type: "per_token", inputPricePerToken: { amountCents: 1, currency: "USD" }, outputPricePerToken: { amountCents: 1, currency: "USD" } }
        : { type: "per_second", pricePerSecond: { amountCents: 1, currency: "USD" } };

      const res = await fetch(`${API_BASE}/api/providers/${providerId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          version,
          capabilities: capabilityName ? [{ name: capabilityName, description: "", inputSchema: {}, outputSchema: {} }] : [],
          pricing,
          sla: { maxLatencyMs: parseInt(maxLatencyMs, 10), uptimePercentage: 99.9, maxErrorRate: 0.01 },
          supportsStreaming,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setName("");
        setDescription("");
        setCapabilityName("");
        fetchAgents();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to register agent");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI agents available for coordination
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Register Agent
        </button>
      </div>

      {showForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Register Agent</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Provider</label>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                  <option value="">Select provider...</option>
                  {providers.filter((p) => p.status !== "deactivated").map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Agent Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  placeholder="Document Analyzer"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Version</label>
                <input type="text" value={version} onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Analyzes documents and extracts structured data"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Pricing Model</label>
                <select value={pricingType} onChange={(e) => setPricingType(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                  <option value="per_invocation">Per invocation</option>
                  <option value="per_token">Per token</option>
                  <option value="per_second">Per second</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Max Latency (ms)</label>
                <input type="number" value={maxLatencyMs} onChange={(e) => setMaxLatencyMs(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Capability</label>
                <input type="text" value={capabilityName} onChange={(e) => setCapabilityName(e.target.value)}
                  placeholder="text-analysis"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Streaming</label>
                <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={supportsStreaming} onChange={(e) => setSupportsStreaming(e.target.checked)}
                    className="rounded border-border" />
                  Supports streaming
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Register
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : agents.length === 0 && !showForm ? (
        <EmptyState
          icon={Bot}
          title="No agents registered"
          description="Register agents through a provider to make them available for coordination requests."
        />
      ) : (
        agents.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="card-hover rounded-xl border border-border-subtle bg-surface p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10">
                      <Bot size={16} className="text-accent-blue" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{agent.name}</h3>
                      <p className="font-mono text-[11px] text-muted">v{agent.version}</p>
                    </div>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>
                <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {agent.capabilities.slice(0, 3).map((cap) => (
                    <span key={cap.name} className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-muted-foreground">
                      {cap.name}
                    </span>
                  ))}
                  {agent.capabilities.length > 3 && (
                    <span className="text-[11px] text-muted">+{agent.capabilities.length - 3} more</span>
                  )}
                </div>
                <div className="flex items-center gap-3 border-t border-border-subtle pt-3 text-[11px] text-muted">
                  <PricingBadge type={agent.pricing.type} />
                  <span className="flex items-center gap-1"><Clock size={11} />{agent.sla.maxLatencyMs}ms</span>
                  {agent.supportsStreaming && (
                    <span className="flex items-center gap-1 text-accent-green"><Zap size={11} />Streaming</span>
                  )}
                  <span className="flex-1" />
                  {agent.status !== "active" ? (
                    <button
                      onClick={() => updateAgentStatus(agent.id, "active")}
                      className="rounded-md bg-accent-green/10 px-2 py-0.5 text-[11px] font-medium text-accent-green transition-colors hover:bg-accent-green/20"
                    >
                      Activate
                    </button>
                  ) : (
                    <button
                      onClick={() => updateAgentStatus(agent.id, "disabled")}
                      className="rounded-md bg-accent-red/10 px-2 py-0.5 text-[11px] font-medium text-accent-red transition-colors hover:bg-accent-red/20"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
