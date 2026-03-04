"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Bot, Plus, Zap, Clock, X, Loader2, Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
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
  pricing: { type: string; pricePerCall?: { amountCents: number; currency: string }; inputPricePerToken?: { amountCents: number }; outputPricePerToken?: { amountCents: number }; pricePerSecond?: { amountCents: number }; monthlyPrice?: { amountCents: number } };
  sla: { maxLatencyMs: number; uptimePercentage: number };
  supportsStreaming: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  status: string;
}

function formatPrice(pricing: Agent["pricing"]): string {
  switch (pricing.type) {
    case "per_invocation":
      return pricing.pricePerCall ? `$${(pricing.pricePerCall.amountCents / 100).toFixed(2)}/call` : "per call";
    case "per_token":
      return pricing.inputPricePerToken ? `$${(pricing.inputPricePerToken.amountCents / 100).toFixed(4)}/tok` : "per token";
    case "per_second":
      return pricing.pricePerSecond ? `$${(pricing.pricePerSecond.amountCents / 100).toFixed(2)}/sec` : "per second";
    case "flat_monthly":
      return pricing.monthlyPrice ? `$${(pricing.monthlyPrice.amountCents / 100).toFixed(0)}/mo` : "flat monthly";
    default:
      return pricing.type.replace(/_/g, " ");
  }
}

function PricingBadge({ pricing }: { pricing: Agent["pricing"] }) {
  return (
    <span className="inline-flex items-center rounded-md bg-accent-blue/10 px-2 py-0.5 text-[11px] font-medium text-accent-blue">
      {formatPrice(pricing)}
    </span>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pricingTypeFilter, setPricingTypeFilter] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Form state
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [pricingType, setPricingType] = useState("per_invocation");
  const [maxLatencyMs, setMaxLatencyMs] = useState("5000");
  const [supportsStreaming, setSupportsStreaming] = useState(false);
  const [capabilityName, setCapabilityName] = useState("");

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter) params.set("status", statusFilter);
    if (pricingTypeFilter) params.set("pricingType", pricingTypeFilter);
    if (capabilityFilter) params.set("capability", capabilityFilter);
    if (sortField) {
      if (sortField === "name_asc") { params.set("sort", "name"); params.set("sortDir", "asc"); }
      else if (sortField === "newest") { params.set("sort", "created_at"); params.set("sortDir", "desc"); }
      else if (sortField === "price_asc") { params.set("sort", "price"); params.set("sortDir", "asc"); }
    }
    return params.toString();
  }, [searchTerm, statusFilter, pricingTypeFilter, capabilityFilter, sortField]);

  const fetchAgents = useCallback(() => {
    fetch(`${API_BASE}/api/agents?${buildQueryString()}`)
      .then((r) => r.json())
      .then((res) => setAgents(res.data?.agents ?? []))
      .catch(() => {});
  }, [buildQueryString]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents?${buildQueryString()}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/providers?limit=50`).then((r) => r.json()),
    ])
      .then(([agentRes, providerRes]) => {
        setAgents(agentRes.data?.agents ?? []);
        setProviders(providerRes.data?.providers ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on filter changes (debounced for search)
  useEffect(() => {
    if (loading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAgents();
    }, searchTerm ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, statusFilter, pricingTypeFilter, capabilityFilter, sortField, fetchAgents, loading]);

  const providerMap = new Map(providers.map((p) => [p.id, p.name]));

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

  const selectClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover and evaluate AI agents for coordination
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

      {/* Search + Filters Bar */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search agents by name or description..."
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-muted" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="deprecated">Deprecated</option>
              <option value="disabled">Disabled</option>
            </select>
            <select value={pricingTypeFilter} onChange={(e) => setPricingTypeFilter(e.target.value)} className={selectClass}>
              <option value="">All pricing</option>
              <option value="per_invocation">Per invocation</option>
              <option value="per_token">Per token</option>
              <option value="per_second">Per second</option>
              <option value="flat_monthly">Flat monthly</option>
            </select>
            <input
              type="text"
              value={capabilityFilter}
              onChange={(e) => setCapabilityFilter(e.target.value)}
              placeholder="Capability..."
              className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-muted" />
            <select value={sortField} onChange={(e) => setSortField(e.target.value)} className={selectClass}>
              <option value="">Default</option>
              <option value="name_asc">Name A-Z</option>
              <option value="newest">Newest first</option>
              <option value="price_asc">Price low to high</option>
            </select>
          </div>
        </div>
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
          title="No agents found"
          description={searchTerm || statusFilter || pricingTypeFilter || capabilityFilter
            ? "No agents match your current filters. Try adjusting your search criteria."
            : "Register agents through a provider to make them available for coordination requests."
          }
        />
      ) : (
        agents.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`} className="block">
                <div className="card-hover rounded-xl border border-border-subtle bg-surface p-5 transition-colors hover:border-border">
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
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
                  {providerMap.get(agent.providerId) && (
                    <p className="mb-3 text-[11px] text-muted">by {providerMap.get(agent.providerId)}</p>
                  )}
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {agent.capabilities.map((cap) => (
                      <span key={cap.name} className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-muted-foreground">
                        {cap.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 border-t border-border-subtle pt-3 text-[11px] text-muted">
                    <PricingBadge pricing={agent.pricing} />
                    <span className="flex items-center gap-1"><Clock size={11} />{agent.sla.maxLatencyMs}ms</span>
                    <span className="text-muted-foreground">{agent.sla.uptimePercentage}% SLA</span>
                    {agent.supportsStreaming && (
                      <span className="flex items-center gap-1 text-accent-green"><Zap size={11} />Stream</span>
                    )}
                    <span className="flex-1" />
                    <button
                      onClick={(e) => { e.preventDefault(); updateAgentStatus(agent.id, agent.status !== "active" ? "active" : "disabled"); }}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        agent.status !== "active"
                          ? "bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
                          : "bg-accent-red/10 text-accent-red hover:bg-accent-red/20"
                      }`}
                    >
                      {agent.status !== "active" ? "Activate" : "Disable"}
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
