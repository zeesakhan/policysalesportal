import { isRtl, t, type Locale } from '@psp/shared';
import { revalidatePath } from 'next/cache';
import { api, demoTenant, type ApiCtx } from '../../../../lib/api';

// The engine screens SC-03..SC-10, state-driven: ONE flow for every channel
// (WP-13 §1). Channel wrappers pass their own role via ?as= (mock auth).
interface AppView {
  application: {
    id: string;
    state: string;
    regime: string;
    product_track: string;
    decline_reason?: string;
  };
  persons: { id: string; kind: string; full_name: string; declaration_status?: string }[];
  quote?: { id: string; premium_aed: string; kind: string; breakdown: { total: number; base: number; loadings: number; fees: number; vat: number; discount: number } };
  tracker: { paid: boolean; issued: boolean; visaReady: boolean; message?: string };
}

async function ctxFor(as?: string): Promise<ApiCtx> {
  if (as === 'operator') return { role: 'operator', tenantId: await demoTenant('typing_centre') };
  if (as === 'broker') return { role: 'broker_agent', tenantId: await demoTenant('broker') };
  return { role: 'platform_ops', tenantId: await demoTenant('platform') };
}

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; as?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = (sp.lang ?? 'en') as Locale;
  const as = sp.as;
  const ctx = await ctxFor(as);
  const view = await api<AppView>(`/applications/${id}`, ctx);
  const { application: app, tracker } = view;
  const qs = `?lang=${locale}${as ? `&as=${as}` : ''}`;

  async function act(formData: FormData) {
    'use server';
    const step = String(formData.get('step'));
    const c = await ctxFor(as);
    const { ApiError } = await import('../../../../lib/api');
    try {
      if (step === 'identity') {
        await api(`/applications/${id}/identity`, c, {
          body: {
            eid: formData.get('eid') ? String(formData.get('eid')) : undefined,
            passportNo: formData.get('passportNo') ? String(formData.get('passportNo')) : undefined,
            visaFileNo: formData.get('visaFileNo') ? String(formData.get('visaFileNo')) : undefined,
            fullName: String(formData.get('fullName')),
            dob: String(formData.get('dob')),
            gender: String(formData.get('gender')),
            nationality: String(formData.get('nationality')),
          },
        });
        await api(`/applications/${id}/details`, c, {
          body: {
            mobile: String(formData.get('mobile')),
            employmentCategory: String(formData.get('employmentCategory')),
            sponsorType: String(formData.get('sponsorType')),
            salaryBand: String(formData.get('salaryBand')),
            occupation: String(formData.get('occupation')),
            sponsorNoticeAcknowledged: formData.get('sponsorAck') === 'on', // UW-402
          },
        });
        await api(`/applications/${id}/screening`, c, {});
      } else if (step === 'quote') {
        await api(`/applications/${id}/quote`, c, {
          body: { productCode: String(formData.get('productCode')) },
        });
      } else if (step === 'declare') {
        const answers: Record<string, boolean> = {};
        for (const q of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) {
          answers[q] = formData.get(q) === 'on';
        }
        const person = view.persons.find((p) => !p.declaration_status);
        await api(`/applications/${id}/declaration`, c, {
          body: {
            personId: person!.id,
            answers,
            details: formData.get('condition')
              ? [{ question: 'D3', condition: String(formData.get('condition')) }]
              : undefined,
            maf: formData.get('maf') === 'on' ? { provided: true } : undefined,
            sensitiveConsent: formData.get('sensitiveConsent') === 'on', // REG-050
          },
        });
      } else if (step === 'decide') {
        await api(`/applications/${id}/decide`, c, {});
      } else if (step === 'attest-request') {
        await api(`/applications/${id}/attestations`, c, {
          body: { purpose: 'review', phone: String(formData.get('phone') ?? '+9715xxxxxxx') },
        });
      } else if (step === 'attest-verify') {
        const verified = await api<{ attestationId: string }>(`/attestations/verify`, c, {
          body: { challengeId: String(formData.get('challengeId')), code: String(formData.get('code')) },
        });
        const link = await api<{ paymentRef: string }>(`/applications/${id}/payment`, c, {
          body: { attestationId: verified.attestationId },
        });
        // demo shortcut: insurer confirms instantly, then issue + deliver
        await api(`/webhooks/payment`, c, { body: { providerRef: link.paymentRef, status: 'confirmed' } });
        await api(`/applications/${id}/issue`, c, {});
        await api(`/applications/${id}/deliver`, c, {});
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const { redirect } = await import('next/navigation');
        redirect(`/apply/${id}${qs}&error=${encodeURIComponent(err.category)}`);
      }
      throw err;
    }
    revalidatePath(`/apply/${id}`);
  }

  const catalogue = ['screened'].includes(app.state)
    ? await api<{ rows: { code: string; name: string; declaration_required: boolean }[] }>(
        `/catalogue?track=${app.product_track ?? ''}`,
        ctx,
      )
    : null;

  const lastSms =
    app.state === 'payment_pending'
      ? await api<{ last: { message: string } | null }>(`/dev/last-sms`, ctx)
      : null;

  return (
    <main dir={isRtl(locale) ? 'rtl' : 'ltr'} style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h1>{t(locale, 'portal.customer.title')}</h1>
      <p>
        Application <code>{app.id.slice(0, 8)}</code> — state <strong>{app.state}</strong>
        {app.regime ? ` · regime ${app.regime}` : ''}
      </p>
      {sp.error && <p role="alert">We could not proceed: {sp.error.replaceAll('_', ' ')}.</p>}

      {app.state === 'draft' && (
        <form action={act}>
          <input type="hidden" name="step" value="identity" />
          <h2>Your identity (SC-03/04)</h2>
          <label>Emirates ID <input name="eid" placeholder="784-XXXX-XXXXXXX-X" /></label><br />
          <label>Passport (if no EID) <input name="passportNo" /></label><br />
          <label>Visa file no. <input name="visaFileNo" /></label><br />
          <label>Full name <input name="fullName" required /></label><br />
          <label>Date of birth <input type="date" name="dob" required /></label><br />
          <label>Gender <select name="gender"><option>male</option><option>female</option></select></label><br />
          <label>Nationality <input name="nationality" required maxLength={2} placeholder="IN" /></label><br />
          <label>Mobile <input name="mobile" required placeholder="+9715…" /></label><br />
          <label>Employment <select name="employmentCategory">
            <option value="private_employee">Private employee</option>
            <option value="domestic_worker">Domestic worker</option>
            <option value="self_sponsored">Self-sponsored</option>
            <option value="freelancer">Freelancer</option>
          </select></label><br />
          <label>Sponsor <select name="sponsorType">
            <option value="employer">Employer</option>
            <option value="self">Self</option>
            <option value="family">Family</option>
          </select></label><br />
          <label>Monthly salary <select name="salaryBand">
            <option value="lt_4k">Below AED 4,000</option>
            <option value="4k_10k">AED 4,000–10,000</option>
            <option value="gt_10k">Above AED 10,000</option>
          </select></label><br />
          <label>Occupation <input name="occupation" required /></label><br />
          <label><input type="checkbox" name="sponsorAck" /> I acknowledge the sponsor-obligation notice (Abu Dhabi)</label><br />
          <button type="submit">{t(locale, 'common.continue')}</button>
        </form>
      )}

      {app.state === 'screened' && catalogue && (
        <form action={act}>
          <input type="hidden" name="step" value="quote" />
          <h2>Choose your plan (SC-06)</h2>
          {catalogue.rows.map((p) => (
            <label key={p.code} style={{ display: 'block', border: '1px solid #ccc', padding: 8, margin: 4 }}>
              <input type="radio" name="productCode" value={p.code} required /> {p.name}
              {p.declaration_required ? ' (health declaration applies)' : ' (instant final price)'}
            </label>
          ))}
          <button type="submit">{t(locale, 'common.continue')}</button>
        </form>
      )}

      {(app.state === 'quoted' || app.state === 'declared') && view.quote && (
        <section>
          <h2>Your price ({view.quote.kind})</h2>
          <p style={{ fontSize: '1.6em' }}>
            <strong>AED {view.quote.premium_aed}</strong> / year (incl. VAT)
          </p>
          <small>
            base {view.quote.breakdown.base} + loadings {view.quote.breakdown.loadings} + fees {view.quote.breakdown.fees} − discount {view.quote.breakdown.discount} + VAT {view.quote.breakdown.vat}
          </small>
          {app.state === 'quoted' && view.persons.some((p) => !p.declaration_status) && view.quote.kind === 'indicative' && (
            <form action={act}>
              <input type="hidden" name="step" value="declare" />
              <h3>Health declaration (SC-07)</h3>
              {(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const).map((q) => (
                <label key={q} style={{ display: 'block' }}>
                  <input type="checkbox" name={q} /> {q}: Yes
                </label>
              ))}
              <label>Condition (if any yes) <input name="condition" /></label><br />
              <label><input type="checkbox" name="maf" /> Full medical form provided</label><br />
              <label><input type="checkbox" name="sensitiveConsent" required /> I consent to processing my health data</label><br />
              <button type="submit">{t(locale, 'common.continue')}</button>
            </form>
          )}
          <form action={act}>
            <input type="hidden" name="step" value="decide" />
            <button type="submit">Get decision (S7)</button>
          </form>
        </section>
      )}

      {app.state === 'payment_pending' && (
        <section>
          <h2>Review & pay (SC-08/09)</h2>
          <form action={act}>
            <input type="hidden" name="step" value="attest-request" />
            <button type="submit">Send OTP to my phone</button>
          </form>
          {lastSms?.last && (
            <p><small>Dev mock SMS: {lastSms.last.message}</small></p>
          )}
          <form action={act}>
            <input type="hidden" name="step" value="attest-verify" />
            <label>Challenge ID <input name="challengeId" required /></label><br />
            <label>OTP code <input name="code" required /></label><br />
            <button type="submit">Attest & pay on insurer gateway</button>
          </form>
        </section>
      )}

      {['paid', 'issued', 'registered', 'delivered'].includes(app.state) && (
        <section>
          <h2>Status (SC-10)</h2>
          <ol>
            <li>{tracker.paid ? '✅' : '⬜'} Paid</li>
            <li>{tracker.issued ? '✅' : '⬜'} Policy issued</li>
            <li>{tracker.visaReady ? '✅' : '⬜'} Active &amp; registered (visa-ready)</li>
          </ol>
          {tracker.message && <p>{tracker.message}</p>}
        </section>
      )}

      {app.state === 'declined' && (
        <p role="alert">
          We are unable to offer this product ({app.decline_reason?.replaceAll('_', ' ')}).
        </p>
      )}
    </main>
  );
}
