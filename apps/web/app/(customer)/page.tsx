import { isRtl, LOCALES, t, type Locale } from '@psp/shared';
import { redirect } from 'next/navigation';
import { api, demoTenant } from '../../lib/api';

// Customer sales portal (WP-13 SC-01/SC-02): language + consent + regime
// routing. Mobile-first; price-first journey continues at /apply/[id].
export default async function CustomerPortalHome({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; aff?: string; declined?: string }>;
}) {
  const params = await searchParams;
  const locale = (LOCALES.includes(params.lang as Locale) ? params.lang : 'en') as Locale;
  const affiliateCode = params.aff;

  async function start(formData: FormData) {
    'use server';
    // Direct channel: the licensed entity itself is the transacting tenant
    const tenantId = await demoTenant('platform');
    const ctx = { role: 'platform_ops', tenantId };
    const started = await api<{ applicationId: string }>('/applications', ctx, {
      body: {
        channel: 'direct',
        language: String(formData.get('lang')),
        affiliateCode: formData.get('aff') ? String(formData.get('aff')) : undefined,
        privacyConsent: formData.get('consent') === 'on', // REG-050
      },
    });
    const routed = await api<{ declined: boolean }>(
      `/applications/${started.applicationId}/regime`,
      ctx,
      {
        body: {
          emirateOfVisa: String(formData.get('emirate')),
          visaStatus: String(formData.get('visaStatus')), // UW-101 gate
        },
      },
    );
    if (routed.declined) redirect(`/?lang=${formData.get('lang')}&declined=1`);
    redirect(`/apply/${started.applicationId}?lang=${formData.get('lang')}`);
  }

  return (
    <main dir={isRtl(locale) ? 'rtl' : 'ltr'} style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1>{t(locale, 'portal.customer.title')}</h1>
      <p>{t(locale, 'portal.customer.tagline')}</p>

      <nav aria-label={t(locale, 'sc01.language.label')}>
        {LOCALES.map((l) => (
          <a key={l} href={`/?lang=${l}${affiliateCode ? `&aff=${affiliateCode}` : ''}`} style={{ marginInlineEnd: 12 }}>
            {l.toUpperCase()}
          </a>
        ))}
      </nav>

      {params.declined && (
        // SC-14 / J-R4: category only
        <p role="alert">Visit/tourist visas are not eligible for these mandatory products.</p>
      )}

      <form action={start}>
        <input type="hidden" name="lang" value={locale} />
        {affiliateCode && <input type="hidden" name="aff" value={affiliateCode} />}
        <h2>{t(locale, 'sc02.title')}</h2>
        <label>
          {t(locale, 'sc02.emirate.label')}
          <select name="emirate" required>
            <option value="dubai">Dubai</option>
            <option value="abu_dhabi">Abu Dhabi</option>
            <option value="sharjah">Sharjah</option>
            <option value="ajman">Ajman</option>
            <option value="umm_al_quwain">Umm Al Quwain</option>
            <option value="ras_al_khaimah">Ras Al Khaimah</option>
            <option value="fujairah">Fujairah</option>
          </select>
        </label>
        <small>{t(locale, 'sc02.emirate.help')}</small>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t(locale, 'sc02.visa_status.label')}
          <select name="visaStatus" required>
            <option value="active">Active</option>
            <option value="in_process">In process</option>
            <option value="visit">Visit / tourist</option>
          </select>
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          <input type="checkbox" name="consent" required /> {t(locale, 'sc01.consent.label')}
        </label>
        <button type="submit" style={{ marginTop: 12 }}>{t(locale, 'common.continue')}</button>
      </form>
    </main>
  );
}
