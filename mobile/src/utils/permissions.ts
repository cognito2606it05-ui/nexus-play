import { Platform } from 'react-native';

/**
 * Request both camera and audio permissions.
 * On Web: Triggers getUserMedia prompt.
 * On Native: Uses expo-camera and expo-av.
 */
export async function requestAudioAndCameraPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MediaDevices API is not supported in this browser environment.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Stop tracks immediately after verifying permissions
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Access denied. Please check your browser settings and allow camera and microphone permissions.');
      }
      throw err;
    }
  } else {
    try {
      const { Camera } = require('expo-camera');
      const { Audio } = require('expo-av');

      const cameraRes = await Camera.requestCameraPermissionsAsync();
      const audioRes = await Audio.requestPermissionsAsync();

      return cameraRes.status === 'granted' && audioRes.status === 'granted';
    } catch (err) {
      console.warn('[Permissions] Native camera/audio request failed:', err);
      return false;
    }
  }
}

/**
 * Request microphone (audio-only) permission.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MediaDevices API is not supported in this browser environment.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Access denied. Please check your browser settings and allow microphone permission.');
      }
      throw err;
    }
  } else {
    try {
      const { Audio } = require('expo-av');
      const audioRes = await Audio.requestPermissionsAsync();
      return audioRes.status === 'granted';
    } catch (err) {
      console.warn('[Permissions] Native microphone request failed:', err);
      return false;
    }
  }
}

/**
 * Request GPS / Location permission.
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation is not supported in this browser environment.');
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(new Error('Location access denied. Please allow location permissions in browser settings.'));
          } else {
            resolve(true); // Ignore other errors like timeout to avoid blocking the user
          }
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 }
      );
    });
  } else {
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (err) {
      console.warn('[Permissions] Native location request failed:', err);
      return false;
    }
  }
}
