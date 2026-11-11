import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { onValue, runTransaction, set, type Unsubscribe } from 'firebase/database';
import { useEffect, useState, type ReactNode } from 'react';
import { auth, database, getConfiguredAuth } from '../firebase';
import { userProfileRef } from '../data/seedlink';
import { municipalities } from '../data/municipalities';
import { AuthContext, type AuthContextValue, type StakeholderRole, type UserProfile } from './authContextTypes';

const roles: StakeholderRole[] = ['admin', 'depot_manager', 'farmer', 'executive'];
const firebaseConfigWarning = 'SeedLink Firebase is not configured. Add the real Firebase Web API key to .env.local and restart the app.';
const DEMO_USERS_KEY = 'seedlink-demo-users';
const DEMO_ACTIVE_USER_KEY = 'seedlink-demo-active-user';

interface DemoUserRecord {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: StakeholderRole;
  municipality?: string;
  depot?: string;
}

function buildDemoUserRecord(partial: Partial<DemoUserRecord> & Pick<DemoUserRecord, 'uid' | 'email' | 'password' | 'displayName' | 'role'>): DemoUserRecord {
  return {
    municipality: undefined,
    depot: undefined,
    ...partial,
  };
}

function getDemoUsers(): Record<string, DemoUserRecord> {
  const storedUsers = window.localStorage.getItem(DEMO_USERS_KEY);

  if (storedUsers) {
    return JSON.parse(storedUsers) as Record<string, DemoUserRecord>;
  }

  const seededUsers: Record<string, DemoUserRecord> = {
    'admin@seedlink.test': buildDemoUserRecord({
      uid: 'seedlink-admin-demo',
      email: 'admin@seedlink.test',
      password: 'SeedLink123!',
      displayName: 'SeedLink Admin',
      role: 'admin',
      municipality: 'Calapan City',
    }),
    'farmer@seedlink.test': buildDemoUserRecord({
      uid: 'seedlink-farmer-demo',
      email: 'farmer@seedlink.test',
      password: 'SeedLink123!',
      displayName: 'Demo Farmer',
      role: 'farmer',
      municipality: 'Calapan City',
    }),
  };

  window.localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(seededUsers));
  return seededUsers;
}

function persistDemoUsers(users: Record<string, DemoUserRecord>) {
  window.localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

function setActiveDemoUser(email: string, uid: string) {
  window.localStorage.setItem(DEMO_ACTIVE_USER_KEY, JSON.stringify({ uid, email }));
}

function clearActiveDemoUser() {
  window.localStorage.removeItem(DEMO_ACTIVE_USER_KEY);
}

function getActiveDemoUser(): DemoUserRecord | null {
  const activeUser = window.localStorage.getItem(DEMO_ACTIVE_USER_KEY);
  if (!activeUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(activeUser) as { uid: string; email: string };
    const users = getDemoUsers();
    return users[parsed.email.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

function createMockUser(email: string, uid: string): User {
  return {
    uid,
    email,
    displayName: email.split('@')[0],
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: 'local-demo-token',
    tenantId: null,
    providerId: 'local-demo',
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
      a: 0,
      b: 0,
    },
    getIdToken: async () => 'local-demo-token',
    getIdTokenResult: async () => ({ token: 'local-demo-token' } as never),
    reload: async () => undefined,
    toJSON: () => ({ uid, email }),
    phoneNumber: null,
    photoURL: null,
  } as unknown as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [needsGoogleFarmerSetup, setNeedsGoogleFarmerSetup] = useState(false);

  useEffect(() => {
    const authInstance = auth;
    const databaseInstance = database;

    if (!authInstance || !databaseInstance) {
      const activeDemoUser = getActiveDemoUser();

      if (!activeDemoUser) {
        setUser(null);
        setProfile(null);
        setProfileError(firebaseConfigWarning);
        setNeedsGoogleFarmerSetup(false);
        setIsLoading(false);
        return;
      }

      const demoUser = createMockUser(activeDemoUser.email, activeDemoUser.uid);
      setUser(demoUser);
      setProfile({
        uid: activeDemoUser.uid,
        email: activeDemoUser.email,
        displayName: activeDemoUser.displayName,
        role: activeDemoUser.role,
        municipality: activeDemoUser.municipality,
        depot: activeDemoUser.depot,
      });
      setProfileError('');
      setNeedsGoogleFarmerSetup(false);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    let authStateVersion = 0;
    let redirectError = '';
    let unsubscribeProfile: Unsubscribe | undefined;

    void getRedirectResult(authInstance).catch((error: unknown) => {
      if (!isActive) return;
      redirectError = error instanceof Error ? error.message : 'Google sign-in redirect failed.';
      setProfileError(redirectError);
    });

    const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
      const currentVersion = ++authStateVersion;
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      if (!isActive) return;
      setUser(currentUser);
      setProfile(null);
      setProfileError(redirectError);
      setNeedsGoogleFarmerSetup(false);

      if (!currentUser) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      unsubscribeProfile = onValue(userProfileRef(currentUser.uid)!, (snapshot) => {
        if (!isActive || currentVersion !== authStateVersion) return;
        const data = snapshot.val();
        const isGoogleAccount = currentUser.providerData.some((provider) => provider.providerId === 'google.com');

        if (isGoogleAccount && (
          !data
          || (data.role === 'farmer' && typeof data.municipality !== 'string')
        )) {
          setNeedsGoogleFarmerSetup(true);
          setProfileError('');
        } else if (!data || !roles.includes(data.role as StakeholderRole)) {
          setNeedsGoogleFarmerSetup(false);
          setProfileError('This account has no valid SeedLink role. Ask your system administrator to provision your profile.');
        } else if (data.role === 'depot_manager' && typeof data.depot !== 'string') {
          setNeedsGoogleFarmerSetup(false);
          setProfileError('This depot account has no assigned hub. Ask your system administrator to update your profile.');
        } else if (data.role === 'farmer' && typeof data.municipality !== 'string') {
          setNeedsGoogleFarmerSetup(false);
          setProfileError('This farmer account has no assigned municipality. Ask your system administrator to update your profile.');
        } else {
          setNeedsGoogleFarmerSetup(false);
          setProfileError('');
          setProfile({
            uid: currentUser.uid,
            email: currentUser.email ?? '',
            displayName: typeof data.displayName === 'string' ? data.displayName : currentUser.email ?? 'SeedLink user',
            role: data.role as StakeholderRole,
            municipality: typeof data.municipality === 'string' ? data.municipality : undefined,
            depot: typeof data.depot === 'string' ? data.depot : undefined,
          });
        }
        setIsLoading(false);
      }, (error) => {
        if (isActive && currentVersion === authStateVersion) {
          setNeedsGoogleFarmerSetup(false);
          setProfileError(error.message || 'Could not load your SeedLink profile.');
          setIsLoading(false);
        }
      });
    });

    return () => {
      isActive = false;
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    isLoading,
    profileError,
    needsGoogleFarmerSetup,
    signIn: async (email, password) => {
      if (!auth || !database) {
        const users = getDemoUsers();
        const key = email.trim().toLowerCase();
        const matchedUser = users[key];

        if (!matchedUser || matchedUser.password !== password) {
          throw new Error('Invalid email or password. Please try again.');
        }

        setUser(createMockUser(matchedUser.email, matchedUser.uid));
        setProfile({
          uid: matchedUser.uid,
          email: matchedUser.email,
          displayName: matchedUser.displayName,
          role: matchedUser.role,
          municipality: matchedUser.municipality,
          depot: matchedUser.depot,
        });
        setProfileError('');
        setActiveDemoUser(matchedUser.email, matchedUser.uid);
        return;
      }

      const authInstance = getConfiguredAuth();
      await signInWithEmailAndPassword(authInstance, email, password);
    },
    signInWithGoogle: async () => {
      if (!auth || !database) {
        throw new Error('Google sign-in requires Firebase to be configured. It is not available in local demo mode.');
      }

      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });
      const authInstance = getConfiguredAuth();

      try {
        await signInWithPopup(authInstance, provider);
      } catch (error) {
        if (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && error.code === 'auth/popup-blocked'
        ) {
          await signInWithRedirect(authInstance, provider);
          return;
        }

        throw error;
      }
    },
    completeGoogleFarmerSetup: async (municipality) => {
      if (!auth || !database) {
        throw new Error('Google account setup requires Firebase to be configured.');
      }
      if (!municipalities.includes(municipality)) {
        throw new Error('Choose a municipality from the list.');
      }

      const currentUser = getConfiguredAuth().currentUser;
      if (!currentUser || !currentUser.providerData.some((provider) => provider.providerId === 'google.com')) {
        throw new Error('Sign in with Google before completing this account setup.');
      }

      const email = currentUser.email ?? undefined;
      const displayName = currentUser.displayName?.trim() || (email ? email.split('@')[0] : 'SeedLink Farmer');

      const result = await runTransaction(userProfileRef(currentUser.uid)!, (existingProfile) => {
        if (existingProfile !== null) {
          if (existingProfile.role !== 'farmer' || typeof existingProfile.municipality === 'string') return;
          return {
            ...existingProfile,
            municipality,
          };
        }
        return {
          displayName,
          ...(email ? { email } : {}),
          role: 'farmer',
          municipality,
          createdAt: new Date().toISOString(),
        };
      });

      if (!result.committed) {
        const savedProfile = result.snapshot.val();
        if (savedProfile?.role === 'farmer' && savedProfile.municipality === municipality) return;
        throw new Error('SeedLink could not save your municipality. Confirm that your account profile rules are deployed, then try again.');
      }
    },
    sendPasswordReset: async (email) => {
      if (!auth || !database) {
        throw new Error('Password reset is available only for accounts in the configured Firebase project. Local demo accounts do not use Firebase passwords.');
      }

      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        throw new Error('Enter your email address first.');
      }

      await sendPasswordResetEmail(getConfiguredAuth(), normalizedEmail);
    },
    signUpFarmer: async (displayName, email, password, municipality) => {
      if (!auth || !database) {
        const users = getDemoUsers();
        const key = email.trim().toLowerCase();

        if (users[key]) {
          throw new Error('An account with that email already exists in local demo mode.');
        }

        const newUser: DemoUserRecord = buildDemoUserRecord({
          uid: `demo-farmer-${Date.now()}`,
          email: key,
          password,
          displayName,
          role: 'farmer',
          municipality,
        });

        users[key] = newUser;
        persistDemoUsers(users);

        const demoUser = createMockUser(newUser.email, newUser.uid);
        setUser(demoUser);
        setProfile({
          uid: newUser.uid,
          email: newUser.email,
          displayName: newUser.displayName,
          role: newUser.role,
          municipality: newUser.municipality,
        });
        setProfileError('');
        setActiveDemoUser(newUser.email, newUser.uid);
        return;
      }

      const authInstance = getConfiguredAuth();
      const credential = await createUserWithEmailAndPassword(authInstance, email, password);
      try {
        await set(userProfileRef(credential.user.uid)!, {
          displayName,
          email,
          role: 'farmer',
          municipality,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        await signOut(authInstance);
        throw new Error(`Your account was created, but its farmer profile could not be saved. Confirm that Realtime Database rules are deployed, then ask your agriculture office for help. ${error instanceof Error ? error.message : ''}`);
      }
    },
    signOutUser: async () => {
      if (!auth || !database) {
        clearActiveDemoUser();
        setUser(null);
        setProfile(null);
        setProfileError('');
        setNeedsGoogleFarmerSetup(false);
        return;
      }

      const authInstance = getConfiguredAuth();
      await signOut(authInstance);
      setUser(null);
      setProfile(null);
      setProfileError('');
      setNeedsGoogleFarmerSetup(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}