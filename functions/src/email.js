const STATUS_DETAILS = {
  approved: {
    label: 'approved',
    detail: 'The administrator approved your request.',
  },
  rejected: {
    label: 'not approved',
    detail: 'The administrator could not approve your request. Sign in to SeedLink or contact customer service for help.',
  },
  in_transit: {
    label: 'on the way',
    detail: 'Your order is in transit.',
  },
  delivered: {
    label: 'delivered',
    detail: 'Your order has been marked as delivered. Please sign in to confirm when you receive it.',
  },
};

function getRequestEmailEvents(before, after) {
  if (!after || typeof after !== 'object') return [];

  const events = [];
  if (!before && after.status === 'pending') {
    events.push({
      key: 'request_submitted',
      headline: 'Your request was submitted',
      detail: 'We have received your seed request. The administrator will review it.',
    });
  } else if (before && before.status !== after.status && STATUS_DETAILS[after.status]) {
    const status = STATUS_DETAILS[after.status];
    events.push({
      key: `status_${after.status}`,
      headline: `Your request was ${status.label}`,
      detail: status.detail,
    });
  }

  if (before && before.deliveryVerified !== true && after.deliveryVerified === true) {
    events.push({
      key: 'delivery_confirmed',
      headline: 'You confirmed receipt of your order',
      detail: 'Thank you for confirming that your order arrived.',
    });
  }

  return events;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function createRequestEventEmail(seedName, event) {
  if (!event || typeof event.headline !== 'string' || typeof event.detail !== 'string') return null;

  const safeSeedName = String(seedName ?? 'seeds')
    .trim()
    .slice(0, 80) || 'seeds';
  const headline = `${event.headline}: ${safeSeedName}`;
  const text = `${headline}\n\n${event.detail}\n\nSign in to SeedLink to view your request details.`;

  return {
    subject: `SeedLink update: ${event.headline.toLowerCase()}`,
    text,
    html: `<h1>${escapeHtml(headline)}</h1><p>${escapeHtml(event.detail)}</p><p>Sign in to SeedLink to view your request details.</p>`,
  };
}

module.exports = {
  createRequestEventEmail,
  getRequestEmailEvents,
};
