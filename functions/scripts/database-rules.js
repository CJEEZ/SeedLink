const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { get, ref, set, update } = require('firebase/database');

const projectId = process.env.GCLOUD_PROJECT || 'demo-seedlink';
const databaseRules = readFileSync(
  path.resolve(__dirname, '../../database.rules.json'),
  'utf8',
);

async function main() {
  const emulatorAddress = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9299';
  const [host, port] = emulatorAddress.split(':');
  const testEnvironment = await initializeTestEnvironment({
    projectId,
    database: {
      host,
      port: Number(port),
      rules: databaseRules,
    },
  });
  const uid = `push-rules-test-${Date.now()}`;

  try {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `users/${uid}`), {
        displayName: 'Test Farmer',
        role: 'farmer',
        municipality: 'Naujan',
        createdAt: new Date().toISOString(),
      });
    });

    const farmerDatabase = testEnvironment.authenticatedContext(uid).database();
    const emailPreferenceRef = ref(farmerDatabase, `emailPreferences/${uid}`);
    await assertSucceeds(set(emailPreferenceRef, {
      enabled: true,
      updatedAt: Date.now(),
    }));
    await assertFails(update(emailPreferenceRef, { enabled: 'yes' }));
    await assertFails(update(emailPreferenceRef, { updatedAt: 'now' }));
    await assertFails(update(emailPreferenceRef, { unexpected: true }));
    await assertFails(set(ref(farmerDatabase, `emailPreferences/${uid}/invalid`), true));

    const otherDatabase = testEnvironment.authenticatedContext('another-farmer').database();
    await assertFails(get(ref(otherDatabase, `emailPreferences/${uid}`)));

    const unauthenticatedDatabase = testEnvironment.unauthenticatedContext().database();
    await assertFails(set(ref(unauthenticatedDatabase, `emailPreferences/${uid}`), {
      enabled: true,
      updatedAt: Date.now(),
    }));

    const tokenRef = ref(farmerDatabase, `pushTokens/${uid}/test-device`);
    await assertSucceeds(set(tokenRef, {
      token: 'valid-fcm-registration-token',
      platform: 'web',
      updatedAt: Date.now(),
    }));

    await assertFails(update(tokenRef, { platform: 'ios' }));
    await assertFails(update(tokenRef, { unexpected: true }));

    await assertFails(get(ref(otherDatabase, `pushTokens/${uid}`)));

    await assertFails(set(ref(unauthenticatedDatabase, `pushTokens/${uid}/unauthorized`), {
      token: 'valid-fcm-registration-token',
      platform: 'web',
      updatedAt: Date.now(),
    }));

    await assertSucceeds(set(tokenRef, null));

    console.log('RTDB email preference and push-token rules passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
