import { makeTestEid } from '../testing/make-eid';

/**
 * UAT-PLAN.md §2 — synthetic personas covering every branch. Never real
 * EIDs (all generated via makeTestEid, Luhn-valid but fabricated).
 */
export interface Persona {
  id: string;
  label: string;
  scenario: string;
  eid?: string;
  fullName: string;
  dob: string;
  gender: string;
  nationality: string;
  emirateOfVisa: 'dubai' | 'sharjah' | 'abu_dhabi' | 'ajman' | 'umm_al_quwain' | 'ras_al_khaimah' | 'fujairah';
  visaStatus: 'active' | 'in_process' | 'visit';
  employmentCategory: 'private_employee' | 'domestic_worker' | 'self_sponsored' | 'freelancer' | 'dependent';
  sponsorType: 'employer' | 'self' | 'family';
  salaryBand: 'lt_4k' | '4k_10k' | 'gt_10k';
  occupation: string;
}

let serial = 500000;
const nextSerial = () => serial++;

function persona(p: Omit<Persona, 'eid'> & { eid?: string }): Persona {
  return { eid: p.eid ?? makeTestEid(Number(p.dob.slice(0, 4)), nextSerial()), ...p };
}

export const PERSONAS: Record<string, Persona> = {
  P01: persona({
    id: 'P01', label: 'Federal worker age 40, clean', scenario: 'U-10',
    fullName: 'Federal Worker Forty', dob: '1986-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'driver',
  }),
  P02: persona({
    id: 'P02', label: 'Federal age 66', scenario: 'U-11',
    fullName: 'Federal Senior Sixtysix', dob: '1960-01-01', gender: 'male', nationality: 'PK',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'guard',
  }),
  P03: persona({
    id: 'P03', label: 'Federal, declared diabetes', scenario: 'U-12',
    fullName: 'Federal Diabetes Case', dob: '1985-01-01', gender: 'male', nationality: 'BD',
    emirateOfVisa: 'ajman', visaStatus: 'active',
    employmentCategory: 'domestic_worker', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'cleaner',
  }),
  P04: persona({
    id: 'P04', label: 'Freelancer', scenario: 'U-13',
    fullName: 'Freelance Federal', dob: '1990-01-01', gender: 'female', nationality: 'PH',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'freelancer', sponsorType: 'self', salaryBand: 'lt_4k', occupation: 'designer',
  }),
  P05: persona({
    id: 'P05', label: 'Dubai salary 3,500', scenario: 'U-20',
    fullName: 'Dubai Ebp Worker', dob: '1988-01-01', gender: 'male', nationality: 'NP',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'waiter',
  }),
  P06: persona({
    id: 'P06', label: 'Dubai salary 9,000 → enhanced', scenario: 'U-21',
    fullName: 'Dubai Enhanced Worker', dob: '1988-01-01', gender: 'male', nationality: 'NP',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'engineer',
  }),
  P07: persona({
    id: 'P07', label: 'Married female EBP buyer', scenario: 'U-23',
    fullName: 'Married Female Ebp', dob: '1990-05-05', gender: 'female', nationality: 'PH',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'nurse',
  }),
  P09: persona({
    id: 'P09', label: 'AD employee w/ spouse+3 kids', scenario: 'U-30',
    fullName: 'AD Employee Family', dob: '1984-01-01', gender: 'male', nationality: 'EG',
    emirateOfVisa: 'abu_dhabi', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'technician',
  }),
  P11: persona({
    id: 'P11', label: 'Enhanced clean 35/BMI 24', scenario: 'U-40',
    fullName: 'Enhanced Clean Case', dob: '1991-01-01', gender: 'male', nationality: 'GB',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'manager',
  }),
  P12: persona({
    id: 'P12', label: 'Controlled hypertension', scenario: 'U-41',
    fullName: 'Hypertension Controlled', dob: '1980-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'accountant',
  }),
  P13: persona({
    id: 'P13', label: 'Cancer history', scenario: 'U-42',
    fullName: 'Cancer History Case', dob: '1975-01-01', gender: 'female', nationality: 'ZA',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'consultant',
  }),
  P14: persona({
    id: 'P14', label: 'BMI 38', scenario: 'U-45',
    fullName: 'High Bmi Case', dob: '1985-01-01', gender: 'male', nationality: 'US',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'chef',
  }),
  P15: persona({
    id: 'P15', label: 'Counter-offer acceptor', scenario: 'U-43',
    fullName: 'Counter Offer Acceptor', dob: '1982-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'engineer',
  }),
  P16: persona({
    id: 'P16', label: 'Counter-offer lapser', scenario: 'U-44',
    fullName: 'Counter Offer Lapser', dob: '1982-06-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'engineer',
  }),
  P17: persona({
    id: 'P17', label: 'Fuzzy watchlist name', scenario: 'U-50',
    fullName: 'Fuzzy WATCHLIST Match', dob: '1988-01-01', gender: 'male', nationality: 'SY',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'clerk',
  }),
  P18: persona({
    id: 'P18', label: 'Confirmed match', scenario: 'U-51',
    fullName: 'Confirmed SANCTIONED Person', dob: '1979-01-01', gender: 'male', nationality: 'IR',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'clerk',
  }),
  P20: persona({
    id: 'P20', label: 'Visit visa', scenario: 'U-02',
    fullName: 'Visit Visa Applicant', dob: '1990-01-01', gender: 'male', nationality: 'GB',
    emirateOfVisa: 'dubai', visaStatus: 'visit',
    employmentCategory: 'self_sponsored', sponsorType: 'self', salaryBand: 'gt_10k', occupation: 'tourist',
  }),
  P21: persona({
    id: 'P21', label: 'Bad EID checksum', scenario: 'U-03',
    fullName: 'Bad Checksum Applicant', dob: '1990-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'driver',
  }),
  P22: persona({
    id: 'P22', label: 'No-EID new arrival', scenario: 'U-04',
    fullName: 'New Arrival No Eid', dob: '1992-01-01', gender: 'male', nationality: 'NP',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'labourer',
  }),
  P23: persona({
    id: 'P23', label: 'Duplicate buyer', scenario: 'U-05',
    fullName: 'Duplicate Buyer', dob: '1990-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'driver',
  }),
  P24: persona({
    id: 'P24', label: 'Channel-shopper post-decline', scenario: 'U-74',
    fullName: 'Channel Shopper', dob: '1983-01-01', gender: 'male', nationality: 'IN',
    emirateOfVisa: 'dubai', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'gt_10k', occupation: 'salesman',
  }),
  P25: persona({
    id: 'P25', label: 'Cancel-refund abuser', scenario: 'U-83',
    fullName: 'Refund Abuser', dob: '1986-01-01', gender: 'female', nationality: 'IN',
    emirateOfVisa: 'sharjah', visaStatus: 'active',
    employmentCategory: 'private_employee', sponsorType: 'employer', salaryBand: 'lt_4k', occupation: 'cashier',
  }),
};
