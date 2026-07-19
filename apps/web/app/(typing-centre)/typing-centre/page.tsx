import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, demoTenant } from '../../../lib/api';

// Typing centre portal (WP-13 TC-01..TC-04): dashboard + consent-first new
// application (TC-02a / JB-02) + application list. Operator context.
export default async function TypingCentrePortal({
  searchParams,
}: {
  searchParams: Promise<{ challengeId?: string; appId?: string }>;
}) {
  const sp = await searchParams;
  const tenantId = await demoTenant('typing_centre');
  const ctx = { role: 'operator' as const, tenantId };
  const apps = await api<{ rows: { id: string; state: string; regime: string; created_at: string }[] }>(
    '/applications',
    ctx,
  );

  async function startWithConsent(formData: FormData) {
    'use server';
    const tenant = await demoTenant('typing_centre');
    const c = { role: 'operator', tenantId: tenant };
    // TC-02a: consent screen FIRST — OTP to the customer's own phone (JB-02)
    const started = await api<{ applicationId: string }>('/applications', c, {
      body: { channel: 'typing_centre', language: String(formData.get('lang')), privacyConsent: true },
    });
    const challenge = await api<{ challengeId: string }>(
      `/applications/${started.applicationId}/attestations`,
      c,
      { body: { purpose: 'consent', phone: String(formData.get('phone')) } },
    );
    redirect(`/typing-centre?challengeId=${challenge.challengeId}&appId=${started.applicationId}`);
  }

  async function verifyConsent(formData: FormData) {
    'use server';
    const tenant = await demoTenant('typing_centre');
    const c = { role: 'operator', tenantId: tenant };
    await api(`/attestations/verify`, c, {
      body: { challengeId: String(formData.get('challengeId')), code: String(formData.get('code')) },
    });
    const appId = String(formData.get('appId'));
    await api(`/applications/${appId}/regime`, c, {
      body: { emirateOfVisa: String(formData.get('emirate')), visaStatus: 'active' },
    });
    redirect(`/apply/${appId}?as=operator`);
  }

  async function refresh() {
    'use server';
    revalidatePath('/typing-centre');
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h1>Typing Centre Portal</h1>

      <h2>New application — customer consent first (TC-02a)</h2>
      {!sp.challengeId ? (
        <form action={startWithConsent}>
          <label>Customer language <select name="lang">
            <option value="ur">Urdu</option><option value="hi">Hindi</option>
            <option value="bn">Bengali</option><option value="en">English</option><option value="ar">Arabic</option>
          </select></label>{' '}
          <label>Customer mobile <input name="phone" required placeholder="+9715…" /></label>{' '}
          <button type="submit">Send consent OTP</button>
        </form>
      ) : (
        <form action={verifyConsent}>
          <input type="hidden" name="challengeId" value={sp.challengeId} />
          <input type="hidden" name="appId" value={sp.appId} />
          <label>OTP from customer’s phone <input name="code" required /></label>{' '}
          <label>Visa emirate <select name="emirate">
            <option value="sharjah">Sharjah</option><option value="dubai">Dubai</option>
            <option value="abu_dhabi">Abu Dhabi</option><option value="ajman">Ajman</option>
            <option value="ras_al_khaimah">RAK</option><option value="fujairah">Fujairah</option>
            <option value="umm_al_quwain">UAQ</option>
          </select></label>{' '}
          <button type="submit">Confirm consent & continue</button>
        </form>
      )}

      <h2>Centre applications (TC-03 — declaration content never shown)</h2>
      <form action={refresh}><button type="submit">Refresh</button></form>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Application</th><th>State</th><th>Regime</th><th /><th /></tr></thead>
        <tbody>
          {apps.rows.map((a) => (
            <tr key={a.id}>
              <td><code>{a.id.slice(0, 8)}</code></td>
              <td>{a.state}</td>
              <td>{a.regime ?? '—'}</td>
              <td><a href={`/apply/${a.id}?as=operator`}>open</a></td>
              <td>{['registered', 'delivered'].includes(a.state) && (
                <a href={`/typing-centre/print/${a.id}`}>print pack</a>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
