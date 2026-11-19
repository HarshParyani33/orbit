import React from 'react';

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 24px', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '24px' }}>Privacy & Data Governance Policy</h1>
      <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Last updated: November 2026</p>

      <div style={{ backgroundColor: '#111827', padding: '32px', borderRadius: '12px', border: '1px solid #1f2937' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: 0 }}>1. GDPR & SOC-2 Compliance</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          Orbit complies with GDPR requirements, providing full Right-to-be-Forgotten data deletion cascades across conversations, customer channel identities, vector embeddings, and uploaded message attachments.
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '24px' }}>2. Channel Credentials & Secret Vaulting</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          All third-party integration credentials (WhatsApp tokens, Shopify Admin API keys, Twilio Auth Tokens) are encrypted at rest using AES-256-GCM envelope encryption with per-tenant data encryption keys (DEKs).
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '24px' }}>3. Vector Grounding & Model Isolation</h2>
        <p style={{ color: '#d1d5db', fontSize: '14px' }}>
          Customer knowledge embeddings generated in pgvector are strictly isolated per tenant workspace. Query similarity matches are evaluated exclusively against the requesting organization’s verified knowledge base.
        </p>
      </div>
    </div>
  );
}
