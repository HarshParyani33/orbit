import React from 'react';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 24px', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '24px' }}>Terms of Service</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Last updated: November 2026</p>

      <div style={{ backgroundColor: '#111827', padding: '32px', borderRadius: '12px', border: '1px solid #1f2937' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: 0 }}>1. Multi-Tenant Architecture & Data Security</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          Project Orbit enforces strict multi-tenant isolation through PostgreSQL Row-Level Security (RLS) and AES-256-GCM envelope encryption. No customer data or conversational tokens are shared across workspace boundaries or used to train public LLM models without explicit consent.
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '24px' }}>2. AI Credit Metering & Expiration</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          Monthly subscription tier allowances reset at each billing cycle. Purchased top-up credits never expire and roll over indefinitely. When workspace credits reach zero, the platform operates under a fail-closed protocol, safely routing new inquiries to human agent queues.
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '24px' }}>3. Audited Administrative Access</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          Any platform operator impersonation session requires mandatory business justification, issues short-lived 30-minute JWT credentials, and writes immutable audit entries to the platform security log.
        </p>
      </div>
    </div>
  );
}
