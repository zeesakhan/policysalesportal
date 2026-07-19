import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';

export const VAT_RATE = 0.05; // REG-062: VAT 5% on premiums

export interface QuoteOptions {
  network?: string; // enhanced only
  copay?: string;
  maternity?: boolean;
}

export interface QuoteLine {
  personId: string;
  name: string;
  ageBand?: string;
  base: number;
  loading: number;
}

export interface QuoteBreakdown {
  lines: QuoteLine[];
  base: number;
  loadings: number;
  discount: number;
  fees: number;
  vat: number;
  total: number;
  insurerName: string;
  productName: string;
  rateTableVersion: string;
  options: QuoteOptions;
}

interface RateMatrix {
  type: 'flat' | 'age_banded';
  ratePerLife?: number;
  fees: number;
  bands?: Record<string, number>;
  options?: {
    network: Record<string, number>;
    copay: Record<string, number>;
    maternityAddon: number;
  };
}

function ageBandFor(ageYears: number): string {
  if (ageYears < 18) return '0-17';
  if (ageYears <= 30) return '18-30';
  if (ageYears <= 45) return '31-45';
  if (ageYears <= 60) return '46-60';
  if (ageYears <= 65) return '61-65';
  return '66+';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * SC-06 — quote generation (QR-001..012). Community-rated tracks produce the
 * FINAL quote here (no medical rating — UW-206/304/403); enhanced products
 * produce an INDICATIVE quote that is re-rated after declarations (UW-506).
 * Per-life rating (QR-006); itemised base + loadings + fees + VAT (QR-003);
 * discounts only from insurer campaigns (QR-004/REG-005); validity 14 days
 * (QR-005); quote snapshots the rate-table version (QR-001/030).
 */
export async function generateQuote(
  exec: SqlExec,
  args: {
    applicationId: string;
    tenantId: string;
    actingUserId?: string;
    productCode: string;
    options?: QuoteOptions;
    promoCode?: string;
    /** UW-506 per-person loading pct applied on re-rate after declarations. */
    loadingPctByPerson?: Record<string, number>;
    /** 'final' forced by the declaration re-rate path. */
    kindOverride?: 'final' | 'indicative';
  },
): Promise<{ quoteId: string; kind: 'final' | 'indicative'; breakdown: QuoteBreakdown }> {
  const app = await exec.query<{ regime: string; product_track: string; state: string }>(
    'SELECT regime, product_track, state FROM applications WHERE id = $1',
    [args.applicationId],
  );
  if (app.rows.length === 0) throw new Error(`application ${args.applicationId} not found`);
  const { regime, product_track: track, state } = app.rows[0]!;

  const product = await exec.query<{
    code: string;
    insurer_name: string;
    name: string;
    track: string;
    regime: string;
    declaration_required: boolean;
    status: string;
  }>('SELECT * FROM products WHERE code = $1', [args.productCode]);
  if (product.rows.length === 0 || product.rows[0]!.status !== 'live') {
    throw new JourneyRuleError('QR-001', `product ${args.productCode} is not live`);
  }
  const p = product.rows[0]!;
  // UW-103/UW-303: regime-filtered catalogue only — a product may only be
  // quoted on an application routed to its track
  if (p.track !== track) {
    throw new JourneyRuleError(
      'UW-103',
      `product track ${p.track} does not match application track ${track}`,
    );
  }
  if (p.regime !== 'all' && p.regime !== regime) {
    throw new JourneyRuleError('UW-103', `product regime ${p.regime} does not match ${regime}`);
  }

  const rate = await exec.query<{ version: string; matrix: RateMatrix }>(
    `SELECT version, matrix FROM rate_tables
     WHERE product_code = $1 AND status = 'active' ORDER BY effective_from DESC LIMIT 1`,
    [args.productCode],
  );
  if (rate.rows.length === 0) throw new JourneyRuleError('QR-001', 'no active rate table');
  const { version, matrix } = rate.rows[0]!;

  const lives = await exec.query<{ id: string; full_name: string; dob: string | null }>(
    'SELECT id, full_name, dob FROM persons WHERE application_id = $1',
    [args.applicationId],
  );
  if (lives.rows.length === 0) throw new JourneyRuleError('QR-006', 'no insured lives captured');

  const options = args.options ?? {};
  const lines: QuoteLine[] = lives.rows.map((life) => {
    let base: number;
    let ageBand: string | undefined;
    if (matrix.type === 'flat') {
      base = matrix.ratePerLife!;
    } else {
      const age = life.dob
        ? (Date.now() - new Date(life.dob).getTime()) / (365.25 * 24 * 3600_000)
        : 30;
      ageBand = ageBandFor(age);
      base = matrix.bands![ageBand]!;
      const networkMult = matrix.options!.network[options.network ?? 'GN'] ?? 1;
      const copayMult = matrix.options!.copay[options.copay ?? '20'] ?? 1;
      base = base * networkMult * copayMult;
      if (options.maternity) base += matrix.options!.maternityAddon;
    }
    const loadingPct = args.loadingPctByPerson?.[life.id] ?? 0;
    return {
      personId: life.id,
      name: life.full_name,
      ageBand,
      base: round2(base),
      loading: round2((base * loadingPct) / 100),
    };
  });

  const baseSum = round2(lines.reduce((s, l) => s + l.base, 0));
  const loadings = round2(lines.reduce((s, l) => s + l.loading, 0));

  // QR-004: promo codes map to insurer campaigns only
  let discount = 0;
  if (args.promoCode) {
    const campaign = await exec.query<{ percent_off: string }>(
      `SELECT percent_off FROM campaigns
       WHERE code = $1 AND (product_code IS NULL OR product_code = $2)
         AND valid_from <= current_date AND valid_to >= current_date`,
      [args.promoCode, args.productCode],
    );
    if (campaign.rows.length === 0) {
      throw new JourneyRuleError('QR-004', 'promo code is not a valid insurer campaign');
    }
    discount = round2(((baseSum + loadings) * Number(campaign.rows[0]!.percent_off)) / 100);
  }

  const fees = matrix.fees;
  const netPremium = baseSum + loadings - discount + fees;
  const vat = round2(netPremium * VAT_RATE);
  const total = round2(netPremium + vat);

  const kind =
    args.kindOverride ?? (p.declaration_required ? ('indicative' as const) : ('final' as const));

  const breakdown: QuoteBreakdown = {
    lines,
    base: baseSum,
    loadings,
    discount,
    fees,
    vat,
    total,
    insurerName: p.insurer_name,
    productName: p.name,
    rateTableVersion: version,
    options,
  };

  // QR-030: a new quote supersedes previous active quotes — never mutate
  await exec.query(
    `UPDATE quotes SET status = 'superseded' WHERE application_id = $1 AND status = 'active'`,
    [args.applicationId],
  );
  const inserted = await exec.query<{ id: string }>(
    `INSERT INTO quotes (tenant_id, application_id, rate_table_version, premium_aed, product_code,
                         kind, breakdown, valid_until, promo_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '14 days', $8) RETURNING id`,
    [
      args.tenantId,
      args.applicationId,
      version,
      total,
      args.productCode,
      kind,
      JSON.stringify(breakdown),
      args.promoCode ?? null,
    ],
  );

  if (state === 'screened') {
    await transitionApplication(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      from: 'screened',
      to: 'quoted',
    });
  }

  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'quote.generated',
    entityType: 'quote',
    entityId: inserted.rows[0]!.id,
    after: { kind, total, version, productCode: args.productCode },
    ruleIds: ['QR-001', 'QR-003', 'QR-005', 'QR-006', 'REG-062'],
  });

  return { quoteId: inserted.rows[0]!.id, kind, breakdown };
}

/**
 * QR-005/QR-030 — re-quote on resume: expired quotes (or a rate-table version
 * change) re-rate with the current table; paid applications keep their quoted
 * price and are never re-rated.
 */
export async function requoteIfStale(
  exec: SqlExec,
  args: { applicationId: string; tenantId: string; quoteId: string },
): Promise<{ requoted: boolean; oldTotal?: number; newTotal?: number; quoteId: string }> {
  const q = await exec.query<{
    id: string;
    product_code: string;
    rate_table_version: string;
    premium_aed: string;
    valid_until: string;
    promo_code: string | null;
    breakdown: QuoteBreakdown;
  }>('SELECT * FROM quotes WHERE id = $1', [args.quoteId]);
  if (q.rows.length === 0) throw new Error('quote not found');
  const quote = q.rows[0]!;

  const app = await exec.query<{ state: string }>(
    'SELECT state FROM applications WHERE id = $1',
    [args.applicationId],
  );
  const paidStates = ['paid', 'issued', 'registered', 'delivered'];
  if (paidStates.includes(app.rows[0]!.state)) {
    // QR-030: in-flight PAID applications honour the quoted price
    return { requoted: false, quoteId: quote.id };
  }

  const current = await exec.query<{ version: string }>(
    `SELECT version FROM rate_tables WHERE product_code = $1 AND status = 'active'
     ORDER BY effective_from DESC LIMIT 1`,
    [quote.product_code],
  );
  const expired = new Date(quote.valid_until).getTime() < Date.now();
  const versionChanged = current.rows[0]!.version !== quote.rate_table_version;
  if (!expired && !versionChanged) return { requoted: false, quoteId: quote.id };

  const fresh = await generateQuote(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    productCode: quote.product_code,
    options: quote.breakdown.options,
    promoCode: quote.promo_code ?? undefined,
  });
  // QR-005: if price increased, show old vs new transparently
  return {
    requoted: true,
    oldTotal: Number(quote.premium_aed),
    newTotal: fresh.breakdown.total,
    quoteId: fresh.quoteId,
  };
}
