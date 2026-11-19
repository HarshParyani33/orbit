'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    ticketVolume: '10k-50k',
    channels: ['whatsapp', 'instagram'],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '42px', fontWeight: 800, margin: '0 0 12px 0' }}>See Orbit in Action</h1>
        <p style={{ color: '#9ca3af', fontSize: '16px' }}>
          Schedule a live 30-minute demonstration tailored to your brand’s daily ticket volume and storefront stack.
        </p>
      </div>

      <div style={{ padding: '40px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f2937' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', margin: '0 0 8px 0' }}>Demo Requested!</h2>
            <p style={{ color: '#9ca3af', fontSize: '15px', maxWidth: '480px', margin: '0 auto 24px auto' }}>
              Thank you, {formData.name}. Our enterprise team will email a calendar invite to <strong>{formData.email}</strong> shortly.
            </p>
            <a
              href="/"
              style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '6px', backgroundColor: '#1f2937', color: '#fff', textDecoration: 'none', fontSize: '14px' }}
            >
              Return to Homepage
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>Full Name</label>
              <input
                type="text"
                required
                placeholder="Sarah Jenkins"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', backgroundColor: '#090d16', border: '1px solid #374151', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>Work Email</label>
              <input
                type="email"
                required
                placeholder="sarah@yourbrand.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', backgroundColor: '#090d16', border: '1px solid #374151', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>Company / Brand Name</label>
              <input
                type="text"
                required
                placeholder="Lumina Fashion"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', backgroundColor: '#090d16', border: '1px solid #374151', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>Monthly Support Volume</label>
              <select
                value={formData.ticketVolume}
                onChange={(e) => setFormData({ ...formData, ticketVolume: e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', backgroundColor: '#090d16', border: '1px solid #374151', color: '#fff', boxSizing: 'border-box' }}
              >
                <option value="under-1k">Under 1,000 tickets/month</option>
                <option value="1k-10k">1,000 – 10,000 tickets/month</option>
                <option value="10k-50k">10,000 – 50,000 tickets/month</option>
                <option value="50k-plus">50,000+ tickets/month</option>
              </select>
            </div>

            <button
              type="submit"
              style={{
                marginTop: '12px',
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#10b981',
                color: '#090d16',
                fontWeight: 700,
                fontSize: '16px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Request Custom Demo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
