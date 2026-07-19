import { api, demoTenant } from '../../../../../lib/api';

// TC-04: print pack — allowed only after "Active & registered" (PAY-022);
// reprints are audit-logged server-side.
export default async function PrintPack({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await demoTenant('typing_centre');
  const view = await api<{
    application: { id: string; state: string; regime: string; language: string };
    quote?: { premium_aed: string };
    tracker: { visaReady: boolean };
  }>(`/applications/${id}`, { role: 'operator', tenantId });

  if (!['registered', 'delivered'].includes(view.application.state)) {
    return <main><p>Pack available only after the policy is Active &amp; registered (PAY-022).</p></main>;
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <style>{`@media print { button { display: none } }`}</style>
      <h1>Policy Pack</h1>
      <p>Application <code>{view.application.id}</code> — regime {view.application.regime}</p>
      <p>Premium: AED {view.quote?.premium_aed} (incl. VAT)</p>
      <ul>
        <li>Policy schedule (insurer document — REG-003)</li>
        <li>E-card</li>
        <li>Receipt (PAY-012)</li>
        <li>Benefit summary ({view.application.language} + Arabic)</li>
      </ul>
      <p>Status: Active &amp; registered (visa-ready) ✓</p>
      <button>Print</button>
    </main>
  );
}
