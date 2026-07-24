import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
} from 'react-native';

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Check if user previously dismissed the prompt recently
    const dismissedTime = localStorage.getItem('nexus_install_dismissed');
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 24 * 60 * 60 * 1000) {
      return;
    }

    // Check if already running in standalone mode (installed app)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    if (iosDevice) {
      // Show iOS prompt banner after 3 seconds
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Listen for Chrome/Android beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback
      alert('To install Nexus Play: open browser menu and tap "Add to Home Screen"');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nexus_install_dismissed', Date.now().toString());
    }
  };

  if (!showPrompt) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.bannerContent}>
        {/* App Logo */}
        <Image
          source={{ uri: '/logo.png' }}
          style={styles.appLogo}
          defaultSource={{ uri: '/logo.png' }}
        />

        {/* Text Details */}
        <View style={styles.textContainer}>
          <Text style={styles.appTitle}>Nexus Play App</Text>
          <Text style={styles.appSub}>
            {isIOS ? 'Install on iPhone / iPad' : 'Add to Home Screen for fast mobile access'}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <Pressable style={styles.installBtn} onPress={handleInstallClick}>
            <Text style={styles.installBtnText}>
              {isIOS ? '📲 Install' : '⚡ Install App'}
            </Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={handleDismiss}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* iOS Guided Modal Step-by-Step */}
      {showIOSGuide && (
        <View style={styles.iosGuideOverlay}>
          <View style={styles.iosGuideCard}>
            <Image source={{ uri: '/logo.png' }} style={{ width: 48, height: 48, borderRadius: 10, alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.iosTitle}>Install Nexus Play on iOS</Text>
            <Text style={styles.iosStep}>1. Tap the <Text style={{ color: '#3B82F6', fontWeight: '800' }}>Share button 📤</Text> at the bottom of Safari.</Text>
            <Text style={styles.iosStep}>2. Scroll down & tap <Text style={{ color: '#3B82F6', fontWeight: '800' }}>"Add to Home Screen ➕"</Text>.</Text>
            <Text style={styles.iosStep}>3. Launch Nexus Play directly from your home screen!</Text>
            <Pressable style={styles.iosDoneBtn} onPress={handleDismiss}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Got it!</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 500,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  appLogo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  appTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  appSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  installBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  installBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  iosGuideOverlay: {
    ...Platform.select({
      web: {
        position: 'fixed',
      } as any,
      default: {
        position: 'absolute',
      }
    }),
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100000,
  },
  iosGuideCard: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    maxWidth: 360,
    width: '100%',
  },
  iosTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  iosStep: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  iosDoneBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
});
