import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/state/AuthContext';
import { ThemeProvider } from './src/state/ThemeContext';
import { LanguageProvider } from './src/state/LanguageContext';
import RootNavigator from './src/navigation/RootNavigator';

const linking = {
  prefixes: ['http://localhost:8081', 'nexusplay://'],
  config: {
    screens: {
      Home: '',
      Reels: 'reels',
      News: 'news',
      Live: 'live/:streamId',
      Profile: 'profile',
      ReporterBroadcast: 'reporter-station',
      StudioDashboard: 'reporter/dashboard',
      RecordedLivePlayer: 'video/:streamId',
    }
  }
};

export default function App() {
  return (
    <SafeAreaProvider style={{ flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
