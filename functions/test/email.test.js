const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestEventEmail, getRequestEmailEvents } = require('../src/email');

test('notifies farmers when a pending request is submitted', () => {
  const events = getRequestEmailEvents(null, { status: 'pending', deliveryVerified: false });
  assert.deepEqual(events, [{
    key: 'request_submitted',
    headline: 'Your request was submitted',
    detail: 'We have received your seed request. The administrator will review it.',
  }]);
});

test('notifies farmers about every request status outcome', () => {
  const cases = [
    ['approved', 'approved', 'The administrator approved your request.'],
    ['rejected', 'not approved', 'The administrator could not approve your request. Sign in to SeedLink or contact customer service for help.'],
    ['in_transit', 'on the way', 'Your order is in transit.'],
    ['delivered', 'delivered', 'Your order has been marked as delivered. Please sign in to confirm when you receive it.'],
  ];

  for (const [status, label, detail] of cases) {
    assert.deepEqual(getRequestEmailEvents(
      { status: 'pending', deliveryVerified: false },
      { status, deliveryVerified: false },
    ), [{
      key: `status_${status}`,
      headline: `Your request was ${label}`,
      detail,
    }]);
  }
});

test('notifies farmers when they confirm delivery and ignores unrelated edits', () => {
  assert.deepEqual(getRequestEmailEvents(
    { status: 'delivered', deliveryVerified: false },
    { status: 'delivered', deliveryVerified: true },
  ), [{
    key: 'delivery_confirmed',
    headline: 'You confirmed receipt of your order',
    detail: 'Thank you for confirming that your order arrived.',
  }]);
  assert.deepEqual(getRequestEmailEvents(
    { status: 'approved', deliveryVerified: false, freightNote: 'before' },
    { status: 'approved', deliveryVerified: false, freightNote: 'after' },
  ), []);
  assert.deepEqual(getRequestEmailEvents(
    { status: 'delivered', deliveryVerified: true },
    { status: 'delivered', deliveryVerified: true },
  ), []);
});

test('creates safe, bounded email content for a request event', () => {
  const email = createRequestEventEmail('<img src=x onerror=alert(1)>', {
    headline: 'Your request was approved',
    detail: 'The administrator approved your request.',
  });
  assert.equal(email.html.includes('<img'), false);
  assert.match(email.subject, /^SeedLink update:/);
  assert.ok(email.text.length < 300);
  assert.equal(createRequestEventEmail('Rice', { headline: 'Bad', detail: null }), null);
});

test('uses a fallback seed name when the request name is empty', () => {
  assert.equal(createRequestEventEmail(' ', {
    headline: 'Your request was submitted',
    detail: 'We received the request.',
  }).text, 'Your request was submitted: seeds\n\nWe received the request.\n\nSign in to SeedLink to view your request details.');
});

test('ignores deleted requests and unsupported status values', () => {
  assert.deepEqual(getRequestEmailEvents({ status: 'pending' }, null), []);
  assert.deepEqual(getRequestEmailEvents(
    { status: 'pending', deliveryVerified: false },
    { status: 'unknown', deliveryVerified: false },
  ), []);
});

test('escapes all HTML special characters', () => {
  const email = createRequestEventEmail('Rice & "corn"', {
    headline: 'Request update',
    detail: 'Farmer\'s request <updated>.',
  });
  assert.equal(email.html.includes('Rice &amp; &quot;corn&quot;'), true);
  assert.equal(email.html.includes('Farmer&#39;s request &lt;updated&gt;.'), true);
});
