import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';

// Insurer/TPA portal (WP-13 IN-01/03/05/06): referral queue with SLA clocks,
// rate-table manager, campaigns, registration ops. Underwriter/rates roles.
export default async function InsurerPortal() {
  const uw = { role: 'underwriter' as const, userId: 'demo-underwriter' };
  const rates = { role: 'rates_manager' as const };
  const cases = await api<{ rows: { id: string; application_id: string; state: string; trigger_rule_ids: string[]; sla_due_at?: string; snapshot?: unknown }[] }>(
    '/cases?queue=underwriting',
    uw,
  );
  const rateTables = await api<{ rows: { id: string; version: string; product_code: string; status: string }[] }>(
    '/rates',
    rates,
  );
  const campaigns = await api<{ rows: { code: string; percent_off: string; valid_to: string }[] }>(
    '/campaigns',
    rates,
  );
  const tickets = await api<{ rows: { id: string; application_id: string; type: string; created_at: string }[] }>(
    '/ops/tickets',
    { role: 'platform_ops' },
  );

  async function decideCase(formData: FormData) {
    'use server';
    await api(`/cases/${formData.get('caseId')}/decision`, { role: 'underwriter', userId: 'demo-underwriter' }, {
      body: {
        decision: String(formData.get('decision')),
        rationale: String(formData.get('rationale')),
        loadingPct: formData.get('loadingPct') ? Number(formData.get('loadingPct')) : undefined,
        exclusionText: formData.get('exclusionText') ? String(formData.get('exclusionText')) : undefined,
      },
    });
    revalidatePath('/insurer');
  }

  async function publishRates(formData: FormData) {
    'use server';
    await api('/rates', { role: 'rates_manager' }, {
      body: {
        productCode: String(formData.get('productCode')),
        version: String(formData.get('version')),
        effectiveFrom: String(formData.get('effectiveFrom')),
        matrix: { type: 'flat', ratePerLife: Number(formData.get('rate')), fees: 25 },
      },
    });
    revalidatePath('/insurer');
  }

  async function retryRegistration(formData: FormData) {
    'use server';
    await api(`/ops/tickets/${formData.get('ticketId')}/retry-registration`, { role: 'platform_ops' }, { body: {} });
    revalidatePath('/insurer');
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1>Insurer / TPA Portal</h1>

      <h2>Referral queue (IN-01 — underwriting only; REF-001)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Case</th><th>Triggers</th><th>State</th><th>SLA due</th><th>Decision (REF-020/021/023)</th></tr></thead>
        <tbody>
          {cases.rows.filter((c) => !['closed'].includes(c.state)).map((c) => (
            <tr key={c.id}>
              <td><code>{c.id.slice(0, 8)}</code></td>
              <td>{c.trigger_rule_ids.join(', ')}</td>
              <td>{c.state}</td>
              <td>{c.sla_due_at ? new Date(c.sla_due_at).toLocaleString() : '—'}</td>
              <td>
                <form action={decideCase}>
                  <input type="hidden" name="caseId" value={c.id} />
                  <select name="decision">
                    <option value="accept">Accept</option>
                    <option value="accept_with_terms">Accept with terms</option>
                    <option value="decline">Decline</option>
                  </select>
                  <input name="rationale" placeholder="rationale (REF-024)" required />
                  <input name="loadingPct" placeholder="loading %" size={6} />
                  <input name="exclusionText" placeholder="exclusion" size={12} />
                  <button type="submit">Record</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Rate tables (IN-03 — versioned; in-flight quotes protected QR-030)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Product</th><th>Version</th><th>Status</th></tr></thead>
        <tbody>
          {rateTables.rows.map((r) => (
            <tr key={r.id}><td>{r.product_code}</td><td>{r.version}</td><td>{r.status}</td></tr>
          ))}
        </tbody>
      </table>
      <form action={publishRates}>
        <input name="productCode" placeholder="FED-BASIC" required />
        <input name="version" placeholder="RT-2026-08-v1" required />
        <input type="date" name="effectiveFrom" required />
        <input name="rate" type="number" placeholder="rate/life" required />
        <button type="submit">Publish new version</button>
      </form>

      <h2>Campaigns (IN-05 — the only discount source, REG-005)</h2>
      <ul>{campaigns.rows.map((c) => <li key={c.code}>{c.code}: {c.percent_off}% until {c.valid_to}</li>)}</ul>

      <h2>Registration ops (IN-06 — PAY-023 queue, highest priority)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Ticket</th><th>Type</th><th>Raised</th><th /></tr></thead>
        <tbody>
          {tickets.rows.map((tk) => (
            <tr key={tk.id}>
              <td><code>{tk.id.slice(0, 8)}</code></td>
              <td>{tk.type}</td>
              <td>{new Date(tk.created_at).toLocaleString()}</td>
              <td>
                {tk.type === 'registration_failure' && (
                  <form action={retryRegistration}>
                    <input type="hidden" name="ticketId" value={tk.id} />
                    <button type="submit">Retry registration</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
