"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, X, Loader2, Copy, Check } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Consumer {
  id: string;
  name: string;
  description: string;
  contactEmail: string;
  status: string;
  rateLimitPerMinute: number;
  createdAt: string;
}

export default function ConsumersPage() {
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiKeyResult, setApiKeyResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const fetchConsumers = useCallback(() => {
    fetch(`${API_BASE}/api/consumers?limit=50`)
      .then((r) => r.json())
      .then((res) => setConsumers(res.data?.consumers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchConsumers();
    setLoading(false);
  }, [fetchConsumers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/consumers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, contactEmail }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeyResult(data.data?.apiKey ?? null);
        setName("");
        setDescription("");
        setContactEmail("");
        fetchConsumers();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to register consumer");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyApiKey = () => {
    if (apiKeyResult) {
      navigator.clipboard.writeText(apiKeyResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Consumers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizations consuming agent services
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setApiKeyResult(null); }}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Register Consumer
        </button>
      </div>

      {apiKeyResult && (
        <div className="animate-fade-in mb-6 rounded-xl border border-accent-green/30 bg-accent-green/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-accent-green">Consumer registered — save your API key now</p>
            <button onClick={() => setApiKeyResult(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">This key will only be shown once.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
              {apiKeyResult}
            </code>
            <button onClick={copyApiKey} className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-hover">
              {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {showForm && !apiKeyResult && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Register Consumer</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  placeholder="FinCorp Trading"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Contact Email</label>
                <input
                  type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required
                  placeholder="ops@fincorp.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
              <input
                type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Financial services firm consuming AI analysis agents"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
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
      ) : consumers.length === 0 && !showForm ? (
        <EmptyState
          icon={Users}
          title="No consumers registered"
          description="Register a consumer organization to start making coordination requests to agents."
        />
      ) : (
        consumers.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-subtle">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Rate Limit</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {consumers.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <p className="mt-0.5 text-xs text-muted">{c.description}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{c.contactEmail}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{c.rateLimitPerMinute}/min</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
