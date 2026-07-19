import { revalidatePath } from 'next/cache';
import { api, demoTenant } from '../../../lib/api';

// Broker portal (WP-13 BR-01/02/05/06): pipeline, client book, bulk intake
// with per-life validation, referral tracker (status only).
export default async function BrokerPortal({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const sp = await searchParams;
  const tenantId = await demoTenant('broker');
  const ctx = { role: 'broker_agent' as const, tenantId };
  const apps = await api<{ rows: { id: string; state: string; regime: string }[] }>('/applications', ctx);
  const cases = await api<{ rows: { id: string; application_id: string; queue: string; state: string; sla_due_at?: string }[] }>(
    '/cases',
    ctx,
  );

  async function bulkIntake(formData: FormData) {
    'use server';
    const tenant = await demoTenant('broker');
    const lines = String(formData.get('csv'))
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // CSV: emirate,visaStatus,eid,fullName,dob,gender,nationality
    const rows = lines.map((line) => {
      const [emirateOfVisa, visaStatus, eid, fullName, dob, gender, nationality] = line.split(',');
      return {
        emirateOfVisa,
        visaStatus,
        eid: eid || undefined,
        fullName,
        dob,
        gender,
        nationality,
      };
    });
    const result = await api<{ report: unknown[] }>('/bulk/applications', {
      role: 'broker_agent',
      tenantId: tenant,
    }, { body: { rows } });
    const { redirect } = await import('next/navigation');
    redirect(`/broker?report=${encodeURIComponent(JSON.stringify(result.report))}`);
  }

  async function refresh() {
    'use server';
    revalidatePath('/broker');
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 16 }}>
      <h1>Broker Portal</h1>

      <h2>Client book / pipeline (BR-01/02)</h2>
      <form action={refresh}><button type="submit">Refresh</button></form>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Application</th><th>State</th><th>Regime</th><th /></tr></thead>
        <tbody>
          {apps.rows.map((a) => (
            <tr key={a.id}>
              <td><code>{a.id.slice(0, 8)}</code></td>
              <td>{a.state}</td>
              <td>{a.regime ?? '—'}</td>
              <td><a href={`/apply/${a.id}?as=broker`}>open</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Bulk intake (BR-05 — per-life validation, each life screened individually)</h2>
      <form action={bulkIntake}>
        <textarea
          name="csv"
          rows={4}
          cols={80}
          placeholder="emirate,visaStatus,eid,fullName,dob,gender,nationality"
        />
        <br />
        <button type="submit">Validate & create</button>
      </form>
      {sp.report && (
        <pre style={{ background: '#f5f5f5', padding: 8, overflowX: 'auto' }}>
          {JSON.stringify(JSON.parse(sp.report), null, 2)}
        </pre>
      )}

      <h2>Referral tracker (BR-06 — status only, SLA countdown)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Case</th><th>Queue</th><th>State</th><th>SLA due</th></tr></thead>
        <tbody>
          {cases.rows.map((c) => (
            <tr key={c.id}>
              <td><code>{c.id.slice(0, 8)}</code></td>
              <td>{c.queue}</td>
              <td>{c.state}</td>
              <td>{c.sla_due_at ? new Date(c.sla_due_at).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><small>Commission statements arrive with M3 ledgers (QR-021: accrual on issued+registered only).</small></p>
    </main>
  );
}
