'use client';

import React from 'react';

export default function PricingPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 800, margin: '0 0 16px 0' }}>Transparent, Volume-Based Pricing</h1>
        <p style={{ fontSize: '18px', color: '#9ca3af', maxWidth: '640px', margin: '0 auto' }}>
          Pay for successful resolutions, not for idle human seats. All plans include full RAG knowledge search and Response Guard safety.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '28px', marginBottom: '60px' }}>
        {/* Starter Plan */}
        <div style={{ padding: '36px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0' }}>Starter</h3>
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 24px 0' }}>Ideal for emerging DTC brands getting started with automation.</p>
            <div style={{ fontSize: '42px', fontWeight: 800, color: '#f3f4f6' }}>$29<span style={{ fontSize: '16px', color: '#6b7280', fontWeight: 400 }}> / month</span></div>
            <ul style={{ paddingLeft: '20px', color: '#d1d5db', fontSize: '14px', lineHeight: 2, marginTop: '24px' }}>
              <li><strong>2,000 AI Credits</strong> / month</li>
              <li>2 Team Member Seats</li>
              <li>Web Chat Widget + Email</li>
              <li>Knowledge Base RAG (up to 50 docs)</li>
              <li>Standard Response Guard</li>
            </ul>
          </div>
          <a
            href="http://localhost:5173/register"
            style={{ display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: '8px', backgroundColor: '#1f2937', color: '#fff', textDecoration: 'none', fontWeight: 600, marginTop: '32px' }}
          >
            Start 14-Day Trial
          </a>
        </div>

        {/* Growth Plan (Highlighted) */}
        <div style={{ padding: '36px', backgroundColor: '#111827', borderRadius: '16px', border: '2px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#10b981', color: '#090d16', padding: '4px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
            MOST POPULAR
          </div>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0' }}>Growth</h3>
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 24px 0' }}>For fast-growing brands scaling omnichannel engagement.</p>
            <div style={{ fontSize: '42px', fontWeight: 800, color: '#10b981' }}>$99.99<span style={{ fontSize: '16px', color: '#6b7280', fontWeight: 400 }}> / month</span></div>
            <ul style={{ paddingLeft: '20px', color: '#d1d5db', fontSize: '14px', lineHeight: 2, marginTop: '24px' }}>
              <li><strong>7,500 AI Credits</strong> / month</li>
              <li>5 Team Member Seats</li>
              <li>WhatsApp Cloud API + Instagram DMs</li>
              <li>Shopify & WooCommerce Real-Time Cards</li>
              <li>Full 10 Analytics Dashboards</li>
              <li>Top-Up Credits Never Expire</li>
            </ul>
          </div>
          <a
            href="http://localhost:5173/register"
            style={{ display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: '8px', backgroundColor: '#10b981', color: '#090d16', textDecoration: 'none', fontWeight: 700, marginTop: '32px' }}
          >
            Get Started
          </a>
        </div>

        {/* Enterprise Plan */}
        <div style={{ padding: '36px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0' }}>Enterprise</h3>
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 24px 0' }}>Custom volume, dedicated voice lines, and bespoke SLAs.</p>
            <div style={{ fontSize: '42px', fontWeight: 800, color: '#f3f4f6' }}>Custom</div>
            <ul style={{ paddingLeft: '20px', color: '#d1d5db', fontSize: '14px', lineHeight: 2, marginTop: '24px' }}>
              <li><strong>Custom Credit Packages (50k+)</strong></li>
              <li>Unlimited Seats & Custom Teams</li>
              <li>Dedicated Inbound/Outbound Voice Lines</li>
              <li>Custom ERP / OMS Integrations</li>
              <li>Dedicated Technical Account Manager</li>
              <li>SAML SSO & Custom Security SLA</li>
            </ul>
          </div>
          <a
            href="/demo"
            style={{ display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: '8px', backgroundColor: '#1f2937', color: '#fff', textDecoration: 'none', fontWeight: 600, marginTop: '32px' }}
          >
            Speak to Sales
          </a>
        </div>
      </div>
    </div>
  );
}
