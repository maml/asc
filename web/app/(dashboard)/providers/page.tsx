"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, ExternalLink, X, Loader2, Copy, Check } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Provider {
  id: string;
  name: string;
  description: string;
  contactEmail: string;
  webhookUrl: string;
  status: string;
  createdAt: string;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiKeyResult, setApiKeyResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const updateStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchProviders();
  };

  const fetchProviders = useCallback(() => {
    fetch(`${API_BASE}/api/providers?limit=50`)
      .then((r) => r.json())
      .then((res) => setProviders(res.data?.providers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProviders();
    setLoading(false);
  }, [fetchProviders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, contactEmail, webhookUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeyResult(data.data?.apiKey ?? null);
        setName("");
        setDescription("");
        setContactEmail("");
        setWebhookUrl("");
        fetchProviders();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to register provider");
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Providers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizations that supply agent services
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setApiKeyResult(null); }}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Register Provider
        </button>
      </div>

      {/* API key result banner */}
      {apiKeyResult && (
        <div className="animate-fade-in mb-6 rounded-xl border border-accent-green/30 bg-accent-green/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-accent-green">Provider registered — save your API key now</p>
            <button onClick={() => setApiKeyResult(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">This key will only be shown once. Store it securely.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
              {apiKeyResult}
            </code>
            <button
              onClick={copyApiKey}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-hover"
            >
              {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Registration form */}
      {showForm && !apiKeyResult && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Register Provider</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Acme AI Services"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  placeholder="admin@acme.ai"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enterprise AI agent provider specializing in..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
                placeholder="http://localhost:4100"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
              />
              <p className="mt-1 text-[11px] text-muted">ASC will send invoke requests to this URL</p>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Register
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : providers.length === 0 && !showForm ? (
        <EmptyState
          icon={Building2}
          title="No providers registered"
          description="Register your first provider organization to start offering agent services through ASC."
        />
      ) : (
        providers.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-subtle">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Webhook</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <a href={`/providers/${p.id}`} className="font-medium text-foreground hover:text-accent-blue">
                        {p.name}
                      </a>
                      <p className="mt-0.5 text-xs text-muted">{p.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.contactEmail}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 font-mono text-xs text-muted">
                        {p.webhookUrl}
                        <ExternalLink size={11} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {p.status !== "active" ? (
                        <button
                          onClick={() => updateStatus(p.id, "active")}
                          className="rounded-md bg-accent-green/10 px-2.5 py-1 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/20"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(p.id, "suspended")}
                          className="rounded-md bg-accent-red/10 px-2.5 py-1 text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/20"
                        >
                          Suspend
                        </button>
                      )}
                    </td>
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
