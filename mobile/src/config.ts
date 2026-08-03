import { Platform } from 'react-native';

// Where the NEXUS Play API lives.
// - Web / Production: Dynamic IP/Domain on Port 9001 (e.g. http://46.28.44.54:9001)
// - Android emulator: http://10.0.2.2:9001
const getWebFallback = () => {
  if (typeof window === 'undefined') return 'http://localhost:9001';
  try {
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:9001';
    }
    if (hostname.includes('192.168.') || hostname.includes('10.0.')) {
      return `${protocol}//${hostname}:9001`;
    }
    // Netlify web deployment -> use live backend tunnel
    return 'https://nexusplayapi.loca.lt';
  } catch (e) {
    return 'https://nexusplayapi.loca.lt';
  }
};

const fallback = Platform.OS === 'web' ? getWebFallback() : 'http://46.28.44.54:9001';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || fallback;
