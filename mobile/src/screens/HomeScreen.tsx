import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Platform,
  useWindowDimensions,
  TextInput,
  Animated,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { HoverPressable } from '../components/HoverPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThreeDForestBg } from '../components/ThreeDForestBg';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import { io } from 'socket.io-client';
import { useTheme } from '../state/ThemeContext';
import { AppHeader } from '../components/AppHeader';
import { BreakingNewsTicker } from '../components/BreakingNewsTicker';
import { StorySkeleton, FeedCardSkeleton } from '../components/Skeletons';
import { TopStoriesCarousel } from '../components/TopStoriesCarousel';
import { ShareModal } from '../components/ShareModal';
import type { Movie, Reel, NewsItem } from '../types';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../state/AuthContext';
import { NexusAssistantModal } from '../components/NexusAssistantModal';
import { API_URL } from '../config';
import { LazyImage } from '../components/LazyImage';
import { AIUploadScanner } from '../components/AIUploadScanner';
import { Translate } from '../state/LanguageContext';

const PRIMARY_LOGO = require('../../assets/nexuslogo.png');

const LOCATION_SUGGESTIONS = [
  'Visakhapatnam, AP',
  'NTR (Vijayawada), AP',
  'Guntur, AP',
  'Tirupati, AP',
  'Nellore, AP',
  'Kurnool, AP',
  'Anantapur, AP',
  'Kakinada, AP',
  'Eluru, AP',
  'Hyderabad, Telangana',
  'Warangal, Telangana',
  'Karimnagar, Telangana',
  'Khammam, Telangana',
  'Nalgonda, Telangana',
  'New Delhi, Delhi',
  'North Delhi, Delhi',
  'South Delhi, Delhi',
  'West Delhi, Delhi',
  'East Delhi, Delhi',
  'Mumbai, Maharashtra',
  'Bengaluru, Karnataka'
];

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function MoviePlayer({ uri, styles }: { uri: string; styles?: any }) {
  if (Platform.OS === 'web' && (uri.includes('youtube.com') || uri.includes('youtu.be'))) {
    // Extract video ID
    let videoId = '';
    if (uri.includes('youtu.be/')) {
      videoId = uri.split('youtu.be/')[1]?.split('?')[0];
    } else if (uri.includes('v=')) {
      videoId = uri.split('v=')[1]?.split('&')[0];
    } else if (uri.includes('embed/')) {
      videoId = uri.split('embed/')[1]?.split('?')[0];
    } else if (uri.includes('live/')) {
      videoId = uri.split('live/')[1]?.split('?')[0];
    }
    return (
      <View style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&rel=0&modestbranding=1`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 'none', width: '100%', height: '100%', backgroundColor: '#000' }}
        />
        {/* Top Title/Share Block Overlay to prevent YouTube redirect */}
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 55, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
        {/* Bottom Right YouTube Logo Block Overlay to prevent YouTube redirect */}
        <Pressable
          style={{ position: 'absolute', bottom: 0, right: 0, width: 90, height: 45, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
      </View>
    );
  }

  // Fallback for native or standard non-youtube videos
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) {
    return (
      <View style={[styles?.modalVideo, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
        <Text style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
          YouTube playback is supported in Web interface.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <video
        src={uri}
        style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
        controls
        autoPlay
        playsInline
      />
    );
  }

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  return <VideoView player={player} style={styles?.modalVideo || { width: '100%', height: '100%' }} contentFit="contain" />;
}

const ALL_CATEGORIES_TAXONOMY = [
  {
    theme: '📰 General & Main',
    categories: ['Breaking News', 'Top Stories', 'Latest News', 'Trending News', 'National News', 'International News', 'Regional News', 'Local News']
  },
  {
    theme: '🏛 Politics & Government',
    categories: ['Politics', 'Elections', 'Government Policies', 'Parliament & Legislature', 'Public Administration', 'Diplomacy']
  },
  {
    theme: '💼 Business & Economy',
    categories: ['Business', 'Economy', 'Finance', 'Banking', 'Startups', 'Markets', 'Stock Market', 'Cryptocurrency', 'Real Estate', 'Industry']
  },
  {
    theme: '💻 Technology & Innovation',
    categories: ['Technology', 'Artificial Intelligence (AI)', 'Cybersecurity', 'Gadgets', 'Software', 'Internet & Social Media', 'Space Technology']
  },
  {
    theme: '🏏 Sports',
    categories: ['Sports', 'Cricket', 'Football', 'Tennis', 'Basketball', 'Kabaddi', 'Olympics', 'Formula 1', 'Esports', 'Other Sports']
  },
  {
    theme: '🎬 Entertainment',
    categories: ['Entertainment', 'Movies', 'OTT & Streaming', 'Web Series', 'TV Shows', 'Music', 'Celebrity News', 'Box Office', 'Theatre & Arts']
  },
  {
    theme: '🛕 DEVOTIONAL',
    categories: [
      'Temple News',
      'Spiritual News',
      'Hindu Dharma',
      'Festivals',
      'Pooja & Rituals',
      'Pilgrimage',
      'Devotional Songs',
      'Bhajans',
      'Slokas',
      'Vedas & Upanishads',
      'Bhagavad Gita',
      'Ramayana',
      'Mahabharata',
      'Puranas',
      'Saints & Gurus',
      'Astrology',
      'Panchangam',
      'Daily Horoscope',
      'Meditation',
      'Yoga',
      'Quotes & Teachings',
      'Religious Events',
      'Temple Festivals',
      'Charity & Seva',
      'Spiritual Discourses'
    ]
  },
  {
    theme: '🏥 Health & Wellness',
    categories: ['Health', 'Wellness', 'Nutrition', 'Mental Health', 'Medicine & Research', 'Healthcare Industry', 'Public Health']
  },
  {
    theme: '📚 Education & Careers',
    categories: ['Education', 'Board Exams', 'University News', 'Higher Education', 'Jobs & Careers', 'Skill Development']
  },
  {
    theme: '🚀 Science & Space',
    categories: ['Science', 'Space Exploration', 'Astronomy', 'Physics & Chemistry', 'Biology & Genetics']
  },
  {
    theme: '🌱 Environment & Climate',
    categories: ['Climate Change', 'Environment', 'Renewable Energy', 'Wildlife & Conservation', 'Sustainability', 'Weather Updates']
  },
  {
    theme: '⚖️ Crime & Law',
    categories: ['Crime News', 'Judiciary & Courts', 'Law Enforcement', 'Cyber Crime', 'Legal System']
  },
  {
    theme: '✨ Lifestyle & Culture',
    categories: ['Lifestyle', 'Travel', 'Food & Recipes', 'Fashion', 'Automotive', 'Art & Culture', 'Books & Literature']
  },
  {
    theme: '🌎 International & World',
    categories: ['World News', 'Global Conflicts', 'International Relations', 'UN & Global Bodies']
  },
  {
    theme: '⭐ Special Features',
    categories: ['Editorial & Opinion', 'In-depth Investigations', 'Fact Check', 'Good News', 'History & Nostalgia', 'Obits']
  },
  {
    theme: '📍 Regional & Local Focus',
    categories: ['State-wise News', 'City Updates', 'Community Stories', 'Civic Issues']
  }
];

function BlurRegionsOverlay({ regions }: { regions?: any[] }) {
  return null;
}

function InlineReelPlayer({ videoUrl, isNews, blurRegions, needsBlur, blurReason }: { videoUrl: string; isNews?: boolean; blurRegions?: any[]; needsBlur?: boolean; blurReason?: string }) {
  const [isMuted, setIsMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);

  const playlist = React.useMemo(() => {
    if (!isNews) return [videoUrl];
    if (videoUrl.startsWith('[') && videoUrl.endsWith(']')) {
      try {
        return JSON.parse(videoUrl) as string[];
      } catch {}
    }
    const isDirectVideo = videoUrl.toLowerCase().endsWith('.mp4') || videoUrl.toLowerCase().endsWith('.mov') || videoUrl.includes('supabase.co');
    if (isDirectVideo && !videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
      return [
        `${API_URL}/media/uploads/intro.mp4`,
        videoUrl,
        `${API_URL}/media/uploads/post.mp4`
      ];
    }
    return [videoUrl];
  }, [videoUrl, isNews]);

  const currentVideoUrl = playlist[trackIndex] || videoUrl;

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = isMuted;
    if (needsBlur) {
      el.pause();
      return;
    }
    if (!paused) {
      el.play().catch(() => {});
    } else {
      el.focus();
      el.pause();
    }
  }, [paused, isMuted, currentVideoUrl, needsBlur]);

  // On Web, render HTML5 <video> for instant load
  if (Platform.OS === 'web') {
    const handleEnded = () => {
      if (isNews && trackIndex < playlist.length - 1) {
        setTrackIndex(trackIndex + 1);
      }
    };

    return (
      <Pressable 
        style={{ width: '100%', height: 320, backgroundColor: '#000', position: 'relative', justifyContent: 'center', alignItems: 'center' }}
        onPress={() => !needsBlur && setPaused(!paused)}
      >
        {!needsBlur ? (
          <video
            ref={videoRef}
            key={currentVideoUrl}
            src={currentVideoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            autoPlay
            playsInline
            loop={!isNews}
            onEnded={handleEnded}
          />
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
        )}
        <BlurRegionsOverlay regions={blurRegions} />
        {needsBlur && (
          <View style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.98)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            zIndex: 10,
            ...Platform.select({
              web: {
                backdropFilter: 'blur(35px)',
                WebkitBackdropFilter: 'blur(35px)',
              }
            }) as any
          }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>⚠️</Text>
            <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 4 }}>Graphic Content Blurred</Text>
            {blurReason && <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{blurReason}</Text>}
          </View>
        )}
        {!needsBlur && paused && (
          <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 24 }}>▶</Text>
          </View>
        )}
        {!needsBlur && (
          <Pressable 
            style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 20, zIndex: 10 }}
            onPress={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>{isMuted ? '🔇' : '🔊'}</Text>
          </Pressable>
        )}
      </Pressable>
    );
  }

  // On Native, use expo-video
  const player = useVideoPlayer(currentVideoUrl, (p) => {
    p.loop = !isNews;
    p.muted = isMuted;
    p.play();
  });

  useEffect(() => {
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, player]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  // Playlist sequencing on Native: listen to end of playback
  useEffect(() => {
    if (!isNews) return;
    const subscription = player.addListener('playToEnd', () => {
      if (trackIndex < playlist.length - 1) {
        setTrackIndex(trackIndex + 1);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, trackIndex, playlist, isNews]);

  return (
    <Pressable 
      style={{ width: '100%', height: 320, backgroundColor: '#000', position: 'relative', justifyContent: 'center', alignItems: 'center' }}
      onPress={() => !needsBlur && setPaused(!paused)}
    >
      {!needsBlur ? (
        <VideoView 
          player={player} 
          style={StyleSheet.absoluteFill} 
          contentFit="contain" 
          nativeControls={false} 
        />
      ) : (
        <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
      )}
      <BlurRegionsOverlay regions={blurRegions} />
      {needsBlur && (
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.98)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          zIndex: 10,
        }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>⚠️</Text>
          <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 4 }}>Graphic Content Blurred</Text>
          {blurReason && <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{blurReason}</Text>}
        </View>
      )}
      {!needsBlur && paused && (
        <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 24 }}>▶</Text>
        </View>
      )}
      {!needsBlur && (
        <Pressable 
          style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 20 }}
          onPress={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
        >
          <Text style={{ color: '#fff', fontSize: 14 }}>{isMuted ? '🔇' : '🔊'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const { colors, themeMode, toggleTheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  
  // Auth and Profile
  const { activeProfile, user, signOut, switchProfile } = useAuth();
  
  // Modals state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);
  
  // Animations values
  const scrollY = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  
  // Continuous logo float and glowing ring animations
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 2.5,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: -2.5,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.2,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  // Real-time top stories updater
  useEffect(() => {
    const socket = io(API_URL);
    socket.on('top-stories-update', (data) => {
      console.log('[Realtime Websocket] Top stories changed, reloading...', data);
      loadData();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Data State
  const [liveStreams, setLiveStreams] = useState<any[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [dynamicTopStories, setDynamicTopStories] = useState<any[]>([]);
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  
  // Stories module states
  const [stories, setStories] = useState<any[]>([]);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [storyMediaType, setStoryMediaType] = useState<'image' | 'video'>('image');
  const [storyMediaData, setStoryMediaData] = useState('');
  const [storyContent, setStoryContent] = useState('');
  const [publishingStory, setPublishingStory] = useState(false);

  // Story Viewer Modal states
  const [activeStoryGroup, setActiveStoryGroup] = useState<any | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Instagram-style comment, liked, and saved states
  const [commentingItem, setCommentingItem] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());
  const [localLikedNewsIds, setLocalLikedNewsIds] = useState<Set<string>>(new Set());

  const [showScanner, setShowScanner] = useState(false);
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [modWarning, setModWarning] = useState<{
    visible: boolean;
    title: string;
    rejectReason: string;
    type: 'post';
    formData: any;
  } | null>(null);

  const handleModCancel = () => {
    if (modWarning) {
      setShowCreatePostModal(true);
    }
    setModWarning(null);
  };

  const handleModContinueAnyway = async () => {
    if (!modWarning) return;
    const { formData } = modWarning;
    
    setModWarning(null);
    setScanProgress(0);
    setScanStatus('Re-submitting with safety filters enabled...');
    setShowScanner(true);

    let progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev < 40) {
          setScanStatus('Applying safety blur masks...');
          return prev + 12;
        } else if (prev < 80) {
          setScanStatus('Uploading sanitized asset content...');
          return prev + 8;
        } else if (prev < 98) {
          setScanStatus('Finalizing secure cataloging...');
          return prev + 2;
        }
        return prev;
      });
    }, 100);

    try {
      const newPost = await api.createPost(
        formData.content,
        formData.location,
        formData.imageData,
        formData.targetLang,
        true,
        formData.imageName
      );
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Uploaded! sensitive regions will be blurred.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const taggedPost = {
        ...newPost,
        feedType: 'post',
        timestamp: new Date(newPost.createdAt || Date.now()).getTime(),
      };
      setFeedItems((prev) => [taggedPost, ...prev]);
      setShowCreatePostModal(false);
      setPostContent('');
      setPostLocation('');
      setPostFileName('');
      setPostImageData('');
      setPostTargetLang('None');
      showToast('Post created successfully!');
    } catch (err: any) {
      clearInterval(progressInterval);
      alert(err.message || 'Failed to create post');
      setShowCreatePostModal(true);
    } finally {
      setShowScanner(false);
      setScanProgress(0);
    }
  };
  const [toastMsg, setToastMsg] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(1500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  };
  
  // Create Post Modal State (we'll keep this if needed, or remove since user can create posts in the News tab)
  // Let's keep it just in case, but user will primarily post in News hub tab. Let's keep the modal for home screen posts.
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [postFileName, setPostFileName] = useState('');
  const [postImageData, setPostImageData] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postTargetLang, setPostTargetLang] = useState('None');
  const [selectedCategory, setSelectedCategory] = useState('Home');
  const [showMoreModal, setShowMoreModal] = useState(false);

  const [shareItem, setShareItem] = useState<{ url: string; title: string; description?: string } | null>(null);

  const handleSharePost = (post: any) => {
    const origin = Platform.OS === 'web' ? window.location.origin : 'http://localhost:4000';
    const type = post.feedType || 'post';
    const shareUrl = `${origin}/news?tab=Feed&${type}Id=${post.id}`;
    setShareItem({
      url: shareUrl,
      title: post.title || post.content || 'NEXUS Post',
      description: post.summary || post.description || ''
    });
  };

  const loadData = async () => {
    try {
      // 1. Fetch active live streams, official channels and stories in parallel
      const [streamsRes, officialRes, storiesRes] = await Promise.all([
        api.getStreams().catch(() => ({ data: [] })),
        api.getOfficialChannels().catch(() => ({ data: [] })),
        api.getStories().catch(() => ({ data: [] }))
      ]);
      
      const officialChannels = (officialRes.data || []).map((c: any) => ({
        id: c.id || `off-${Math.random()}`,
        name: c.name || 'Official Channel',
        category: c.category || c.cat || 'News',
        now: c.now || c.now_playing || 'Live Stream',
        viewers: c.viewers || 0,
        isOfficial: true,
        logoText: (c.name && typeof c.name === 'string') ? (c.name.split(' ')[0]?.charAt(0) || 'N') : 'N',
      }));
      
      const userStreams = (streamsRes.data || []).map((s: any) => ({
        id: s.id || `user-${Math.random()}`,
        name: s.profile_name || s.name || 'User Live',
        category: s.category || 'General',
        now: s.title || s.now || 'Live Broadcast',
        viewers: s.viewers || 0,
        isOfficial: false,
        logoText: '👤',
      }));
      
      let allStreams = [...userStreams, ...officialChannels];
      if (allStreams.length === 0) {
        allStreams = [
          { id: 'off-1', name: 'Official Live TV', category: 'News', now: 'Breaking Live Broadcast', viewers: 1420, isOfficial: true, logoText: '📡' },
          { id: 'off-2', name: 'Official Live TV 2', category: 'News', now: '24/7 Global Stream', viewers: 980, isOfficial: true, logoText: '📺' },
          { id: 'off-3', name: 'User 7999', category: 'General', now: 'Debate Room', viewers: 430, isOfficial: false, logoText: '👤' },
          { id: 'off-4', name: 'Demo Profile', category: 'Entertainment', now: 'Tech Discussion', viewers: 215, isOfficial: false, logoText: '👤' },
        ];
      }
      setLiveStreams(allStreams);
      setStories(storiesRes.data || []);
      
      // 2. Fetch Reels
      const reelsRes = await api.getReels(null, 15).catch(() => ({ data: [] }));
      setReels(reelsRes.data || []);
      
      // 3. Fetch News & Social Posts to construct the Feed
      const newsRes = await api.getNews().catch(() => ({ data: [] }));
      const postsRes = await api.getPosts().catch(() => ({ data: [] }));
      
      // Fetch watchlist to sync saved states
      const watchlistRes = await api.getWatchlist().catch(() => ({ data: [] }));
      const watchlistIds = new Set((watchlistRes.data || []).map((x) => x.contentId));
      setSavedIds(watchlistIds);
      
      // Fetch followed creators
      if (activeProfile) {
        const activityRes = await api.getProfileActivity(activeProfile.id).catch(() => ({ follows: [] }));
        const followedIds = new Set((activityRes.follows || []).map((x) => x.id));
        setFollowedCreatorIds(followedIds);
      }

      let rawNews = newsRes.data || [];
      if (rawNews.length === 0) {
        rawNews = [
          {
            id: 'c0a36806-4ce7-4519-b262-66b726ce80ab',
            title: 'WhatsApp Image 2026 07 30 at 15.49.48',
            summary: 'Godavari district devotional updates and special temple pooja rituals.',
            category: 'General',
            source: 'NEXUS Network',
            imageUrl: '/media/uploads/1785497334162_WhatsApp_Image_2026-07-30_at_15.45.44.jpeg',
            publishedAt: '2026-07-31T11:28:58.023Z',
            readMinutes: 2
          },
          {
            id: 'godavari-devotional-story',
            title: 'godavari',
            summary: 'Special prayers and spiritual gatherings on the banks of Godavari river.',
            category: 'Devotional',
            source: 'NEXUS Network',
            imageUrl: '/media/uploads/1785401097366_WhatsApp_Image_2026-07-30_at_11.22.56__1_.jpeg',
            publishedAt: '2026-07-30T08:45:00.899Z',
            readMinutes: 3
          },
          {
            id: 'cricket-sports-story',
            title: 'cricket',
            summary: 'High stakes match coverage and live tournament statistics.',
            category: 'Sports',
            source: 'NEXUS Network',
            imageUrl: '/media/uploads/1785564361196_spt3.jpeg',
            publishedAt: '2026-08-01T06:06:04.839Z',
            readMinutes: 4
          },
          {
            id: 'gold-rates-story',
            title: 'gold',
            summary: 'Latest market trends, bullion prices and gold rate updates across major cities.',
            category: 'Business',
            source: 'NEXUS Network',
            imageUrl: '/media/uploads/1785651082062_gen5.jpeg',
            publishedAt: '2026-08-02T06:11:25.438Z',
            readMinutes: 5
          }
        ];
      }

      const taggedNews = rawNews.map((item: any) => ({
        ...item,
        feedType: 'news',
        timestamp: new Date(item.publishedAt || item.createdAt || Date.now()).getTime(),
      }));
      
      const taggedPosts = (postsRes.data || []).map((item: any) => ({
        ...item,
        feedType: 'post',
        timestamp: new Date(item.createdAt || item.publishedAt || Date.now()).getTime(),
      }));

      const taggedReels = (reelsRes.data || []).map((item: any) => ({
        ...item,
        feedType: 'reel',
        timestamp: new Date(item.createdAt || Date.now()).getTime(),
      }));
      
      const mergedFeed = [...taggedNews, ...taggedPosts, ...taggedReels];
      setFeedItems(mergedFeed);

      // 4. Fetch dynamic top stories from CMS
      const topStoriesRes = await api.request<{ data: any[] }>('/api/admin/top-stories/public').catch(() => ({ data: [] }));
      let topStories = topStoriesRes.data || [];
      if (topStories.length === 0) {
        topStories = rawNews;
      }
      setDynamicTopStories(topStories);
    } catch (error) {
      console.error('Failed to load home dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Auto-advance active story slides
  useEffect(() => {
    if (!activeStoryGroup) return;
    const storiesList = activeStoryGroup.stories || [];
    if (storiesList.length === 0) return;

    // Log a view when a story is shown
    const currentStory = storiesList[activeStoryIndex];
    if (currentStory) {
      api.viewStory(currentStory.id).catch(() => {});
    }

    const timer = setTimeout(() => {
      if (activeStoryIndex < storiesList.length - 1) {
        setActiveStoryIndex(activeStoryIndex + 1);
      } else {
        // End of story group
        setActiveStoryGroup(null);
        setActiveStoryIndex(0);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [activeStoryGroup, activeStoryIndex]);

  const handleOpenStoryGroup = (group: any) => {
    setActiveStoryGroup(group);
    setActiveStoryIndex(0);
  };

  const handleYourStoryPress = () => {
    const ownGroup = stories.find(sg => sg.profileId === activeProfile?.id);
    if (!ownGroup) {
      triggerStoryPicker();
      return;
    }
    
    Alert.alert(
      'Your Story',
      'Would you like to view your active stories or add a new one?',
      [
        { text: '👁️ View Story', onPress: () => handleOpenStoryGroup(ownGroup) },
        { text: '➕ Add Story', onPress: triggerStoryPicker },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const triggerStoryPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*,video/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const lowerName = asset.name.toLowerCase();
        const ext = lowerName.split('.').pop() || '';
        const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
        setStoryMediaType(isVideo ? 'video' : 'image');

        let base64 = '';
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const resultStr = reader.result as string;
                resolve(resultStr.split(',')[1]);
              };
            });
            reader.readAsDataURL(file);
            base64 = await base64Promise;
          }
        } else {
          base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        if (base64) {
          setStoryMediaData(base64);
          setStoryContent('');
          setShowCreateStoryModal(true);
        }
      }
    } catch (err) {
      console.error('Error picking story media:', err);
      alert('Failed to select story media');
    }
  };

  const handlePublishStory = async () => {
    if (!storyMediaData) return;
    setPublishingStory(true);
    try {
      await api.createStory({
        mediaData: storyMediaData,
        mediaType: storyMediaType,
        content: storyContent.trim()
      });
      // Refresh stories
      const storiesRes = await api.getStories().catch(() => ({ data: [] }));
      setStories(storiesRes.data || []);
      
      setShowCreateStoryModal(false);
      setStoryMediaData('');
      setStoryContent('');
      showToast('Story published successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to publish story');
    } finally {
      setPublishingStory(false);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteStory(storyId);
              // Refresh stories
              const storiesRes = await api.getStories().catch(() => ({ data: [] }));
              const newStories = storiesRes.data || [];
              setStories(newStories);
              
              // Update viewer state
              const updatedGroup = newStories.find(sg => sg.profileId === activeStoryGroup?.profileId);
              if (updatedGroup && updatedGroup.stories.length > 0) {
                setActiveStoryGroup(updatedGroup);
                setActiveStoryIndex(Math.max(0, activeStoryIndex - 1));
              } else {
                setActiveStoryGroup(null);
                setActiveStoryIndex(0);
              }
              showToast('Story deleted');
            } catch (err: any) {
              alert('Failed to delete story');
            }
          }
        }
      ]
    );
  };

  const handleStoryReaction = async (storyId: string, reaction: string) => {
    try {
      const res = await api.reactToStory(storyId, reaction);
      // Update local activeStoryGroup reactions count to show immediate visual feedback
      if (activeStoryGroup) {
        const updatedStories = activeStoryGroup.stories.map((s: any) => {
          if (s.id === storyId) {
            return { ...s, reactions: res.reactions };
          }
          return s;
        });
        setActiveStoryGroup({ ...activeStoryGroup, stories: updatedStories });
      }
      showToast(`Reacted with ${reaction}`);
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLikeItem = async (item: any) => {
    try {
      if (item.feedType === 'reel') {
        const res = await api.likeReel(item.id);
        setFeedItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, liked: res.liked, stats: { ...x.stats, likes: res.likes } } : x
          )
        );
      } else if (item.feedType === 'post') {
        const res = await api.likePost(item.id);
        setFeedItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, liked: res.liked, likes: res.likes } : x
          )
        );
      } else if (item.feedType === 'news') {
        const liked = !localLikedNewsIds.has(item.id);
        setLocalLikedNewsIds((prev) => {
          const next = new Set(prev);
          if (liked) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        setFeedItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, liked: liked, likes: (x.likes || 0) + (liked ? 1 : -1) } : x
          )
        );
      }
    } catch (err) {
      console.error('Failed to like item:', err);
    }
  };

  const handleSaveItem = async (item: any) => {
    const isSaved = savedIds.has(item.id);
    const contentType = item.feedType;
    try {
      if (isSaved) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        await api.removeFromWatchlist(contentType, item.id);
        showToast('Removed from saved items');
      } else {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        await api.addToWatchlist({
          contentType,
          contentId: item.id,
          title: item.title || item.content || 'Saved Feed Item',
          thumbnailUrl: item.imageUrl || item.thumbnailUrl || '',
          category: item.category || 'Feed Item',
          progressSec: 0,
        });
        showToast('Saved to your settings');
      }
    } catch (err) {
      console.error('Failed to update saved item:', err);
    }
  };

  const handleFollowCreator = async (item: any) => {
    const creatorId = item.creator?.id || item.profile_id;
    if (!creatorId) return;
    const isFollowing = followedCreatorIds.has(creatorId);
    try {
      setFollowedCreatorIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) {
          next.delete(creatorId);
          showToast('Unfollowed creator');
        } else {
          next.add(creatorId);
          showToast('Following creator');
        }
        return next;
      });
      await api.followCreator(creatorId);
    } catch (err) {
      console.error('Failed to follow creator:', err);
    }
  };

  const handleOpenComments = async (item: any) => {
    setCommentingItem(item);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await api.getComments(item.id);
      setComments(res.data || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentInput.trim() || !commentingItem) return;
    const text = commentInput.trim();
    setCommentInput('');
    try {
      const newComment = await api.postComment(commentingItem.id, text);
      setComments((prev) => [newComment, ...prev]);
      
      setFeedItems((prev) =>
        prev.map((x) => {
          if (x.id === commentingItem.id) {
            if (x.feedType === 'reel') {
              return { ...x, stats: { ...x.stats, comments: (x.stats?.comments || 0) + 1 } };
            } else {
              return { ...x, comments: (x.comments || 0) + 1 };
            }
          }
          return x;
        })
      );
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  const handleGetCurrentLocation = () => {
    setIsLocating(true);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            if (data && data.address) {
              const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || 'Detected Location';
              const state = data.address.state || '';
              setPostLocation(`${city}${state ? ', ' + state : ''}`);
            } else {
              setPostLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            }
          } catch (e) {
            setPostLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          } finally {
            setIsLocating(false);
          }
        },
        (error) => {
          console.error(error);
          alert('Could not retrieve current location. Please type manually.');
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      alert('Geolocation is not supported on this device/platform.');
      setIsLocating(false);
    }
  };

  const pickPostImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const lowerName = asset.name.toLowerCase();
        const ext = lowerName.split('.').pop() || '';
        if (!['jpg', 'jpeg', 'heic', 'png', 'webp'].includes(ext)) {
          alert('Only JPEG, JPG, HEIC, PNG, and WEBP image formats are supported');
          return;
        }
        const nameWithoutExt = asset.name.substring(0, asset.name.lastIndexOf('.')) || asset.name;
        const pngName = `${nameWithoutExt}.png`;
        setPostFileName(pngName);

        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const img = new (window as any).Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  const jpgData = canvas.toDataURL('image/jpeg', 0.8);
                  const base64 = jpgData.split(',')[1];
                  setPostImageData(base64);
                } else {
                  const base64data = reader.result?.toString().split(',')[1];
                  if (base64data) setPostImageData(base64data);
                }
              };
              img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setPostImageData(base64data);
        }
      }
    } catch (err) {
      console.error('Error picking post image:', err);
      alert('Failed to pick cover image');
    }
  };

  const handleCreatePostSubmit = async () => {
    if (!postContent.trim()) {
      alert('Post content cannot be empty');
      return;
    }
    setScanProgress(0);
    setScanStatus('Initiating upload...');
    setShowScanner(true);
    setSubmittingPost(true);
    setShowCreatePostModal(false);

    let progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev < 40) {
          setScanStatus('Uploading text content...');
          return prev + 10;
        } else if (prev < 70) {
          setScanStatus('Scanning assets for safety compliance...');
          return prev + 5;
        } else if (prev < 98) {
          setScanStatus('Finalizing update storage...');
          return prev + 2;
        }
        return prev;
      });
    }, 100);

    try {
      const newPost = await api.createPost(
        postContent.trim(),
        postLocation || undefined,
        postImageData || undefined,
        postTargetLang !== 'None' ? postTargetLang : undefined,
        undefined,
        postFileName || undefined
      );
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Approved! SafeGuard check passed successfully.');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const taggedPost = {
        ...newPost,
        feedType: 'post',
        timestamp: new Date(newPost.createdAt || Date.now()).getTime(),
      };
      setFeedItems((prev) => [taggedPost, ...prev]);
      setShowCreatePostModal(false);
      setPostContent('');
      setPostLocation('');
      setPostFileName('');
      setPostImageData('');
      setPostTargetLang('None');
      showToast('Post created successfully!');
    } catch (err: any) {
      clearInterval(progressInterval);
      const isBlocked = err.message && err.message.includes('blocked by AI moderation');
      if (isBlocked) {
        setShowScanner(false);
        setModWarning({
          visible: true,
          title: 'Post Blocked',
          rejectReason: err.message.replace('Post blocked by AI moderation: ', ''),
          type: 'post',
          formData: {
            content: postContent.trim(),
            location: postLocation || undefined,
            imageData: postImageData || undefined,
            targetLang: postTargetLang !== 'None' ? postTargetLang : undefined,
            imageName: postFileName || undefined
          }
        });
      } else {
        alert(err.message || 'Failed to create post');
        setShowCreatePostModal(true);
      }
    } finally {
      setSubmittingPost(false);
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  const handleLikePost = async (id: string) => {
    try {
      // Optimistic update
      setFeedItems((prev) =>
        prev.map((item) =>
          item.feedType === 'post' && item.id === id
            ? { ...item, liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }
            : item
        )
      );
      const res = await api.likePost(id);
      setFeedItems((prev) =>
        prev.map((item) =>
          item.feedType === 'post' && item.id === id
            ? { ...item, liked: res.liked, likes: res.likes }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  };

  const logoScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  const categoriesList = ['Home', 'Trending', 'Breaking', 'Live TV', 'Politics', 'Business', 'Technology', 'Sports', 'Entertainment', 'Devotional', 'Education', 'Health', 'World', 'More'];

  const renderShelf = (title: string, data: any[], icon?: string) => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    return (
      <View style={styles.shelfContainer}>
        <Text style={styles.shelfTitle}>
          {icon ? `${icon} ` : ''}<Translate text={title} />
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfScroll}>
          {data.map((item, idx) => {
            if (!item) return null;
            const needsBlur = !!item.needsBlur;
            const catText = (item.category || 'NEWS').toString().toUpperCase();
            const titleText = item.title || 'News Update';
            const sourceText = item.source || 'NEXUS Network';
            const pubDate = item.publishedAt || item.createdAt || new Date().toISOString();
            return (
              <HoverPressable
                key={`shelf-${title.replace(/\s+/g, '-')}-${item.id || idx}`}
                style={styles.trendingCard}
                onPress={() => setSelectedContent({ ...item, type: 'news' })}
              >
                <View style={[
                  styles.trendingImage,
                  { overflow: 'hidden', position: 'relative' },
                  needsBlur && Platform.OS === 'web' && { filter: 'blur(20px)', WebkitFilter: 'blur(20px)' } as any
                ]}>
                  <LazyImage 
                    source={{ uri: item.imageUrl || item.thumbnailUrl || 'https://picsum.photos/seed/news/800/450' }} 
                    style={StyleSheet.absoluteFill} 
                    blurRadius={needsBlur ? 20 : 0}
                  />
                </View>
                <View style={styles.trendingTextBlock}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.trendingCategory}>{catText}</Text>
                    {item.readMinutes ? (
                      <Text style={{ fontSize: 10, color: 'rgba(33, 33, 33, 0.4)', fontWeight: '700' }}>
                        ⏱️ {item.readMinutes}m
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.trendingTitle} numberOfLines={2}><Translate text={titleText} /></Text>
                  <Text style={styles.trendingSource}>
                    {sourceText} · {timeAgo(pubDate)}
                  </Text>
                </View>
              </HoverPressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderLiveTVShelf = () => {
    if (!liveStreams || !Array.isArray(liveStreams) || liveStreams.length === 0) return null;
    return (
      <View style={styles.shelfContainer}>
        <Text style={styles.shelfTitle}>📺 <Translate text="Live TV" /></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfScroll}>
          {liveStreams.map((stream, idx) => {
            if (!stream) return null;
            const logoText = typeof stream.logoText === 'string' ? stream.logoText : 'N';
            const streamName = stream.name || 'Live Channel';
            const streamNow = stream.now || stream.now_playing || 'Live Broadcast';
            return (
              <HoverPressable
                key={`live-shelf-${stream.id || idx}`}
                style={styles.trendingCard}
                onPress={() => navigation.navigate('Live', { streamId: stream.id })}
              >
                <LinearGradient
                  colors={stream.isOfficial ? ['#D32F2F', '#0D47A1'] : ['#475569', '#1E293B']}
                  style={{ width: '100%', height: 100, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 32 }}>{logoText}</Text>
                  <View style={[styles.storyLiveBadge, { position: 'absolute', top: 8, right: 8 }]}>
                    <Text style={styles.storyLiveBadgeText}>LIVE</Text>
                  </View>
                  {stream.viewers ? (
                    <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>👁️ {stream.viewers.toLocaleString()}</Text>
                    </View>
                  ) : null}
                </LinearGradient>
                <View style={styles.trendingTextBlock}>
                  <Text style={styles.trendingCategory}>{(stream.category || 'NEWS').toString().toUpperCase()}</Text>
                  <Text style={styles.trendingTitle} numberOfLines={2}><Translate text={streamName} /></Text>
                  <Text style={styles.trendingSource} numberOfLines={1}><Translate text={streamNow} /></Text>
                </View>
              </HoverPressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Skeletons are rendered inline when loading is true

  const displayCategories = [...categoriesList];
  if (!categoriesList.includes(selectedCategory)) {
    const moreIndex = displayCategories.indexOf('More');
    if (moreIndex !== -1) {
      displayCategories.splice(moreIndex, 0, selectedCategory);
    } else {
      displayCategories.push(selectedCategory);
    }
  }

  const DEVOTIONAL_SUBCATEGORIES = new Set([
    'temple news', 'spiritual news', 'hindu dharma', 'festivals', 'pooja & rituals',
    'pilgrimage', 'devotional songs', 'bhajans', 'slokas', 'vedas & upanishads',
    'bhagavad gita', 'ramayana', 'mahabharata', 'puranas', 'saints & gurus',
    'astrology', 'panchangam', 'daily horoscope', 'meditation', 'yoga',
    'quotes & teachings', 'religious events', 'temple festivals', 'charity & seva',
    'spiritual discourses', 'devotional'
  ]);

  const newsItems = feedItems.filter((item) => item.feedType === 'news');

  const topStories = dynamicTopStories.length > 0
    ? dynamicTopStories
    : newsItems.filter((item) => item.isBreaking).slice(0, 5);
  const trendingStories = newsItems.slice(0, 5);
  
  const politicsNews = newsItems.filter((item) => item.category?.toLowerCase() === 'politics').slice(0, 5);
  const businessNews = newsItems.filter((item) => item.category?.toLowerCase() === 'business').slice(0, 5);
  const techNews = newsItems.filter((item) => item.category?.toLowerCase() === 'technology').slice(0, 5);
  const sportsNews = newsItems.filter((item) => item.category?.toLowerCase() === 'sports').slice(0, 5);
  const entNews = newsItems.filter((item) => item.category?.toLowerCase() === 'entertainment').slice(0, 5);
  const devotionalNews = newsItems.filter((item) => DEVOTIONAL_SUBCATEGORIES.has(item.category?.toLowerCase() || '')).slice(0, 5);
  const eduNews = newsItems.filter((item) => item.category?.toLowerCase() === 'education').slice(0, 5);
  const healthNews = newsItems.filter((item) => item.category?.toLowerCase() === 'health').slice(0, 5);
  const worldNews = newsItems.filter((item) => item.category?.toLowerCase() === 'international' || item.category?.toLowerCase() === 'world').slice(0, 5);
  
  const editorsPicks = newsItems.filter((item) => item.category?.toLowerCase() === 'opinion' || item.category?.toLowerCase() === 'fact check').slice(0, 5);
  const mostViewed = [...newsItems].sort((a, b) => (b.readMinutes || 0) - (a.readMinutes || 0)).slice(0, 5);

  const getTrendScore = (item: any) => {
    const likes = item.likes || item.stats?.likes || 0;
    const views = item.views || item.stats?.views || item.readMinutes || 0;
    const commentsCount = item.comments || item.stats?.comments || 0;
    return likes * 3 + views + commentsCount * 5;
  };

  const filteredFeed = feedItems.filter((item) => {
    if (selectedCategory === 'Home') return true;
    if (selectedCategory === 'Trending') return true;
    if (selectedCategory === 'Breaking') {
      return item.isBreaking === true || item.is_breaking === true || item.isBreaking === 1 || item.is_breaking === 1;
    }
    if (item.feedType === 'post') {
      return false; 
    }
    const cat = item.category?.toLowerCase() || '';
    const sel = selectedCategory.toLowerCase();
    if (sel === 'devotional') {
      return DEVOTIONAL_SUBCATEGORIES.has(cat);
    }
    if (sel === 'world') {
      return cat === 'world' || cat === 'international';
    }
    return cat === sel;
  });

  const remainingFeed = filteredFeed.filter((item) => {
    if (selectedCategory === 'Home') {
      if (topStories.some((t) => t.id === item.id)) {
        return false;
      }
    }
    return true;
  });

  let sortedFeed = [...remainingFeed];
  if (selectedCategory === 'Trending') {
    sortedFeed.sort((a, b) => getTrendScore(b) - getTrendScore(a));
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    sortedFeed = sortedFeed.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.summary && item.summary.toLowerCase().includes(q)) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.creator_name && item.creator_name.toLowerCase().includes(q)) ||
      (item.profile?.name && item.profile.name.toLowerCase().includes(q)) ||
      (item.source && item.source.toLowerCase().includes(q))
    );
  }

  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={isDark ? ['#1E293B', '#0F172A', '#0F172A'] : ['#E3F2FD', '#FFFFFF', '#FFFFFF']}
        style={StyleSheet.absoluteFill}
      />
      <ThreeDForestBg />
      
      <AppHeader 
        scrollY={scrollY} 
        onPressAvatar={() => setShowProfileMenu(true)} 
        onSearch={setSearchQuery}
        onRefresh={onRefresh}
        onCreatePost={() => setShowCreatePostModal(true)}
        onOpenAssistant={() => setShowAssistant(true)}
      />

      <Animated.ScrollView
        style={[styles.container, { zIndex: 1 }]}
        contentContainerStyle={{ 
          paddingTop: Math.max((insets?.top ?? 0), 12) + 74, 
          paddingBottom: Math.max((insets?.bottom ?? 0), 12) + 80,
          flexGrow: 1,
        }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Top Reels & Live Bar (Stories) inside a glassmorphic container */}
        <View style={styles.storiesContainer}>
          {loading ? (
            <StorySkeleton />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesScroll}>
              {/* Your Story / + Add Story bubble */}
              <HoverPressable
                style={styles.storyItem}
                onPress={handleYourStoryPress}
              >
                <View style={styles.storyRingContainer}>
                  <View style={[styles.storyRingReel, { borderColor: '#10B981', borderStyle: 'dashed' }]} />
                  <View style={[styles.storyAvatarInside, { backgroundColor: '#10B981' }]}>
                    <Text style={[styles.storyAvatarText, { fontSize: 24 }]}>+</Text>
                  </View>
                  <View style={[styles.storyLiveBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.storyLiveBadgeText}>ADD</Text>
                  </View>
                </View>
                <Text style={styles.storyLabel} numberOfLines={1}>Your Story</Text>
              </HoverPressable>

              {/* Active Stories from other creators */}
              {stories.map((storyGroup) => {
                const isOwnGroup = storyGroup.profileId === activeProfile?.id;
                if (isOwnGroup) return null; // Rendered under Your Story
                return (
                  <HoverPressable
                    key={`story-group-${storyGroup.profileId}`}
                    style={styles.storyItem}
                    onPress={() => handleOpenStoryGroup(storyGroup)}
                  >
                    <View style={styles.storyRingContainer}>
                      <View style={[styles.storyRingReel, { borderColor: '#FF007F' }]} />
                      {storyGroup.avatarUrl ? (
                        <Image
                          source={{ uri: storyGroup.avatarUrl }}
                          style={styles.storyAvatarImage}
                        />
                      ) : (
                        <View style={[styles.storyAvatarInside, { backgroundColor: storyGroup.color }]}>
                          <Text style={styles.storyAvatarText}>{storyGroup.name.charAt(0)}</Text>
                        </View>
                      )}
                      <View style={[styles.storyLiveBadge, { backgroundColor: '#FF007F' }]}>
                        <Text style={styles.storyLiveBadgeText}>STORY</Text>
                      </View>
                    </View>
                    <Text style={styles.storyLabel} numberOfLines={1}>{storyGroup.name}</Text>
                  </HoverPressable>
                );
              })}

              {/* Active Live Streams */}
              {liveStreams.map((stream) => (
                <HoverPressable
                  key={stream.id}
                  style={styles.storyItem}
                  onPress={() => navigation.navigate('Live', { streamId: stream.id })}
                >
                  <View style={styles.storyRingContainer}>
                    <Animated.View style={[
                      styles.storyRingLive,
                      {
                        opacity: glowAnim,
                        transform: [{ scale: glowAnim.interpolate({ inputRange: [0.5, 1.2], outputRange: [1, 1.1] }) }],
                        borderColor: '#EF4444',
                      }
                    ]} />
                    <View style={[styles.storyAvatarInside, { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.storyAvatarText}>{stream.logoText}</Text>
                    </View>
                    <View style={styles.storyLiveBadge}>
                      <Text style={styles.storyLiveBadgeText}>LIVE</Text>
                    </View>
                    <View style={styles.storyOnlineDot} />
                  </View>
                  <Text style={styles.storyLabel} numberOfLines={1}>{stream.name}</Text>
                </HoverPressable>
              ))}

              {/* Room Live Debate Room Launcher Bubble */}
              <HoverPressable
                style={styles.storyItem}
                onPress={() => navigation.navigate('RoomLive')}
              >
                <View style={styles.storyRingContainer}>
                  <View style={[styles.storyRingReel, { borderColor: '#3B82F6' }]} />
                  <View style={[styles.storyAvatarInside, { backgroundColor: '#3B82F6' }]}>
                    <Text style={[styles.storyAvatarText, { fontSize: 18 }]}>🎙️</Text>
                  </View>
                  <View style={[styles.storyLiveBadge, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.storyLiveBadgeText}>DEBATE</Text>
                  </View>
                </View>
                <Text style={styles.storyLabel} numberOfLines={1}>Room Live</Text>
              </HoverPressable>

              {/* Reels Shortcuts */}
              {reels.map((reel) => (
                <HoverPressable
                  key={reel.id}
                  style={styles.storyItem}
                  onPress={() => navigation.navigate('Reels', { initialReelId: reel.id })}
                >
                  <View style={styles.storyRingContainer}>
                    <View style={[styles.storyRingReel, { borderColor: colors.primary }]} />
                    <Image
                      source={{ uri: reel.thumbnailUrl || `https://picsum.photos/seed/${reel.id}/150/150` }}
                      style={styles.storyAvatarImage}
                    />
                    <View style={styles.storyReelBadge}>
                      <Text style={styles.storyReelBadgeText}>▶</Text>
                    </View>
                    <View style={styles.storyVerifiedBadge}>
                      <Text style={styles.storyVerifiedText}>✓</Text>
                    </View>
                  </View>
                  <Text style={styles.storyLabel} numberOfLines={1}>
                    @{reel.creator?.handle || reel.creator?.name || 'creator'}
                  </Text>
                </HoverPressable>
              ))}
            </ScrollView>
          )}
        </View>
        
        {/* Breaking News Ticker Banner */}
        <BreakingNewsTicker />

        {/* Horizontal Categories Filter */}
        <View style={styles.categoryFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {displayCategories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => {
                  if (cat === 'Live TV') {
                    navigation.navigate('Live');
                  } else if (cat === 'More') {
                    setShowMoreModal(true);
                  } else {
                    setSelectedCategory(cat);
                  }
                }}
                style={[
                  styles.categoryPill,
                  selectedCategory === cat && styles.categoryPillActive
                ]}
              >
                <Text style={[
                  styles.categoryPillText,
                  selectedCategory === cat && styles.categoryPillTextActive
                ]}>
                  {cat === 'Breaking' ? '🚨 ' : cat === 'Live TV' ? '📺 ' : cat === 'More' ? '➕ ' : ''}
                  <Translate text={cat} />
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {selectedCategory === 'Home' && !searchQuery.trim() && (
          <>
            {/* Top Stories horizontal carousel */}
            <TopStoriesCarousel 
              data={topStories} 
              loading={loading} 
              onPressStory={(id) => { 
                const item = topStories.find((t: any) => t.id === id); 
                if (item) {
                  setSelectedContent({ 
                    ...item, 
                    type: 'news',
                    title: item.title || item.headline || 'Top Story',
                    summary: item.summary || item.description || '',
                    body: item.body || item.article || item.summary || item.description || '',
                  });
                }
              }} 
            />

            {/* Live TV horizontal shelf */}
            {renderLiveTVShelf()}

            {/* Trending News horizontal shelf */}
            {renderShelf('Trending News', trendingStories, '⚡')}

            {/* Politics horizontal shelf */}
            {renderShelf('Politics', politicsNews, '🏛️')}

            {/* Business horizontal shelf */}
            {renderShelf('Business', businessNews, '💼')}

            {/* Technology horizontal shelf */}
            {renderShelf('Technology', techNews, '💻')}

            {/* Sports horizontal shelf */}
            {renderShelf('Sports', sportsNews, '🏏')}

            {/* Entertainment horizontal shelf */}
            {renderShelf('Entertainment', entNews, '🎬')}

            {/* Devotional horizontal shelf */}
            {renderShelf('Devotional', devotionalNews, '🛕')}

            {/* Education horizontal shelf */}
            {renderShelf('Education', eduNews, '📚')}

            {/* Health horizontal shelf */}
            {renderShelf('Health', healthNews, '🏥')}

            {/* World News horizontal shelf */}
            {renderShelf('World News', worldNews, '🌎')}

            {/* Editor's Picks horizontal shelf */}
            {renderShelf("Editor's Picks", editorsPicks, '⭐')}

            {/* Most Viewed horizontal shelf */}
            {renderShelf('Most Viewed', mostViewed, '👁️')}
          </>
        )}

        {/* Create Post Launcher Trigger */}
        {selectedCategory === 'Home' && (
          <View style={styles.feedPostLauncher}>
            <Pressable style={styles.feedPostLauncherButton} onPress={() => setShowCreatePostModal(true)}>
              <View style={[styles.feedPostLauncherAvatar, { backgroundColor: activeProfile?.color || colors.primary }]}>
                <Text style={styles.feedPostLauncherAvatarText}>
                  {(activeProfile?.name || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.feedPostLauncherText}>What's on your mind, {activeProfile?.name}?</Text>
              <Text style={styles.feedPostLauncherIcon}>＋</Text>
            </Pressable>
          </View>
        )}

        {/* Unified Vertical Social Discovery Feed */}
        <View style={isDesktop ? styles.feedContainerDesktop : styles.feedContainer}>
          <Text style={styles.shelfTitle}>
            {selectedCategory === 'Home' ? '📅 Latest Updates' : selectedCategory === 'Breaking' ? '🚨 Breaking News Feed' : selectedCategory === 'Trending' ? '⚡ Trending on NEXUS' : `📅 Latest in ${selectedCategory}`}
          </Text>
          {loading ? (
            <View style={{ gap: 16, width: '100%' }}>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </View>
          ) : sortedFeed.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>No feed items found. Pull down to refresh.</Text>
            </View>
          ) : (
            <View style={isDesktop ? styles.feedGridRow : null}>
              {sortedFeed.map((item) => {
                const isNews = item.feedType === 'news';
                const isReel = item.feedType === 'reel';
                const isPost = item.feedType === 'post';
                const needsBlur = item.needsBlur;
                
                const handleRevealItem = (id: string) => {
                  setRevealedItems((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                  });
                };

                const handleDeleteItem = (targetItem: any) => {
                  const onConfirm = async () => {
                    try {
                      if (targetItem.feedType === 'news') {
                        await api.deleteNews(targetItem.id);
                      } else if (targetItem.feedType === 'post') {
                        await api.deletePost(targetItem.id);
                      } else if (targetItem.feedType === 'reel') {
                        await api.deleteReel(targetItem.id);
                      }
                      setFeedItems((prev) => prev.filter((x) => x.id !== targetItem.id));
                      showToast('Item deleted successfully!');
                    } catch (err: any) {
                      alert(err.message || 'Failed to delete item');
                    }
                  };

                  if (Platform.OS === 'web') {
                    if (window.confirm(`Are you sure you want to delete this ${targetItem.feedType}?`)) {
                      onConfirm();
                    }
                  } else {
                    Alert.alert(
                      'Confirm Delete',
                      `Are you sure you want to delete this ${targetItem.feedType}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: onConfirm }
                      ]
                    );
                  }
                };

                const isOwnPost = isPost && item.profile_id === activeProfile?.id;
                const isOwnReel = isReel && item.creator_name === activeProfile?.name;
                const canDelete = isOwnPost || isOwnReel || user?.role === 'super_admin';

                const creatorId = isReel ? item.creator?.id : (isPost ? item.profile_id : null);
                const isFollowing = creatorId ? followedCreatorIds.has(creatorId) : false;
                const isSaved = savedIds.has(item.id);
                const isLiked = isNews ? localLikedNewsIds.has(item.id) : item.liked;
                const likesCount = isReel ? (item.stats?.likes || 0) : (item.likes || 0);
                const commentsCount = isReel ? (item.stats?.comments || 0) : (item.comments || 0);

                let avatarContent = '👤';
                let profileName = 'Anonymous';
                let locationText = item.location || '';

                if (isNews) {
                  avatarContent = '📰';
                  profileName = item.source || 'NEXUS News';
                } else if (isReel) {
                  profileName = `@${item.creator?.handle || item.creator_name || 'creator'}`;
                } else if (isPost) {
                  profileName = item.profile?.name || activeProfile?.name || 'User';
                  avatarContent = profileName.charAt(0).toUpperCase();
                }

                return (
                  <View key={`${item.feedType}-${item.id}`} style={[isDesktop ? styles.feedCardDesktop : styles.feedCard, { position: 'relative' }]}>
                    {/* Card Header */}
                    <View style={styles.feedHeader}>
                      <Pressable 
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, cursor: 'pointer' } as any}
                        onPress={() => setSelectedContent({ ...item, type: item.feedType })}
                      >
                        {isReel && item.creator?.avatar ? (
                          <Image source={{ uri: item.creator.avatar }} style={styles.feedAvatarImage} />
                        ) : (
                          <View style={[styles.feedAvatarCircle, { backgroundColor: isPost ? (item.profile?.color || colors.primary) : colors.accent }]}>
                            <Text style={styles.feedAvatarText}>{avatarContent}</Text>
                          </View>
                        )}
                        <View style={styles.feedHeaderDetails}>
                          <Text style={styles.feedProfileName} numberOfLines={1}>{profileName}</Text>
                          {locationText ? (
                            <Text style={styles.feedLocationText} numberOfLines={1}>📍 <Translate text={locationText} /></Text>
                          ) : (
                            <Text style={styles.feedTime}>{timeAgo(item.publishedAt || item.createdAt || new Date().toISOString())}</Text>
                          )}
                        </View>
                      </Pressable>

                      {/* Follow Creator Option */}
                      {creatorId && creatorId !== activeProfile?.id && (
                        <HoverPressable 
                          style={[styles.feedFollowBtn, isFollowing && styles.feedFollowingBtn]} 
                          onPress={() => handleFollowCreator(item)}
                        >
                          <Text style={[styles.feedFollowBtnText, isFollowing && styles.feedFollowingBtnText]}>
                            {isFollowing ? <Translate text="Following" /> : <Translate text="Follow" />}
                          </Text>
                        </HoverPressable>
                      )}

                      {canDelete && (
                        <HoverPressable style={styles.feedDeleteBtn} onPress={() => handleDeleteItem(item)}>
                          <Text style={styles.feedDeleteText}>🗑️</Text>
                        </HoverPressable>
                      )}
                    </View>

                    {/* Card Body */}
                    {isReel || (isNews && item.videoUrl) ? (
                      <InlineReelPlayer videoUrl={item.videoUrl} isNews={isNews} blurRegions={item.blurRegions} needsBlur={item.needsBlur} blurReason={item.blurReason} />
                    ) : (
                      <Pressable 
                        style={styles.feedImageContainer}
                        onPress={() => setSelectedContent({ ...item, type: item.feedType })}
                      >
                        {item.imageUrl ? (
                          
                          <View style={{ position: 'relative', width: '100%', height: '100%' }}>
                            <View style={[
                              { width: '100%', height: '100%', overflow: 'hidden' },
                              needsBlur && Platform.OS === 'web' && { filter: 'blur(30px)', WebkitFilter: 'blur(30px)' } as any
                            ]}>
                              <LazyImage 
                                source={{ uri: item.imageUrl }} 
                                style={styles.feedImage as any} 
                                blurRadius={needsBlur ? 30 : 0}
                              />
                              <BlurRegionsOverlay regions={item.blurRegions} />
                            </View>
                          </View>
                        ) : (
                          <View style={{ padding: 16, backgroundColor: colors.surfaceAlt, borderRadius: 8 }}>
                            <Text style={{ color: colors.text, fontSize: 14 }}><Translate text={item.content || item.summary} /></Text>
                          </View>
                        )}
                      </Pressable>
                    )}

                    {/* Card Actions Bar (Instagram Style) */}
                    <View style={styles.instagramActionBar}>
                      <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
                        <Pressable onPress={() => handleLikeItem(item)}>
                          <Text style={{ fontSize: 22, color: isLiked ? '#EF4444' : colors.text }}>{isLiked ? '❤️' : '🖤'}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleOpenComments(item)}>
                          <Text style={{ fontSize: 20, color: colors.text }}>💬</Text>
                        </Pressable>
                        <Pressable onPress={() => handleSharePost(item)}>
                          <Text style={{ fontSize: 20, color: colors.text }}>↗️</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => handleSaveItem(item)}>
                        <Text style={{ fontSize: 22, color: isSaved ? '#EAB308' : colors.text }}>{isSaved ? '🟡' : '🔖'}</Text>
                      </Pressable>
                    </View>

                    {/* Card Footer Text */}
                    <Pressable 
                      style={styles.instagramCardFooter}
                      onPress={() => setSelectedContent({ ...item, type: item.feedType })}
                    >
                      <Text style={styles.likesCountText}>{likesCount} <Translate text="likes" /></Text>
                      
                      {isNews ? (
                        <>
                          <Text style={styles.newsTitleText}><Translate text={item.title} /></Text>
                          <Text style={styles.newsSummaryText}><Translate text={item.summary} /></Text>
                        </>
                      ) : (
                        <Text style={styles.captionText}>
                          <Text style={{ fontWeight: '800' }}>{profileName} </Text>
                          <Translate text={item.content || item.description || ''} />
                        </Text>
                      )}

                      {item.needsBlur && item.blurReason && (
                        <View style={{ marginTop: 6, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '900' }}>🛡️ <Translate text="Safety Notice:" /></Text>
                          <Text style={{ fontSize: 12, color: colors.text }}><Translate text={item.blurReason} /></Text>
                        </View>
                      )}
                    </Pressable>

                    <View style={{ paddingHorizontal: 12, paddingBottom: 14 }}>
                      {commentsCount > 0 ? (
                        <Pressable onPress={() => handleOpenComments(item)}>
                          <Text style={styles.viewCommentsText}><Translate text="View all comments" /></Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => handleOpenComments(item)}>
                          <Text style={styles.viewCommentsText}><Translate text="Add a comment..." /></Text>
                        </Pressable>
                      )}
                      <Text style={styles.timeAgoText}>{timeAgo(item.publishedAt || item.createdAt || new Date().toISOString())}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
    </Animated.ScrollView>

    <NexusAssistantModal visible={showAssistant} onClose={() => setShowAssistant(false)} />

    {/* Create Story Modal */}
    <Modal
      visible={showCreateStoryModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCreateStoryModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.createPostModalCard, { maxHeight: '90%' }]}>
          <Text style={styles.modalTitle}><Translate text="Publish Temporary Story" /></Text>
          <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 12 }}>
            <Translate text="This story will be visible to everyone on the platform for 24 hours." />
          </Text>

          <View style={{ width: '100%', height: 300, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {storyMediaType === 'image' ? (
              <Image source={{ uri: `data:image/png;base64,${storyMediaData}` }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff' }}>🎥 Video selected ({storyMediaData.length} bytes)</Text>
              </View>
            )}
          </View>

          <Text style={styles.inputLabel}>Caption (Optional)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Type a caption..."
            placeholderTextColor={colors.placeholder}
            value={storyContent}
            onChangeText={setStoryContent}
          />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <HoverPressable style={{ flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowCreateStoryModal(false)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </HoverPressable>
            <HoverPressable
              style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', opacity: publishingStory ? 0.7 : 1 }}
              onPress={handlePublishStory}
              disabled={publishingStory}
            >
              {publishingStory ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>🚀 Publish Story</Text>
              )}
            </HoverPressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* Story Viewer Modal */}
    <Modal
      visible={!!activeStoryGroup}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setActiveStoryGroup(null)}
    >
      {activeStoryGroup && (
        <View style={styles.storyViewerBackdrop}>
          <View style={styles.storyViewerContainer}>
            {/* Top progress bar indicators */}
            <View style={styles.storyProgressWrapper}>
              {activeStoryGroup.stories.map((st: any, idx: number) => {
                const isCompleted = idx < activeStoryIndex;
                const isActive = idx === activeStoryIndex;
                return (
                  <View key={st.id} style={styles.storyProgressTrack}>
                    <View style={[styles.storyProgressBar, { width: isCompleted ? '100%' : isActive ? '100%' : '0%', backgroundColor: colors.primary }]} />
                  </View>
                );
              })}
            </View>

            {/* Header with profile info and close button */}
            <View style={styles.storyViewerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.storyAvatarSmall, { backgroundColor: activeStoryGroup.color }]}>
                  {activeStoryGroup.avatarUrl ? (
                    <Image source={{ uri: activeStoryGroup.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{activeStoryGroup.name.charAt(0)}</Text>
                  )}
                </View>
                <View>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{activeStoryGroup.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{timeAgo(new Date(activeStoryGroup.stories[activeStoryIndex]?.createdAt).toISOString())}</Text>
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {activeStoryGroup.profileId === activeProfile?.id && (
                  <Pressable onPress={() => handleDeleteStory(activeStoryGroup.stories[activeStoryIndex]?.id)}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setActiveStoryGroup(null)}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Media Content */}
            <View style={styles.storyViewerBody}>
              {activeStoryGroup.stories[activeStoryIndex]?.mediaType === 'video' || activeStoryGroup.stories[activeStoryIndex]?.mediaUrl?.match(/\.(mp4|webm|mov)(\?.*)?$/i) ? (
                Platform.OS === 'web' ? (
                  <video
                    src={activeStoryGroup.stories[activeStoryIndex]?.mediaUrl}
                    autoPlay
                    controls
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
                  />
                ) : (
                  <View style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                    <MoviePlayer uri={activeStoryGroup.stories[activeStoryIndex]?.mediaUrl || ''} styles={{ modalVideo: { width: '100%', height: '100%' } }} />
                  </View>
                )
              ) : (
                <Image
                  source={{ uri: activeStoryGroup.stories[activeStoryIndex]?.mediaUrl || 'https://picsum.photos/seed/story/800/1200' }}
                  style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                />
              )}

              {/* Caption Overlay */}
              {activeStoryGroup.stories[activeStoryIndex]?.content && (
                <View style={styles.storyCaptionContainer}>
                  <Text style={styles.storyCaptionText}>{activeStoryGroup.stories[activeStoryIndex]?.content}</Text>
                </View>
              )}
            </View>

            {/* Bottom Actions: View count & Reactions */}
            <View style={styles.storyViewerFooter}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                👁️ {activeStoryGroup.stories[activeStoryIndex]?.views || 0} views
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {['❤️', '🔥', '😮', '👏', '😂'].map(emoji => (
                  <Pressable key={emoji} onPress={() => handleStoryReaction(activeStoryGroup.stories[activeStoryIndex]?.id, emoji)}>
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </Modal>

    {/* Create Post Modal */}
    <Modal
      visible={showCreatePostModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCreatePostModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.createPostModalCard}>
          <Text style={styles.modalTitle}>Create Social Post</Text>

          <Text style={styles.inputLabel}>Content *</Text>
          <TextInput
            style={[styles.modalInput, { height: 100 }]}
            placeholder="What's on your mind?..."
            placeholderTextColor={colors.placeholder}
            multiline
            value={postContent}
            onChangeText={setPostContent}
          />

          <Text style={styles.inputLabel}>Location (GPS & Search)</Text>
          <View style={styles.locationInputContainer}>
            <View style={styles.locationRow}>
              <TextInput
                style={styles.modalInputLoc}
                placeholder="Search or enter location (e.g. Tirupati, AP)"
                placeholderTextColor={colors.placeholder}
                value={postLocation}
                onChangeText={(text) => {
                  setPostLocation(text);
                  setShowLocationSuggestions(true);
                }}
                onFocus={() => setShowLocationSuggestions(true)}
              />
              <HoverPressable
                style={[styles.gpsBtnInline, isLocating && styles.gpsBtnDisabled]}
                onPress={handleGetCurrentLocation}
                disabled={isLocating}
              >
                <Text style={styles.gpsBtnTextInline}>
                  {isLocating ? '⏳...' : '📍 GPS'}
                </Text>
              </HoverPressable>
            </View>

            {showLocationSuggestions && (
              <View style={styles.suggestionsContainer}>
                <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
                  {LOCATION_SUGGESTIONS.filter(item =>
                    item.toLowerCase().includes(postLocation.toLowerCase())
                  ).map((item) => (
                    <Pressable
                      key={item}
                      style={({ hovered }: any) => [
                        styles.suggestionItem,
                        hovered && { backgroundColor: 'rgba(255, 255, 255, 0.08)' }
                      ]}
                      onPress={() => {
                        setPostLocation(item);
                        setShowLocationSuggestions(false);
                      }}
                    >
                      <Text style={styles.suggestionItemText}>📍 {item}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <Text style={styles.inputLabel}>Attach Image</Text>
          <View style={styles.filePickerContainer}>
            <HoverPressable style={styles.fileInputLabel} onPress={pickPostImage}>
              <Text style={styles.fileInputLabelText}>
                {postFileName ? `Selected: ${postFileName}` : '📁 Choose Image File'}
              </Text>
            </HoverPressable>
          </View>

          <Text style={styles.inputLabel}>Target Translation Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 16 }}>
            {['None', 'English', 'Telugu', 'Hindi', 'Kannada', 'Tamil'].map((lang) => {
              const isSelected = postTargetLang === lang;
              return (
                <HoverPressable
                  key={lang}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: isSelected ? colors.primary : colors.surfaceAlt,
                    marginRight: 8,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                  onPress={() => setPostTargetLang(lang)}
                >
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                    {lang}
                  </Text>
                </HoverPressable>
              );
            })}
          </ScrollView>

          <View style={styles.modalActionsRow}>
            <HoverPressable
              style={styles.cancelBtn}
              onPress={() => setShowCreatePostModal(false)}
              disabled={submittingPost}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </HoverPressable>

            <HoverPressable
              style={[styles.submitBtn, !postContent.trim() && styles.submitBtnDisabled]}
              onPress={handleCreatePostSubmit}
              disabled={submittingPost || !postContent.trim()}
            >
              {submittingPost ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Post</Text>
              )}
            </HoverPressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* AI Moderation Warning Custom Dialog */}
    {modWarning && (
      <Modal visible={modWarning.visible} transparent animationType="fade">
        <View style={styles.modOverlay}>
          <View style={styles.modContainer}>
            <Text style={styles.modEmoji}>⚠️</Text>
            <Text style={styles.modTitle}>SafeGuard Safety Notice</Text>
            
            <Text style={styles.modDesc}>
              Our AI moderation scan detected potentially sensitive content:
            </Text>
            
            <View style={styles.modReasonBox}>
              <Text style={styles.modReasonText}>
                {modWarning.rejectReason}
              </Text>
            </View>

            <Text style={styles.modSafetyText}>
              ⚠️ Violence, adult content, or graphic material violates our public safety standards. Continuing will automatically blur the sensitive elements to protect the public.
            </Text>

            <View style={styles.modActionRow}>
              <HoverPressable
                style={styles.modSecondaryBtn}
                onPress={handleModCancel}
              >
                <Text style={styles.modSecondaryBtnText}>Upload Another File</Text>
              </HoverPressable>

              <HoverPressable
                style={styles.modPrimaryBtn}
                onPress={handleModContinueAnyway}
              >
                <Text style={styles.modPrimaryBtnText}>Continue Anyway</Text>
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>
    )}

    <AIUploadScanner visible={showScanner} progress={scanProgress} statusText={scanStatus} />

    {/* Profile Quick Menu Modal */}
    <Modal
      visible={showProfileMenu}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowProfileMenu(false)}
    >
      <Pressable 
        style={styles.modalOverlay} 
        onPress={() => setShowProfileMenu(false)}
      >
        <View style={styles.quickMenuCard}>
          <LinearGradient
            colors={['rgba(12, 29, 25, 0.95)', 'rgba(5, 15, 13, 0.98)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View style={styles.quickMenuHeader}>
            <View style={styles.largeAvatarContainer}>
              <Image
                source={{ uri: activeProfile?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/png' }}
                style={styles.largeAvatarImage as any}
              />
              {activeProfile?.subscribed && (
                <View style={styles.largeCrownBadge}>
                  <Text style={styles.largeCrownText}>👑</Text>
                </View>
              )}
            </View>
            <Text style={styles.quickMenuProfileName}>{activeProfile?.name}</Text>
            <Text style={styles.quickMenuUserEmail}>{user?.email}</Text>
            
            {activeProfile?.subscribed ? (
              <View style={styles.premiumTierBadge}>
                <Text style={styles.premiumTierText}>⭐ Premium Member</Text>
              </View>
            ) : (
              <View style={styles.freeTierBadge}>
                <Text style={styles.freeTierText}>Free Tier</Text>
              </View>
            )}
          </View>

          <View style={styles.quickMenuDivider} />

          {(user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'editor') && (
            <HoverPressable 
              style={styles.quickMenuOption} 
              onPress={() => {
                setShowProfileMenu(false);
                navigation.navigate('TopStoriesAdmin');
              }}
            >
              <Text style={[styles.quickMenuOptionText, { color: '#3B82F6', fontWeight: '800' }]}>🎛️ Top Stories CMS</Text>
            </HoverPressable>
          )}

          {user?.role === 'super_admin' && (
            <HoverPressable 
              style={styles.quickMenuOption} 
              onPress={() => {
                setShowProfileMenu(false);
                navigation.navigate('SuperAdminDashboard');
              }}
            >
              <Text style={[styles.quickMenuOptionText, { color: '#10B981', fontWeight: '800' }]}>👑 Super Admin Portal</Text>
            </HoverPressable>
          )}

          <HoverPressable 
            style={styles.quickMenuOption} 
            onPress={() => {
              setShowProfileMenu(false);
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.quickMenuOptionText}>👤 View Profile</Text>
          </HoverPressable>

          <HoverPressable 
            style={styles.quickMenuOption} 
            onPress={() => {
              setShowProfileMenu(false);
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.quickMenuOptionText}>✏️ Edit Profile</Text>
          </HoverPressable>

          <HoverPressable 
            style={styles.quickMenuOption} 
            onPress={() => {
              setShowProfileMenu(false);
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.quickMenuOptionText}>
              💳 Sub Status: {activeProfile?.subscribed ? 'Active' : 'Upgrade Required'}
            </Text>
          </HoverPressable>

          <HoverPressable 
            style={styles.quickMenuOption} 
            onPress={() => {
              setShowProfileMenu(false);
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.quickMenuOptionText}>⚙️ Settings</Text>
          </HoverPressable>

          <HoverPressable 
            style={styles.quickMenuOption} 
            onPress={() => {
              setShowProfileMenu(false);
              switchProfile();
            }}
          >
            <Text style={styles.quickMenuOptionText}>🔄 Switch Profile</Text>
          </HoverPressable>

          <View style={styles.quickMenuDivider} />

          <HoverPressable 
            style={[styles.quickMenuOption, styles.quickMenuLogout]} 
            onPress={() => {
              setShowProfileMenu(false);
              signOut();
            }}
          >
            <Text style={styles.quickMenuLogoutText}>🚪 Logout</Text>
          </HoverPressable>
        </View>
      </Pressable>
    </Modal>

    {/* More Categories Modal */}
    <Modal
      visible={showMoreModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowMoreModal(false)}
    >
      <View style={styles.moreCategoriesBackdrop}>
        <View style={styles.moreCategoriesContainer}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(245, 245, 245, 0.99)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.moreCategoriesHeader}>
            <Text style={styles.moreCategoriesTitle}>📰 Explore News Categories</Text>
            <Pressable
              style={styles.moreCategoriesCloseBtn}
              onPress={() => setShowMoreModal(false)}
            >
              <Text style={styles.moreCategoriesCloseText}>✕</Text>
            </Pressable>
          </View>
          
          <ScrollView contentContainerStyle={styles.moreCategoriesList}>
            {ALL_CATEGORIES_TAXONOMY.map((group) => (
              <View key={group.theme} style={styles.taxonomySection}>
                <Text style={styles.taxonomyThemeTitle}>{group.theme}</Text>
                <View style={styles.taxonomyGrid}>
                  {group.categories.map((cat) => {
                    const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
                    return (
                      <Pressable
                        key={cat}
                        style={[
                          styles.taxonomyItem,
                          isActive && styles.taxonomyItemActive
                        ]}
                        onPress={() => {
                          setSelectedCategory(cat);
                          setShowMoreModal(false);
                        }}
                      >
                        <Text style={[
                          styles.taxonomyItemText,
                          isActive && styles.taxonomyItemTextActive
                        ]}>
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Comments Drawer Modal */}
    <Modal
      visible={commentingItem !== null}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setCommentingItem(null)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.drawerOverlay}
      >
        <Pressable style={styles.drawerCloseZone} onPress={() => setCommentingItem(null)} />
        <View style={styles.drawerContent}>
          <View style={styles.drawerHeader}>
            <View style={styles.dragBar} />
            <Text style={styles.drawerTitle}>Comments</Text>
          </View>

          {commentsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView style={styles.drawerList}>
              {comments.length === 0 ? (
                <Text style={styles.noCommentsText}>No comments yet. Start the conversation!</Text>
              ) : (
                comments.map((item) => (
                  <View key={item.id} style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.commentDetails}>
                      <Text style={styles.commentAuthor}>{item.name}</Text>
                      <Text style={styles.commentBody}>{item.body}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <View style={styles.drawerInputBar}>
            <TextInput
              style={styles.drawerInput}
              placeholder="Add a comment..."
              placeholderTextColor={colors.placeholder}
              value={commentInput}
              onChangeText={setCommentInput}
              onSubmitEditing={handlePostComment}
            />
            <Pressable style={styles.postButton} onPress={handlePostComment}>
              <Text style={styles.postButtonText}>Post</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Toast Notification */}
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          opacity: toastAnim,
          transform: [
            {
              translateY: toastAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.toastText}>{toastMsg}</Text>
    </Animated.View>

    <ShareModal
      visible={shareItem !== null}
      onClose={() => setShareItem(null)}
      shareUrl={shareItem?.url || ''}
      title={shareItem?.title || ''}
      description={shareItem?.description || ''}
      onShareSuccess={(profileName) => {
        showToast(`Shared with ${profileName}!`);
      }}
    />

    {/* Content Preview Detail Modal */}
    <Modal
      visible={selectedContent !== null}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setSelectedContent(null)}
    >
      <View style={styles.modOverlay}>
        <View style={{
          width: '90%',
          maxWidth: 550,
          maxHeight: Platform.OS === 'web' ? '85vh' : '85%',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 24,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderWidth: 1.5,
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit', textTransform: 'uppercase' }}>
              {selectedContent?.type === 'reel' ? '🎥 Reel Preview' : selectedContent?.type === 'post' ? '📝 Post Update' : '📰 News Article'}
            </Text>
            <HoverPressable
              style={{ padding: 6, backgroundColor: colors.breaking, borderRadius: 8 }}
              onPress={() => setSelectedContent(null)}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'Outfit' }}>✕ Close</Text>
            </HoverPressable>
          </View>

          {/* Scrollable Content */}
          <ScrollView style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }} contentContainerStyle={{ padding: 20 }}>
            {selectedContent?.type === 'reel' && (
              <View style={{ alignItems: 'center' }}>
                <View style={{ 
                  width: '100%', 
                  height: 380, 
                  maxHeight: 380,
                  borderRadius: 16, 
                  overflow: 'hidden', 
                  backgroundColor: '#000', 
                  marginBottom: 16,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MoviePlayer uri={selectedContent.videoUrl || selectedContent.video_file || ''} styles={{ modalVideo: { width: '100%', height: '100%' } }} />
                </View>
                <View style={{ width: '100%' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit', marginBottom: 8 }}>
                    {selectedContent.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', fontFamily: 'Outfit', marginBottom: 12 }}>
                    by {selectedContent.creator?.handle || 'creator'} · {selectedContent.stats?.views || 0} Views
                  </Text>
                  <Text style={{ fontSize: 14, color: isDark ? '#CBD5E1' : '#334155', fontFamily: 'Outfit', lineHeight: 20 }}>
                    {selectedContent.description}
                  </Text>
                </View>
              </View>
            )}

            {selectedContent?.type === 'post' && (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selectedContent.profile?.color || colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                      {(selectedContent.profile?.name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit' }}>
                      {selectedContent.profile?.name || activeProfile?.name || 'User'}
                    </Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', fontFamily: 'Outfit' }}>
                      📍 {selectedContent.location || 'General'} · {new Date(selectedContent.createdAt || selectedContent.publishedAt || new Date()).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                
                <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#1E293B', fontFamily: 'Outfit', lineHeight: 22, marginBottom: 14 }}>
                  {selectedContent.content}
                </Text>

                {selectedContent.imageUrl && (
                  <Image source={{ uri: selectedContent.imageUrl }} style={{ width: '100%', height: 260, borderRadius: 12, marginBottom: 14, resizeMode: 'cover' }} />
                )}
                
                <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 12, fontFamily: 'Outfit' }}>
                  ❤️ {selectedContent.likes || 0} Likes · 💬 {selectedContent.comments || 0} Comments
                </Text>
              </View>
            )}

            {selectedContent?.type === 'news' && (
              <View>
                {selectedContent.videoUrl ? (
                  <View style={{ width: '100%', aspectRatio: 1.77, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: 14 }}>
                    <MoviePlayer uri={selectedContent.videoUrl} styles={{ modalVideo: { width: '100%', height: '100%' } }} />
                  </View>
                ) : (
                  selectedContent.imageUrl && (
                    <Image source={{ uri: selectedContent.imageUrl }} style={{ width: '100%', height: 320, borderRadius: 12, marginBottom: 14, resizeMode: 'contain', backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)' }} />
                  )
                )}
                
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: 'bold' }}>{selectedContent.category || 'News'}</Text>
                  </View>
                  {selectedContent.location && (
                    <Text style={{ fontSize: 11, color: colors.accent }}>📍 {selectedContent.location}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>
                    {selectedContent.readMinutes || 3} min read · {new Date(selectedContent.publishedAt || selectedContent.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit', lineHeight: 28, marginBottom: 10 }}>
                  {selectedContent.title}
                </Text>

                <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#94A3B8' : '#475569', fontFamily: 'Outfit', lineHeight: 20, marginBottom: 14, fontStyle: 'italic' }}>
                  {selectedContent.summary}
                </Text>

                <Text style={{ fontSize: 14, color: isDark ? '#CBD5E1' : '#334155', fontFamily: 'Outfit', lineHeight: 22 }}>
                  {selectedContent.body}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  fill: { 
    flex: 1, 
    backgroundColor: colors.bg,
    ...Platform.select({
      web: {
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }
    }) as any,
  },
  container: { 
    flex: 1, 
    backgroundColor: colors.bg,
    ...Platform.select({
      web: {
        width: '100%',
        height: '100%',
      }
    }) as any,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  
  // Stories container & items
  storiesContainer: {
    paddingVertical: 12,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }
    }) as any,
  },
  storiesScroll: {
    paddingHorizontal: 16,
    gap: 16,
  },
  storyItem: {
    alignItems: 'center',
    width: 76,
  },
  storyRingContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyRingLive: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 34,
    borderWidth: 2.5,
  },
  storyRingReel: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 34,
    borderWidth: 2,
  },
  storyOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 3,
  },
  storyVerifiedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  storyVerifiedText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  storyAvatarInside: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  storyAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    resizeMode: 'cover',
    backgroundColor: colors.surfaceAlt,
  },
  storyLiveBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  storyLiveBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  storyReelBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: colors.primary,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyReelBadgeText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '900',
  },
  storyLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
    width: '100%',
  },

  // Feed post launcher
  feedPostLauncher: {
    paddingHorizontal: 16,
    marginVertical: 10,
  },
  feedPostLauncherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedPostLauncherAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  feedPostLauncherAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  feedPostLauncherText: {
    color: colors.textDim,
    fontSize: 13,
    flex: 1,
  },
  feedPostLauncherIcon: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Feed Cards styles
  feedContainer: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  feedContainerDesktop: {
    paddingHorizontal: 24,
    paddingBottom: 110,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  feedGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  feedCardDesktop: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    width: '48.5%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  feedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  feedAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  feedHeaderDetails: {
    flex: 1,
  },
  feedProfileName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  feedTime: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  feedDeleteBtn: {
    padding: 8,
  },
  feedDeleteText: {
    fontSize: 16,
  },
  feedContent: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  feedImageContainer: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    marginBottom: 12,
  },
  feedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsFeedContent: {
    marginTop: 4,
  },
  newsFeedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  newsFeedCategoryBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  newsFeedCategoryText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  newsFeedTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginBottom: 6,
  },
  newsFeedSummary: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },

  // Sensitive content blur overlays
  blurOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 10,
    borderRadius: 12,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  fullCardBlurOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 100,
    borderRadius: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(35px)',
        WebkitBackdropFilter: 'blur(35px)',
      }
    }) as any,
  },
  imageBlurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
    borderRadius: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  blurBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  blurBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurBtnPrimary: {
    backgroundColor: colors.primary,
  },
  blurBtnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    fontFamily: 'Outfit',
  },
  blurTapText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12.5,
    fontFamily: 'Outfit',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    maxWidth: 260,
  },
  blurEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  blurText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  blurReasonText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  blurRevealText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // Premium Floating Header Bar
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 12,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  headerLogo: {
    width: 180,
    height: 48,
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0 2px 6px rgba(13, 71, 161, 0.15))',
      }
    }) as any,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(13, 71, 161, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(13, 71, 161, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerIconGlyph: {
    fontSize: 16,
    color: '#212121',
  },
  notifBadgeDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D32F2F',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // Profile Avatar Components
  avatarWrapper: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGlowRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 23,
    borderWidth: 2,
  },
  avatarFrame: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  premiumAvatarFrame: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  crownBadge: {
    position: 'absolute',
    top: -8,
    left: -4,
    zIndex: 10,
  },
  crownText: {
    fontSize: 12,
  },
  tickBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#10B981',
    borderRadius: 6,
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#051612',
    zIndex: 10,
  },
  tickText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },

  // Profile Quick Menu Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickMenuCard: {
    width: 280,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }
    }) as any,
  },
  quickMenuHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  largeAvatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#10B981',
    overflow: 'visible',
    position: 'relative',
    marginBottom: 10,
  },
  largeAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    resizeMode: 'cover',
  },
  largeCrownBadge: {
    position: 'absolute',
    top: -10,
    left: -8,
    zIndex: 10,
  },
  largeCrownText: {
    fontSize: 20,
  },
  quickMenuProfileName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  quickMenuUserEmail: {
    color: '#A7F3D0',
    fontSize: 12,
    marginTop: 2,
  },
  premiumTierBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  premiumTierText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  freeTierBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  freeTierText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    fontWeight: '700',
  },
  quickMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 10,
  },
  quickMenuOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 2,
  },
  quickMenuOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  quickMenuLogout: {
    marginTop: 4,
  },
  quickMenuLogoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },

  // Create Post Modal styles
  createPostModalCard: { backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 440, padding: 20, borderWidth: 1, borderColor: colors.border },
  inputLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 5, marginTop: 4 },
  modalInput: { backgroundColor: colors.surfaceAlt, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 },
  modalInputLoc: { backgroundColor: colors.surfaceAlt, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, flex: 1 },
  locationInputContainer: { marginBottom: 10, position: 'relative', zIndex: 100 },
  locationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  gpsBtnInline: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 42, justifyContent: 'center', alignItems: 'center' },
  gpsBtnDisabled: { opacity: 0.5 },
  gpsBtnTextInline: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  suggestionsContainer: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, maxHeight: 120, zIndex: 200, overflow: 'hidden' },
  suggestionsScroll: { maxHeight: 120 },
  suggestionItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionItemText: { color: colors.text, fontSize: 11 },

  filePickerContainer: { marginBottom: 14 },
  fileInputLabel: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInputLabelText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtnText: { color: colors.textDim, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800' },
  aiLocationBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiLocationBadgeText: {
    color: '#3B82F6',
    fontSize: 9,
    fontWeight: '800',
  },
  postLocationText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  postLikeBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  postLikeBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }
    }) as any,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  breakingNewsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginVertical: 4,
  },
  breakingTag: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 10,
  },
  breakingTagText: {
    color: '#D32F2F',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  breakingMarquee: {
    flex: 1,
  },
  breakingMarqueeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryFilterContainer: {
    paddingVertical: 10,
    backgroundColor: 'rgba(13, 71, 161, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 10,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryPillText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  shelfContainer: {
    marginVertical: 12,
  },
  shelfTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.3,
    paddingHorizontal: 16,
  },
  shelfScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  trendingCard: {
    width: 200,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  trendingImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  trendingTextBlock: {
    padding: 10,
  },
  trendingCategory: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 4,
  },
  trendingTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginBottom: 4,
  },
  trendingSource: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
  },
  moreCategoriesBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  moreCategoriesContainer: {
    height: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  moreCategoriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moreCategoriesTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  moreCategoriesCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreCategoriesCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  moreCategoriesList: {
    padding: 20,
    paddingBottom: 40,
  },
  taxonomySection: {
    marginBottom: 20,
  },
  taxonomyThemeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taxonomyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  taxonomyItem: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  taxonomyItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  taxonomyItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  taxonomyItemTextActive: {
    color: '#FFFFFF',
  },
  feedAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border,
    resizeMode: 'cover',
  },
  instagramActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  instagramCardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  likesCountText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 4,
  },
  captionText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  newsTitleText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 4,
  },
  newsSummaryText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  viewCommentsText: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  timeAgoText: {
    color: colors.textFaint,
    fontSize: 9,
    marginTop: 4,
  },
  feedFollowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: 10,
  },
  feedFollowingBtn: {
    borderColor: colors.border,
  },
  feedFollowBtnText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  feedFollowingBtnText: {
    color: colors.textFaint,
  },
  feedLocationText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 100,
    backgroundColor: 'rgba(31,156,255,0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    zIndex: 99,
  },
  toastText: {
    color: '#fff',
    fontWeight: '800',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  drawerCloseZone: {
    flex: 1,
  },
  drawerContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  drawerHeader: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  drawerList: {
    flex: 1,
    padding: 16,
  },
  noCommentsText: {
    color: colors.textFaint,
    textAlign: 'center',
    marginVertical: 32,
    fontSize: 14,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  commentDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  commentAuthor: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
  },
  commentBody: {
    color: colors.textDim,
    fontSize: 13,
  },
  drawerInputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  drawerInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postButton: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  postButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  modOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20000,
  },
  modContainer: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  modTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  modDesc: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  modReasonBox: {
    width: '100%',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    padding: 14,
    marginBottom: 16,
  },
  modReasonText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  modSafetyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 16,
  },
  modActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  modPrimaryBtn: {
    flex: 1,
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modPrimaryBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 13,
  },
  modSecondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modSecondaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  // Story viewer styles
  storyViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyViewerContainer: {
    width: '100%',
    maxWidth: 500,
    height: '100%',
    maxHeight: 850,
    position: 'relative',
    backgroundColor: '#000',
    borderRadius: Platform.OS === 'web' ? 12 : 0,
    overflow: 'hidden',
  },
  storyProgressWrapper: {
    position: 'absolute',
    top: 24,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  storyProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  storyProgressBar: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  storyViewerHeader: {
    position: 'absolute',
    top: 36,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  storyAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyViewerBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyCaptionContainer: {
    position: 'absolute',
    bottom: 80,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  storyCaptionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  storyViewerFooter: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
});
