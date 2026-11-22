import assert from 'node:assert/strict';
import test from 'node:test';
import { readVoterImportRows } from './voterImport';

test('reads the five voter fields from an Excel sheet with a numbering column and extras', () => {
  const table: unknown[][] = [
    ['#', 'Member / Employer Name', 'Identifier', 'Catetory Category', 'Employer / Employee Association', 'Eligibility to vote for', 'Notes'],
    [1, 'Steve Chivi', '22222222X22', 'Active Member', 'ZCATWU', 'Board Member Employee Representative only', 'ignore me'],
    [2, 'ABC CONSTRUCTIONS', 'FUND1400', 'Employer Representative', 'CIFOZ', 'Board Member Employer Representative (CIFOZ) only', 'ignore me']
  ];

  assert.deepEqual(readVoterImportRows(table), [
    { fullName: 'Steve Chivi', identifier: '22222222X22', memberCategory: 'Active Member', association: 'ZCATWU', eligibility: 'Board Member Employee Representative only' },
    { fullName: 'ABC CONSTRUCTIONS', identifier: 'FUND1400', memberCategory: 'Employer Representative', association: 'CIFOZ', eligibility: 'Board Member Employer Representative (CIFOZ) only' }
  ]);
});
