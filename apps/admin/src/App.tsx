import { useState, useEffect } from 'react';

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  status: 'ACTIVE' | 'SUSPENDED';
  creditsRemaining: number;
  monthlySpendUsd: number;
  providerCogsUsd: number;
  grossMarginPct: number;
  memberCount?: number;
}

interface CircuitBreakerStatus {
  provider: 'OPENAI' | 'GROQ' | 'OPENROUTER';
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  latencyMs: number;
  consecutiveFailures: number;
}

interface MarginMetrics {
  monthlyRecurringRevenueUsd: number;
  annualRecurringRevenueUsd: number;
  providerCogsUsd: number;
  platformGrossMarginPct: number;
  totalActiveCredits: number;
  flaggedTenantsCount: number;
  flaggedTenants: Array<{
    id: string;
    name: string;
    grossMarginPct: number;
    monthlySpendUsd: number;
    providerCogsUsd: number;
  }>;
}

interface AuditLogEntry {
  id: string;
  operatorEmail: string;
  action: string;
  targetTenantSlug?: string;
  justification?: string;
  ticketId?: string;
  createdAt: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'gateway' | 'margins' | 'audit'>('tenants');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Impersonation State
  const [impersonatingSession, setImpersonatingSession] = useState<{
    slug: string;
    name: string;
    token: string;
    redirectUrl: string;
    expiresAt: string;
  } | null>(null);

  // Impersonation Modal Target
  const [modalTenant, setModalTenant] = useState<TenantSummary | null>(null);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateTicketId, setImpersonateTicketId] = useState('');
  const [isSubmittingImpersonation, setIsSubmittingImpersonation] = useState(false);

  // Live Data States
  const [tenants, setTenants] = useState<TenantSummary[]>([
    {
      id: 'tenant-1',
      name: 'Plum Beauty Store',
      slug: 'plum-beauty',
      planTier: 'GROWTH',
      status: 'ACTIVE',
      creditsRemaining: 6840,
      monthlySpendUsd: 99.99,
      providerCogsUsd: 2.14,
      grossMarginPct: 97.8,
    },
    {
      id: 'tenant-2',
      name: 'Aachho Ethnic Wear',
      slug: 'aachho',
      planTier: 'ENTERPRISE',
      status: 'ACTIVE',
      creditsRemaining: 44200,
      monthlySpendUsd: 499.0,
      providerCogsUsd: 14.8,
      grossMarginPct: 97.0,
    },
    {
      id: 'tenant-3',
      name: 'Urban Thread Co',
      slug: 'urban-thread',
      planTier: 'GROWTH',
      status: 'ACTIVE',
      creditsRemaining: 7304,
      monthlySpendUsd: 99.99,
      providerCogsUsd: 1.86,
      grossMarginPct: 98.1,
    },
    {
      id: 'tenant-4',
      name: 'Spammy Storefront LLC',
      slug: 'spammy-store',
      planTier: 'STARTER',
      status: 'SUSPENDED',
      creditsRemaining: 0,
      monthlySpendUsd: 29.0,
      providerCogsUsd: 0.12,
      grossMarginPct: 99.6,
    },
    {
      id: 'tenant-5',
      name: 'High-Volume Deficit Brand',
      slug: 'high-volume-deficit',
      planTier: 'STARTER',
      status: 'ACTIVE',
      creditsRemaining: 150,
      monthlySpendUsd: 29.0,
      providerCogsUsd: 11.2,
      grossMarginPct: 61.4,
    },
  ]);

  const [circuitBreakers, setCircuitBreakers] = useState<Record<string, CircuitBreakerStatus>>({
    OPENAI: { provider: 'OPENAI', state: 'CLOSED', latencyMs: 380, consecutiveFailures: 0 },
    GROQ: { provider: 'GROQ', state: 'CLOSED', latencyMs: 140, consecutiveFailures: 0 },
    OPENROUTER: { provider: 'OPENROUTER', state: 'CLOSED', latencyMs: 510, consecutiveFailures: 0 },
  });

  const [margins, setMargins] = useState<MarginMetrics>({
    monthlyRecurringRevenueUsd: 727.98,
    annualRecurringRevenueUsd: 8735.76,
    providerCogsUsd: 30.12,
    platformGrossMarginPct: 95.9,
    totalActiveCredits: 58494,
    flaggedTenantsCount: 1,
    flaggedTenants: [
      {
        id: 'tenant-5',
        name: 'High-Volume Deficit Brand',
        grossMarginPct: 61.4,
        monthlySpendUsd: 29.0,
        providerCogsUsd: 11.2,
      },
    ],
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'audit-001',
      operatorEmail: 'harsh@orbit.internal',
      action: 'IMPERSONATION_REQUEST',
      targetTenantSlug: 'plum-beauty',
      justification: 'Support Ticket #4912: WhatsApp media sync debugging',
      ticketId: 'T-4912',
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-002',
      operatorEmail: 'system-auto',
      action: 'CIRCUIT_BREAKER_RESET',
      targetTenantSlug: 'system',
      justification: 'Upstream health probe succeeded; resetting breaker to CLOSED',
      createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-003',
      operatorEmail: 'stripe-webhook',
      action: 'CREDIT_ADJUSTMENT',
      targetTenantSlug: 'aachho',
      justification: 'Stripe invoice.payment_succeeded +15,000 top-up credits',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ]);

  // Load from backend on mount
  useEffect(() => {
    fetch('/api/admin/tenants')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          setTenants(json.data);
        }
      })
      .catch(() => {});

    fetch('/api/admin/gateway/circuit-breakers')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          const map: Record<string, CircuitBreakerStatus> = {};
          json.data.forEach((b: CircuitBreakerStatus) => {
            map[b.provider] = b;
          });
          setCircuitBreakers(map);
        }
      })
      .catch(() => {});

    fetch('/api/admin/margins')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          setMargins(json.data);
        }
      })
      .catch(() => {});

    fetch('/api/admin/audit-logs')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          setAuditLogs(json.data);
        }
      })
      .catch(() => {});
  }, []);

  const toggleTenantStatus = async (id: string) => {
    const target = tenants.find((t) => t.id === id);
    if (!target) return;
    const nextStatus = target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t))
    );

    try {
      await fetch(`/api/admin/tenants/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, operatorEmail: 'harsh@orbit.internal' }),
      });
      const res = await fetch('/api/admin/audit-logs');
      const json = await res.json();
      if (json?.data) setAuditLogs(json.data);
    } catch {
      // Local optimistic state kept
    }
  };

  const tripCircuit = async (provider: 'OPENAI' | 'GROQ' | 'OPENROUTER') => {
    const current = circuitBreakers[provider];
    const shouldTrip = current.state === 'CLOSED';

    setCircuitBreakers((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        state: shouldTrip ? 'OPEN' : 'CLOSED',
        consecutiveFailures: shouldTrip ? 3 : 0,
      },
    }));

    try {
      await fetch(`/api/admin/gateway/circuit-breakers/${provider}/trip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: shouldTrip, operatorEmail: 'harsh@orbit.internal' }),
      });
      const res = await fetch('/api/admin/audit-logs');
      const json = await res.json();
      if (json?.data) setAuditLogs(json.data);
    } catch {
      // Local optimistic state kept
    }
  };

  const handleOpenImpersonateModal = (t: TenantSummary) => {
    setModalTenant(t);
    setImpersonateReason('');
    setImpersonateTicketId('');
  };

  const handleConfirmImpersonate = async () => {
    if (!modalTenant || !impersonateReason.trim()) return;
    setIsSubmittingImpersonation(true);

    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: modalTenant.id,
          reason: impersonateReason.trim(),
          ticketId: impersonateTicketId.trim() || undefined,
          operatorEmail: 'harsh@orbit.internal',
        }),
      });

      const json = await res.json();
      if (json?.success && json.data) {
        setImpersonatingSession({
          slug: json.data.impersonatedOrg.slug,
          name: json.data.impersonatedOrg.name,
          token: json.data.token,
          redirectUrl: json.data.redirectUrl,
          expiresAt: json.data.expiresAt,
        });
      } else {
        setImpersonatingSession({
          slug: modalTenant.slug,
          name: modalTenant.name,
          token: 'orb_sim_impersonation_jwt_30m',
          redirectUrl: `http://localhost:5173/${modalTenant.slug}`,
          expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
        });
      }

      setModalTenant(null);

      const auditRes = await fetch('/api/admin/audit-logs');
      const auditJson = await auditRes.json();
      if (auditJson?.data) setAuditLogs(auditJson.data);
    } catch {
      setImpersonatingSession({
        slug: modalTenant.slug,
        name: modalTenant.name,
        token: 'orb_sim_impersonation_jwt_30m',
        redirectUrl: `http://localhost:5173/${modalTenant.slug}`,
        expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
      });
      setModalTenant(null);
    } finally {
      setIsSubmittingImpersonation(false);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Super-Admin Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 32px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>ORBIT CONTROL PLANE</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: '#ef444422',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Surface C — Super-Admin Privileged (orbit_admin)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '13px', color: '#94a3b8' }}>
          <span>Operator: <strong>harsh@orbit.internal</strong></span>
          <span style={{ color: '#10b981' }}>● Hardware FIDO2 Active</span>
        </div>
      </header>

      {/* Impersonation Banner (AC-C1) */}
      {impersonatingSession && (
        <div
          style={{
            padding: '12px 32px',
            backgroundColor: '#dc2626',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>⚠️ [IMPERSONATION ACTIVE — AUDITED]: Acting as tenant "{impersonatingSession.name}" ({impersonatingSession.slug}). All operations logged in platform_audit_logs.</span>
            <span style={{ padding: '2px 8px', backgroundColor: '#991b1b', borderRadius: '4px', fontSize: '11px' }}>
              Expires in 30 mins
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a
              href={impersonatingSession.redirectUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                fontWeight: 700,
                textDecoration: 'none',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Launch Workspace Cockpit ↗
            </a>
            <button
              onClick={() => setImpersonatingSession(null)}
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                backgroundColor: '#fff',
                color: '#dc2626',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              End Impersonation
            </button>
          </div>
        </div>
      )}

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar Nav */}
        <nav
          style={{
            width: '240px',
            backgroundColor: '#0d1322',
            borderRight: '1px solid #1e293b',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {[
            { id: 'tenants', label: 'Tenant Directory' },
            { id: 'gateway', label: 'AI Provider Gateway' },
            { id: 'margins', label: 'Revenue & Gross Margins' },
            { id: 'audit', label: 'Platform Audit Logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#1e293b' : 'transparent',
                color: activeTab === tab.id ? '#10b981' : '#94a3b8',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content View */}
        <main style={{ flex: 1, padding: '32px' }}>
          {activeTab === 'tenants' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>Multi-Tenant Organizations</h2>
                  <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Inspect tenant health, toggle suspension kill-switches, and initiate audited impersonation.</p>
                </div>
                <input
                  type="text"
                  placeholder="Search tenant name or slug..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '14px',
                    width: '280px',
                  }}
                />
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                    <th style={{ padding: '12px' }}>Organization</th>
                    <th style={{ padding: '12px' }}>Plan</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px' }}>Credits Left</th>
                    <th style={{ padding: '12px' }}>Gross Margin</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{t.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>slug: {t.slug}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#334155', fontSize: '12px', fontWeight: 600 }}>
                          {t.planTier}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: t.status === 'ACTIVE' ? '#10b98122' : '#ef444422',
                            color: t.status === 'ACTIVE' ? '#10b981' : '#ef4444',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>{t.creditsRemaining.toLocaleString()}</td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{ color: t.grossMarginPct < 75 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                          {t.grossMarginPct}%
                        </span>
                        {t.grossMarginPct < 75 && (
                          <span style={{ marginLeft: '6px', fontSize: '11px', color: '#ef4444', backgroundColor: '#ef444422', padding: '1px 6px', borderRadius: '3px' }}>
                            Low Margin
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenImpersonateModal(t)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            backgroundColor: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            fontSize: '12px',
                            cursor: 'pointer',
                            marginRight: '8px',
                          }}
                        >
                          Impersonate
                        </button>
                        <button
                          onClick={() => toggleTenantStatus(t.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            backgroundColor: t.status === 'ACTIVE' ? '#ef444422' : '#10b98122',
                            color: t.status === 'ACTIVE' ? '#ef4444' : '#10b981',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'gateway' && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>AI Provider Gateway & Routing</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 32px 0' }}>
                Monitor upstream LLM provider availability, latency, and manual circuit breaker overrides.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                {(['OPENAI', 'GROQ', 'OPENROUTER'] as const).map((prov) => {
                  const cb = circuitBreakers[prov] || { provider: prov, state: 'CLOSED', latencyMs: 350, consecutiveFailures: 0 };
                  return (
                    <div key={prov} style={{ padding: '24px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{prov}</h3>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: cb.state === 'CLOSED' ? '#10b98122' : '#ef444422',
                            color: cb.state === 'CLOSED' ? '#10b981' : '#ef4444',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          {cb.state}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
                        Average Latency: <strong style={{ color: '#f8fafc' }}>{cb.latencyMs} ms</strong>
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
                        Consecutive Failures: <strong style={{ color: '#f8fafc' }}>{cb.consecutiveFailures}</strong>
                      </div>
                      <button
                        onClick={() => tripCircuit(prov)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          backgroundColor: cb.state === 'CLOSED' ? '#ef4444' : '#10b981',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {cb.state === 'CLOSED' ? 'Trip Breaker to OPEN' : 'Reset Breaker to CLOSED'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'margins' && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>Platform Revenue & Unit Margins</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 32px 0' }}>
                Compare customer billable credit consumption with raw provider API costs (OpenAI/Groq).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Monthly Recurring Revenue</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
                    ${margins.monthlyRecurringRevenueUsd.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Provider COGS (LLM Cost)</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#ef4444', marginTop: '8px' }}>
                    ${margins.providerCogsUsd.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Platform Gross Margin</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>
                    {margins.platformGrossMarginPct}%
                  </div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Total Active Credits</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
                    {margins.totalActiveCredits.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Flagged Tenants Alert (AC-C3) */}
              {margins.flaggedTenantsCount > 0 && (
                <div style={{ padding: '24px', backgroundColor: '#1e1b2e', borderRadius: '12px', border: '1px solid #dc2626', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '16px' }}>⚠️ UNIT MARGIN DEFICIT ALERT:</span>
                    <span style={{ color: '#f8fafc', fontSize: '14px' }}>
                      {margins.flaggedTenantsCount} tenant(s) have fallen below the 75% platform gross margin threshold.
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {margins.flaggedTenants.map((ft) => (
                      <div key={ft.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#090d16', borderRadius: '6px', fontSize: '13px' }}>
                        <span><strong>{ft.name}</strong></span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>Margin: {ft.grossMarginPct}% (Spend: ${ft.monthlySpendUsd} / COGS: ${ft.providerCogsUsd})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>Platform Audit Trail</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 24px 0' }}>
                Immutable log of all super-administrative operations and tenant impersonations.
              </p>

              <div style={{ backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b', padding: '8px' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{ padding: '14px', borderBottom: '1px solid #1e293b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#334155', fontWeight: 700, marginRight: '10px', fontSize: '11px' }}>
                        {log.action}
                      </span>
                      <span><strong>{log.justification || 'Administrative operation'}</strong></span>
                      {log.ticketId && (
                        <span style={{ marginLeft: '8px', color: '#60a5fa', fontWeight: 600 }}>({log.ticketId})</span>
                      )}
                    </div>
                    <span style={{ color: '#64748b' }}>
                      Operator: {log.operatorEmail} {log.targetTenantSlug ? `| Org: ${log.targetTenantSlug}` : ''} | {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Impersonation Modal (AC-C1) */}
      {modalTenant && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#111827',
              borderRadius: '12px',
              border: '1px solid #374151',
              padding: '32px',
              width: '480px',
              maxWidth: '90%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ef4444' }}>
                Initiate Impersonation Session
              </h3>
              <button
                onClick={() => setModalTenant(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.5, marginBottom: '20px' }}>
              You are requesting temporary access to act as tenant <strong>{modalTenant.name}</strong>. In accordance with SOC-2 and AC-C1 requirements, every action will be logged in immutable audit records.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e5e7eb', marginBottom: '6px' }}>
                  Mandatory Justification Reason <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Support Ticket #4912: RAG retrieval debugging"
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#090d16',
                    border: '1px solid #374151',
                    color: '#fff',
                    boxSizing: 'border-box',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e5e7eb', marginBottom: '6px' }}>
                  Support Ticket ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. T-4912"
                  value={impersonateTicketId}
                  onChange={(e) => setImpersonateTicketId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#090d16',
                    border: '1px solid #374151',
                    color: '#fff',
                    boxSizing: 'border-box',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setModalTenant(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImpersonate}
                disabled={!impersonateReason.trim() || isSubmittingImpersonation}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: !impersonateReason.trim() ? '#4b5563' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  cursor: !impersonateReason.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                {isSubmittingImpersonation ? 'Issuing 30m JWT...' : 'Confirm & Impersonate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
