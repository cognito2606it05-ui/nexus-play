import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Switch, ActivityIndicator, Platform, Alert } from 'react-native';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { api, getEventsUrl } from '../api/client';
import { API_URL } from '../config';

export default function StudioDashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { activeProfile } = useAuth();
  
  const [reporters, setReporters] = useState<any[]>([]);
  const [currentBroadcast, setCurrentBroadcast] = useState<any>(null);
  const [layoutMode, setLayoutMode] = useState<'single' | 'split-2' | 'quad' | 'pip'>('single');
  const [promotedStreams, setPromotedStreams] = useState<string[]>([]);
  
  const [tickerText, setTickerText] = useState('BREAKING NEWS - Nexus Play Special Broadcast');
  const [showLogo, setShowLogo] = useState(true);
  const [breakingNews, setBreakingNews] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);

  // Load active reporters, current master session, and coordinate chat history
  const loadData = async () => {
    try {
      const repRes = await api.getStudioReporters();
      if (repRes.success) setReporters(repRes.data);

      const bRes = await api.getCurrentBroadcast();
      if (bRes.success && bRes.data) {
        setCurrentBroadcast(bRes.data);
        setBroadcasting(true);
        setLayoutMode(bRes.data.layout_mode);
        setPromotedStreams(bRes.data.promoted_streams || []);
        setTickerText(bRes.data.ticker_text || '');
        setShowLogo(bRes.data.show_logo === 1);
        setBreakingNews(bRes.data.breaking_news === 1);
      } else {
        setBroadcasting(false);
        setCurrentBroadcast(null);
      }

      const chatRes = await api.getStudioChatMessages();
      if (chatRes.success) setChatMessages(chatRes.data);

    } catch (err) {
      console.error('Failed to load control room data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll active reporters list every 5 seconds to detect newly active streams
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // SSE Event Listener for live coordination and chat
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const url = getEventsUrl();
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'studio_reporter_chat') {
          setChatMessages((prev) => [...prev, data.payload]);
        } else if (data.type === 'reporter_stream_started' || data.type === 'reporter_stream_ended') {
          loadData();
        } else if (data.type === 'master_broadcast_started') {
          setBroadcasting(true);
          loadData();
        } else if (data.type === 'master_broadcast_ended') {
          setBroadcasting(false);
          setCurrentBroadcast(null);
          setPromotedStreams([]);
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => {
      es.close();
    };
  }, []);

  // Start master broadcast composite
  const handleStartBroadcast = async () => {
    try {
      const res = await api.startMasterBroadcast();
      if (res.success) {
        setBroadcasting(true);
        Alert.alert('Broadcast Started', 'The Master Compositor is now active on port 1935 and generating HLS.');
        loadData();
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Failure', 'Failed to launch master compositor.');
    }
  };

  // Stop master broadcast composite
  const handleStopBroadcast = async () => {
    if (!currentBroadcast) return;
    try {
      const res = await api.stopMasterBroadcast(currentBroadcast.id);
      if (res.success) {
        setBroadcasting(false);
        setCurrentBroadcast(null);
        Alert.alert('Broadcast Terminated', 'Master composite finalized and archived.');
        loadData();
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to stop composite.');
    }
  };

  // Apply layout modifications to Master Compositor
  const handleUpdateLayout = async (newMode?: 'single' | 'split-2' | 'quad' | 'pip', newPromoted?: string[]) => {
    if (!currentBroadcast) return;

    const mode = newMode ?? layoutMode;
    const streams = newPromoted ?? promotedStreams;

    try {
      await api.updateMasterLayout({
        broadcastId: currentBroadcast.id,
        layoutMode: mode,
        promotedStreams: streams,
        tickerText,
        showLogo,
        breakingNews
      });
      setLayoutMode(mode);
      setPromotedStreams(streams);
    } catch (err) {
      console.error('Failed to update compositor layout:', err);
    }
  };

  // Toggle reporter selection inside master composition slots
  const handleTogglePromoted = (streamKey: string) => {
    let newPromoted = [...promotedStreams];
    if (newPromoted.includes(streamKey)) {
      newPromoted = newPromoted.filter(k => k !== streamKey);
    } else {
      newPromoted.push(streamKey);
    }
    setPromotedStreams(newPromoted);
    handleUpdateLayout(layoutMode, newPromoted);
  };

  // Send message on coordination intercom
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

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  const liveReporters = reporters.filter(r => r.status === 'live');
  const masterHlsUrl = `${API_URL}/media/uploads/live/master/index.m3u8`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>PRODUCER CONTROL ROOM</Text>
        </View>

        {/* Global Broadcast master control button */}
        <Pressable 
          onPress={broadcasting ? handleStopBroadcast : handleStartBroadcast} 
          style={[styles.broadcasterBtn, broadcasting ? styles.btnStop : styles.btnStart]}
        >
          <View style={[styles.pulseDot, broadcasting && styles.pulseDotActive]} />
          <Text style={styles.broadcasterBtnText}>
            {broadcasting ? 'STOP BROADCAST MASTER' : 'START BROADCAST MASTER'}
          </Text>
        </Pressable>
      </View>

      {/* Control grid */}
      <View style={styles.grid}>
        {/* Left Column: Reporter streams directory */}
        <View style={styles.leftCol}>
          <Text style={styles.sectionTitle}>🛰️ Live Feeds Directory</Text>
          
          {liveReporters.length === 0 ? (
            <View style={styles.emptyFeedsCard}>
              <Text style={styles.emptyText}>No field reporters are currently streaming. Use OBS/Larix to push streams to the ingestion server.</Text>
            </View>
          ) : (
            liveReporters.map((rep, idx) => {
              const isPromoted = promotedStreams.includes(rep.stream_key);
              return (
                <View key={idx} style={[styles.feedCard, isPromoted && styles.feedCardPromoted]}>
                  <View style={styles.feedHeader}>
                    <Text style={styles.feedReporter}>{rep.reporter_name}</Text>
                    <View style={styles.badgeLive}>
                      <Text style={styles.badgeText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.feedMeta}>📍 {rep.location || 'Field'}</Text>
                  
                  {/* Web live video preview element */}
                  {Platform.OS === 'web' && (
                    <video
                      src={`${API_URL}/media/uploads/live/${rep.stream_key}/v1/index.m3u8`}
                      autoPlay
                      playsInline
                      muted
                      controls
                      style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12, backgroundColor: '#000' }}
                    />
                  )}

                  <Pressable 
                    disabled={!broadcasting}
                    onPress={() => handleTogglePromoted(rep.stream_key)}
                    style={[styles.promoteBtn, isPromoted ? styles.btnPromoted : styles.btnNotPromoted]}
                  >
                    <Text style={styles.promoteBtnText}>
                      {isPromoted ? 'REMOVE FROM LAYOUT' : 'PROMOTE TO MASTER'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Middle Column: Compositor Preview & Mixer */}
        <View style={styles.middleCol}>
          <Text style={styles.sectionTitle}>🎬 Master TV Mix Preview</Text>
          
          <View style={styles.masterPreviewBox}>
            {broadcasting ? (
              Platform.OS === 'web' ? (
                <video
                  src={masterHlsUrl}
                  autoPlay
                  playsInline
                  controls
                  style={{ width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000' }}
                />
              ) : (
                <View style={styles.masterStandby}>
                  <Text style={styles.standbyText}>Master Broadcast Composite is Active</Text>
                  <Text style={styles.standbySub}>HLS Playlist generated: /live/master/index.m3u8</Text>
                </View>
              )
            ) : (
              <View style={styles.masterStandby}>
                <Text style={styles.standbyText}>Control Room Offline</Text>
                <Text style={styles.standbySub}>Click Start Broadcast Master to begin compositing.</Text>
              </View>
            )}
          </View>

          {/* Layout presets selection */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📐 Layout Presets</Text>
            <View style={styles.layoutBtnGrid}>
              {(['single', 'split-2', 'pip', 'quad'] as const).map((mode) => {
                const isActive = layoutMode === mode;
                return (
                  <Pressable 
                    key={mode}
                    disabled={!broadcasting}
                    onPress={() => handleUpdateLayout(mode)}
                    style={[styles.layoutBtn, isActive && styles.layoutBtnActive]}
                  >
                    <Text style={[styles.layoutBtnText, isActive && styles.layoutBtnTextActive]}>
                      {mode.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Right Column: Live Graphics Overlays & Intercom */}
        <View style={styles.rightCol}>
          <Text style={styles.sectionTitle}>📺 Graphics & Intercom Controls</Text>
          
          {/* Graphics controls */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🎨 Graphics Overlays</Text>
            
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Overlay Station Logo</Text>
              <Switch 
                disabled={!broadcasting}
                value={showLogo}
                onValueChange={(val) => { setShowLogo(val); handleUpdateLayout(layoutMode); }}
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Red Alert (Breaking News)</Text>
              <Switch 
                disabled={!broadcasting}
                value={breakingNews}
                onValueChange={(val) => { setBreakingNews(val); handleUpdateLayout(layoutMode); }}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>News Ticker Scrolling Text:</Text>
              <TextInput
                editable={broadcasting}
                style={styles.tickerInput}
                value={tickerText}
                onChangeText={setTickerText}
                placeholder="Enter ticker message..."
                placeholderTextColor="#64748B"
              />
              <Pressable 
                disabled={!broadcasting}
                onPress={() => handleUpdateLayout()}
                style={styles.applyGraphicsBtn}
              >
                <Text style={styles.applyGraphicsText}>Apply Graphics Update</Text>
              </Pressable>
            </View>
          </View>

          {/* Intercom coordination */}
          <View style={styles.intercomCard}>
            <Text style={styles.intercomTitle}>📞 Coordinate Intercom</Text>
            
            <ScrollView style={styles.messageBox} contentContainerStyle={{ padding: 12 }}>
              {chatMessages.length === 0 ? (
                <Text style={styles.noMessageText}>No intercom logs.</Text>
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
                placeholder="Message field stations..."
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
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  contentContainer: { padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  backBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: 1 },
  broadcasterBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 10 },
  btnStart: { backgroundColor: '#10B981' },
  btnStop: { backgroundColor: '#EF4444' },
  broadcasterBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, letterSpacing: 0.5 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', opacity: 0.6 },
  pulseDotActive: { opacity: 1 },
  grid: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  leftCol: { flex: 1, minWidth: 280, gap: 16 },
  middleCol: { flex: 2, minWidth: 320, gap: 24 },
  rightCol: { flex: 1, minWidth: 300, gap: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyFeedsCard: { padding: 32, backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1F2937', alignItems: 'center' },
  emptyText: { color: '#4B5563', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  feedCard: { padding: 16, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1.5, borderColor: '#334155' },
  feedCardPromoted: { borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.05)' },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedReporter: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  badgeLive: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: '#EF4444' },
  badgeText: { fontSize: 10, color: '#FFF', fontWeight: 'bold' },
  feedMeta: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  promoteBtn: { paddingVertical: 10, borderRadius: 8, marginTop: 16, alignItems: 'center' },
  btnPromoted: { backgroundColor: '#EF4444' },
  btnNotPromoted: { backgroundColor: '#3B82F6' },
  promoteBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  masterPreviewBox: { height: 320, backgroundColor: '#020617', borderRadius: 16, borderWidth: 2, borderColor: '#1E293B', overflow: 'hidden', position: 'relative' },
  masterStandby: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  standbyText: { color: '#94A3B8', fontWeight: '800', fontSize: 18, marginBottom: 8 },
  standbySub: { color: '#475569', fontSize: 13, textAlign: 'center' },
  card: { padding: 24, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 16 },
  layoutBtnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  layoutBtn: { flex: 1, minWidth: 120, paddingVertical: 12, borderRadius: 8, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  layoutBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  layoutBtnText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 12 },
  layoutBtnTextActive: { color: '#FFF' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  toggleLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  formGroup: { marginTop: 16 },
  label: { color: '#F8FAFC', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  tickerInput: { backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 10, color: '#FFF', fontSize: 14, marginBottom: 12 },
  applyGraphicsBtn: { paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center' },
  applyGraphicsText: { color: '#FFF', fontWeight: 'bold' },
  intercomCard: { height: 350, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  intercomTitle: { padding: 16, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', color: '#F8FAFC', fontWeight: 'bold', fontSize: 16 },
  messageBox: { flex: 1 },
  noMessageText: { color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 80, fontSize: 14 },
  chatBubble: { padding: 10, borderRadius: 12, marginBottom: 12, maxWidth: '90%' },
  producerBubble: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderLeftWidth: 3, borderLeftColor: '#10B981', alignSelf: 'flex-end' },
  reporterBubble: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRightWidth: 3, borderRightColor: '#3B82F6', alignSelf: 'flex-start' },
  chatHeader: { fontSize: 10, color: '#94A3B8', marginBottom: 4 },
  chatText: { color: '#F8FAFC', fontSize: 13, lineHeight: 16 },
  chatControls: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#334155', gap: 12 },
  chatInput: { flex: 1, backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, color: '#FFF', fontSize: 14 },
  sendBtn: { paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 8, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: 'bold' }
});
