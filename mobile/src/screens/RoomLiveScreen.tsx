import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Image,
  Clipboard,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';
import { API_URL } from '../config';
import { colors } from '../theme';
import { useTheme } from '../state/ThemeContext';
import { useAuth } from '../state/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { HoverPressable } from '../components/HoverPressable';

export default function RoomLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isDark } = useTheme();
  const { user, activeProfile } = useAuth();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  const roomIdParam = route?.params?.roomId;

  // Active Room state
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [role, setRole] = useState<'host' | 'speaker' | 'spectator'>('spectator');
  const [participants, setParticipants] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // Media states
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showActiveRoomsModal, setShowActiveRoomsModal] = useState(false);

  // Form Inputs
  const [createName, setCreateName] = useState('');
  const [createTopic, setCreateTopic] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCategory, setCreateCategory] = useState('General Debate');
  const [createPass, setCreatePass] = useState('');
  const [createMax, setCreateMax] = useState('10');
  const [createVis, setCreateVis] = useState<'public' | 'private'>('public');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [joinId, setJoinId] = useState(roomIdParam || '');
  const [joinPass, setJoinPass] = useState('');
  const [joining, setJoining] = useState(false);

  const [activeRoomsList, setActiveRoomsList] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // WebRTC Local Stream & Socket
  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Socket.IO Connection Setup
  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[RoomLive] Connected to Socket server:', socket.id);
    });

    socket.on('room-participant-joined', (data) => {
      console.log('[RoomLive] Participant joined:', data);
      fetchRoomParticipants(data.roomId);
    });

    socket.on('room-participant-left', (data) => {
      console.log('[RoomLive] Participant left:', data);
      fetchRoomParticipants(data.roomId);
    });

    socket.on('room-media-updated', (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.user_id === data.userId || p.socketId === data.socketId ? { ...p, mic_enabled: data.micEnabled ? 1 : 0, cam_enabled: data.camEnabled ? 1 : 0 } : p))
      );
    });

    socket.on('room-hand-raised-event', (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.user_id === data.userId || p.socketId === data.socketId ? { ...p, hand_raised: data.handRaised ? 1 : 0 } : p))
      );
    });

    socket.on('room-role-updated', (data) => {
      if (data.targetUserId === user?.id) {
        setRole(data.role);
        if (Platform.OS === 'web') alert(`Your role has been changed to ${data.role.toUpperCase()}`);
        else Alert.alert('Role Updated', `Your role has been changed to ${data.role.toUpperCase()}`);
      }
      if (activeRoom) fetchRoomParticipants(activeRoom.id);
    });

    socket.on('room-host-mute-mic-event', (data) => {
      if (data.targetUserId === user?.id) {
        setMicEnabled(false);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
        }
        if (Platform.OS === 'web') alert('The room host has muted your microphone.');
        else Alert.alert('Muted', 'The room host has muted your microphone.');
      }
    });

    socket.on('room-host-stop-cam-event', (data) => {
      if (data.targetUserId === user?.id) {
        setCamEnabled(false);
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
        }
        if (Platform.OS === 'web') alert('The room host has stopped your video feed.');
        else Alert.alert('Video Stopped', 'The room host has stopped your video feed.');
      }
    });

    socket.on('new-room-chat', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('room-chat-history', (history) => {
      setChatMessages(history);
    });

    socket.on('room-reaction-event', (data) => {
      // Floating reaction animation trigger
    });

    socket.on('room_ended', (data) => {
      if (activeRoom && activeRoom.id === data.id) {
        if (Platform.OS === 'web') alert('The host has ended this live debate room.');
        else Alert.alert('Room Ended', 'The host has ended this live debate room.');
        handleLeaveRoom();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeRoom]);

  // Load Active Rooms list
  const loadActiveRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await api.getActiveRooms();
      setActiveRoomsList(res.data || []);
    } catch (e) {
      console.error('Failed to load active rooms:', e);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    loadActiveRooms();
  }, []);

  const fetchRoomParticipants = async (rId: string) => {
    try {
      const res = await api.getRoomDetails(rId);
      if (res.data) {
        setActiveRoom(res.data);
        setParticipants(res.data.participants || []);
      }
    } catch (e) {}
  };

  // Web Camera Stream setup for Speakers/Hosts
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (role === 'host' || role === 'speaker') {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn('Camera/Mic permission failed:', err);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    }
  }, [role]);

  // Handle Create Room Submit
  const handleCreateRoomSubmit = async () => {
    if (!createName.trim() || !createTopic.trim()) {
      const msg = 'Please enter Room Name and Topic';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await api.createRoom({
        roomName: createName.trim(),
        topic: createTopic.trim(),
        description: createDesc.trim(),
        category: createCategory,
        password: createPass.trim(),
        maxParticipants: Number(createMax) || 10,
        visibility: createVis,
      });

      setShowCreateModal(false);
      const roomData = res.data;
      setActiveRoom(roomData);
      setRole('host');

      // Reset form fields
      setCreateName('');
      setCreateTopic('');
      setCreatePass('');

      // Join socket room
      socketRef.current?.emit('join-room-session', {
        roomId: roomData.id,
        userId: user?.id,
        userName: activeProfile?.name || user?.displayName || 'Host',
        userAvatar: activeProfile?.avatarUrl || '',
        role: 'host',
      });

      fetchRoomParticipants(roomData.id);
    } catch (err: any) {
      const errMsg = err.message || 'Failed to create debate room';
      console.error('Error creating room:', err);
      if (Platform.OS === 'web') alert(`Error: ${errMsg}`);
      else Alert.alert('Error', errMsg);
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Handle Join Room Submit
  const handleJoinRoomSubmit = async () => {
    if (!joinId.trim()) {
      const msg = 'Please enter Room ID';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    setJoining(true);
    try {
      const res = await api.joinRoom({
        roomId: joinId.trim(),
        password: joinPass.trim(),
      });

      setShowJoinModal(false);
      const { room, role: assignedRole, participants: roomParts } = res.data;
      setActiveRoom(room);
      setRole(assignedRole);
      setParticipants(roomParts);

      // Reset form fields
      setJoinId('');
      setJoinPass('');

      // Join socket room
      socketRef.current?.emit('join-room-session', {
        roomId: room.id,
        userId: user?.id,
        userName: activeProfile?.name || user?.displayName || 'User',
        userAvatar: activeProfile?.avatarUrl || '',
        role: assignedRole,
      });
    } catch (err: any) {
      const errMsg = err.message || 'Invalid Room ID or Password';
      if (Platform.OS === 'web') alert(`Access Denied: ${errMsg}`);
      else Alert.alert('Access Denied', errMsg);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      socketRef.current?.emit('leave-room-session', { roomId: activeRoom.id });
      await api.leaveRoom(activeRoom.id).catch(() => {});
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setActiveRoom(null);
    setRole('spectator');
    setParticipants([]);
    setChatMessages([]);
  };

  const handleToggleMic = () => {
    const nextState = !micEnabled;
    setMicEnabled(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = nextState));
    }
    if (activeRoom) {
      socketRef.current?.emit('room-toggle-media', { roomId: activeRoom.id, micEnabled: nextState, camEnabled });
    }
  };

  const handleToggleCam = () => {
    const nextState = !camEnabled;
    setCamEnabled(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = nextState));
    }
    if (activeRoom) {
      socketRef.current?.emit('room-toggle-media', { roomId: activeRoom.id, micEnabled, camEnabled: nextState });
    }
  };

  const handleToggleRaiseHand = () => {
    const nextState = !handRaised;
    setHandRaised(nextState);
    if (activeRoom) {
      socketRef.current?.emit('room-raise-hand', { roomId: activeRoom.id, handRaised: nextState });
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !activeRoom) return;
    const text = chatInput.trim();
    setChatInput('');
    socketRef.current?.emit('send-room-chat', {
      roomId: activeRoom.id,
      userId: user?.id,
      name: activeProfile?.name || user?.displayName || 'User',
      avatar: activeProfile?.avatarUrl || '',
      message: text,
    });
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoGridRef = useRef<any>(null);

  const handleToggleFullscreen = () => {
    if (Platform.OS === 'web') {
      const elem = videoGridRef.current;
      if (!document.fullscreenElement) {
        if (elem?.requestFullscreen) {
          elem.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } else {
      setIsFullscreen(!isFullscreen);
    }
  };

  const handleToggleScreenShare = async () => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getDisplayMedia) {
      if (Platform.OS === 'web') alert('Screen sharing is available on Web browser only.');
      else Alert.alert('Not Supported', 'Screen sharing is available on Web browser.');
      return;
    }

    try {
      if (!isScreenSharing) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        setIsScreenSharing(true);
        const screenVideoTrack = displayStream.getVideoTracks()[0];
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
        }

        screenVideoTrack.onended = () => {
          setIsScreenSharing(false);
          if (localStreamRef.current && localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        };
      } else {
        setIsScreenSharing(false);
        if (localStreamRef.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    } catch (e) {
      console.warn('Screen share cancelled or failed:', e);
    }
  };

  const handleCopyInviteLink = () => {
    if (!activeRoom) return;
    const link = `${API_URL}/room/${activeRoom.id}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(link);
      alert(`Invite link copied to clipboard!\nRoom ID: ${activeRoom.id}\nPassword: ${activeRoom.password}`);
    } else {
      Clipboard.setString(link);
      Alert.alert('Copied', `Room Link & Password copied!\nRoom ID: ${activeRoom.id}`);
    }
  };

  // Dynamic Video Grid Sizing Matrix
  const speakersList = participants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const numSpeakers = Math.max(1, speakersList.length);

  const getGridStyle = (): any => {
    if (numSpeakers === 1) return { width: '100%', height: '100%' };
    if (numSpeakers === 2) return { width: isDesktop ? '49%' : '100%', height: isDesktop ? '100%' : '49%' };
    if (numSpeakers <= 4) return { width: '49%', height: '49%' };
    if (numSpeakers <= 8) return { width: '32%', height: '49%' };
    return { width: '24%', height: '24%' };
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', overflow: 'hidden' }]}>
      <AppHeader onPressAvatar={() => navigation.navigate('Profile')} />

      <View style={{ flex: 1, marginTop: Platform.OS === 'web' ? 74 : ((insets?.top || 0) + 60), padding: 12, flexDirection: isDesktop ? 'row' : 'column', gap: 12, maxHeight: Platform.OS === 'web' ? ('calc(100vh - 74px)' as any) : '100%', overflow: 'hidden' }}>
        {/* MAIN VIDEO & TOOLBAR COLUMN */}
        <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          
          {/* ROOM HEADER BAR */}
          {activeRoom ? (
            <View style={[styles.roomHeaderBar, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0', flexShrink: 0 }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>ROOM LIVE</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                    {activeRoom.room_name}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                  Topic: {activeRoom.topic}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <HoverPressable style={[styles.copyInviteBtn, { backgroundColor: '#1D4ED8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }]} onPress={handleCopyInviteLink}>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>📋 Copy Invite</Text>
                </HoverPressable>

                {role === 'host' ? (
                  <HoverPressable
                    style={[styles.actionBtnHeader, { backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }]}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (confirm('Are you sure you want to end this Room Live session for all users?')) {
                          api.endRoom(activeRoom.id).then(handleLeaveRoom);
                        }
                      } else {
                        Alert.alert('End Debate Room', 'Are you sure you want to end this Room Live session for all users?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'End Room', style: 'destructive', onPress: () => api.endRoom(activeRoom.id).then(handleLeaveRoom) }
                        ]);
                      }
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>🔴 End Room</Text>
                  </HoverPressable>
                ) : (
                  <HoverPressable style={[styles.actionBtnHeader, { backgroundColor: '#64748B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }]} onPress={handleLeaveRoom}>
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>🚪 Leave</Text>
                  </HoverPressable>
                )}
              </View>
            </View>
          ) : (
            /* NO ACTIVE ROOM HERO BANNER */
            <View style={[styles.noRoomBanner, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
              <Text style={{ fontSize: 42, marginBottom: 12 }}>🎙️</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', textAlign: 'center', marginBottom: 6 }}>
                NEXUS Room Live (Debate Mode)
              </Text>
              <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center', maxWidth: 500, marginBottom: 20 }}>
                Host live panel discussions, public debates, or join active rooms with Room ID and Password. Unlimited spectators can watch, chat, and participate!
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <HoverPressable style={[styles.heroPrimaryBtn, { backgroundColor: colors.primary }]} onPress={() => setShowCreateModal(true)}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>＋ Create Debate Room</Text>
                </HoverPressable>

                <HoverPressable style={[styles.heroPrimaryBtn, { backgroundColor: '#3B82F6' }]} onPress={() => setShowJoinModal(true)}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>🔑 Join Room by ID</Text>
                </HoverPressable>

                <HoverPressable style={[styles.heroPrimaryBtn, { backgroundColor: '#10B981' }]} onPress={() => { loadActiveRooms(); setShowActiveRoomsModal(true); }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>🌐 Browse Active Rooms ({activeRoomsList.length})</Text>
                </HoverPressable>
              </View>
            </View>
          )}

          {/* DYNAMIC RESPONSIVE VIDEO GRID */}
          {activeRoom && (
            <View ref={videoGridRef} style={[{ flex: 1, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', padding: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', position: 'relative' }, isFullscreen && { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, borderRadius: 0 }]}>
              
              {/* TOP RIGHT FULLSCREEN BUTTON */}
              <HoverPressable
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                onPress={handleToggleFullscreen}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                  {isFullscreen ? '↙ Exit Fullscreen' : '⛶ Fullscreen'}
                </Text>
              </HoverPressable>

              {speakersList.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 14 }}>Waiting for speakers to turn on camera...</Text>
                </View>
              ) : (
                speakersList.map((speaker, idx) => {
                  const isMe = speaker.user_id === user?.id;
                  const gridStyle = getGridStyle();

                  return (
                    <View
                      key={speaker.id || idx}
                      style={[
                        gridStyle,
                        {
                          backgroundColor: '#0F172A',
                          borderRadius: 12,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 2,
                          borderColor: speaker.role === 'host' ? '#F59E0B' : colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }
                      ]}
                    >
                      {isMe && Platform.OS === 'web' ? (
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
                              {(speaker.name || 'S').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '800' }}>{speaker.name}</Text>
                        </View>
                      )}

                      {/* Participant Badge & Mic Indicator */}
                      <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                          {speaker.role === 'host' ? '👑 ' : ''}{speaker.name || 'Speaker'}
                        </Text>
                        <Text style={{ fontSize: 12 }}>{speaker.mic_enabled !== 0 ? '🎙️' : '🔇'}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* CONTROL TOOLBAR BAR */}
          {activeRoom && (
            <View style={[styles.bottomToolbar, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
              {role === 'spectator' ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' }}>
                    👁️ Spectator Mode · Watching Debate
                  </Text>
                  <HoverPressable
                    style={[styles.raiseHandBtn, handRaised && { backgroundColor: '#F59E0B' }]}
                    onPress={handleToggleRaiseHand}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                      {handRaised ? '✋ Hand Raised (Waiting...)' : '✋ Request to Speak'}
                    </Text>
                  </HoverPressable>
                </View>
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <HoverPressable style={[styles.toolCircleBtn, !micEnabled && { backgroundColor: '#EF4444' }]} onPress={handleToggleMic}>
                    <Text style={{ fontSize: 18 }}>{micEnabled ? '🎙️' : '🔇'}</Text>
                  </HoverPressable>

                  <HoverPressable style={[styles.toolCircleBtn, !camEnabled && { backgroundColor: '#EF4444' }]} onPress={handleToggleCam}>
                    <Text style={{ fontSize: 18 }}>{camEnabled ? '📹' : '🚫'}</Text>
                  </HoverPressable>

                  <HoverPressable style={[styles.toolCircleBtn, isScreenSharing && { backgroundColor: '#10B981' }]} onPress={handleToggleScreenShare}>
                    <Text style={{ fontSize: 18 }}>🖥️</Text>
                  </HoverPressable>

                  <HoverPressable style={styles.toolCircleBtn} onPress={() => setShowParticipantsModal(true)}>
                    <Text style={{ fontSize: 18 }}>👥</Text>
                  </HoverPressable>
                </View>
              )}
            </View>
          )}
        </View>

        {/* SIDEBAR: REAL-TIME CHAT & REACTIONS */}
        {activeRoom && (
          <View style={[styles.chatSidebar, { width: isDesktop ? 340 : '100%', height: isDesktop ? '100%' : 300, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                💬 Live Chat ({chatMessages.length})
              </Text>
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
                👥 {participants.length} Active
              </Text>
            </View>

            <ScrollView style={{ flex: 1, padding: 12 }}>
              {chatMessages.map((msg, idx) => (
                <View key={msg.id || idx} style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '800' }}>
                    {msg.sender_name || 'User'}
                  </Text>
                  <Text style={{ fontSize: 13, color: isDark ? '#E2E8F0' : '#334155', marginTop: 2 }}>
                    {msg.message}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Chat Input Bar */}
            <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.chatInput, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]}
                placeholder="Type message..."
                placeholderTextColor="#64748B"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChat}
              />
              <HoverPressable style={{ paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.primary, justifyContent: 'center' }} onPress={handleSendChat}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Send</Text>
              </HoverPressable>
            </View>
          </View>
        )}
      </View>

      {/* CREATE ROOM MODAL */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 16 }}>
              🎙️ Create Live Debate Room
            </Text>

            <Text style={styles.label}>ROOM NAME *</Text>
            <TextInput style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]} placeholder="e.g. Political Debate Session" placeholderTextColor="#64748B" value={createName} onChangeText={setCreateName} />

            <Text style={styles.label}>DEBATE TOPIC *</Text>
            <TextInput style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]} placeholder="e.g. AI Technology Impact 2026" placeholderTextColor="#64748B" value={createTopic} onChangeText={setCreateTopic} />

            <Text style={styles.label}>PASSWORD (OPTIONAL)</Text>
            <TextInput style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]} placeholder="e.g. ABC123" placeholderTextColor="#64748B" value={createPass} onChangeText={setCreatePass} autoCapitalize="characters" />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <HoverPressable style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleCreateRoomSubmit} disabled={submittingCreate}>
                {submittingCreate ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Start Room</Text>}
              </HoverPressable>
              <HoverPressable style={[styles.btn, { backgroundColor: '#64748B', flex: 1 }]} onPress={() => setShowCreateModal(false)}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Cancel</Text>
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* JOIN ROOM MODAL */}
      <Modal visible={showJoinModal} animationType="slide" transparent onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 16 }}>
              🔑 Join Room by ID & Password
            </Text>

            <Text style={styles.label}>6-DIGIT ROOM ID *</Text>
            <TextInput style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]} placeholder="e.g. 785241" placeholderTextColor="#64748B" value={joinId} onChangeText={setJoinId} keyboardType="number-pad" />

            <Text style={styles.label}>ROOM PASSWORD (IF REQUIRED)</Text>
            <TextInput style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]} placeholder="Enter room password" placeholderTextColor="#64748B" value={joinPass} onChangeText={setJoinPass} autoCapitalize="characters" />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <HoverPressable style={[styles.btn, { backgroundColor: '#3B82F6', flex: 1 }]} onPress={handleJoinRoomSubmit} disabled={joining}>
                {joining ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Join Debate</Text>}
              </HoverPressable>
              <HoverPressable style={[styles.btn, { backgroundColor: '#64748B', flex: 1 }]} onPress={() => setShowJoinModal(false)}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Cancel</Text>
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ACTIVE ROOMS LIST MODAL */}
      <Modal visible={showActiveRoomsModal} animationType="fade" transparent onRequestClose={() => setShowActiveRoomsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '80%', backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>🌐 Active Debate Rooms</Text>
              <HoverPressable onPress={() => setShowActiveRoomsModal(false)}>
                <Text style={{ color: '#94A3B8', fontSize: 16 }}>✕</Text>
              </HoverPressable>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {activeRoomsList.map((roomItem) => (
                <View key={roomItem.id} style={{ padding: 14, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#fff' : '#000' }}>{roomItem.room_name}</Text>
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: 2 }}>Topic: {roomItem.topic}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Host: {roomItem.host_name} · Viewers: {roomItem.total_viewers || 1} · Speakers: {roomItem.speaker_count || 1}</Text>
                  
                  <HoverPressable
                    style={{ marginTop: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center' }}
                    onPress={() => {
                      setJoinId(roomItem.id);
                      setShowActiveRoomsModal(false);
                      setShowJoinModal(true);
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Join Debate Room</Text>
                  </HoverPressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ROOM PARTICIPANTS & HOST MODERATION MODAL */}
      <Modal visible={showParticipantsModal} animationType="fade" transparent onRequestClose={() => setShowParticipantsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 520, maxHeight: '80%', backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                👥 Room Participants ({participants.length})
              </Text>
              <HoverPressable onPress={() => setShowParticipantsModal(false)}>
                <Text style={{ color: '#94A3B8', fontSize: 16 }}>✕</Text>
              </HoverPressable>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {participants.map((p) => {
                const isHostUser = (p.role === 'host');
                const isSpeakerUser = (p.role === 'speaker');
                const hasHandRaised = (p.hand_raised === 1);

                return (
                  <View key={p.id || p.user_id} style={{ padding: 12, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#fff' : '#000' }}>
                        {isHostUser ? '👑 ' : ''}{p.name || 'User'} {hasHandRaised ? '✋ (Hand Raised)' : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2 }}>
                        Role: {p.role?.toUpperCase()}
                      </Text>
                    </View>

                    {role === 'host' && !isHostUser && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {isSpeakerUser ? (
                          <HoverPressable
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EF4444' }}
                            onPress={() => {
                              socketRef.current?.emit('room-revoke-speaker', { roomId: activeRoom.id, targetUserId: p.user_id, targetSocketId: p.socketId });
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Move to Spectator</Text>
                          </HoverPressable>
                        ) : (
                          <HoverPressable
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#10B981' }}
                            onPress={() => {
                              socketRef.current?.emit('room-grant-speaker', { roomId: activeRoom.id, targetUserId: p.user_id, targetSocketId: p.socketId });
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Promote to Speaker</Text>
                          </HoverPressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  roomHeaderBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  copyInviteBtn: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnHeader: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  noRoomBanner: { padding: 32, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  heroPrimaryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  bottomToolbar: { height: 60, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, marginTop: 10, justifyContent: 'center' },
  toolCircleBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  raiseHandBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  chatSidebar: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  chatInput: { flex: 1, height: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 450, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginTop: 10, marginBottom: 4 },
  input: { height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, marginBottom: 6 },
  btn: { height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
