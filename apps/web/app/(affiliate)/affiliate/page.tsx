import { api } from '../../../lib/api';

// Affiliate view (WP-13 / TEN-003 / QR-023): attribution metrics and payouts
// ONLY — zero customer PII ever reaches this page.
export default async function AffiliatePortal({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.code ?? 'AFF-DEMO';
  const stats = await api<{ code: string; clicks: number; conversions: number }>(
    `/affiliate/stats?code=${encodeURIComponent(code)}`,
    { role: 'affiliate' },
  );

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1>Affiliate Portal</h1>
      <p>Code: <strong>{stats.code}</strong></p>
      <ul>
        <li>Attributed applications: {stats.clicks}</li>
        <li>Converted (issued+registered — QR-021 accrual basis): {stats.conversions}</li>
      </ul>
      <p>
        Share link: <code>{`https://psp.example/?aff=${stats.code}`}</code>
      </p>
      <p><small>
        Attribution is last-click with a 30-day window (QR-023). Payout statements
        arrive with M3 ledgers. No customer data is available in this view (TEN-003).
      </small></p>
    </main>
  );
}
