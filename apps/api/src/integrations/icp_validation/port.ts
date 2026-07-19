/**
 * ICP Validation Gateway port (INT-G1 / KYC-001): the authoritative identity
 * control — genuine card, active status, data match. OCR/manual capture is
 * never sufficient on its own. Real adapter is an M5-T1 task gated on the ICP
 * cooperation contract.
 */
export type IcpResult = 'pass' | 'mismatch' | 'expired' | 'not_found';

export interface IcpValidationPort {
  validate(input: {
    eid: string;
    fullName: string;
    dob: string;
    nationality: string;
  }): Promise<{ result: IcpResult }>;
}
