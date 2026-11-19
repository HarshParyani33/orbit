'use client';

import React, { useState } from 'react';

interface IntegrationItem {
  id: string;
  name: string;
  category: 'ecommerce' | 'channels' | 'logistics' | 'ai_voice' | 'developer';
  description: string;
  badge: string;
  isPopular?: boolean;
}

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const integrations: IntegrationItem[] = [
    {
      id: 'shopify',
      name: 'Shopify & Shopify Plus',
      category: 'ecommerce',
      description: 'Real-time order lookup, automated line-item cancellations, item exchanges, and partial/full refund calculation.',
      badge: 'Native Adapter',
      isPopular: true,
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      category: 'ecommerce',
      description: 'Sync customer orders, line items, and fulfillment statuses directly into the Orbit shared inbox.',
      badge: 'Native Adapter',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business Cloud API',
      category: 'channels',
      description: 'Deploy 24/7 autonomous support, abandoned cart re-engagement, and order tracking notifications.',
      badge: 'Meta Certified',
      isPopular: true,
    },
    {
      id: 'instagram',
      name: 'Instagram DMs & Comments',
      category: 'channels',
      description: 'Listen to public ad/post comments, execute sentiment moderation, and escalate to private DMs.',
      badge: 'Meta Certified',
      isPopular: true,
    },
    {
      id: 'shiprocket',
      name: 'Shiprocket & Couriers',
      category: 'logistics',
      description: 'Real-time AWB milestone tracking, NDR exception detection, and automated re-attempt scheduling.',
      badge: 'Real-Time AWB',
      isPopular: true,
    },
    {
      id: 'twilio',
      name: 'Twilio Voice Telephony',
      category: 'ai_voice',
      description: 'Sub-1,200ms turnaround conversational voice agents with automated human transfer briefings.',
      badge: 'Telephony',
      isPopular: true,
    },
    {
      id: 'openai',
      name: 'OpenAI GPT-4o & Embeddings',
      category: 'ai_voice',
      description: 'Primary intelligence engine with vector search embeddings and multi-turn conversational reasoning.',
      badge: 'Primary AI',
    },
    {
      id: 'groq',
      name: 'Groq LPUs (Llama 3.1 70B)',
      category: 'ai_voice',
      description: 'Ultra-low latency fallback and high-throughput conversational intelligence under 200ms.',
      badge: 'Failover Gateway',
    },
    {
      id: 'mcp',
      name: 'Model Context Protocol (MCP)',
      category: 'developer',
      description: 'Connect Orbit knowledge and customer CRM directly to Claude Desktop, Cursor, and IDE assistants.',
      badge: 'JSON-RPC 2.0',
      isPopular: true,
    },
    {
      id: 'webhooks',
      name: 'Developer Webhooks & API',
      category: 'developer',
      description: 'Cryptographically signed outbound webhook events (X-Orbit-Signature-256) and REST API keys.',
      badge: 'Developer SDK',
    },
  ];

  const filtered = integrations.filter((item) => {
    const matchesCat = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '16px', backgroundColor: '#10b98115', color: '#10b981', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid #10b98133' }}>
          Connect Your Entire Commerce Stack
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: 800, margin: '0 0 16px 0' }}>The Orbit Integrations Directory</h1>
        <p style={{ fontSize: '18px', color: '#9ca3af', maxWidth: '640px', margin: '0 auto 32px auto' }}>
          Orbit connects natively to your storefront, courier partners, messaging channels, and AI providers with zero glue code.
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search integrations (e.g. Shopify, WhatsApp, Voice, MCP)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '480px',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: '#111827',
            border: '1px solid #374151',
            color: '#fff',
            fontSize: '15px',
          }}
        />
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '40px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Integrations' },
          { id: 'ecommerce', label: 'E-Commerce' },
          { id: 'channels', label: 'Messaging Channels' },
          { id: 'logistics', label: 'Logistics & Couriers' },
          { id: 'ai_voice', label: 'AI & Telephony' },
          { id: 'developer', label: 'Developer APIs & MCP' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              padding: '8px 18px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: activeCategory === cat.id ? '#10b981' : '#1f2937',
              color: activeCategory === cat.id ? '#090d16' : '#d1d5db',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Integrations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
        {filtered.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '28px',
              backgroundColor: '#111827',
              borderRadius: '14px',
              border: item.isPopular ? '1px solid #10b98144' : '1px solid #1f2937',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f3f4f6' }}>{item.name}</h3>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#10b98115',
                    color: '#10b981',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {item.badge}
                </span>
              </div>
              <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                {item.description}
              </p>
            </div>
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{item.category}</span>
              <a
                href="/demo"
                style={{ fontSize: '13px', color: '#10b981', textDecoration: 'none', fontWeight: 600 }}
              >
                Configure in Cockpit →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
