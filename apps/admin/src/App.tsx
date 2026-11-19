import React, { useState } from 'react';

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
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'gateway' | 'margins' | 'audit'>('tenants');
  const [searchTerm, setSearchTerm] = useState('');
  const [impersonatingTenant, setImpersonatingTenant] = useState<string | null>(null);

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
  ]);

  const [circuitBreakers, setCircuitBreakers] = useState({
    OPENAI: { state: 'CLOSED', latencyMs: 380, consecutiveFailures: 0 },
    GROQ: { state: 'CLOSED', latencyMs: 140, consecutiveFailures: 0 },
    OPENROUTER: { state: 'CLOSED', latencyMs: 510, consecutiveFailures: 0 },
  });

  const toggleTenantStatus = (id: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } : t
      )
    );
  };

  const tripCircuit = (provider: 'OPENAI' | 'GROQ' | 'OPENROUTER') => {
    setCircuitBreakers((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        state: prev[provider].state === 'CLOSED' ? 'OPEN' : 'CLOSED',
        consecutiveFailures: prev[provider].state === 'CLOSED' ? 3 : 0,
      },
    }));
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#090d16' }}>
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
            Super-Admin Privileged (orbit_admin)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '13px', color: '#94a3b8' }}>
          <span>Operator: <strong>harsh@orbit.internal</strong></span>
          <span style={{ color: '#10b981' }}>● Hardware FIDO2 Active</span>
        </div>
      </header>

      {/* Impersonation Banner */}
      {impersonatingTenant && (
        <div
          style={{
            padding: '10px 32px',
            backgroundColor: '#dc2626',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <span>⚠️ IMPERSONATION SESSION ACTIVE: Acting as tenant "{impersonatingTenant}". Read & write mutations are audited.</span>
          <button
            onClick={() => setImpersonatingTenant(null)}
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#dc2626',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            End Impersonation
          </button>
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
                      <td style={{ padding: '16px 12px', color: '#10b981', fontWeight: 700 }}>{t.grossMarginPct}%</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => setImpersonatingTenant(t.slug)}
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
                  const cb = circuitBreakers[prov];
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
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>$727.98</div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Provider COGS (LLM Cost)</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#ef4444', marginTop: '8px' }}>$18.92</div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Platform Gross Margin</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>97.4%</div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Total Active Credits</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>58,344</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>Platform Audit Trail</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 24px 0' }}>
                Immutable log of all super-administrative operations and tenant impersonations.
              </p>

              <div style={{ backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b', padding: '16px' }}>
                <div style={{ padding: '12px', borderBottom: '1px solid #1e293b', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>ACTION:</strong> IMPERSONATION_REQUEST</span>
                  <span style={{ color: '#64748b' }}>Operator: harsh@orbit.internal | Target: plum-beauty | Justification: "Support Ticket #4912" | 2 mins ago</span>
                </div>
                <div style={{ padding: '12px', borderBottom: '1px solid #1e293b', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>ACTION:</strong> CIRCUIT_BREAKER_RESET</span>
                  <span style={{ color: '#64748b' }}>Operator: system-auto | Provider: GROQ | 14 mins ago</span>
                </div>
                <div style={{ padding: '12px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>ACTION:</strong> CREDIT_TOP_UP_SYNC</span>
                  <span style={{ color: '#64748b' }}>Operator: stripe-webhook | Org: aachho | Amount: +15,000 Credits | 1 hour ago</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
