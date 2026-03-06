import { ShieldCheck, Zap } from "lucide-react";
import { SectionWrapper } from "./section-wrapper";
import { FadeIn } from "./fade-in";

export function TrustSettlement() {
  return (
    <SectionWrapper id="trust">
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-3">
          Differentiators
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
          Identity and Payment on One Keypair
        </h2>
        <p className="text-gray max-w-2xl mb-12">
          Not hypothetical — these are working systems with tests, migrations, and
          API endpoints shipping today.
        </p>
      </FadeIn>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trust */}
        <FadeIn delay={100}>
          <div className="rounded-lg border border-navy-light p-6 h-full">
            <ShieldCheck size={24} className="text-blue mb-4" />
            <h3 className="font-mono text-sm font-bold text-light mb-3 uppercase tracking-wide">
              Cryptographic Identity
            </h3>
            <ul className="space-y-3 text-sm text-gray">
              <li className="flex gap-2">
                <span className="text-blue shrink-0">→</span>
                <span>
                  <strong className="text-light">secp256k1 keypairs</strong> — same
                  curve as Bitcoin/Ethereum. Agents own their identity, not the platform.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue shrink-0">→</span>
                <span>
                  <strong className="text-light">BIP-32 HD derivation</strong> — derive
                  child keys for different scopes (provider auth, consumer auth, delegation)
                  from one master key.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue shrink-0">→</span>
                <span>
                  <strong className="text-light">Dual auth</strong> — API keys for
                  simplicity or cryptographic signatures for zero-trust. Both enforce
                  route-level access guards.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue shrink-0">→</span>
                <span>
                  <strong className="text-light">Replay protection</strong> — per-request
                  nonce + timestamp. Platform compromise cannot impersonate agents.
                </span>
              </li>
            </ul>
          </div>
        </FadeIn>

        {/* Settlement */}
        <FadeIn delay={200}>
          <div className="rounded-lg border border-navy-light p-6 h-full">
            <Zap size={24} className="text-amber mb-4" />
            <h3 className="font-mono text-sm font-bold text-light mb-3 uppercase tracking-wide">
              Lightning Settlement
            </h3>
            <p className="text-sm text-gray mb-4 italic">
              &quot;An agent can hold a private key. It cannot open a bank account.&quot;
            </p>
            <ul className="space-y-3 text-sm text-gray">
              <li className="flex gap-2">
                <span className="text-amber shrink-0">→</span>
                <span>
                  <strong className="text-light">Multi-network settlement</strong> —
                  Lightning via Phoenixd, traditional payments via Stripe Connect.
                  Custom adapters are pluggable.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">→</span>
                <span>
                  <strong className="text-light">Fire-and-forget from billing</strong> —
                  settlement triggers automatically after each invocation. No manual
                  reconciliation cycles.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">→</span>
                <span>
                  <strong className="text-light">Platform fee model</strong> — configurable
                  percentage (default 5%). Provider receives gross minus platform fee
                  minus network fee.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">→</span>
                <span>
                  <strong className="text-light">Noop adapter for dev</strong> — no money
                  moves in development. Set <code className="text-ice">PHOENIXD_URL</code> to
                  enable real Lightning settlement.
                </span>
              </li>
            </ul>
          </div>
        </FadeIn>
      </div>
    </SectionWrapper>
  );
}
