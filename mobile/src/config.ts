import { Platform } from 'react-native';

// Where the NEXUS Play API lives.
// - Web / Production: Dynamic IP/Domain on Port 9001 (e.g. http://46.28.44.54:9001)
// - Android emulator: http://10.0.2.2:9001
const getWebFallback = () => {
  if (typeof window === 'undefined') return 'http://localhost:9001';
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:9001`;
};

const fallback = Platform.OS === 'android' 
  ? 'http://10.0.2.2:9001' 
  : (Platform.OS === 'web' ? getWebFallback() : 'http://localhost:9001');

export const API_URL = process.env.EXPO_PUBLIC_API_URL || fallback;
