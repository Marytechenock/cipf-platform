import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTemporaryAdminPassword } from './temporaryAdminPassword';

test('temporary admin password suggestions use 20 random characters from all required groups', () => {
  const suggestions = Array.from({ length: 3 }, generateTemporaryAdminPassword);
  assert.equal(new Set(suggestions).size, 3);
  for (const password of suggestions) {
    assert.equal(password.length, 20);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /\d/);
    assert.match(password, /[!@#$%&*?]/);
    assert.ok(Buffer.byteLength(password) <= 72);
  }
});
