'use client';

import React, { useState } from 'react';

export default function HomePage() {
  const [ticketVolume, setTicketVolume] = useState<number>(20000);
  const [teamSize, setTeamSize] = useState<number>(8);
  const [responseTimeMin, setResponseTimeMin] = useState<number>(45);

  // ROI Calculator Calculations
  const deflectionRate = 0.78; // 78% average autonomous resolution
  const resolvedByAi = Math.round(ticketVolume * deflectionRate);
  const costPerHumanTicket = 4.5; // Average $4.50 loaded cost per ticket
  const aiCostPerTicket = 0.15; // $0.15 including credits and overhead
  const monthlySavings = Math.round(resolvedByAi * (costPerHumanTicket - aiCostPerTicket));
  const annualSavings = monthlySavings * 12;
  const hoursSavedPerYear = Math.round((resolvedByAi * 12) / 4); // ~15 mins human time per ticket

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', marginBottom: '80px' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '20px', backgroundColor: '#10b98115', color: '#10b981', fontSize: '13px', fontWeight: 600, marginBottom: '24px', border: '1px solid #10b98133' }}>
          ⚡ Meet the Autonomous AI Workforce
        </div>
        <h1 style={{ fontSize: '54px', fontWeight: 800, lineHeight: 1.15, margin: '0 0 24px 0', letterSpacing: '-0.02em' }}>
          Automate 80% of Support.<br />
          <span style={{ color: '#10b981' }}>Without Sacrificing Human Trust.</span>
        </h1>
        <p style={{ fontSize: '18px', color: '#9ca3af', maxWidth: '720px', margin: '0 auto 40px auto', lineHeight: 1.6 }}>
          Project Orbit orchestrates specialized AI agents that take direct actions across your Shopify store, payment gateways, and couriers—resolving refunds, returns, and tracking queries on WhatsApp, Instagram, and Voice.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <a
            href="/demo"
            style={{
              padding: '14px 32px',
              borderRadius: '8px',
              backgroundColor: '#10b981',
              color: '#090d16',
              fontWeight: 700,
              fontSize: '16px',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            Book an Enterprise Demo
          </a>
          <a
            href="http://localhost:5173/register"
            style={{
              padding: '14px 32px',
              borderRadius: '8px',
              backgroundColor: '#1f2937',
              color: '#fff',
              fontWeight: 600,
              fontSize: '16px',
              textDecoration: 'none',
              border: '1px solid #374151',
            }}
          >
            Start 14-Day Free Trial
          </a>
        </div>
      </section>

      {/* Customer Proof Section */}
      <section style={{ marginBottom: '80px', padding: '32px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f2937' }}>
        <h3 style={{ textAlign: 'center', fontSize: '14px', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.08em', marginBottom: '32px' }}>
          Proven at Scale with Leading Brands
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#10b981' }}>94%</div>
            <div style={{ fontSize: '14px', color: '#d1d5db', fontWeight: 600, marginTop: '4px' }}>Peak AI Resolution</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Handled 12x Birthday Sale surge</div>
          </div>
          <div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#10b981' }}>60,000+</div>
            <div style={{ fontSize: '14px', color: '#d1d5db', fontWeight: 600, marginTop: '4px' }}>Monthly Tickets Automated</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Reduced first response to 3 seconds</div>
          </div>
          <div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#10b981' }}>2.1x</div>
            <div style={{ fontSize: '14px', color: '#d1d5db', fontWeight: 600, marginTop: '4px' }}>Repeat Purchase Rate</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>AI-driven win-backs & retention</div>
          </div>
        </div>
      </section>

      {/* Interactive ROI Calculator */}
      <section style={{ marginBottom: '80px', padding: '40px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #10b98133' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 12px 0' }}>Calculate Your Annual ROI</h2>
          <p style={{ color: '#9ca3af', margin: 0 }}>See how much Orbit saves your brand in human support costs and customer wait times.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
          {/* Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span>Monthly Support Ticket Volume:</span>
                <span style={{ color: '#10b981' }}>{ticketVolume.toLocaleString()} tickets</span>
              </div>
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={ticketVolume}
                onChange={(e) => setTicketVolume(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span>Current Support Team Size:</span>
                <span style={{ color: '#10b981' }}>{teamSize} agents</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span>Current First Response Time:</span>
                <span style={{ color: '#10b981' }}>{responseTimeMin} minutes</span>
              </div>
              <input
                type="range"
                min="5"
                max="240"
                step="5"
                value={responseTimeMin}
                onChange={(e) => setResponseTimeMin(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
            </div>
          </div>

          {/* Results Card */}
          <div style={{ padding: '32px', backgroundColor: '#090d16', borderRadius: '12px', border: '1px solid #1f2937', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Annual Net Savings</div>
            <div style={{ fontSize: '48px', fontWeight: 800, color: '#10b981', margin: '12px 0' }}>
              ${annualSavings.toLocaleString()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px', textAlign: 'left', borderTop: '1px solid #1f2937', paddingTop: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Autonomous Deflection</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f3f4f6' }}>{resolvedByAi.toLocaleString()} tickets/mo (78%)</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Human Hours Reclaimed</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f3f4f6' }}>{hoursSavedPerYear.toLocaleString()} hrs/year</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Omnichannel Grid */}
      <section style={{ marginBottom: '80px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 700, textAlign: 'center', marginBottom: '40px' }}>
          One Unified Brain Across Every Touchpoint
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {[
            { channel: 'WhatsApp Cloud API', desc: 'Direct order updates, return requests, and interactive quick-replies.', icon: '💬' },
            { channel: 'Instagram Feed & DM', desc: 'Automate comment moderation, public brand replies, and private DM handoffs.', icon: '📸' },
            { channel: 'Web Chat Widget', desc: 'Embeddable Shadow-DOM widget with live Shopify order cards and zero-lag streaming.', icon: '🌐' },
            { channel: 'AI Voice Telephony', desc: 'Shared phone line handling inbound calls with real-time speech and written briefings.', icon: '📞' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '24px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1f2937' }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{item.icon}</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0' }}>{item.channel}</h4>
              <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
