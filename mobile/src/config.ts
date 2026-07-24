import { Platform } from 'react-native';

// Where the NEXUS Play API lives.
// - Web / iOS simulator: localhost works.
// - Android emulator: 10.0.2.2 maps to the host's localhost.
// Override with EXPO_PUBLIC_API_URL when running on a physical device
// (use your machine's LAN IP, e.g. http://192.168.1.20:4000).
const getWebFallback = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const { hostname, port, origin } = window.location;
  // If running locally in development on a port that is NOT 4000 (e.g. 8081),
  // point to the localhost API on port 4000.
  if (hostname === 'localhost' && port !== '4000') {
    return 'http://localhost:4000';
  }
  return origin;
};

const fallback = Platform.OS === 'android' 
  ? 'http://10.0.2.2:4000' 
  : (Platform.OS === 'web' ? getWebFallback() : 'http://localhost:4000');

export const API_URL = process.env.EXPO_PUBLIC_API_URL || fallback;
