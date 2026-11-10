const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { logger } = require('firebase-functions');
const { onValueWritten } = require('firebase-functions/v2/database');
const { defineSecret, defineString } = require('firebase-functions/params');
const { createRequestEventEmail, getRequestEmailEvents } = require('./src/email');
const {
  chunkTokens,
  createStatusNotification,
  isInvalidRegistrationToken,
} = require('./src/push');

initializeApp();

const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFromEmail = defineString('RESEND_FROM_EMAIL');

exports.sendDeliveryStatusPush = onValueWritten({
  ref: '/allocationRequests/{requestId}',
  region: 'asia-southeast1',
  retry: true,
  timeoutSeconds: 60,
}, async (event) => {
  const before = event.data.before.val();
  const request = event.data.after.val();
  if (!request || before?.status === request.status) return;

  const notification = createStatusNotification(request.seedName, request.status);
  if (!notification || typeof request.requesterUid !== 'string') return;

  const database = getDatabase();
  const tokenSnapshot = await database
    .ref(`pushTokens/${request.requesterUid}`)
    .once('value');
  const tokenRecords = tokenSnapshot.val();
  if (!tokenRecords || typeof tokenRecords !== 'object') return;

  const notificationRef = database.ref(
    `pushNotificationEvents/${event.params.requestId}/${request.status}`,
  );
  const claim = await notificationRef.transaction((current) => {
    if (current?.state === 'sent') return;
    if (current?.state === 'sending' && Date.now() - Number(current.startedAt) < 5 * 60 * 1000) return;
    return {
      state: 'sending',
      attemptCount: (Number(current?.attemptCount) || 0) + 1,
      startedAt: Date.now(),
    };
  });
  if (!claim.committed) return;

  try {
    const records = Object.entries(tokenRecords)
      .filter(([, record]) => typeof record?.token === 'string' && record.token.length > 0);
    if (records.length === 0) {
      await notificationRef.update({ state: 'no_tokens', completedAt: Date.now() });
      return;
    }

    let successCount = 0;
    const invalidTokenRefs = [];
    for (const tokenChunk of chunkTokens(records)) {
      const response = await getMessaging().sendEachForMulticast({
        tokens: tokenChunk.map(([, record]) => record.token),
        notification,
        data: {
          requestId: event.params.requestId,
          status: request.status,
        },
        android: {
          priority: 'high',
          notification: { channelId: 'seedlink-updates' },
        },
        webpush: {
          notification: { icon: '/favicon.ico' },
        },
      });

      successCount += response.successCount;
      response.responses.forEach((result, index) => {
        if (!result.success && isInvalidRegistrationToken(result.error?.code)) {
          invalidTokenRefs.push(database.ref(
            `pushTokens/${request.requesterUid}/${tokenChunk[index][0]}`,
          ));
        }
      });

      if (response.failureCount === tokenChunk.length) {
        throw new Error('Firebase Cloud Messaging failed to deliver to every registered device.');
      }
    }

    await Promise.all(invalidTokenRefs.map((tokenRef) => tokenRef.remove()));
    await notificationRef.update({ state: 'sent', successCount, completedAt: Date.now() });
    logger.info('Delivery status push notification sent.', {
      requestId: event.params.requestId,
      status: request.status,
      successCount,
    });
  } catch (error) {
    await notificationRef.update({
      state: 'failed',
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown Firebase Cloud Messaging error.',
    });
    logger.error('Could not send delivery status push notification.', {
      requestId: event.params.requestId,
      status: request.status,
      error,
    });
    throw error;
  }
});

exports.sendFarmerRequestEventEmail = onValueWritten({
  ref: '/allocationRequests/{requestId}',
  region: 'asia-southeast1',
  retry: true,
  timeoutSeconds: 60,
  secrets: [resendApiKey],
}, async (event) => {
  const before = event.data.before.val();
  const request = event.data.after.val();
  const requestEvents = getRequestEmailEvents(before, request);
  if (requestEvents.length === 0 || typeof request.requesterUid !== 'string') return;

  const database = getDatabase();
  const preferenceSnapshot = await database
    .ref(`emailPreferences/${request.requesterUid}/enabled`)
    .once('value');
  if (preferenceSnapshot.val() !== true) return;

  const user = await getAuth().getUser(request.requesterUid);
  if (!user.email) {
    logger.warn('Delivery status email skipped because the account has no email address.', {
      requestId: event.params.requestId,
    });
    return;
  }

  const from = resendFromEmail.value().trim();
  if (!from) throw new Error('RESEND_FROM_EMAIL must be configured before email notifications can be sent.');

  for (const requestEvent of requestEvents) {
    const email = createRequestEventEmail(request.seedName, requestEvent);
    if (!email) continue;

    const notificationRef = database.ref(
      `emailNotificationEvents/${event.params.requestId}/${requestEvent.key}`,
    );
    const claim = await notificationRef.transaction((current) => {
      if (current?.state === 'sent') return;
      if (current?.state === 'sending' && Date.now() - Number(current.startedAt) < 5 * 60 * 1000) return;
      return {
        state: 'sending',
        attemptCount: (Number(current?.attemptCount) || 0) + 1,
        startedAt: Date.now(),
      };
    });
    if (!claim.committed) continue;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey.value()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${event.params.requestId}-${requestEvent.key}`,
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
      if (!response.ok) {
        const responseBody = await response.text();
        logger.error('Email provider rejected a farmer request notification.', {
          requestId: event.params.requestId,
          event: requestEvent.key,
          status: response.status,
          response: responseBody.slice(0, 1000),
        });
        throw new Error(`Resend rejected the email request with HTTP ${response.status}.`);
      }

      await notificationRef.update({ state: 'sent', completedAt: Date.now() });
      logger.info('Farmer request email sent.', {
        requestId: event.params.requestId,
        event: requestEvent.key,
      });
    } catch (error) {
      await notificationRef.update({
        state: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown email delivery error.',
      });
      logger.error('Could not send farmer request email.', {
        requestId: event.params.requestId,
        event: requestEvent.key,
        error,
      });
      throw error;
    }
  }
});
