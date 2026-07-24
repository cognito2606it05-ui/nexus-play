import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Animated, Platform, Linking, Modal, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { ShareModal } from './ShareModal';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import type { Reel, Profile } from '../types';
import { HoverPressable } from './HoverPressable';
import { useTheme } from '../state/ThemeContext';
import { api } from '../api/client';

const DOUBLE_TAP_MS = 280;

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  reel: Reel;
  isActive: boolean;
  height: number;
  width: number;
  onLike: () => void;
  onFollow: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  saved: boolean;
  onSkip?: () => void;
}

const SENSITIVE_KEYWORDS = [
  'nudity', 'porn', 'adult', 'violence', 'blood', 'gore', 'explicit', 'disturbing', 'accident', 'crash', 'dead', 'kill', 'suicide', 'sex', 'sexy', 'naked', 'weapon', 'gun', 'killing', 'murder'
];

function checkIsSensitive(title?: string, desc?: string) {
  const combined = `${title || ''} ${desc || ''}`.toLowerCase();
  return SENSITIVE_KEYWORDS.some(keyword => combined.includes(keyword));
}

function BlurRegionsOverlay({ regions }: { regions?: any[] }) {
  return null;
}

function ReelCardBase({
  reel, isActive, height, width, onLike, onFollow, onComment, onShare, onSave, saved, onSkip,
}: Props) {
  const { isDark } = useTheme();
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [revealed, setRevealed] = useState(false);
  
  const isSensitive = reel.needsBlur || checkIsSensitive(reel.title, reel.description);

  // Share popup state
  const [shareVisible, setShareVisible] = useState(false);

  const player = useVideoPlayer(reel.videoUrl, (p) => {
    p.loop = true;
    p.muted = !isActive;
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<View>(null);

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play/pause and mute/unmute control for Web vs Native
  useEffect(() => {
    if (isSensitive && !revealed) {
      if (Platform.OS === 'web') {
        const el = videoRef.current;
        if (el) el.pause();
      } else {
        if (player) {
          try {
            player.pause();
          } catch {}
        }
      }
      return;
    }

    if (Platform.OS === 'web') {
      const el = videoRef.current;
      if (!el) return;
      el.muted = muted;
      if (isActive && !paused) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    } else {
      if (!player) return;
      if (isActive && !paused) {
        try {
          player.muted = muted;
          player.play();
        } catch {}
      } else {
        try {
          player.muted = true;
          player.pause();
        } catch {}
      }
    }
  }, [isActive, paused, player, muted, revealed, isSensitive]);

  // Progress tracking: Web listeners vs Native polling
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!isActive) return;
      const el = videoRef.current;
      if (!el) return;
      const onTimeUpdate = () => {
        const d = el.duration || 0;
        const cur = el.currentTime || 0;
        setCurrentTime(cur);
        setDuration(d);
        setProgress(d > 0 ? Math.min(1, cur / d) : 0);
      };
      el.addEventListener('timeupdate', onTimeUpdate);
      return () => {
        el.removeEventListener('timeupdate', onTimeUpdate);
      };
    } else {
      if (!isActive || !player) return;
      const id = setInterval(() => {
        try {
          const d = player.duration || 0;
          const cur = player.currentTime || 0;
          setCurrentTime(cur);
          setDuration(d);
          setProgress(d > 0 ? Math.min(1, cur / d) : 0);
        } catch {}
      }, 250);
      return () => clearInterval(id);
    }
  }, [isActive, player]);

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  const popHeart = () => {
    heartScale.setValue(0.4);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(heartOpacity, { toValue: 0, delay: 350, duration: 350, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };

  const handleTap = () => {
    if (isSensitive) return; // prevent play toggle when blurred

    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current = 0;
      if (!reel.liked) onLike();
      popHeart();
    } else {
      lastTap.current = now;
      singleTapTimer.current = setTimeout(() => {
        setPaused((p) => !p);
        singleTapTimer.current = null;
      }, DOUBLE_TAP_MS);
    }
  };

  // Interactive Progress seek tracker handlers
  const handleProgressSeek = (evt: any) => {
    if (isSensitive) return; // prevent seek when blurred

    const pageX = evt.nativeEvent.pageX;
    trackRef.current?.measure((x, y, trackW, trackH, pageXOffset, pageYOffset) => {
      const relativeX = pageX - pageXOffset;
      const ratio = Math.max(0, Math.min(1, relativeX / trackW));
      setProgress(ratio);
      const targetTime = ratio * duration;
      setCurrentTime(targetTime);
      
      if (Platform.OS === 'web') {
        if (videoRef.current) {
          videoRef.current.currentTime = targetTime;
        }
      } else {
        if (player) {
          (player as any).seekTo(targetTime);
        }
      }
    });
  };

  // URL Sharing details
  const getReelUrl = () => {
    const origin = Platform.OS === 'web' ? window.location.origin : 'http://localhost:4000';
    return `${origin}/news?tab=Reels&reelId=${reel.id}`;
  };

  const handleShareClick = () => {
    onShare(); // Record backend stats
    setShareVisible(true);
  };

  return (
    <View style={[styles.container, { height, width }, Platform.OS === 'web' ? { scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0 } as any : {}]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap}>
        {!isSensitive ? (
          Platform.OS === 'web' ? (
            <video
              ref={videoRef}
              src={reel.videoUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: '#000',
              }}
              loop
              playsInline
              muted={muted}
              preload="auto"
            />
          ) : (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          )
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
        )}
        <BlurRegionsOverlay regions={reel.blurRegions} />
        {isSensitive && (
          <View style={[styles.blurOverlay, { zIndex: 100, backgroundColor: 'rgba(15, 23, 42, 0.98)', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={styles.blurEmoji}>⚠️</Text>
            <Text style={styles.blurText}>Sensitive Content</Text>
            <Text style={styles.blurDesc}>
              This reel contains adult or disturbing content and has been permanently blurred for safety.
            </Text>
            <View style={styles.blurBtnRow}>
              <Pressable
                style={[styles.blurBtn, styles.blurBtnSecondary]}
                onPress={() => {
                  if (onSkip) onSkip();
                }}
              >
                <Text style={styles.blurBtnTextSecondary}>Skip Reel</Text>
              </Pressable>
            </View>
          </View>
        )}
        {!isSensitive && (
          <>
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']}
              locations={[0, 0.25, 0.6, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {paused && (
              <View style={styles.centerIcon} pointerEvents="none">
                <Text style={styles.playGlyph}>▶</Text>
              </View>
            )}
            <Animated.View
              style={[styles.heart, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
              pointerEvents="none"
            >
              <Text style={styles.heartGlyph}>♥</Text>
            </Animated.View>
          </>
        )}
      </Pressable>

      {/* Mute toggle */}
      {!isSensitive && (
        <HoverPressable
          style={styles.muteBtn}
          onPress={() => { const m = !muted; setMuted(m); try { player.muted = m; } catch {} }}
        >
          <Text style={styles.muteGlyph}>{muted ? '🔇' : '🔊'}</Text>
        </HoverPressable>
      )}

      {/* Right action rail */}
      {!isSensitive && (
        <View style={styles.actions}>
          <Action glyph={reel.liked ? '♥' : '♡'} color={reel.liked ? colors.like : '#fff'} label={compact(reel.stats.likes)} onPress={onLike} big />
          <Action glyph="💬" label={compact(reel.stats.comments)} onPress={onComment} />
          <Action glyph="↗" label={compact(reel.stats.shares)} onPress={handleShareClick} />
          <Action glyph={saved ? '✓' : '＋'} color={saved ? colors.accent : '#fff'} label={saved ? 'Saved' : 'Save'} onPress={onSave} />
        </View>
      )}

      {/* Creator + caption */}
      {!isSensitive && (
        <View style={[styles.bottom, { width: width - 84 }]}>
          <View style={styles.creatorRow}>
            {reel.creator.avatar ? (
              <Image source={{ uri: reel.creator.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{reel.creator.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.creatorName} numberOfLines={1}>{reel.creator.handle}</Text>
            <HoverPressable
              style={[styles.followBtn, reel.creator.isFollowing && styles.followingBtn]}
              onPress={onFollow}
            >
              <Text style={[styles.followText, reel.creator.isFollowing && styles.followingText]}>
                {reel.creator.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </HoverPressable>
          </View>
          <Text style={styles.title} numberOfLines={2}>{reel.title}</Text>
          <Text style={styles.desc} numberOfLines={1}>{compact(reel.stats.views)} views · {reel.description}</Text>
        </View>
      )}

      {/* Interactive Progress bar */}
      {!isSensitive && (
        <View style={styles.progressContainer}>
          <View style={styles.timeLabelRow}>
            <Text style={styles.timeLabelText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeLabelText}>{formatTime(duration)}</Text>
          </View>
          <View
            ref={trackRef}
            style={styles.progressTrackInteractive}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleProgressSeek}
            onResponderMove={handleProgressSeek}
          >
            <View style={styles.progressTrackBackground}>
              <View style={[styles.progressFillInteractive, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
      )}


      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        shareUrl={getReelUrl()}
        title={reel.title}
        description={reel.description}
        onShareSuccess={(profileName) => {
          alert(`Reel shared with ${profileName} successfully!`);
        }}
      />
    </View>
  );
}

function ShareItem({ label, icon, onPress, isDark }: { label: string; icon: string; onPress: () => void; isDark: boolean }) {
  return (
    <Pressable
      style={({ hovered }: any) => [
        styles.shareItemBtn,
        hovered && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }
      ]}
      onPress={onPress}
    >
      <Text style={styles.shareItemIcon}>{icon}</Text>
      <Text style={[styles.shareItemLabel, { color: isDark ? '#E2E8F0' : '#334155' }]}>{label}</Text>
    </Pressable>
  );
}

function Action({ glyph, label, onPress, color = '#fff', big }: {
  glyph: string; label: string; onPress: () => void; color?: string; big?: boolean;
}) {
  return (
    <HoverPressable style={styles.action} onPress={onPress} hitSlop={8}>
      <Text style={[styles.actionGlyph, big && styles.actionGlyphBig, { color }]}>{glyph}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </HoverPressable>
  );
}

export const ReelCard = React.memo(ReelCardBase);

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  centerIcon: {
    ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center',
  },
  playGlyph: { color: 'rgba(255,255,255,0.85)', fontSize: 64 },
  heart: {
    position: 'absolute', alignSelf: 'center', top: '40%',
  },
  heartGlyph: { color: '#fff', fontSize: 110, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 12 },
  muteBtn: {
    position: 'absolute', top: 52, right: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  muteGlyph: { fontSize: 16 },
  actions: { position: 'absolute', right: 10, bottom: 130, alignItems: 'center' },
  action: { alignItems: 'center', marginBottom: 22 },
  actionGlyph: { fontSize: 30, color: '#fff' },
  actionGlyphBig: { fontSize: 34 },
  actionLabel: { color: '#fff', fontSize: 12, marginTop: 3, fontWeight: '600' },
  bottom: { position: 'absolute', left: 14, bottom: 96 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, borderWidth: 1.5, borderColor: '#fff' },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '700' },
  creatorName: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  followBtn: {
    marginLeft: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: '#fff',
  },
  followingBtn: { borderColor: 'rgba(255,255,255,0.45)' },
  followText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  followingText: { color: 'rgba(255,255,255,0.7)' },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  desc: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  blurOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
      }
    }) as any,
  },
  blurEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  blurText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Outfit',
  },
  blurDesc: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'Outfit',
    maxWidth: 240,
  },
  // Progress Bar Styles
  progressContainer: {
    position: 'absolute',
    left: 14,
    right: 84,
    bottom: 24,
    zIndex: 100,
  },
  timeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeLabelText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10.5,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  progressTrackInteractive: {
    height: 12,
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  progressTrackBackground: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFillInteractive: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    transform: [{ translateX: -6 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  // Fallback Custom Share Popup Modal Styles
  modalOverlayShare: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareContent: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  shareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareTitleText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  shareCloseBtn: {
    padding: 6,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  shareItemBtn: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  shareItemIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  shareItemLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  // New section styles
  sectionTitleText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Outfit',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  profilesSection: {
    minHeight: 64,
    justifyContent: 'center',
    marginBottom: 12,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  noUsersText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  profilesRow: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 4,
  },
  profileItem: {
    alignItems: 'center',
    width: 60,
  },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    overflow: 'hidden',
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  profileAvatarInitial: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: 'Outfit',
  },
  profileName: {
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  shareDivider: {
    height: 1.5,
    marginVertical: 12,
    width: '100%',
  },
  // Blur warning actions styles
  blurBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    zIndex: 120,
  },
  blurBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  blurBtnPrimary: {
    backgroundColor: colors.primary,
  },
  blurBtnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  blurBtnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: 'Outfit',
  },
  blurBtnTextSecondary: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: 'Outfit',
  },

});
