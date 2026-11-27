import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdminWelcomeEmail } from './adminWelcomeEmail';

test('admin welcome email includes credentials and login link without HTML injection', () => {
  const message = buildAdminWelcomeEmail({
    firstName: '<Alex>', lastName: 'Admin', email: 'alex@example.com',
    temporaryPassword: 'T3mp<&Password!', loginUrl: 'https://vote.example.com/'
  });
  assert.match(message.text, /Temporary password: T3mp<&Password!/);
  assert.match(message.text, /Sign in: https:\/\/vote\.example\.com\//);
  assert.match(message.html, /&lt;Alex&gt;/);
  assert.match(message.html, /T3mp&lt;&amp;Password!/);
  assert.doesNotMatch(message.html, /<Alex>/);
});
