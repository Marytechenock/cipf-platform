import type { ElectionCandidateCategory } from '../types';

export function parseVotingEligibility(value: unknown): ElectionCandidateCategory | null {
  const words = new Set(String(value ?? '').normalize('NFKC').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (words.has('employee') && words.has('representative') && !words.has('employer')) return 'employee_representative';
  if (words.has('employer') && words.has('representative') && words.has('cifoz')) return 'employer_cifoz';
  if (words.has('employer') && words.has('representative') && words.has('zbca')) return 'employer_zbca';
  return null;
}
