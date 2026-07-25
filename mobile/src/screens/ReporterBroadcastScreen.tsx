import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Platform, Alert, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { api, getEventsUrl } from '../api/client';
import { API_URL } from '../config';
import { requestAudioAndCameraPermissions } from '../utils/permissions';

export default function ReporterBroadcastScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, activeProfile } = useAuth();
  
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<'offline' | 'on_deck' | 'live'>('offline');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Ingestion fields
  const [ingestUrl, setIngestUrl] = useState('rtmp://localhost:1935/live');

  // Real-time Metrics
  const [latency, setLatency] = useState(0);
  const [fps, setFps] = useState(0);
  const [cpuUsage, setCpuUsage] = useState(12);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);

  // Refs
  const socketRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);

  // Form Fields
  const [streamTitle, setStreamTitle] = useState('');
  const [streamDescription, setStreamDescription] = useState('');
  const [streamCategory, setStreamCategory] = useState('General');
  const [streamLocation, setStreamLocation] = useState('');
  const [streamThumbnail, setStreamThumbnail] = useState<string | null>(null);
  
  // Media States
  const localVideoRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'connected' | 'not_found' | 'denied' | 'busy' | 'unsupported' | 'loading'>('loading');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<any[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  
  // Bitrate and network health metrics
  const [networkQuality, setNetworkQuality] = useState<'Good' | 'Excellent' | 'Fair'>('Good');
  const [uploadBitrate, setUploadBitrate] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const durationIntervalRef = useRef<any>(null);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);

  // Verify Role Authentication
  useEffect(() => {
    if (!user || (user.role !== 'super_admin' && user.role !== 'news_reader' && user.role !== 'user' && user.role !== 'reporter')) {
      Alert.alert(
        'Access Denied',
        'Only authorized reporters, news readers, or admins can access the Reporter Station.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [user]);

  // Fetch current stream key and chat history
  useEffect(() => {
    async function loadData() {
      try {
        const keyRes = await api.getStreamKey();
        if (keyRes.success && keyRes.streamKey) {
          setStreamKey(keyRes.streamKey);
        }
        
        const chatRes = await api.getStudioChatMessages();
        if (chatRes.success) {
          setChatMessages(chatRes.data);
        }
      } catch (err) {
        console.error('Failed to load reporter details:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Enumerate video devices (webcams) on desktop/web
  useEffect(() => {
    if (Platform.OS === 'web' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const videoDevs = devices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(videoDevs);
        })
        .catch((err) => console.warn('Failed to enumerate video devices:', err));
    }
  }, [localStream]);

  const showPermissionHelpAlert = () => {
    Alert.alert(
      'Enabling Camera & Mic Permissions',
      'If you have previously blocked access, follow these steps:\n\n' +
      '• Chrome / Edge: Click the Lock icon 🔒 next to the URL in the address bar, then change Camera & Microphone to "Allow" and reload the page.\n' +
      '• Safari: Tap the Settings or "aA" icon in the search bar, select "Website Settings", and set Camera & Microphone to "Allow".\n' +
      '• Firefox: Click the permission status icon next to the URL, clear previous block choices, and reload.',
      [{ text: 'OK' }]
    );
  };

  // Initialize camera preview
  const initializeMedia = async () => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('unsupported');
      setCameraError('Browser does not support MediaDevices API or HTTPS connection is required.');
      return;
    }

    setCameraStatus('loading');
    setCameraError(null);

    // Stop current stream if running
    if (localStream) {
      localStream.getTracks().forEach((track: any) => track.stop());
    }

    try {
      // First request permissions via utility helper
      await requestAudioAndCameraPermissions();
    } catch (permErr: any) {
      console.warn('Permission request failed:', permErr);
      setCameraStatus('denied');
      setCameraError(permErr.message || 'Camera and microphone permissions are required.');
      Alert.alert(
        'Permissions Required',
        permErr.message || 'Camera and Microphone access is required. Please allow access in browser or system settings to start broadcasting.',
        [
          { text: 'How to enable?', onPress: () => showPermissionHelpAlert() },
          { text: 'Retry', onPress: () => initializeMedia() },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    try {
      let videoConstraint: any = { facingMode: facingMode };
      if (videoDevices.length > 0 && videoDevices[currentDeviceIndex]) {
        videoConstraint = { deviceId: { exact: videoDevices[currentDeviceIndex].deviceId } };
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...videoConstraint
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setCameraStatus('connected');
    } catch (err: any) {
      console.warn('Failed to access camera/mic stream:', err);
      let status: 'not_found' | 'denied' | 'busy' | 'unsupported' = 'not_found';
      let errorMsg = 'An unknown error occurred while accessing the camera.';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        status = 'denied';
        errorMsg = 'Camera access is required to start broadcasting.';
        Alert.alert('Permission Denied', 'Camera access is required to start broadcasting.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        status = 'not_found';
        errorMsg = 'No camera or microphone found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        status = 'busy';
        errorMsg = 'Camera is already in use by another application.';
      } else {
        errorMsg = err.message || errorMsg;
      }

      setCameraStatus(status);
      setCameraError(errorMsg);
      setLocalStream(null);
    }
  };

  useEffect(() => {
    initializeMedia();
  }, [facingMode, currentDeviceIndex]);

  // Keep srcObject updated on the HTML5 video element when stream is ready
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, cameraStatus]);

  // Handle camera toggles / webcam switcher
  const handleToggleCamera = () => {
    if (videoDevices.length > 1) {
      setCurrentDeviceIndex((prev) => (prev + 1) % videoDevices.length);
    } else {
      setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    }
  };

  const handleToggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = micMuted;
        setMicMuted(!micMuted);
      }
    }
  };

  // Fluctuate CPU load and simulate minor packet losses when connected
  useEffect(() => {
    let interval: any;
    if (connected) {
      interval = setInterval(() => {
        setCpuUsage(Math.floor(10 + Math.random() * 12));
        if (Math.random() > 0.95) {
          setDroppedFrames(prev => prev + Math.floor(Math.random() * 3));
        }
      }, 4000);
    } else {
      setCpuUsage(0);
      setDroppedFrames(0);
    }
    return () => clearInterval(interval);
  }, [connected]);

  // Set up SSE Event Source for real-time coordinator chat and alerts
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const url = getEventsUrl();
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 1. Coordinates intercom message
        if (data.type === 'studio_reporter_chat') {
          setChatMessages((prev) => [...prev, data.payload]);
        }
        
        // 2. Layout promotion / alert
        else if (data.type === 'master_broadcast_updated') {
          const promotedKeys = data.payload.promotedStreams || [];
          if (promotedKeys.includes(streamKey)) {
            setStatus('live');
            Alert.alert('Studio Alert', 'You are currently live in the Master TV Feed! Focus on camera.');
          } else {
            setStatus('on_deck');
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => {
      es.close();
    };
  }, [streamKey]);

  // Start SpeechRecognition when going live
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('Speech recognition is not supported in this browser.');
      return;
    }
    
    if (status === 'live') {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      
      rec.onresult = (event: any) => {
        const resultIndex = event.resultIndex;
        const transcriptText = event.results[resultIndex][0].transcript;
        console.log('[Reporter Speech] Transcribed:', transcriptText);
        
        if (myStreamId) {
          api.postStreamTranscript(myStreamId, transcriptText, streamDuration);
        }
      };
      
      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
      };
      
      rec.start();
      setRecognition(rec);
    } else {
      if (recognition) {
        recognition.stop();
        setRecognition(null);
      }
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [status, myStreamId, streamDuration]);

  // Generate a new secure stream key
  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const res = await api.generateStreamKey();
      if (res.success) {
        setStreamKey(res.streamKey);
        Alert.alert('Key Generated', 'Use this new stream key in your OBS/Larix client.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to generate key.');
    } finally {
      setGenerating(false);
    }
  };

  // Connect to the Media Server
  const handleConnectServer = async (): Promise<boolean> => {
    if (!ingestUrl.trim().startsWith('rtmp://')) {
      Alert.alert('Validation Error', 'Invalid RTMP URL. Must start with rtmp://');
      return false;
    }
    if (!streamKey || streamKey.trim().length === 0) {
      Alert.alert('Validation Error', 'Stream key cannot be empty.');
      return false;
    }
    
    setConnecting(true);
    return new Promise(async (resolve) => {
      try {
        const rawAuth = await AsyncStorage.getItem('nexus.auth.v1');
        const token = rawAuth ? JSON.parse(rawAuth).accessToken : null;
        if (!token) {
          setConnecting(false);
          Alert.alert('Authentication Error', 'Session expired. Please log in again.');
          resolve(false);
          return;
        }

        // Connect to the Socket.IO server relay endpoint
        const socket = io(API_URL, {
          path: '/socket.io',
          auth: { token, streamKey },
          transports: ['websocket'],
          autoConnect: false
        });
        socketRef.current = socket;

        socket.connect();

        socket.on('connect', () => {
          setConnecting(false);
          setConnected(true);
          Alert.alert('Connected', 'Established secure connection with media server. Ready to Broadcast!');
          resolve(true);
        });

        socket.on('connect_error', (err: any) => {
          console.error('[Relay Connection Error]:', err);
          setConnecting(false);
          setConnected(false);
          Alert.alert('Connection Failure', 'Unable to connect to the streaming server. Please try again.');
          resolve(false);
        });

        socket.on('error-msg', (msg: string) => {
          setConnecting(false);
          setConnected(false);
          Alert.alert('Connection Failure', msg);
          resolve(false);
        });

        socket.on('stream-metrics', (metrics: any) => {
          setUploadBitrate(metrics.bitrate);
          setNetworkQuality(metrics.quality);
          setLatency(metrics.latency);
          setFps(metrics.fps);
          setCpuUsage(metrics.cpuUsage);
        });

        socket.on('disconnect', () => {
          setConnected(false);
          setConnecting(false);
          setUploadBitrate(0);
          setNetworkQuality('Good');
        });

      } catch (e) {
        setConnecting(false);
        Alert.alert('Connection Failure', 'Unable to connect to the streaming server. Please try again.');
        resolve(false);
      }
    });
  };

  // Go Live Broadcast
  const handleGoLive = async () => {
    console.log('[Go Live] Button Clicked');
    if (!streamTitle.trim()) {
      console.error('[Go Live] Validation Failed: Empty Title');
      Alert.alert('Input Error', 'Please enter a stream title before going live.');
      return;
    }
    if (!streamCategory.trim()) {
      console.error('[Go Live] Validation Failed: Empty Category');
      Alert.alert('Input Error', 'Please enter a category before going live.');
      return;
    }
    if (!streamLocation.trim()) {
      console.error('[Go Live] Validation Failed: Empty Location');
      Alert.alert('Input Error', 'Please enter a location before going live.');
      return;
    }
    if (!localStream) {
      console.error('[Go Live] Hardware Error: Camera/mic not initialized');
      Alert.alert('Hardware Error', 'Camera/microphone feed is not initialized.');
      return;
    }

    setStarting(true);

    if (!connected || !socketRef.current) {
      console.log('[Go Live] Connection Missing. Auto-connecting first...');
      const isConnected = await handleConnectServer();
      if (!isConnected) {
        setStarting(false);
        return;
      }
    }

    console.log('[Go Live] Validation Passed');
    setStarting(true);

    try {
      console.log('[Go Live] Sending startStream API request...');
      // Create PostgreSQL/SQLite Live Session
      const stream = await api.startStream(streamTitle.trim(), streamCategory.trim(), streamLocation.trim());
      console.log('[Go Live] Live Session Response:', stream);

      if (stream && stream.id) {
        const liveId = stream.id;
        setMyStreamId(liveId);
        setStatus('live');
        console.log(`[Go Live] Live Session Created. ID: ${liveId}`);
        Alert.alert('Broadcast Master', 'You are now broadcasting live to the control studio.');

        console.log('[Go Live] Connecting local MediaStream to media relay server...');
        // Initialize real socket-based RTMP ingestion relay
        socketRef.current.emit('start-relay', { streamId: liveId });

        console.log('[Go Live] Initializing MediaRecorder for chunk broadcasting...');
        // Record chunks locally and send to relay server
        let recorder: any;
        try {
          recorder = new MediaRecorder(localStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        } catch (e) {
          try {
            recorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
          } catch (e2) {
            recorder = new MediaRecorder(localStream);
          }
        }
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) {
            if (socketRef.current && socketRef.current.connected) {
              socketRef.current.emit('video-chunk', event.data);
            }
          }
        };
        
        recorder.start(1000); // 1-second chunks
        console.log('[Go Live] MediaRecorder chunking started');

        // Start duration timer
        setStreamDuration(0);
        durationIntervalRef.current = setInterval(() => {
          setStreamDuration(prev => prev + 1);
        }, 1000);
        console.log('[Go Live] Elapsed duration counter initialized');
      } else {
        throw new Error('Failed to create Live Session.');
      }
    } catch (err: any) {
      console.error('[Go Live Error]:', err);
      Alert.alert('Streaming Error', err.message || 'Failed to start live stream session.');
    } finally {
      setStarting(false);
    }
  };

  // Stop Live Broadcast
  const handleStopLive = async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    
    // Stop recording and close media recorder
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Failed to stop MediaRecorder safely:', e);
      }
      mediaRecorderRef.current = null;
    }

    // Stop relay and disconnect socket
    if (socketRef.current) {
      try {
        socketRef.current.emit('stop-relay');
        socketRef.current.disconnect();
      } catch (e) {
        console.error('Failed to disconnect socket:', e);
      }
      socketRef.current = null;
    }

    try {
      if (myStreamId) {
        await api.stopStream(myStreamId);
      }
    } catch (e) {
      console.error('Failed to terminate stream session on server:', e);
    }

    setStatus('offline');
    setConnected(false);
    setStreamDuration(0);
    setMyStreamId(null);
    setUploadBitrate(0);
    setLatency(0);
    setFps(0);
    Alert.alert('Broadcast Ended', 'Streaming session completed and recording submitted for processing.');
  };

  // Send message on coordination channel
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const txt = chatInput.trim();
    setChatInput('');

    try {
      await api.sendStudioChatMessage(txt);
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }
  const isGoLiveDisabled = cameraStatus !== 'connected' || !localStream;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>FIELD BROADCAST STATION</Text>
        
        {/* Connection status badge */}
        <View style={[
          styles.statusBadge, 
          status === 'live' ? styles.statusLive : (status === 'on_deck' ? styles.statusDeck : styles.statusOffline)
        ]}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Main split grid */}
      <View style={styles.grid}>
        {/* Left: Camera stream preview & configuration */}
        <View style={styles.leftCol}>
          <View style={styles.cameraBox}>
            {Platform.OS === 'web' && cameraStatus === 'connected' && localStream ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', borderRadius: 12, objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                <View style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(16, 185, 129, 0.85)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>🟢 Camera Connected</Text>
                </View>
              </>
            ) : (
              <View style={styles.noCamera}>
                {cameraStatus === 'loading' ? (
                  <>
                    <ActivityIndicator size="large" color="#3B82F6" />
                    <Text style={styles.noCameraText}>Initializing Camera Preview...</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.noCameraIcon, { color: '#EF4444' }]}>⚠️</Text>
                    <Text style={[styles.noCameraText, { color: '#F8FAFC', textAlign: 'center', paddingHorizontal: 20 }]}>
                      {cameraStatus === 'denied' ? '🔴 Permission Denied' :
                       cameraStatus === 'not_found' ? '🔴 Camera Not Found' :
                       cameraStatus === 'busy' ? '🔴 Camera Busy' :
                       cameraStatus === 'unsupported' ? '🔴 System Unsupported' : '🔴 Camera Offline'}
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingHorizontal: 24, marginTop: -4, lineHeight: 18 }}>
                      {cameraError || 'Please allow camera and microphone access to start your broadcast.'}
                    </Text>
                    <Pressable onPress={initializeMedia} style={{ marginTop: 14, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Retry Access</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {/* Hardware Controls Overlays */}
            <View style={styles.hardwareControls}>
              <Pressable onPress={handleToggleCamera} style={styles.hardwareBtn}>
                <Text style={styles.hardwareBtnText}>🔄 Flip Cam</Text>
              </Pressable>
              <Pressable onPress={handleToggleMic} style={[styles.hardwareBtn, micMuted && { backgroundColor: '#EF4444' }]}>
                <Text style={styles.hardwareBtnText}>{micMuted ? '🎤 Unmute' : '🎤 Mute'}</Text>
              </Pressable>
            </View>

            <View style={styles.cameraOverlay}>
              <Text style={styles.overlayName}>{activeProfile?.name || 'Reporter'}</Text>
              <Text style={styles.overlayLoc}>📍 {streamLocation || 'Field Location'}</Text>
            </View>
          </View>

          {/* Connection parameters inputs */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📝 Broadcast Parameters</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Stream Title:</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter title..."
                placeholderTextColor="#64748B"
                value={streamTitle}
                onChangeText={setStreamTitle}
                editable={status !== 'live'}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description:</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter description..."
                placeholderTextColor="#64748B"
                value={streamDescription}
                onChangeText={setStreamDescription}
                editable={status !== 'live'}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Category:</Text>
                <TextInput
                  style={styles.textInput}
                  value={streamCategory}
                  onChangeText={setStreamCategory}
                  placeholder="e.g. News, Sports"
                  placeholderTextColor="#64748B"
                  editable={status !== 'live'}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Location:</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Hyderabad"
                  placeholderTextColor="#64748B"
                  value={streamLocation}
                  onChangeText={setStreamLocation}
                  editable={status !== 'live'}
                />
              </View>
            </View>
          </View>

          {/* Stream Configuration settings */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛰️ Secure Ingestion Settings</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>RTMP Server URL:</Text>
              <View style={styles.inputContainer}>
                <TextInput 
                  style={styles.input} 
                  value={ingestUrl} 
                  onChangeText={setIngestUrl}
                  editable={status !== 'live'} 
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>RTMP Stream Key:</Text>
              <View style={styles.inputContainer}>
                <TextInput 
                  secureTextEntry 
                  style={styles.input} 
                  value={streamKey || ''} 
                  onChangeText={setStreamKey}
                  placeholder="Enter stream key..."
                  placeholderTextColor="#64748B"
                  editable={status !== 'live'} 
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Pressable disabled={generating} onPress={handleGenerateKey} style={[styles.actionBtn, { backgroundColor: '#1E293B' }]}>
                {generating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.generateBtnText}>🔄 Generate Key</Text>}
              </Pressable>
              
              <Pressable 
                disabled={connecting || connected || status === 'live'} 
                onPress={handleConnectServer} 
                style={[styles.actionBtn, connected ? { backgroundColor: '#10B981' } : { backgroundColor: '#3B82F6' }]}
              >
                {connecting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.generateBtnText}>{connected ? '✓ Connected' : '🔌 Connect Server'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>

        {/* Right: Producer Intercom Chat & Metrics */}
        <View style={styles.rightCol}>
          {/* Live Action button */}
          <View style={[styles.card, { alignItems: 'center', justifyContent: 'center', minHeight: 120, borderWidth: 2, borderColor: status === 'live' ? '#EF4444' : '#1e293b' }]}>
            {status === 'live' ? (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <Text style={styles.durationCounter}>ON AIR - {formatTime(streamDuration)}</Text>
                <Pressable onPress={handleStopLive} style={[styles.goLiveBtn, { backgroundColor: '#EF4444', marginTop: 12 }]}>
                  <Text style={styles.goLiveBtnText}>END BROADCAST</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable 
                disabled={isGoLiveDisabled || starting} 
                onPress={handleGoLive} 
                style={[styles.goLiveBtn, (!isGoLiveDisabled && !starting) ? { backgroundColor: '#EF4444' } : { backgroundColor: '#475569', opacity: 0.5 }]}
              >
                <Text style={styles.goLiveBtnText}>
                  {starting ? 'Starting Live...' : 'GO LIVE'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Network Health Metrics */}
          {connected && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📈 Live Transmission Metrics</Text>
              
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Camera Status:</Text>
                <Text style={[styles.metricValue, { color: localStream ? '#10B981' : '#EF4444' }]}>
                  {localStream ? 'Active' : 'Offline'}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Microphone Status:</Text>
                <Text style={[styles.metricValue, { color: !micMuted ? '#10B981' : '#EF4444' }]}>
                  {!micMuted ? 'Active' : 'Muted'}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Upload Speed / Bitrate:</Text>
                <Text style={styles.metricValue}>{uploadBitrate ? `${uploadBitrate} kbps` : 'Calculating...'}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>FPS:</Text>
                <Text style={styles.metricValue}>{fps || 30}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Latency:</Text>
                <Text style={styles.metricValue}>{latency ? `${latency} ms` : '120 ms'}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>CPU Usage:</Text>
                <Text style={styles.metricValue}>{cpuUsage ? `${cpuUsage}%` : '12%'}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Dropped Frames:</Text>
                <Text style={[styles.metricValue, { color: droppedFrames > 0 ? '#EF4444' : '#10B981' }]}>
                  {droppedFrames}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Connection Quality:</Text>
                <Text style={[styles.metricValue, networkQuality === 'Excellent' ? { color: '#10B981' } : { color: '#F59E0B' }]}>
                  {networkQuality}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Recording Status:</Text>
                <Text style={[styles.metricValue, { color: status === 'live' ? '#EF4444' : '#64748B' }]}>
                  {status === 'live' ? 'RECORDING' : 'Idle'}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Viewer Count:</Text>
                <Text style={styles.metricValue}>{viewerCount}</Text>
              </View>
            </View>
          )}

          {/* Intercom Coordination panel */}
          <View style={styles.intercomCard}>
            <Text style={styles.intercomTitle}>📞 Studio Producer Intercom</Text>
            
            <ScrollView style={styles.messageBox} contentContainerStyle={{ padding: 12 }}>
              {chatMessages.length === 0 ? (
                <Text style={styles.noMessageText}>No coordinate messages. Messages sent here are seen by the producers and other reporters.</Text>
              ) : (
                chatMessages.map((msg, index) => {
                  const isProducer = msg.role === 'producer';
                  return (
                    <View key={index} style={[styles.chatBubble, isProducer ? styles.producerBubble : styles.reporterBubble]}>
                      <Text style={styles.chatHeader}>
                        {msg.name} ({msg.role.toUpperCase()}) · {new Date(msg.createdAt).toLocaleTimeString()}
                      </Text>
                      <Text style={styles.chatText}>{msg.message}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.chatControls}>
              <TextInput
                style={styles.chatInput}
                placeholder="Message production desk..."
                placeholderTextColor="#94A3B8"
                value={chatInput}
                onChangeText={setChatInput}
              />
              <Pressable onPress={handleSendChat} style={styles.sendBtn}>
                <Text style={styles.sendBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  contentContainer: { padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  backBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, gap: 6 },
  statusLive: { backgroundColor: '#EF4444' },
  statusDeck: { backgroundColor: '#F59E0B' },
  statusOffline: { backgroundColor: '#475569' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  statusText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  grid: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  leftCol: { flex: 2, minWidth: 320, gap: 24 },
  rightCol: { flex: 1, minWidth: 300, gap: 24 },
  cameraBox: { height: 320, backgroundColor: '#020617', borderRadius: 16, borderWidth: 1.5, borderColor: '#334155', overflow: 'hidden', position: 'relative' },
  noCamera: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  noCameraIcon: { fontSize: 48 },
  noCameraText: { color: '#64748B', fontWeight: '600' },
  hardwareControls: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8, zIndex: 10 },
  hardwareBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.75)', borderWidth: 1, borderColor: '#334155' },
  hardwareBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  cameraOverlay: { position: 'absolute', bottom: 16, left: 16, padding: 12, backgroundColor: 'rgba(15, 23, 42, 0.75)', borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#3B82F6' },
  overlayName: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 16 },
  overlayLoc: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  card: { padding: 24, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 8 },
  cardDesc: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  formGroup: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 16 },
  label: { color: '#F8FAFC', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  textInput: { backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 10, color: '#FFF', fontSize: 14 },
  inputContainer: { backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 10 },
  input: { color: '#F8FAFC', fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  generateBtnText: { color: '#FFF', fontWeight: 'bold' },
  goLiveBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goLiveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  durationCounter: { fontSize: 24, fontWeight: '900', color: '#EF4444', letterSpacing: 1 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  metricLabel: { color: '#94A3B8', fontSize: 14 },
  metricValue: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  intercomCard: { height: 350, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  intercomTitle: { padding: 16, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', color: '#F8FAFC', fontWeight: 'bold', fontSize: 16 },
  messageBox: { flex: 1 },
  noMessageText: { color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 60, fontSize: 14, padding: 16 },
  chatBubble: { padding: 12, borderRadius: 12, marginBottom: 12, maxWidth: '90%' },
  producerBubble: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderLeftWidth: 3, borderLeftColor: '#3B82F6', alignSelf: 'flex-start' },
  reporterBubble: { backgroundColor: 'rgba(71, 85, 105, 0.3)', borderRightWidth: 3, borderRightColor: '#64748B', alignSelf: 'flex-end' },
  chatHeader: { fontSize: 11, color: '#94A3B8', marginBottom: 4 },
  chatText: { color: '#F8FAFC', fontSize: 14, lineHeight: 18 },
  chatControls: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#334155', gap: 12 },
  chatInput: { flex: 1, backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, color: '#FFF', fontSize: 14 },
  sendBtn: { paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 8, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: 'bold' }
});
