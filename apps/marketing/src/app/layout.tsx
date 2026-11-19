import React from 'react';

export const metadata = {
  title: 'Orbit — The Autonomous AI Customer Engagement Platform for Modern Brands',
  description:
    'Scale customer resolution with autonomous AI agents across WhatsApp, Instagram, Email, and Voice. 80%+ autonomous resolution with verified human governance.',
  openGraph: {
    title: 'Orbit — Autonomous AI Workforce for DTC Brands',
    description: 'Transform customer support into a revenue driver with autonomous AI employees.',
    url: 'https://orbit.com',
    siteName: 'Project Orbit',
    images: [{ url: 'https://orbit.com/og-image.png', width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#090d16', color: '#f3f4f6' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid #1f2937', backgroundColor: '#090d16' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>ORBIT</span>
            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#10b98122', color: '#10b981', fontWeight: 600 }}>AI SaaS</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <a href="/" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '14px' }}>Platform</a>
            <a href="/pricing" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '14px' }}>Pricing</a>
            <a href="/customers" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '14px' }}>Case Studies</a>
            <a href="/demo" style={{ color: '#10b981', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Book Demo</a>
            <a href="http://localhost:5173/login" style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: '#1f2937', color: '#fff', textDecoration: 'none', fontSize: '14px' }}>Sign In</a>
            <a href="http://localhost:5173/register" style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: '#10b981', color: '#090d16', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Start Free Trial</a>
          </div>
        </nav>
        <main>{children}</main>
        <footer style={{ padding: '40px 32px', borderTop: '1px solid #1f2937', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          <p>© 2026 Project Orbit Inc. All rights reserved. SOC2 Ready | GDPR Compliant | AES-256 Encrypted.</p>
        </footer>
      </body>
    </html>
  );
}
