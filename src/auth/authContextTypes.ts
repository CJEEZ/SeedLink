import { createContext } from 'react';
import type { User } from 'firebase/auth';

export type StakeholderRole = 'admin' | 'depot_manager' | 'farmer' | 'executive';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: StakeholderRole;
  municipality?: string;
  depot?: string;
}

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  profileError: string;
  needsGoogleFarmerSetup: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeGoogleFarmerSetup: (municipality: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signUpFarmer: (displayName: string, email: string, password: string, municipality: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);