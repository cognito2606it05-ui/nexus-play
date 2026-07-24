import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, apiAuth } from '../api/client';
import type { AuthResponse, Profile, User } from '../types';

const STORAGE_KEY = 'nexus.auth.v1';
const ACTIVE_PROFILE_KEY = 'nexus.activeProfile.v1';

interface AuthState {
  loading: boolean;
  user: User | null;
  profiles: Profile[];
  activeProfile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithOtp: (phone: string, otp: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectProfile: (p: Profile) => Promise<void>;
  switchProfile: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  const applyAuth = useCallback(async (auth: AuthResponse) => {
    apiAuth.setTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
    setUser(auth.user);
    setProfiles(auth.profiles);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    if (auth.profiles.length === 1) {
      const single = auth.profiles[0];
      apiAuth.setActiveProfile(single.id);
      setActiveProfile(single);
      await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, single.id);
    }
  }, []);

  const signOut = useCallback(async () => {
    apiAuth.setTokens(null);
    apiAuth.setActiveProfile(null);
    setUser(null);
    setProfiles([]);
    setActiveProfile(null);
    await AsyncStorage.multiRemove([STORAGE_KEY, ACTIVE_PROFILE_KEY]);
  }, []);

  // Restore session on launch.
  useEffect(() => {
    apiAuth.onExpired(() => { void signOut(); });
    (async () => {
      try {
        // Clear session on load to ensure refresh lands on OTP section
        await AsyncStorage.multiRemove([STORAGE_KEY, ACTIVE_PROFILE_KEY]);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    await applyAuth(await api.login(email, password));
  }, [applyAuth]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    await applyAuth(await api.register(email, password, displayName));
  }, [applyAuth]);

  const signInWithOtp = useCallback(async (phone: string, otp: string) => {
    await applyAuth(await api.verifyOtp(phone, otp));
  }, [applyAuth]);

  const selectProfile = useCallback(async (p: Profile) => {
    apiAuth.setActiveProfile(p.id);
    setActiveProfile(p);
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, p.id);
  }, []);

  const switchProfile = useCallback(async () => {
    apiAuth.setActiveProfile(null);
    setActiveProfile(null);
    await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  }, []);

  const refreshProfiles = useCallback(async () => {
    const { profiles: fresh } = await api.getProfiles();
    setProfiles(fresh);
    setActiveProfile((prevActive) => {
      if (!prevActive) return null;
      const updatedActive = fresh.find((p) => p.id === prevActive.id);
      return updatedActive || prevActive;
    });
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const auth = JSON.parse(raw);
        auth.profiles = fresh;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      }
    } catch (e) {
      console.error('Failed to persist refreshed profiles:', e);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ loading, user, profiles, activeProfile, signIn, signUp, signInWithOtp, signOut, selectProfile, switchProfile, refreshProfiles }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
