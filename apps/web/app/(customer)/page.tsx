import { isRtl, t, type Locale } from '@psp/shared';

// Customer sales portal shell (WP-13 §1). The application engine screens
// (SC-01…SC-14) are built in M1 and embedded here; this shell only wraps them.
// Locale comes from SC-01 language selection once the engine screens land;
// until then the shell renders the EN reference catalog.
const locale: Locale = 'en';

export default function CustomerPortalHome() {
  return (
    <main dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <h1>{t(locale, 'portal.customer.title')}</h1>
      <p>{t(locale, 'portal.customer.tagline')}</p>
    </main>
  );
}
