import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../state/AuthContext';
import { api } from '../api/client';

const BRAND_LOGO = require('../../assets/nexuslogo.png');

export default function LoginScreen() {
  const { signIn, signUp, signInWithOtp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  
  // Email states
  const [email, setEmail] = useState('demo@nexusplay.app');
  const [password, setPassword] = useState('password123');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Phone OTP states
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remembered credentials on mount
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('nexus_remember_email');
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
        const savedPhone = await AsyncStorage.getItem('nexus_remember_phone');
        if (savedPhone) {
          setPhone(savedPhone);
        }
      } catch (err) {
        console.error('Failed to load credentials:', err);
      }
    };
    loadSavedCredentials();
  }, []);

  const sendOtpCode = async () => {
    if (!phone.trim()) {
      setError('Please enter a valid phone number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await AsyncStorage.setItem('nexus_remember_phone', phone.trim());
      const res = await api.sendOtp(phone.trim());
      setOtpSent(true);
      if (res.otp) {
        setGeneratedOtp(res.otp);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (method === 'phone') {
        if (!otp.trim()) {
          throw new Error('Please enter the 6-digit OTP code');
        }
        await signInWithOtp(phone.trim(), otp.trim());
      } else {
        if (rememberMe) {
          await AsyncStorage.setItem('nexus_remember_email', email.trim());
        } else {
          await AsyncStorage.removeItem('nexus_remember_email');
        }

        if (mode === 'login') {
          await signIn(email.trim(), password);
        } else {
          await signUp(email.trim(), password, displayName.trim() || email.split('@')[0]);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      "Reset Password",
      `A simulated password reset instructions has been sent to ${email || 'your email'}.`,
      [{ text: "OK" }]
    );
  };

  const resetPhoneFlow = () => {
    setOtpSent(false);
    setOtp('');
    setGeneratedOtp(null);
    setError(null);
  };

  return (
    <LinearGradient colors={['#E3F2FD', '#FFFFFF', '#FFFFFF']} style={styles.fill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          
          <View style={styles.headerContainer}>
            <Image source={BRAND_LOGO} style={styles.logo as any} resizeMode="contain" />
            <Text style={styles.tagline}>BBC & CNN-inspired Premium News & OTT Hub</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome to Nexus Play</Text>
            <Text style={styles.subtitle}>
              Sign in to access live streams and global breaking news
            </Text>

            {/* Method Tabs */}
            <View style={styles.tabsContainer}>
              <Pressable 
                style={[styles.tab, method === 'phone' && styles.tabActive]} 
                onPress={() => { setMethod('phone'); setError(null); }}
              >
                <Text style={[styles.tabText, method === 'phone' && styles.tabTextActive]}>Phone OTP</Text>
              </Pressable>
              <Pressable 
                style={[styles.tab, method === 'email' && styles.tabActive]} 
                onPress={() => { setMethod('email'); setError(null); }}
              >
                <Text style={[styles.tabText, method === 'email' && styles.tabTextActive]}>Email / Pass</Text>
              </Pressable>
            </View>

            {method === 'phone' ? (
              // Phone OTP Login Flow
              <View>
                {!otpSent ? (
                  <View style={styles.inputWrapper}>
                    <Text style={styles.label}>Mobile Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter mobile number"
                      placeholderTextColor="#9E9E9E"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      autoFocus
                    />
                  </View>
                ) : (
                  <View>
                    <View style={styles.phoneChangeRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Verifying Mobile</Text>
                        <Text style={styles.phoneVal}>{phone}</Text>
                      </View>
                      <Pressable style={styles.changeBtn} onPress={resetPhoneFlow}>
                        <Text style={styles.changeBtnText}>Change</Text>
                      </Pressable>
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.label}>6-Digit OTP</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="••••••"
                        placeholderTextColor="#9E9E9E"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                      />
                    </View>

                    {generatedOtp && (
                      <View style={styles.demoOtpContainer}>
                        <Text style={styles.demoOtpLabel}>Local Dev OTP Code:</Text>
                        <Text style={styles.demoOtpValue}>{generatedOtp}</Text>
                        <Text style={styles.demoOtpHelp}>Copy & enter the code above to sign in</Text>
                      </View>
                    )}
                  </View>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                {!otpSent ? (
                  <Pressable 
                    style={({ pressed }) => [
                      styles.btn, 
                      pressed && styles.btnPressed,
                      busy && { opacity: 0.6 }
                    ]} 
                    onPress={sendOtpCode} 
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : (
                      <Text style={styles.btnText}>Send OTP Code</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable 
                    style={({ pressed }) => [
                      styles.btn, 
                      pressed && styles.btnPressed,
                      busy && { opacity: 0.6 }
                    ]} 
                    onPress={submit} 
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : (
                      <Text style={styles.btnText}>Verify & Login</Text>
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              // Classic Email / Password Flow
              <View>
                {mode === 'signup' && (
                  <View style={styles.inputWrapper}>
                    <Text style={styles.label}>Display Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter display name"
                      placeholderTextColor="#9E9E9E"
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                    />
                  </View>
                )}

                <View style={styles.inputWrapper}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor="#9E9E9E"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9E9E9E"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                {mode === 'login' && (
                  <View style={styles.optionsRow}>
                    <Pressable style={styles.checkboxRow} onPress={() => setRememberMe(!rememberMe)}>
                      <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                        {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.optionText}>Remember Me</Text>
                    </Pressable>

                    <Pressable onPress={handleForgotPassword}>
                      <Text style={styles.forgotText}>Forgot Password?</Text>
                    </Pressable>
                  </View>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable 
                  style={({ pressed }) => [
                    styles.btn, 
                    pressed && styles.btnPressed,
                    busy && { opacity: 0.6 }
                  ]} 
                  onPress={submit} 
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.btnText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
                  )}
                </Pressable>

                <Pressable 
                  onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
                  style={styles.switchContainer}
                >
                  <Text style={styles.switchText}>
                    {mode === 'login' ? "New to Nexus Play? " : 'Already have an account? '}
                    <Text style={styles.switchLink}>{mode === 'login' ? 'Sign Up' : 'Sign In'}</Text>
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {method === 'phone' ? (
            <Text style={styles.demo}>Entering any phone number will send a simulated verification code.</Text>
          ) : (
            <Text style={styles.demo}>Demo access: demo@nexusplay.app / password123</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 48 },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 260,
    height: 72,
    marginBottom: 8,
  },
  tagline: {
    color: '#616161',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    color: '#212121',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#616161',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#616161',
  },
  tabTextActive: {
    color: '#0D47A1',
  },
  inputWrapper: {
    marginBottom: 16,
  },
  label: {
    color: '#212121',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
  },
  phoneChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  phoneVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  changeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#616161',
  },
  demoOtpContainer: {
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#FBC02D',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  demoOtpLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F57F17',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  demoOtpValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#E65100',
    letterSpacing: 4,
  },
  demoOtpHelp: {
    fontSize: 11,
    color: '#5D4037',
    marginTop: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    backgroundColor: '#0D47A1',
    borderColor: '#0D47A1',
  },
  checkmark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  optionText: {
    color: '#616161',
    fontSize: 12,
    fontWeight: '600',
  },
  forgotText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: '#D32F2F',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 14,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#0D47A1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPressed: {
    backgroundColor: '#D32F2F',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  switchContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#616161',
    fontSize: 13,
    fontWeight: '600',
  },
  switchLink: {
    color: '#0D47A1',
    fontWeight: '800',
  },
  demo: {
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 11,
    fontWeight: '600',
  },
});
