import { ref, set, type Database } from 'firebase/database';

export function getEmailPreferenceReference(database: Database, uid: string) {
  return ref(database, `emailPreferences/${uid}`);
}

export async function saveEmailNotificationPreference(
  database: Database,
  uid: string,
  enabled: boolean,
): Promise<void> {
  await set(getEmailPreferenceReference(database, uid), {
    enabled,
    updatedAt: Date.now(),
  });
}
