"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Plus, X, Loader2 } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Invoice {
  id: string;
  consumerId: string;
  periodStart: string;
  periodEnd: string;
  totalAmountCents: number;
  totalCurrency: string;
  lineItemCount: number;
  status: "draft" | "issued" | "paid" | "overdue";
  createdAt: string;
}

interface Consumer {
  id: string;
  name: string;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [consumerId, setConsumerId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStartStr);
  const [periodEnd, setPeriodEnd] = useState(todayStr);

  // Map consumer id -> name for quick lookup
  const consumerMap = new Map(consumers.map((c) => [c.id, c.name]));

  const fetchInvoices = useCallback(() => {
    fetch(`${API_BASE}/api/invoices?limit=50`)
      .then((r) => r.json())
      .then((res) => setInvoices(res.data?.invoices ?? []))
      .catch(() => {});
  }, []);

  const fetchConsumers = useCallback(() => {
    fetch(`${API_BASE}/api/consumers?limit=50`)
      .then((r) => r.json())
      .then((res) => setConsumers(res.data?.consumers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/invoices?limit=50`)
        .then((r) => r.json())
        .then((res) => setInvoices(res.data?.invoices ?? []))
        .catch(() => {}),
      fetch(`${API_BASE}/api/consumers?limit=50`)
        .then((r) => r.json())
        .then((res) => setConsumers(res.data?.consumers ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setConsumerId("");
        setPeriodStart(monthStartStr());
        setPeriodEnd(todayStr());
        fetchInvoices();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to generate invoice");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchInvoices();
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage billing and invoices</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Generate Invoice
        </button>
      </div>

      {/* Generate Invoice form */}
      {showForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Generate Invoice</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Consumer</label>
              <select
                value={consumerId}
                onChange={(e) => setConsumerId(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select a consumer...</option>
                {consumers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Period Start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Period End</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Generate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : invoices.length === 0 && !showForm ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Generate your first invoice to start tracking billing for consumer usage."
        />
      ) : (
        invoices.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-subtle">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Invoice ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Consumer</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Line Items</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-foreground">{inv.id.slice(0, 12)}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {consumerMap.get(inv.consumerId) ?? inv.consumerId.slice(0, 12)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.periodStart).toLocaleDateString()} –{" "}
                      {new Date(inv.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.lineItemCount}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatMoney(inv.totalAmountCents)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3">
                      {inv.status === "draft" && (
                        <button
                          onClick={() => updateStatus(inv.id, "issued")}
                          className="rounded-md bg-accent-blue/10 px-2.5 py-1 text-xs font-medium text-accent-blue transition-colors hover:bg-accent-blue/20"
                        >
                          Issue
                        </button>
                      )}
                      {(inv.status === "issued" || inv.status === "overdue") && (
                        <button
                          onClick={() => updateStatus(inv.id, "paid")}
                          className="rounded-md bg-accent-green/10 px-2.5 py-1 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/20"
                        >
                          Mark Paid
                        </button>
                      )}
                      {inv.status === "paid" && (
                        <span className="text-xs text-muted">Paid</span>
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
