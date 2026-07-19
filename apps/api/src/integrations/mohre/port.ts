/**
 * MOHRE work-permit validation port (INT-G3 / KYC-001a): confirms
 * private-sector-employee / domestic-worker status for the federal Basic
 * Scheme population test. Real adapter is M5-T1, gated on access model.
 */
export interface MohrePort {
  checkWorkPermit(input: {
    eid?: string;
    passportNo?: string;
    category: 'private_employee' | 'domestic_worker';
  }): Promise<{ result: 'match' | 'no_record' }>;
}
