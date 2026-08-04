import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/state/AuthContext';
import { ThemeProvider } from './src/state/ThemeContext';
import { LanguageProvider } from './src/state/LanguageContext';
import RootNavigator from './src/navigation/RootNavigator';

import { Platform } from 'react-native';

const getWebOrigin = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'http://46.28.44.54:9001';
};

const linking = {
  prefixes: [
    getWebOrigin(),
    'http://46.28.44.54:9001',
    'http://localhost:9001',
    'http://localhost:8081',
    'http://localhost:5000',
    'nexusplay://'
  ],
  config: {
    screens: {
      Home: '',
      Reels: 'reels',
      News: 'news',
      Live: 'live',
      Profile: 'profile',
      ReporterBroadcast: 'reporter-station',
      StudioDashboard: 'reporter/dashboard',
      RecordedLivePlayer: 'video/:streamId',
      SuperAdminDashboard: 'admin',
    }
  }
};

export default function App() {
  return (
    <SafeAreaProvider style={{ flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' } as any}>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <NavigationContainer linking={linking}>
              <RootNavigator />
            </NavigationContainer>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
