const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chunkTokens,
  createStatusNotification,
  isInvalidRegistrationToken,
} = require('../src/push');

test('creates notification content only for supported request statuses', () => {
  assert.deepEqual(createStatusNotification('Rice seeds', 'approved'), {
    title: 'SeedLink request update',
    body: 'Your Rice seeds request is approved. Sign in to SeedLink for details.',
  });
  assert.equal(createStatusNotification('Corn', 'rejected'), null);
});

test('sanitizes and bounds seed names in notification content', () => {
  const notification = createStatusNotification('<script>alert(1)</script>', 'delivered');
  assert.equal(notification.body.includes('<'), false);
  assert.ok(notification.body.length < 150);
});

test('chunks token lists within Firebase multicast limits', () => {
  const tokens = Array.from({ length: 1001 }, (_, index) => String(index));
  const chunks = chunkTokens(tokens);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [500, 500, 1]);
  assert.deepEqual(chunks.flat(), tokens);
});

test('recognizes invalid FCM registration token errors', () => {
  assert.equal(isInvalidRegistrationToken('messaging/invalid-registration-token'), true);
  assert.equal(isInvalidRegistrationToken('messaging/registration-token-not-registered'), true);
  assert.equal(isInvalidRegistrationToken('messaging/server-unavailable'), false);
});
