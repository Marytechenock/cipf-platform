import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVotingEligibility } from './electionEligibility';

test('maps the voter spreadsheet eligibility labels to one position', () => {
  assert.equal(parseVotingEligibility('Board Member Employee Representative only'), 'employee_representative');
  assert.equal(parseVotingEligibility('Board Member Employer Representative (CIFOZ) only'), 'employer_cifoz');
  assert.equal(parseVotingEligibility('Board Member Employer Representative (ZBCA) only'), 'employer_zbca');
  assert.equal(parseVotingEligibility('Board Member Employer  Representative (CIFOZ) only'), 'employer_cifoz');
  assert.equal(parseVotingEligibility('Board Member Employer\nRepresentative (ZBCA) only'), 'employer_zbca');
  assert.equal(parseVotingEligibility('Board Member Employer\u00a0Representative (CIFOZ) only'), 'employer_cifoz');
  assert.equal(parseVotingEligibility('Employer Representative only'), null);
});
