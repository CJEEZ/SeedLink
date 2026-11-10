const STATUS_LABELS = {
  approved: 'approved',
  in_transit: 'on the way',
  delivered: 'delivered',
};

function createStatusNotification(seedName, status) {
  const label = STATUS_LABELS[status];
  if (!label) return null;

  const safeSeedName = String(seedName ?? 'seeds')
    .replace(/[^\w\s'-]/g, '')
    .trim()
    .slice(0, 40) || 'seeds';

  return {
    title: 'SeedLink request update',
    body: `Your ${safeSeedName} request is ${label}. Sign in to SeedLink for details.`,
  };
}

function chunkTokens(tokens, chunkSize = 500) {
  const chunks = [];
  for (let index = 0; index < tokens.length; index += chunkSize) {
    chunks.push(tokens.slice(index, index + chunkSize));
  }
  return chunks;
}

function isInvalidRegistrationToken(errorCode) {
  return errorCode === 'messaging/invalid-registration-token'
    || errorCode === 'messaging/registration-token-not-registered';
}

module.exports = {
  chunkTokens,
  createStatusNotification,
  isInvalidRegistrationToken,
};
