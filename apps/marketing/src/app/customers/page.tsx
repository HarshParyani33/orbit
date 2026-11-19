'use client';

import React from 'react';

export default function CaseStudiesPage() {
  const caseStudies = [
    {
      brand: 'Plum Beauty',
      category: 'DTC Cosmetics',
      headline: 'Handled 12x Surge with 94% Peak AI Resolution',
      metrics: [
        { label: 'Deflection Rate', val: '94%' },
        { label: 'Response Time', val: '3 seconds' },
        { label: 'Annual Savings', val: '$180,000' },
      ],
      story:
        'During their annual Birthday Sale, ticket volume surged from 2,000 to over 24,000 tickets a week. Orbit’s autonomous Support Agent resolved order tracking, shade inquiries, and delivery updates without hiring temporary seasonal staff.',
    },
    {
      brand: 'Aachho Ethnic Wear',
      category: 'Fashion & Apparel',
      headline: '60,000 Tickets a Month Fully Automated',
      metrics: [
        { label: 'Monthly Tickets', val: '60,000+' },
        { label: 'CSAT Score', val: '4.8 / 5.0' },
        { label: 'Exchange Turnaround', val: '< 2 hours' },
      ],
      story:
        'Aachho connected their Shopify and Shiprocket courier stacks to Orbit. Customers requesting size exchanges on WhatsApp receive immediate size confirmation, inventory reservation, and reverse pickup scheduling.',
    },
    {
      brand: 'Freecultr',
      category: 'Sustainable Apparel',
      headline: 'Doubled Repeat Purchases Across 10 Regional Languages',
      metrics: [
        { label: 'Repeat Orders', val: '2.1x' },
        { label: 'Languages Supported', val: '10' },
        { label: 'Deflection', val: '82%' },
      ],
      story:
        'Leveraging Orbit’s multilingual capabilities, Freecultr deployed AI employees that communicate fluently with customers in Hindi, English, Tamil, and Telugu, turning support conversations into personalized re-orders.',
    },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 800, margin: '0 0 16px 0' }}>Customer Success Stories</h1>
        <p style={{ fontSize: '18px', color: '#9ca3af', maxWidth: '640px', margin: '0 auto' }}>
          Discover how the fastest-growing consumer brands scale customer delight with Project Orbit.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {caseStudies.map((cs, i) => (
          <div
            key={i}
            style={{
              padding: '40px',
              backgroundColor: '#111827',
              borderRadius: '16px',
              border: '1px solid #1f2937',
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: '40px',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '12px', backgroundColor: '#10b98115', color: '#10b981', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
                {cs.category}
              </div>
              <h2 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 16px 0', color: '#f3f4f6' }}>{cs.headline}</h2>
              <p style={{ color: '#9ca3af', lineHeight: 1.6, fontSize: '15px', margin: '0 0 24px 0' }}>{cs.story}</p>
              <div style={{ fontWeight: 600, color: '#10b981' }}>— {cs.brand} CX Team</div>
            </div>

            <div style={{ backgroundColor: '#090d16', padding: '24px', borderRadius: '12px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {cs.metrics.map((m, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: j < cs.metrics.length - 1 ? '1px solid #1f2937' : 'none', paddingBottom: j < cs.metrics.length - 1 ? '16px' : '0' }}>
                  <span style={{ color: '#9ca3af', fontSize: '14px' }}>{m.label}</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
