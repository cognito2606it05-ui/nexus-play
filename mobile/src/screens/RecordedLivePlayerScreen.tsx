import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, ScrollView, TextInput, Alert, Switch } from 'react-native';
import { useTheme } from '../state/ThemeContext';
import { api } from '../api/client';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RecordedLivePlayerScreen({ route, navigation }: any) {
  const { stream } = route.params || {};
  const { colors } = useTheme();
  
  const [streamDetails, setStreamDetails] = useState<any>(stream || null);
  const [loading, setLoading] = useState(!stream);
  const [error, setError] = useState<string | null>(null);
  
  // Custom Player States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [pipActive, setPipActive] = useState(false);
  const [quality, setQuality] = useState<'1080p' | '720p' | '480p'>('720p');
  
  // Subtitles / Speech Synthesis
  const [subtitles, setSubtitles] = useState<any[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('');
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsRate, setTtsRate] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsHighlightIndex, setTtsHighlightIndex] = useState<number | null>(null);
  
  // Comments
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    if (!streamDetails && route.params?.streamId) {
      loadStreamById(route.params.streamId);
    } else if (streamDetails) {
      loadDetailsAndComments();
    }
  }, [route.params?.streamId]);

  // Load stream details
  const loadStreamById = async (id: string) => {
    try {
      const res = await api.getStreams();
      const found = res.data.find((s: any) => s.id === id);
      if (found) {
        setStreamDetails(found);
      } else {
        setError('Recorded stream not found.');
      }
    } catch (e) {
      setError('Failed to load recorded video information.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailsAndComments = async () => {
    setLikesCount(streamDetails.total_likes || 0);
    // Fetch simulated comments
    setComments([
      { id: '1', name: 'Alisha Rao', text: 'Amazing coverage from the ground!', time: '10m ago' },
      { id: '2', name: 'Rohan Dev', text: 'Clear audio and stable stream. Good work!', time: '5m ago' }
    ]);
    
    // Check local storage for resume progress
    try {
      const savedTime = await AsyncStorage.getItem(`@playback_progress_${streamDetails.id}`);
      if (savedTime && videoRef.current) {
        const parsed = parseFloat(savedTime);
        if (parsed > 5) {
          Alert.alert(
            'Resume Playback',
            `Would you like to resume from where you left off (${formatTime(parsed)})?`,
            [
              { text: 'Start Over' },
              { text: 'Resume', onPress: () => { if (videoRef.current) videoRef.current.currentTime = parsed; } }
            ]
          );
        }
      }
    } catch (e) {}

    // Load available Speech Synthesis Voices
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        const list = window.speechSynthesis.getVoices();
        setVoices(list);
        if (list.length > 0) {
          setSelectedVoice(list.find(v => v.lang.startsWith('en')) || list[0]);
        }
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    // Mock subtitle parser (WebVTT parsing)
    parseMockSubtitles();
  };

  const parseMockSubtitles = () => {
    // Generate a set of subtitles synced to video timeline
    setSubtitles([
      { start: 0, end: 5, text: 'Hello and welcome to this Special Broadcast on Nexus Play.' },
      { start: 5, end: 12, text: 'We are reporting live here on location, bringing you real-time updates.' },
      { start: 12, end: 20, text: 'The atmosphere is dynamic and key developments are unfolding rapidly.' },
      { start: 20, end: 35, text: 'Stay tuned as we continue tracking this situation and interview local experts.' },
      { start: 35, end: 60, text: 'Back to the main studio for more breaking analysis.' }
    ]);
  };

  // Video control triggers
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => setError('Video playback blocked. Please interact first.'));
    }
    setPlaying(!playing);
  };

  // Track elapsed time & progress
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    
    // Save progress periodically
    AsyncStorage.setItem(`@playback_progress_${streamDetails.id}`, time.toString());

    // Update active subtitle
    const currentSub = subtitles.find(s => time >= s.start && time <= s.end);
    setActiveSubtitle(currentSub ? currentSub.text : '');
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  // Seek bar scrub
  const handleScrub = (e: any) => {
    if (!videoRef.current || !duration) return;
    // Calculate scrub on progress bar click
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Speed Rate Change
  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Picture in Picture
  const togglePip = async () => {
    if (Platform.OS !== 'web' || !videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setPipActive(true);
      }
    } catch (e) {
      Alert.alert('PiP Error', 'Picture in Picture is not supported by your browser.');
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (Platform.OS !== 'web' || !videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.parentElement?.requestFullscreen();
    }
  };

  // Text-To-Speech (AI Voice Narration)
  const toggleTts = () => {
    if (Platform.OS !== 'web' || !('speechSynthesis' in window)) {
      Alert.alert('Not Supported', 'Speech synthesis is not supported on this platform.');
      return;
    }

    if (ttsPlaying) {
      window.speechSynthesis.cancel();
      setTtsPlaying(false);
      setTtsHighlightIndex(null);
    } else {
      // Narrate the stream title + active subtitle or all subtitles sequentially
      setTtsPlaying(true);
      const textToRead = activeSubtitle || `${streamDetails.title}. Recorded from location. ${streamDetails.description || ''}`;
      
      const utterance = new SpeechSynthesisUtterance(textToRead);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.rate = ttsRate;
      
      utterance.onend = () => {
        setTtsPlaying(false);
      };
      
      utterance.onerror = () => {
        setTtsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  // Likes & comments actions
  const handleLike = () => {
    if (isLiked) {
      setLikesCount(prev => prev - 1);
    } else {
      setLikesCount(prev => prev + 1);
    }
    setIsLiked(!isLiked);
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const comment = {
      id: Date.now().toString(),
      name: 'You (Reporter Studio)',
      text: newComment.trim(),
      time: 'Just now'
    };
    setComments(prev => [comment, ...prev]);
    setNewComment('');
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  if (error || !streamDetails) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error || 'Failed to locate archive recording'}</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Return to Live Explorer</Text>
        </Pressable>
      </View>
    );
  }

  // Format playback source URL safely
  let rawSource = streamDetails.videoUrl || streamDetails.recorded_video_url;
  let playbackSource = rawSource;
  if (rawSource && typeof rawSource === 'string' && rawSource.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawSource);
      if (Array.isArray(parsed) && parsed.length > 1) {
        playbackSource = parsed[1]; // Extract individual stream recording URL from playlist array
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        playbackSource = parsed[0];
      }
    } catch (e) {}
  }
  if (!playbackSource || playbackSource === 'null' || playbackSource === 'undefined') {
    playbackSource = `${API_URL}/media/uploads/intro.mp4`;
  } else if (playbackSource && !playbackSource.startsWith('http') && !playbackSource.startsWith('blob:') && !playbackSource.startsWith('data:')) {
    playbackSource = `${API_URL}/media/uploads/${playbackSource.split('/').pop()}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Player Header */}
      <View style={styles.playerHeader}>
        <Pressable onPress={() => {
          if (Platform.OS === 'web' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          navigation.goBack();
        }} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Close Player</Text>
        </Pressable>
        <Text style={styles.headerTitle}>NEXUS BROADCAST ARCHIVE</Text>
      </View>

      {/* Main Video Section */}
      <View style={styles.mainGrid}>
        <View style={styles.playerCol}>
          <View style={styles.playerContainer}>
            {Platform.OS === 'web' ? (
              <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
                <video
                  ref={videoRef}
                  src={playbackSource}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onClick={togglePlay}
                />
                
                {/* Custom Subtitles rendering */}
                {showSubtitles && activeSubtitle ? (
                  <div style={webStyles.subtitlesBox}>
                    <span style={webStyles.subtitlesText}>{activeSubtitle}</span>
                  </div>
                ) : null}

                {/* Subtitle speech narration highlight overlay */}
                {ttsPlaying && (
                  <div style={webStyles.ttsHighlight}>
                    <span style={{ color: '#10B981', fontWeight: 'bold' }}>🎙️ Narration Reading: </span>
                    <span style={{ color: '#FFF' }}>{activeSubtitle || 'Narrating metadata...'}</span>
                  </div>
                )}
              </div>
            ) : (
              <View style={styles.nativeVideoContainer}>
                <Text style={styles.nativeText}>Video player loaded in Web component</Text>
              </View>
            )}
          </View>

          {/* Web custom controls bar */}
          {Platform.OS === 'web' && (
            <View style={styles.controlsBar}>
              <Pressable onPress={togglePlay} style={styles.controlBtn}>
                <Text style={styles.controlBtnText}>{playing ? '⏸ Pause' : '▶ Play'}</Text>
              </Pressable>

              <Text style={styles.timeLabel}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>

              {/* Progress slider */}
              <Pressable onPress={handleScrub} style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(currentTime / (duration || 1)) * 100}%` }]} />
              </Pressable>

              {/* Speed rate drop down */}
              <View style={styles.speedControls}>
                {([0.5, 1, 1.5, 2] as const).map((r) => (
                  <Pressable 
                    key={r} 
                    onPress={() => changeSpeed(r)} 
                    style={[styles.speedBtn, playbackRate === r && styles.speedBtnActive]}
                  >
                    <Text style={[styles.speedText, playbackRate === r && styles.speedTextActive]}>{r}x</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={togglePip} style={styles.controlBtn}>
                <Text style={styles.controlBtnText}>📺 PiP</Text>
              </Pressable>

              <Pressable onPress={toggleFullscreen} style={styles.controlBtn}>
                <Text style={styles.controlBtnText}>🔲 Full</Text>
              </Pressable>
            </View>
          )}

          {/* AI Narration and Translation tools */}
          <View style={styles.aiControlsCard}>
            <Text style={styles.cardSectionTitle}>🎙️ AI Subtitles & Voice Narration</Text>
            
            <View style={styles.aiToolsRow}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Subtitles Overlay</Text>
                <Switch value={showSubtitles} onValueChange={setShowSubtitles} />
              </View>

              <Pressable 
                onPress={toggleTts} 
                style={[styles.ttsActionBtn, ttsPlaying ? { backgroundColor: '#EF4444' } : { backgroundColor: '#10B981' }]}
              >
                <Text style={styles.ttsActionText}>
                  {ttsPlaying ? '⏹ Mute AI Voice' : '🔊 AI Subtitles Reader'}
                </Text>
              </Pressable>
            </View>

            {/* Voice select panel */}
            {voices.length > 0 && (
              <View style={styles.voiceSelectBox}>
                <Text style={styles.label}>Select Narration Voice ({voices.length} detected):</Text>
                <ScrollView horizontal style={styles.voicesScroll}>
                  {voices.filter(v => v.lang.startsWith('en')).slice(0, 10).map((v, i) => {
                    const isSelected = selectedVoice?.name === v.name;
                    return (
                      <Pressable 
                        key={i} 
                        onPress={() => setSelectedVoice(v)} 
                        style={[styles.voiceBtn, isSelected && styles.voiceBtnActive]}
                      >
                        <Text style={[styles.voiceText, isSelected && styles.voiceTextActive]}>{v.name.slice(0, 20)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Metadata information */}
          <View style={styles.metadataCard}>
            <View style={styles.metaHeader}>
              <Text style={styles.metaTitle}>{streamDetails.title || 'Untitled Archive Broadcast'}</Text>
              <Text style={styles.metaCategory}>{streamDetails.category || 'General'}</Text>
            </View>
            
            <Text style={styles.metaDesc}>{streamDetails.description || 'No description provided for this broadcast.'}</Text>
            
            <View style={styles.metaFooter}>
              <Text style={styles.footerInfo}>👤 Reporter: {streamDetails.profile_name || 'Broadcaster'}</Text>
              <Text style={styles.footerInfo}>📍 Location: {streamDetails.location || 'Field'}</Text>
              <Text style={styles.footerInfo}>📅 Date: {new Date(streamDetails.started_at).toLocaleDateString()}</Text>
            </View>

            <View style={styles.engagementRow}>
              <Pressable onPress={handleLike} style={[styles.likeBtn, isLiked && styles.likeBtnActive]}>
                <Text style={[styles.likeBtnText, isLiked && { color: '#EF4444' }]}>
                  {isLiked ? '❤️ Liked' : '🤍 Like'} ({likesCount})
                </Text>
              </Pressable>
              
              <Text style={styles.viewsLabel}>👁️ {streamDetails.viewers || 0} Peak Views</Text>
            </View>
          </View>
        </View>

        {/* Right Comments/Chat Sidebar */}
        <View style={styles.sidebarCol}>
          <View style={styles.commentsCard}>
            <Text style={styles.sidebarTitle}>💬 Live Broadcast Replay Comments</Text>
            
            <View style={styles.addCommentBox}>
              <TextInput
                style={styles.commentInput}
                placeholder="Post a comment..."
                placeholderTextColor="#94A3B8"
                value={newComment}
                onChangeText={setNewComment}
              />
              <Pressable onPress={handleAddComment} style={styles.submitCommentBtn}>
                <Text style={styles.submitCommentText}>Submit</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.commentsScroll} contentContainerStyle={{ padding: 12 }}>
              {comments.map((c) => (
                <View key={c.id} style={styles.commentItem}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{c.name}</Text>
                    <Text style={styles.commentTime}>{c.time}</Text>
                  </View>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Custom CSS styles for standard HTML element features
const webStyles = {
  subtitlesBox: {
    position: 'absolute' as const,
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    zIndex: 100,
    pointerEvents: 'none' as const
  },
  subtitlesText: {
    color: '#FFF',
    fontSize: '15px',
    fontFamily: 'system-ui',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const
  },
  ttsHighlight: {
    position: 'absolute' as const,
    top: '12px',
    left: '12px',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderLeft: '4px solid #10B981',
    padding: '8px 12px',
    borderRadius: '4px',
    zIndex: 100,
    fontSize: '12px',
    pointerEvents: 'none' as const
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090F1D' },
  contentContainer: { padding: 24 },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorIcon: { fontSize: 60, marginBottom: 16 },
  errorText: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  backButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#3B82F6', borderRadius: 8 },
  backButtonText: { color: '#FFF', fontWeight: 'bold' },
  playerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  backBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: 1 },
  mainGrid: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  playerCol: { flex: 2, minWidth: 320, gap: 24 },
  sidebarCol: { flex: 1, minWidth: 300 },
  playerContainer: { height: 400, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#1E293B' },
  nativeVideoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  nativeText: { color: '#64748B' },
  controlsBar: { flexDirection: 'row', padding: 12, backgroundColor: '#1E293B', borderRadius: 8, alignItems: 'center', gap: 12 },
  controlBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0F172A', borderRadius: 6 },
  controlBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  timeLabel: { color: '#94A3B8', fontSize: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#0F172A', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  progressFill: { height: '100%', backgroundColor: '#3B82F6' },
  speedControls: { flexDirection: 'row', gap: 4 },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#0F172A' },
  speedBtnActive: { backgroundColor: '#3B82F6' },
  speedText: { color: '#94A3B8', fontSize: 10, fontWeight: 'bold' },
  speedTextActive: { color: '#FFF' },
  aiControlsCard: { padding: 20, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', gap: 16 },
  cardSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  aiToolsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { color: '#F8FAFC', fontSize: 14 },
  ttsActionBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  ttsActionText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  voiceSelectBox: { marginTop: 8 },
  label: { color: '#94A3B8', fontSize: 12, marginBottom: 8 },
  voicesScroll: { flexDirection: 'row', gap: 8 },
  voiceBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#0F172A', marginRight: 8 },
  voiceBtnActive: { backgroundColor: '#3B82F6' },
  voiceText: { color: '#94A3B8', fontSize: 11 },
  voiceTextActive: { color: '#FFF', fontWeight: 'bold' },
  metadataCard: { padding: 24, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', gap: 12 },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  metaTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', flex: 1, marginRight: 12 },
  metaCategory: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#3B82F6', color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  metaDesc: { color: '#94A3B8', fontSize: 14, lineHeight: 20 },
  metaFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#0F172A' },
  footerInfo: { color: '#64748B', fontSize: 12 },
  engagementRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  likeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155' },
  likeBtnActive: { borderColor: '#EF4444' },
  likeBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  viewsLabel: { color: '#94A3B8', fontSize: 13 },
  commentsCard: { height: 500, backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  sidebarTitle: { padding: 16, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', color: '#F8FAFC', fontWeight: 'bold', fontSize: 15 },
  addCommentBox: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#0F172A', gap: 12 },
  commentInput: { flex: 1, backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, color: '#FFF', fontSize: 14 },
  submitCommentBtn: { paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 8, justifyContent: 'center' },
  submitCommentText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  commentsScroll: { flex: 1 },
  commentItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0F172A', gap: 4 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  commentAuthor: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  commentTime: { color: '#64748B', fontSize: 11 },
  commentText: { color: '#94A3B8', fontSize: 13, lineHeight: 18 }
});
