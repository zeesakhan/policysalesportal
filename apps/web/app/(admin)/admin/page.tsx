import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';

// Platform admin portal (WP-13 AD-01/03/07/08): tenant lifecycle, compliance
// workbench, audit viewer, exceptions dashboard.
export default async function AdminPortal({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const sp = await searchParams;
  const ops = { role: 'platform_ops' as const, userId: 'demo-ops' };
  const compliance = { role: 'compliance_officer' as const, userId: 'demo-compliance' };

  const tenants = await api<{ rows: { id: string; type: string; name: string; status: string }[] }>(
    '/admin/tenants',
    ops,
  );
  const complianceCases = await api<{ rows: { id: string; application_id: string; state: string; trigger_rule_ids: string[] }[] }>(
    '/cases?queue=compliance',
    compliance,
  );
  const exceptions = await api<{ applicationId: string; orphanType: string }[]>('/admin/exceptions', ops);
  const audit = sp.entityId
    ? await api<{ rows: { occurred_at: string; action: string; rule_ids: string[]; actor_user_id?: string }[] }>(
        `/admin/audit?entityId=${sp.entityId}`,
        ops,
      )
    : null;

  async function createTenant(formData: FormData) {
    'use server';
    // TEN-010: onboarding gates (agreement, AML attestation, licence check)
    // are recorded before activation
    await api('/admin/tenants', { role: 'platform_ops' }, {
      body: { type: String(formData.get('type')), name: String(formData.get('name')) },
    });
    revalidatePath('/admin');
  }

  async function setStatus(formData: FormData) {
    'use server';
    await api(`/admin/tenants/${formData.get('id')}/status`, { role: 'platform_ops' }, {
      body: { status: String(formData.get('status')) },
    });
    revalidatePath('/admin');
  }

  async function disposition(formData: FormData) {
    'use server';
    await api(`/cases/${formData.get('caseId')}/screening-disposition`, { role: 'compliance_officer', userId: 'demo-compliance' }, {
      body: { disposition: String(formData.get('disposition')), note: String(formData.get('note')) },
    });
    revalidatePath('/admin');
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1>Platform Admin Portal</h1>

      <h2>Tenants (AD-01 — TEN-010..012)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Name</th><th>Type</th><th>Status</th><th /></tr></thead>
        <tbody>
          {tenants.rows.map((tn) => (
            <tr key={tn.id}>
              <td>{tn.name}</td><td>{tn.type}</td><td>{tn.status}</td>
              <td>
                <form action={setStatus} style={{ display: 'inline' }}>
                  <input type="hidden" name="id" value={tn.id} />
                  <select name="status" defaultValue={tn.status}>
                    <option value="pending">pending</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="offboarded">offboarded</option>
                  </select>
                  <button type="submit">Set</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={createTenant}>
        <select name="type">
          <option value="broker">broker</option>
          <option value="typing_centre">typing_centre</option>
          <option value="insurer">insurer</option>
          <option value="affiliate">affiliate</option>
        </select>
        <input name="name" placeholder="tenant name" required />
        <button type="submit">Create (pending — gates apply, TEN-010)</button>
      </form>

      <h2>Compliance workbench (AD-03 — KYC-012 dispositions)</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Case</th><th>Triggers</th><th>State</th><th>Disposition</th></tr></thead>
        <tbody>
          {complianceCases.rows.filter((c) => c.state !== 'closed').map((c) => (
            <tr key={c.id}>
              <td><code>{c.id.slice(0, 8)}</code></td>
              <td>{c.trigger_rule_ids.join(', ')}</td>
              <td>{c.state}</td>
              <td>
                <form action={disposition}>
                  <input type="hidden" name="caseId" value={c.id} />
                  <select name="disposition">
                    <option value="false_positive">False positive (whitelist)</option>
                    <option value="confirmed">Confirmed match (decline + STR)</option>
                  </select>
                  <input name="note" placeholder="note" required />
                  <button type="submit">Disposition</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Exceptions — three-way match orphans (AD-08 / PAY-030)</h2>
      <ul>
        {exceptions.length === 0 && <li>none 🎉</li>}
        {exceptions.map((e, i) => (
          <li key={i}><code>{e.applicationId.slice(0, 8)}</code> — {e.orphanType}</li>
        ))}
      </ul>

      <h2>Audit viewer (AD-07 / MIS-010)</h2>
      <form>
        <input name="entityId" placeholder="application id / policy number" defaultValue={sp.entityId} />
        <button type="submit">Search</button>
      </form>
      {audit && (
        <table border={1} cellPadding={4}>
          <thead><tr><th>When</th><th>Action</th><th>Rules</th><th>Actor</th></tr></thead>
          <tbody>
            {audit.rows.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.occurred_at).toLocaleString()}</td>
                <td>{e.action}</td>
                <td>{e.rule_ids.join(', ')}</td>
                <td>{e.actor_user_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
