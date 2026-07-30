import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Image, Animated,
  useWindowDimensions, ActivityIndicator, Easing, Platform, Modal, ScrollView, TextInput, Alert, KeyboardAvoidingView, LayoutChangeEvent, ViewToken, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReelCard } from '../components/ReelCard';
import { HoverPressable } from '../components/HoverPressable';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useTheme } from '../state/ThemeContext';
import { useAuth } from '../state/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Translate } from '../state/LanguageContext';
import { BreakingNewsTicker } from '../components/BreakingNewsTicker';
import { NewsCardSkeleton } from '../components/Skeletons';
import { AIUploadScanner } from '../components/AIUploadScanner';
import { NexusAssistantModal } from '../components/NexusAssistantModal';
import { ShareModal } from '../components/ShareModal';
import type { NewsItem } from '../types';
import { requestLocationPermission } from '../utils/permissions';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { API_URL } from '../config';

const extractVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Canvas context failed'));
      }
      URL.revokeObjectURL(video.src);
    };
    video.onerror = (err) => {
      reject(err);
      URL.revokeObjectURL(video.src);
    };
  });
};

function BlurRegionsOverlay({ regions }: { regions?: any[] }) {
  return null;
}

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

const AP_DISTRICTS = [
  'All Districts',
  'Anantapur',
  'Chittoor',
  'East Godavari',
  'Guntur',
  'Krishna',
  'Kurnool',
  'Prakasam',
  'Srikakulam',
  'Sri Potti Sriramulu Nellore',
  'Visakhapatnam',
  'Vizianagaram',
  'West Godavari',
  'YSR Kadapa',
  'Parvathipuram Manyam',
  'Alluri Sitharama Raju',
  'Anakapalli',
  'Kakinada',
  'Konaseema',
  'Eluru',
  'NTR (Vijayawada)',
  'Bapatla',
  'Palnadu',
  'Nandyal',
  'Sri Sathya Sai',
  'Annamayya',
  'Tirupati'
];

const TELANGANA_DISTRICTS = [
  'All Districts',
  'Adilabad',
  'Bhadradri Kothagudem',
  'Hanumakonda',
  'Hyderabad',
  'Jagtial',
  'Jangaon',
  'Jayashankar Bhupalpally',
  'Jogulamba Gadwal',
  'Kamareddy',
  'Karimnagar',
  'Khammam',
  'Kumuram Bheem Asifabad',
  'Mahabubabad',
  'Mahabubnagar',
  'Mancherial',
  'Medak',
  'Medchal-Malkajgiri',
  'Mulugu',
  'Nagarkurnool',
  'Nalgonda',
  'Narayanpet',
  'Nirmal',
  'Nizamabad',
  'Peddapalli',
  'Rajanna Sircilla',
  'Rangareddy',
  'Sangareddy',
  'Siddipet',
  'Suryapet',
  'Vikarabad',
  'Wanaparthy',
  'Warangal',
  'Yadadri Bhuvanagiri'
];

const DELHI_DISTRICTS = [
  'All Districts',
  'Central Delhi',
  'East Delhi',
  'New Delhi',
  'North Delhi',
  'North East Delhi',
  'North West Delhi',
  'Shahdara',
  'South Delhi',
  'South East Delhi',
  'South West Delhi',
  'West Delhi'
];

const REGIONS = [
  { id: 'AP', label: 'AP News' },
  { id: 'Telangana', label: 'Telangana News' },
  { id: 'Delhi/North', label: 'Delhi / National' },
  { id: 'Past Live Streams', label: 'Past Live Streams' }
];

function Ticker({ items, styles }: { items: { id: string; title: string }[]; styles: any }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const [contentW, setContentW] = useState(0);
  const text = items.map((i) => i.title).join('      •      ');

  useEffect(() => {
    if (!contentW) return;
    x.setValue(width);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -contentW,
        duration: Math.max(8000, (contentW + width) * 12),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [contentW, width, x, text]);

  return (
    <View style={styles.ticker}>
      <View style={styles.tickerBadge}><Text style={styles.tickerBadgeText}>BREAKING</Text></View>
      <View style={styles.tickerViewport}>
        <Animated.Text
          numberOfLines={1}
          onLayout={(e) => setContentW(e.nativeEvent.layout.width)}
          style={[styles.tickerText, { transform: [{ translateX: x }] }]}
        >
          {text || ' '}
        </Animated.Text>
      </View>
    </View>
  );
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function NewsVideoPlayer({ uri }: { uri: string }) {
  const [trackIndex, setTrackIndex] = useState(0);

  const playlist = React.useMemo(() => {
    if (uri.startsWith('[') && uri.endsWith(']')) {
      try {
        return JSON.parse(uri) as string[];
      } catch {}
    }
    const isDirectVideo = uri.toLowerCase().endsWith('.mp4') || uri.toLowerCase().endsWith('.mov') || uri.toLowerCase().endsWith('.webm') || uri.includes('supabase.co');
    if (isDirectVideo && !uri.includes('youtube.com') && !uri.includes('youtu.be')) {
      return [
        `${API_URL}/media/uploads/intro.mp4`,
        uri,
        `${API_URL}/media/uploads/post.mp4`
      ];
    }
    return [uri];
  }, [uri]);

  if (Platform.OS === 'web' && (uri.includes('youtube.com') || uri.includes('youtu.be'))) {
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
      <View style={{ position: 'relative', width: '100%', height: 220 }}>
        <iframe
          width="100%"
          height="220"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&rel=0&modestbranding=1`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 'none', width: '100%', height: '100%', backgroundColor: '#000' }}
        />
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 50, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
        <Pressable
          style={{ position: 'absolute', bottom: 0, right: 0, width: 85, height: 40, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
      </View>
    );
  }

  // Fallback direct source playback
  if (Platform.OS === 'web') {
    const handleEnded = () => {
      if (trackIndex < playlist.length - 1) {
        setTrackIndex(trackIndex + 1);
      }
    };

    return (
      <video
        key={playlist[trackIndex]}
        autoPlay
        controls
        style={{ width: '100%', height: 220, backgroundColor: '#000' }}
        onEnded={handleEnded}
      >
        <source src={playlist[trackIndex]} type={playlist[trackIndex].toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>
    );
  }

  return (
    <View style={{ width: '100%', height: 220, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 13 }}>Playback optimized for Web browsers.</Text>
    </View>
  );
}

export default function NewsScreen({ route }: { route?: any }) {
  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();
  const { activeProfile, user } = useAuth();
  const { colors, themeMode, toggleTheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const styles = getStyles(colors, insets, width);

  // Tab State
  const [selectedTab, setSelectedTab] = useState<'News' | 'Reels' | 'Past Live Sessions' | 'Posts' | 'Saved Live Recordings'>('News');
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');

  // AI Moderation Warning state
  const [modWarning, setModWarning] = useState<{
    visible: boolean;
    title: string;
    rejectReason: string;
    type: 'news' | 'reel' | 'post';
    formData: any;
  } | null>(null);

  // Common and Ticker State
  const [ticker, setTicker] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [imageZoomScale, setImageZoomScale] = useState(1);
  const [showImageZoomModal, setShowImageZoomModal] = useState(false);
  const lastTapRef = useRef<number>(0);
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);

  const [shareItem, setShareItem] = useState<{ url: string; title: string; description?: string } | null>(null);

  const handleShareNews = (item: any) => {
    const origin = Platform.OS === 'web' ? window.location.origin : 'http://localhost:4000';
    const isPost = item.feedType === 'post' || !item.title;
    const shareUrl = isPost
      ? `${origin}/news?tab=Feed&postId=${item.id}`
      : `${origin}/news?tab=News&articleId=${item.id}`;
    setShareItem({
      url: shareUrl,
      title: isPost ? (item.content || 'NEXUS Post') : item.title,
      description: isPost ? '' : (item.summary || '')
    });
  };

  // News Tab States
  const [news, setNews] = useState<NewsItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [category, setCategory] = useState('All');
  const [region, setRegion] = useState('AP');
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [showDistrictDropdown, setShowDistrictDropdown] = useState(false);

  // Upload News Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadBody, setUploadBody] = useState('');
  const [uploadCategory, setUploadCategory] = useState('General');
  const [uploadRegion, setUploadRegion] = useState('AP');
  const [uploadDistrict, setUploadDistrict] = useState('All Districts');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadImageData, setUploadImageData] = useState('');
  const [uploadVideoFileName, setUploadVideoFileName] = useState('');
  const [uploadVideoData, setUploadVideoData] = useState('');
  const [uploadTargetLang, setUploadTargetLang] = useState('None');
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Reels Tab States
  const [reels, setReels] = useState<any[]>([]);
  const [showUploadReelModal, setShowUploadReelModal] = useState(false);
  const [uploadReelTitle, setUploadReelTitle] = useState('');
  const [uploadReelDesc, setUploadReelDesc] = useState('');
  const [uploadReelVideo, setUploadReelVideo] = useState('');
  const [uploadReelFileName, setUploadReelFileName] = useState('');
  const [uploadReelLocation, setUploadReelLocation] = useState('');
  const [uploadReelLocSuggestions, setUploadReelLocSuggestions] = useState(false);
  const [uploadReelTargetLang, setUploadReelTargetLang] = useState('None');
  const [uploadReelThumbData, setUploadReelThumbData] = useState('');
  const [isUploadingReel, setIsUploadingReel] = useState(false);

  // AI Thumbnail States
  const [reelThumbnailOptions, setReelThumbnailOptions] = useState<any[]>([]);
  const [selectedReelThumbId, setSelectedReelThumbId] = useState<number | null>(null);
  const [aiThumbReason, setAiThumbReason] = useState<string>('');
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [regenerationCount, setRegenerationCount] = useState(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [reelsSize, setReelsSize] = useState({ w: 0, h: 0 });

  // Post Creator Language State
  const [postTargetLang, setPostTargetLang] = useState('None');

  // Reels Comments State
  const [commentingReel, setCommentingReel] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const reelsListRef = useRef<FlatList>(null);

  const handleSkipReel = useCallback((currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < reels.length) {
      setActiveIndex(nextIndex);
      reelsListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [reels]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(1500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  };

  // Posts Tab States
  const [posts, setPosts] = useState<any[]>([]);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [postFileName, setPostFileName] = useState('');
  const [postImageData, setPostImageData] = useState('');
  const [showPostSuggestions, setShowPostSuggestions] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  // Saved Live Recordings Tab States
  const [savedLives, setSavedLives] = useState<any[]>([]);

  // Route parameters listener for deep linking
  useEffect(() => {
    if (route?.params?.tab) {
      setSelectedTab(route.params.tab as any);
    }
    if (route?.params?.searchQuery !== undefined) {
      setSearchQuery(route.params.searchQuery);
    }
    const targetId = route?.params?.newsId || route?.params?.itemId;
    if (targetId) {
      const found = news.find(n => n.id === targetId);
      if (found) {
        setSelectedArticle(found);
      } else {
        api.getNewsArticle(targetId).then(res => {
          setSelectedArticle(res);
        }).catch(err => {
          console.error('Failed to fetch deep linked article:', err);
        });
      }
    }
  }, [route?.params?.tab, route?.params?.itemId, route?.params?.newsId, route?.params?.searchQuery, news]);

  // Load Tab Data depending on selected tab
  const loadTabData = async () => {
    setLoading(true);
    try {
      if (selectedTab === 'News') {
        const res = await api.getNews(
          category,
          region,
          (region === 'AP' || region === 'Telangana' || region === 'Delhi/North') ? selectedDistrict : undefined
        );
        setNews(res.data || []);
        setCategories(res.categories || ['All']);
      } else if (selectedTab === 'Reels') {
        const res = await api.getReels(null, 30);
        setReels(res.data || []);
        const wl = await api.getWatchlist().catch(() => ({ data: [] }));
        const ids = new Set((wl.data || []).map((item: any) => item.contentId));
        setSavedIds(ids);
      } else if (selectedTab === 'Past Live Sessions') {
        const res = await api.getNews('Past Live Streams');
        // Filter out the logged-in user's own broadcast
        const filtered = (res.data || []).filter((item: any) => item.source !== activeProfile?.name);
        setNews(filtered);
      } else if (selectedTab === 'Posts') {
        const res = await api.getPosts();
        setPosts(res.data || []);
        const wl = await api.getWatchlist().catch(() => ({ data: [] }));
        const ids = new Set((wl.data || []).map((item: any) => item.contentId));
        setSavedIds(ids);
      } else if (selectedTab === 'Saved Live Recordings') {
        const res = await api.getNews('Past Live Streams');
        // Filter for user's own broadcasts
        const ownStreams = (res.data || []).filter((item: any) => item.source === activeProfile?.name);
        const mappedOwnStreams = ownStreams.map((item: any) => ({
          id: item.id,
          contentType: 'live_recording',
          contentId: item.id.replace('stream-rec-', ''),
          title: item.title,
          thumbnailUrl: item.imageUrl,
          videoUrl: item.videoUrl,
          isOwnBroadcast: true
        }));

        const wlRes = await api.getWatchlist().catch(() => ({ data: [] }));
        const savedWatchlist = (wlRes.data || []).filter((item: any) => item.contentType === 'live_recording');
        
        setSavedLives([...mappedOwnStreams, ...savedWatchlist]);
      }
    } catch (err) {
      console.error('Failed to load tab data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLikeReel = useCallback((index: number) => {
    setReels((prev) => {
      const next = [...prev];
      const r = next[index];
      if (!r) return prev;
      const liked = !r.liked;
      next[index] = { ...r, liked, stats: { ...r.stats, likes: (r.stats?.likes || 0) + (liked ? 1 : -1) } };
      api.likeReel(r.id).then((res) => {
        setReels((cur) => cur.map((x) => (x.id === r.id ? { ...x, liked: res.liked, stats: { ...x.stats, likes: res.likes } } : x)));
      }).catch(() => {});
      return next;
    });
  }, []);

  const handleFollowCreator = useCallback((index: number) => {
    setReels((prev) => {
      const r = prev[index];
      if (!r || !r.creator) return prev;
      const creatorId = r.creator.id;
      const target = !r.creator.isFollowing;
      api.followCreator(creatorId).catch(() => {});
      return prev.map((x) => (x.creator?.id === creatorId ? { ...x, creator: { ...x.creator, isFollowing: target } } : x));
    });
  }, []);

  const handleSaveReel = useCallback((index: number) => {
    const r = reels[index];
    if (!r) return;
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) {
        next.delete(r.id);
        api.removeFromWatchlist('reel', r.id).catch(() => {});
        showToast('Removed from watchlist');
      } else {
        next.add(r.id);
        api.addToWatchlist({
          contentType: 'reel', contentId: r.id, title: r.title,
          thumbnailUrl: r.creator?.avatar || '', category: 'later', progressSec: 0,
        }).catch(() => {});
        showToast('Saved to watchlist');
      }
      return next;
    });
  }, [reels]);

  const handleLikePost = async (id: string) => {
    try {
      const res = await api.likePost(id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, liked: res.liked, likes: res.likes } : p
        )
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to like post');
    }
  };

  const handleSavePost = useCallback((post: any) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(post.id)) {
        next.delete(post.id);
        api.removeFromWatchlist('post', post.id).catch(() => {});
        showToast('Removed from watchlist');
      } else {
        next.add(post.id);
        api.addToWatchlist({
          contentType: 'post',
          contentId: post.id,
          title: post.content.slice(0, 40) + (post.content.length > 40 ? '...' : ''),
          thumbnailUrl: post.profile?.avatarUrl || '',
          category: 'saved',
          progressSec: 0,
        }).catch(() => {});
        showToast('Saved to watchlist');
      }
      return next;
    });
  }, []);

  const handleOpenComments = async (reel: any) => {
    setCommentingReel(reel);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await api.getComments(reel.id);
      setComments(res.data || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentInput.trim() || !commentingReel) return;
    const text = commentInput.trim();
    setCommentInput('');

    try {
      const newComment = await api.postComment(commentingReel.id, text);
      setComments((prev) => [newComment, ...prev]);
      
      setReels((prev) =>
        prev.map((r) =>
          r.id === commentingReel.id
            ? { ...r, stats: { ...r.stats, comments: (r.stats?.comments || 0) + 1 } }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  useEffect(() => {
    loadTabData();
  }, [selectedTab, category, region, selectedDistrict]);

  // Collapse video player on screen blur
  useEffect(() => {
    if (!isFocused) {
      setExpanded(null);
    }
  }, [isFocused]);

  // Breaking ticker
  useEffect(() => {
    const fetchTicker = () => api.getTicker().then((r) => setTicker(r.data)).catch(() => {});
    fetchTicker();
    const id = setInterval(fetchTicker, 30000);
    return () => clearInterval(id);
  }, []);

  // GPS / Geolocation helper for News Upload
  const handleGetCurrentLocation = async () => {
    setIsLocating(true);
    try {
      await requestLocationPermission();
    } catch (permErr: any) {
      console.warn('Location permission failed:', permErr);
      Alert.alert('Permission Required', permErr.message || 'Location access is required to use GPS.');
      setIsLocating(false);
      return;
    }
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
              setUploadLocation(`${city}${state ? ', ' + state : ''}`);
            } else {
              setUploadLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            }
          } catch (e) {
            setUploadLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
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

  // GPS / Geolocation helper for Reels Upload
  const handleGetReelsLocation = async () => {
    setIsLocating(true);
    try {
      await requestLocationPermission();
    } catch (permErr: any) {
      console.warn('Location permission failed:', permErr);
      Alert.alert('Permission Required', permErr.message || 'Location access is required to use GPS.');
      setIsLocating(false);
      return;
    }
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
              setUploadReelLocation(`${city}${state ? ', ' + state : ''}`);
            } else {
              setUploadReelLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            }
          } catch (e) {
            setUploadReelLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
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

  // Document Picker for News Cover Image
  const pickCoverImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadFileName(asset.name);
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result?.toString().split(',')[1];
              if (base64data) {
                setUploadImageData(base64data);
              }
            };
            reader.readAsDataURL(file);
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setUploadImageData(base64data);
        }
      }
    } catch (err) {
      console.error('Error picking cover image:', err);
      alert('Failed to pick cover image');
    }
  };

  // Document Picker for News Video
  const pickNewsVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const lowerName = asset.name.toLowerCase();
        if (!lowerName.endsWith('.mp4') && !lowerName.endsWith('.mov')) {
          alert('Only .mp4 and .mov video formats are supported');
          return;
        }
        setUploadVideoFileName(asset.name);
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result?.toString().split(',')[1];
              if (base64data) {
                setUploadVideoData(base64data);
              }
            };
            reader.readAsDataURL(file);

            // Extract video frame thumbnail for moderation
            try {
              const thumbBase = await extractVideoThumbnail(file);
              if (!uploadImageData) {
                setUploadImageData(thumbBase);
                setUploadFileName('video-frame.jpg');
              }
            } catch (thumbErr) {
              console.warn('Failed to extract video thumbnail:', thumbErr);
            }
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setUploadVideoData(base64data);
        }
      }
    } catch (err) {
      console.error('Error picking news video:', err);
      alert('Failed to pick video file');
    }
  };

  // Trigger generation of 4 thumbnail options via API
  const triggerThumbnailGeneration = async (videoBase64: string, videoName: string, seedVal = 0) => {
    setGeneratingThumbs(true);
    setGenerationError('');
    try {
      const res = await api.generateReelThumbnails(videoBase64, videoName, seedVal);
      setReelThumbnailOptions(res.options);
      setSelectedReelThumbId(res.recommendedId);
      setAiThumbReason(res.aiReason);
      
      const recommended = res.options.find((o: any) => o.id === res.recommendedId);
      if (recommended) {
        setUploadReelThumbData(recommended.url);
      }
    } catch (err: any) {
      console.error('[AI Thumbnail Generation Error]:', err);
      setGenerationError('Unable to generate AI thumbnails. A default thumbnail has been created.');
      setReelThumbnailOptions([]);
      setSelectedReelThumbId(null);
      setAiThumbReason('');
    } finally {
      setGeneratingThumbs(false);
    }
  };

  // Pick Custom Thumbnail Cover
  const pickCustomThumbnail = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result?.toString().split(',')[1];
              if (base64data) {
                setUploadReelThumbData(base64data);
                setSelectedReelThumbId(null); // Custom cover chosen
                setGenerationError('');
              }
            };
            reader.readAsDataURL(file);
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setUploadReelThumbData(base64data);
          setSelectedReelThumbId(null); // Custom cover chosen
          setGenerationError('');
        }
      }
    } catch (err) {
      console.error('Error picking custom thumbnail:', err);
      alert('Failed to pick custom thumbnail');
    }
  };

  // Document Picker for Reels Upload
  const pickReelVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const lowerName = asset.name.toLowerCase();
        if (!lowerName.endsWith('.mp4') && !lowerName.endsWith('.mov')) {
          alert('Only .mp4 and .mov video formats are supported');
          return;
        }
        setUploadReelFileName(asset.name);
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result?.toString().split(',')[1];
              if (base64data) {
                setUploadReelVideo(base64data);
                triggerThumbnailGeneration(base64data, asset.name, 0);
              }
            };
            reader.readAsDataURL(file);
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setUploadReelVideo(base64data);
          triggerThumbnailGeneration(base64data, asset.name, 0);
        }
      }
    } catch (err) {
      console.error('Error picking reel video:', err);
      alert('Failed to pick video file');
    }
  };

  const handleModCancel = () => {
    if (modWarning) {
      const { type } = modWarning;
      if (type === 'news') {
        setShowUploadModal(true);
      } else if (type === 'reel') {
        setShowUploadReelModal(true);
      } else if (type === 'post') {
        setShowCreatePostModal(true);
      }
    }
    setModWarning(null);
  };

  const handleModContinueAnyway = async () => {
    if (!modWarning) return;
    const { type, formData } = modWarning;
    
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
      if (type === 'post') {
        await api.createPost(
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
        setShowCreatePostModal(false);
        setPostContent('');
        setPostLocation('');
        setPostFileName('');
        setPostImageData('');
        setPostTargetLang('None');
        showToast('Post created successfully!');
      } else if (type === 'news') {
        await api.createNews({
          ...formData,
          continueAnyway: true,
        });
        clearInterval(progressInterval);
        setScanProgress(100);
        setScanStatus('Uploaded! sensitive visual portions will be blurred.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setShowUploadModal(false);
        setUploadTitle('');
        setUploadSummary('');
        setUploadBody('');
        setUploadLocation('');
        setUploadFileName('');
        setUploadImageData('');
        setUploadVideoFileName('');
        setUploadVideoData('');
        setUploadTargetLang('None');
        showToast('News uploaded successfully!');
      } else if (type === 'reel') {
        await api.uploadReel(
          formData.title,
          formData.description,
          formData.videoData,
          formData.location,
          formData.targetLang,
          formData.imageData,
          true,
          formData.imageName
        );
        clearInterval(progressInterval);
        setScanProgress(100);
        setScanStatus('Uploaded! sensitive video segments will be blurred.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setShowUploadReelModal(false);
        setUploadReelTitle('');
        setUploadReelDesc('');
        setUploadReelVideo('');
        setUploadReelFileName('');
        setUploadReelLocation('');
        setUploadReelTargetLang('None');
        setUploadReelThumbData('');
        showToast('Reel uploaded successfully!');
      }
      loadTabData();
    } catch (err: any) {
      clearInterval(progressInterval);
      if (type === 'news') {
        setShowUploadModal(true);
      } else if (type === 'reel') {
        setShowUploadReelModal(true);
      } else if (type === 'post') {
        setShowCreatePostModal(true);
      }
      alert(err.message || 'Failed to submit content');
    } finally {
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  // Submit News Upload Form
  const handleUploadSubmit = async () => {
    if (!uploadTitle.trim() || !uploadBody.trim()) {
      alert('Title and Body are required');
      return;
    }
    
    setScanProgress(0);
    setScanStatus('Initiating secure link...');
    setShowScanner(true);
    setUploading(true);
    setShowUploadModal(false);

    let progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev < 30) {
          setScanStatus('Uploading media file...');
          return prev + 5;
        } else if (prev < 60) {
          setScanStatus('Scanning cover image for 18+ and adult content...');
          return prev + 4;
        } else if (prev < 85) {
          setScanStatus('Verifying text & news safety compliance...');
          return prev + 3;
        } else if (prev < 98) {
          setScanStatus('Finalizing secure cataloging...');
          return prev + 1;
        }
        return prev;
      });
    }, 150);

    try {
      await api.createNews({
        title: uploadTitle.trim(),
        summary: uploadSummary.trim() || uploadTitle.trim(),
        body: uploadBody.trim(),
        category: uploadCategory,
        region: uploadRegion,
        district: uploadDistrict,
        location: uploadLocation,
        imageData: uploadImageData || undefined,
        imageName: uploadFileName || undefined,
        videoData: uploadVideoData || undefined,
        videoName: uploadVideoFileName || undefined,
        targetLang: uploadTargetLang !== 'None' ? uploadTargetLang : undefined,
      });
      
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Approved! SafeGuard check passed successfully.');
      
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setShowUploadModal(false);
      setUploadTitle('');
      setUploadSummary('');
      setUploadBody('');
      setUploadLocation('');
      setUploadFileName('');
      setUploadImageData('');
      setUploadVideoFileName('');
      setUploadVideoData('');
      setUploadTargetLang('None');
      showToast('News uploaded successfully!');
      loadTabData();
    } catch (err: any) {
      clearInterval(progressInterval);
      const isBlocked = err.message && err.message.includes('blocked by AI moderation');
      if (isBlocked) {
        setShowScanner(false);
        setModWarning({
          visible: true,
          title: 'News Blocked',
          rejectReason: err.message.replace('News blocked by AI moderation: ', ''),
          type: 'news',
          formData: {
            title: uploadTitle.trim(),
            summary: uploadSummary.trim() || uploadTitle.trim(),
            body: uploadBody.trim(),
            category: uploadCategory,
            region: uploadRegion,
            district: uploadDistrict,
            location: uploadLocation,
            imageData: uploadImageData || undefined,
            imageName: uploadFileName || undefined,
            videoData: uploadVideoData || undefined,
            videoName: uploadVideoFileName || undefined,
            targetLang: uploadTargetLang !== 'None' ? uploadTargetLang : undefined,
          }
        });
      } else {
        alert(err.message || 'Failed to upload news');
        setShowUploadModal(true);
      }
    } finally {
      setUploading(false);
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  const resetReelUploadForm = () => {
    setUploadReelTitle('');
    setUploadReelDesc('');
    setUploadReelVideo('');
    setUploadReelFileName('');
    setUploadReelLocation('');
    setUploadReelTargetLang('None');
    setUploadReelThumbData('');
    setReelThumbnailOptions([]);
    setSelectedReelThumbId(null);
    setAiThumbReason('');
    setGenerationError('');
    setRegenerationCount(0);
  };

  // Submit Reels Upload Form
  const handleUploadReelSubmit = async () => {
    if (!uploadReelTitle.trim() || !uploadReelVideo) {
      alert('Title and video file are required');
      return;
    }
    
    setScanProgress(0);
    setScanStatus('Initiating secure link...');
    setShowScanner(true);
    setIsUploadingReel(true);
    setShowUploadReelModal(false);

    let progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev < 30) {
          setScanStatus('Uploading media file...');
          return prev + 5;
        } else if (prev < 60) {
          setScanStatus('Scanning content for 18+ and adult media info...');
          return prev + 4;
        } else if (prev < 85) {
          setScanStatus('Verifying community safety compliance...');
          return prev + 3;
        } else if (prev < 98) {
          setScanStatus('Finalizing secure cloud cataloging...');
          return prev + 1;
        }
        return prev;
      });
    }, 150);

    try {
      await api.uploadReel(
        uploadReelTitle.trim(),
        uploadReelDesc.trim(),
        uploadReelVideo,
        uploadReelLocation || undefined,
        uploadReelTargetLang !== 'None' ? uploadReelTargetLang : undefined,
        uploadReelThumbData || undefined,
        undefined,
        uploadReelFileName || undefined
      );
      
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Approved! SafeGuard check passed successfully.');
      
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setShowUploadReelModal(false);
      resetReelUploadForm();
      showToast('Reel uploaded successfully!');
      loadTabData();
    } catch (err: any) {
      clearInterval(progressInterval);
      const isBlocked = err.message && err.message.includes('blocked by AI moderation');
      if (isBlocked) {
        setShowScanner(false);
        setModWarning({
          visible: true,
          title: 'Reel Blocked',
          rejectReason: err.message.replace('Reel blocked by AI moderation: ', ''),
          type: 'reel',
          formData: {
            title: uploadReelTitle.trim(),
            description: uploadReelDesc.trim(),
            videoData: uploadReelVideo,
            location: uploadReelLocation || undefined,
            targetLang: uploadReelTargetLang !== 'None' ? uploadReelTargetLang : undefined,
            imageData: uploadReelThumbData || undefined,
            imageName: uploadReelFileName || undefined
          }
        });
      } else {
        alert(err.message || 'Failed to upload reel');
        setShowUploadReelModal(true);
      }
    } finally {
      setIsUploadingReel(false);
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  // Submit Create Post Form
  const handleCreatePostSubmit = async () => {
    if (!postContent.trim()) {
      alert('Post content cannot be empty');
      return;
    }
    
    setScanProgress(0);
    setScanStatus('Initiating upload...');
    setShowScanner(true);
    setIsSubmittingPost(true);
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
      await api.createPost(postContent.trim(), postLocation || undefined, postImageData || undefined, postTargetLang !== 'None' ? postTargetLang : undefined, undefined, postFileName || undefined);
      
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Approved! SafeGuard check passed successfully.');
      
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setShowCreatePostModal(false);
      setPostContent('');
      setPostLocation('');
      setPostFileName('');
      setPostImageData('');
      setPostTargetLang('None');
      showToast('Post created successfully!');
      loadTabData();
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
      setIsSubmittingPost(false);
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  // Deletion logic
  const handleDeleteNews = (itemId: string, isLiveStreamRecord = false) => {
    const onConfirm = async () => {
      try {
        await api.deleteNews(itemId);
        setNews((prev) => prev.filter((n) => n.id !== itemId));
        alert('News deleted successfully!');
      } catch (err: any) {
        alert(err.message || 'Failed to delete news');
      }
    };

    const confirmMsg = isLiveStreamRecord
      ? 'Are you sure you want to delete this live stream recording? This action is permanent and restricted to Super Admins.'
      : 'Are you sure you want to delete this news article?';

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) onConfirm();
    } else {
      Alert.alert('Confirm Delete', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm }
      ]);
    }
  };

  const handleDeleteReel = (id: string) => {
    const onConfirm = async () => {
      try {
        await api.deleteReel(id);
        setReels((prev) => prev.filter((r) => r.id !== id));
        alert('Reel deleted successfully!');
      } catch (err: any) {
        alert(err.message || 'Failed to delete reel');
      }
    };

    const confirmMsg = 'Are you sure you want to delete this reel?';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) onConfirm();
    } else {
      Alert.alert('Confirm Delete', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm }
      ]);
    }
  };

  const handleDeletePost = (id: string) => {
    const onConfirm = async () => {
      try {
        await api.deletePost(id);
        setPosts((prev) => prev.filter((p) => p.id !== id));
        alert('Post deleted successfully!');
      } catch (err: any) {
        alert(err.message || 'Failed to delete post');
      }
    };

    const confirmMsg = 'Are you sure you want to delete this post?';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) onConfirm();
    } else {
      Alert.alert('Confirm Delete', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm }
      ]);
    }
  };

  // Watchlist Actions for Live Sessions
  const handleSaveLiveRecording = async (item: NewsItem) => {
    try {
      await api.addToWatchlist({
        contentType: 'live_recording',
        contentId: item.id,
        title: item.title,
        thumbnailUrl: item.imageUrl,
        category: 'saved',
      });
      alert('Live recording saved successfully to watchlist!');
    } catch (err: any) {
      alert(err.message || 'Failed to save live recording');
    }
  };

  const handleRemoveSavedLive = async (contentId: string) => {
    try {
      await api.removeFromWatchlist('live_recording', contentId);
      setSavedLives((prev) => prev.filter((s) => s.contentId !== contentId));
      alert('Recording removed from saved list!');
    } catch (err: any) {
      alert(err.message || 'Failed to remove saved recording');
    }
  };

  // Sensitive content reveal helper
  const handleRevealItem = (id: string) => {
    setRevealedItems((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleRegionChange = (regId: string) => {
    setRegion(regId);
    setSelectedDistrict('All Districts');
    setCategory('All');
    setExpanded(null);
    setShowDistrictDropdown(false);
  };

  // Upload modal pickers (Reels location search logic)
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
    }
  };

  const handleGetPostLocation = async () => {
    setIsLocating(true);
    try {
      await requestLocationPermission();
    } catch (permErr: any) {
      console.warn('Location permission failed:', permErr);
      Alert.alert('Permission Required', permErr.message || 'Location access is required to use GPS.');
      setIsLocating(false);
      return;
    }
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
          setIsLocating(false);
        }
      );
    } else {
      setIsLocating(false);
    }
  };

  const filteredNews = searchQuery.trim()
    ? news.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.body && item.body.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.source && item.source.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : news;

  const filteredLiveSessions = searchQuery.trim()
    ? news.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.body && item.body.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.source && item.source.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : news;

  const filteredReels = searchQuery.trim()
    ? reels.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.creator_name && item.creator_name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : reels;

  const filteredPosts = searchQuery.trim()
    ? posts.filter(item => 
        (item.content && item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.profile?.name && item.profile.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : posts;

  return (
    <View style={styles.fill}>
      {isDesktop && (
        <AppHeader 
          onPressAvatar={() => navigation.navigate('Profile')} 
          onSearch={setSearchQuery}
          onRefresh={loadTabData}
          onOpenAssistant={() => setShowAssistant(true)}
        />
      )}
      {!isDesktop && (
        <View style={{
          position: Platform.OS === 'web' ? 'fixed' : 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 56 + (insets?.top ?? 0),
          paddingTop: insets?.top ?? 0,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          borderBottomWidth: 1,
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          zIndex: 9999,
          ...Platform.select({
            web: {
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }
          }) as any,
        }}>
          <Image
            source={require('../../assets/nexuslogo.png')}
            style={{ width: 85, height: 26 }}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Top Header Row with dynamic tab add buttons */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>NEXUS Hub</Text>
        
        {selectedTab === 'News' && (
          <HoverPressable style={styles.uploadHeaderBtn} onPress={() => setShowUploadModal(true)}>
            <Text style={styles.uploadHeaderBtnText}>＋ <Translate text="Add News" /></Text>
          </HoverPressable>
        )}

        {selectedTab === 'Reels' && (
          <HoverPressable style={styles.uploadHeaderBtn} onPress={() => setShowUploadReelModal(true)}>
            <Text style={styles.uploadHeaderBtnText}>＋ <Translate text="Upload Reel" /></Text>
          </HoverPressable>
        )}

        {selectedTab === 'Posts' && (
          <HoverPressable style={styles.uploadHeaderBtn} onPress={() => setShowCreatePostModal(true)}>
            <Text style={styles.uploadHeaderBtnText}>＋ <Translate text="Share Update" /></Text>
          </HoverPressable>
        )}
      </View>

      <BreakingNewsTicker />

      {/* Horizontal Category Tab Bar */}
      <View style={styles.newsGlassTabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.newsGlassTabScroll}>
          {(['News', 'Reels', 'Past Live Sessions', 'Posts', 'Saved Live Recordings'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.newsGlassTab, selectedTab === tab && styles.newsGlassTabActive]}
              onPress={() => {
                setSelectedTab(tab);
                setExpanded(null);
              }}
            >
              <Text style={[styles.newsGlassTabText, selectedTab === tab && styles.newsGlassTabTextActive]}>
                <Translate text={tab} />
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* RENDER DYNAMIC TABS CONTENT */}

      {selectedTab === 'News' && (
        <View style={{ width: '100%', zIndex: 10 }}>
          {/* Region Tabs */}
          <View style={styles.regionTabs}>
            {REGIONS.filter(r => r.id !== 'Past Live Streams').map((reg) => (
              <Pressable
                key={reg.id}
                style={[styles.regionTab, region === reg.id && styles.regionTabActive]}
                onPress={() => handleRegionChange(reg.id)}
              >
                <Text style={[styles.regionTabText, region === reg.id && styles.regionTabTextActive]}>
                  <Translate text={reg.label} />
                </Text>
              </Pressable>
            ))}
          </View>

          {/* District Dropdown Filter */}
          {(region === 'AP' || region === 'Telangana' || region === 'Delhi/North') && (
            <View style={styles.districtFilterRow}>
              <Pressable
                style={styles.dropdownTrigger}
                onPress={() => setShowDistrictDropdown(!showDistrictDropdown)}
              >
                <Text style={styles.dropdownText}>
                  📍 <Translate text="Zone District" />: <Text style={{ color: colors.accent, fontWeight: '900' }}><Translate text={selectedDistrict} /></Text> ▾
                </Text>
              </Pressable>

              {showDistrictDropdown && (
                <View style={styles.dropdownContent}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {(region === 'AP' ? AP_DISTRICTS : region === 'Telangana' ? TELANGANA_DISTRICTS : DELHI_DISTRICTS).map((dist) => (
                      <Pressable
                        key={dist}
                        style={[styles.dropdownItem, selectedDistrict === dist && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedDistrict(dist);
                          setShowDistrictDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, selectedDistrict === dist && { color: colors.accent, fontWeight: '700' }]}>
                          <Translate text={dist} />
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Secondary Categories List */}
          <View style={styles.tabs}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row' }}
            >
              {categories.map((item) => (
                <HoverPressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.tab, category === item && styles.tabActive]}
                >
                  <Text style={[styles.tabText, category === item && styles.tabTextActive]}><Translate text={item} /></Text>
                </HoverPressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {loading ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 10 }}>
          <NewsCardSkeleton />
          <NewsCardSkeleton />
          <NewsCardSkeleton />
        </ScrollView>
      ) : (
        <View style={{ flex: 1, zIndex: 1 }}>
          {selectedTab === 'News' && (
            filteredNews.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No news articles found in this filter.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredNews}
                keyExtractor={(n) => n.id}
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max((insets?.bottom ?? 0) + 80, 110) }}
                renderItem={({ item }) => {
                  const needsBlur = item.needsBlur;
                  const canDelete = item.source === activeProfile?.name || user?.role === 'super_admin';

                    const imgW = isDesktop ? 240 : 130;
                    const imgH = isDesktop ? 145 : 105;

                    return (
                      <HoverPressable
                        style={[styles.article, { position: 'relative' }]}
                        onPress={() => setSelectedArticle(item)}
                      >
                        <View style={{ position: 'relative', width: imgW, height: imgH }}>
                          <View style={[
                            styles.thumb,
                            { width: imgW, height: imgH, overflow: 'hidden' },
                            needsBlur && Platform.OS === 'web' && { filter: 'blur(30px)', WebkitFilter: 'blur(30px)' } as any
                          ]}>
                            <Image 
                              source={{ uri: item.imageUrl }} 
                              style={StyleSheet.absoluteFill} 
                              blurRadius={needsBlur ? 30 : 0}
                            />
                            <BlurRegionsOverlay regions={item.blurRegions} />
                          </View>
                        </View>

                      <View style={styles.articleBody}>
                        {item.needsBlur && item.blurReason && (
                          <View style={{ marginBottom: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 }}>
                            <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '900' }}>🛡️ <Translate text="Safety Notice:" /></Text>
                            <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.9)' }}><Translate text={item.blurReason} /></Text>
                          </View>
                        )}
                        <View style={styles.articleMetaRow}>
                          {item.isBreaking && <Text style={styles.breakingTag}><Translate text="BREAKING" /></Text>}
                          {item.location && (
                            <View style={styles.aiLocationBadge}>
                              <Text style={styles.aiLocationBadgeText}>📍 <Translate text={item.location} /></Text>
                            </View>
                          )}
                          <Text style={styles.source}>{item.source}</Text>
                          <Text style={styles.dot}>·</Text>
                          <Text style={styles.meta}>{item.readMinutes} <Translate text="min read" /></Text>
                        </View>
                        <Text style={styles.articleTitle} numberOfLines={2}><Translate text={item.title} /></Text>
                        <Text style={styles.articleSummary} numberOfLines={2}><Translate text={item.summary} /></Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <Text style={styles.time}>{timeAgo(item.publishedAt)}</Text>
                          {canDelete && (
                            <HoverPressable onPress={(e: any) => { e.stopPropagation(); handleDeleteNews(item.id); }} style={{ padding: 4 }}>
                              <Text style={{ fontSize: 14 }}>🗑️</Text>
                            </HoverPressable>
                          )}
                        </View>
                      </View>
                    </HoverPressable>
                  );
                }}
              />
            )
          )}

          {selectedTab === 'Reels' && (() => {
            const effectiveH = reelsSize.h > 0 ? reelsSize.h : Math.max(500, (useWindowDimensions().height - (isDesktop ? 160 : 120)));
            const effectiveW = reelsSize.w > 0 ? reelsSize.w : useWindowDimensions().width;

            return reels.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No reels uploaded yet.</Text>
              </View>
            ) : (
              <View 
                style={{ flex: 1, height: effectiveH, minHeight: effectiveH, backgroundColor: '#000' }} 
                onLayout={(e) => {
                  const { height: h, width: w } = e.nativeEvent.layout;
                  if (h && w && (h !== reelsSize.h || w !== reelsSize.w)) {
                    setReelsSize({ h, w });
                  }
                }}
              >
                <FlatList
                  ref={reelsListRef}
                  data={reels}
                  keyExtractor={(r) => r.id}
                  pagingEnabled
                  showsVerticalScrollIndicator={false}
                  snapToInterval={effectiveH}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  disableIntervalMomentum
                  onViewableItemsChanged={({ viewableItems }) => {
                    const first = viewableItems[0];
                    if (first?.index != null) {
                      setActiveIndex(first.index);
                      const r = first.item;
                      if (r) api.viewReel(r.id).catch(() => null);
                    }
                  }}
                  viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
                  onEndReachedThreshold={1.2}
                  getItemLayout={(_, index) => ({ length: effectiveH, offset: effectiveH * index, index })}
                  initialNumToRender={2}
                  style={Platform.OS === 'web' ? {
                    scrollSnapType: 'y mandatory',
                    overflowY: 'scroll',
                    height: effectiveH,
                  } as any : {}}
                  renderItem={({ item, index }) => (
                    <ReelCard
                      reel={item}
                      isActive={index === activeIndex && isFocused && selectedTab === 'Reels'}
                      height={effectiveH}
                      width={effectiveW}
                      saved={savedIds.has(item.id)}
                      onLike={() => handleLikeReel(index)}
                      onFollow={() => handleFollowCreator(index)}
                      onComment={() => handleOpenComments(item)}
                      onShare={() => showToast('Share link copied to clipboard')}
                      onSave={() => handleSaveReel(index)}
                      onSkip={() => handleSkipReel(index)}
                    />
                  )}
                />
              </View>
            );
          })()}

          {selectedTab === 'Past Live Sessions' && (
            news.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No archived live sessions available.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredLiveSessions}
                keyExtractor={(n) => n.id}
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max((insets?.bottom ?? 0) + 80, 110) }}
                renderItem={({ item }) => {
                  const needsBlur = item.needsBlur;
                  // ONLY Super Admins can delete Past Live stream recordings
                  const canDelete = user?.role === 'super_admin';

                  return (
                    <HoverPressable
                      style={[styles.article, expanded === item.id && { flexDirection: 'column' }, { position: 'relative' }]}
                      onPress={() => setExpanded(expanded === item.id ? null : item.id)}
                    >
                      <View style={expanded === item.id ? { width: '100%', height: 180, position: 'relative' } : { width: 110, height: 110, position: 'relative' }}>
                        {expanded === item.id && item.videoUrl && isFocused ? (
                          <NewsVideoPlayer uri={item.videoUrl} />
                        ) : (
                          <>
                            <View style={[
                              expanded === item.id ? styles.expandedThumb : styles.thumb,
                              { overflow: 'hidden' },
                              needsBlur && Platform.OS === 'web' && { filter: 'blur(30px)', WebkitFilter: 'blur(30px)' } as any
                            ]}>
                              <Image 
                                source={{ uri: item.imageUrl }} 
                                style={StyleSheet.absoluteFill} 
                                blurRadius={needsBlur ? 30 : 0}
                              />
                              <BlurRegionsOverlay regions={item.blurRegions} />
                            </View>
                          </>
                        )}
                      </View>
                      <View style={styles.articleBody}>
                        {item.needsBlur && item.blurReason && (
                          <View style={{ marginBottom: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 }}>
                            <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '900' }}>🛡️ <Translate text="Safety Notice:" /></Text>
                            <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.9)' }}><Translate text={item.blurReason} /></Text>
                          </View>
                        )}
                        <View style={styles.articleMetaRow}>
                          <View style={styles.aiSummaryBadge}>
                            <Text style={styles.aiSummaryBadgeText}>📼 <Translate text="RECORDING" /></Text>
                          </View>
                          {item.location && <Text style={{ color: colors.accent, fontSize: 11 }}>📍 <Translate text={item.location} /></Text>}
                        </View>
                        <Text style={styles.articleTitle} numberOfLines={expanded === item.id ? undefined : 2}><Translate text={item.title} /></Text>
                        <Text style={styles.articleSummary} numberOfLines={expanded === item.id ? undefined : 2}><Translate text={item.summary} /></Text>
                        {expanded === item.id && item.body && (
                          item.body.startsWith('http') ? (
                            <Pressable 
                              onPress={(e) => {
                                e.stopPropagation();
                                Platform.OS === 'web' ? window.open(item.body, '_blank') : Linking.openURL(item.body);
                              }}
                              style={{ marginTop: 8, alignSelf: 'flex-start' }}
                            >
                              <Text style={[styles.articleBodyText, { color: colors.primary, textDecorationLine: 'underline', fontWeight: 'bold', marginTop: 0 }]}>
                                🔗 Open Article: {item.body}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={styles.articleBodyText}>{item.body}</Text>
                          )
                        )}
                        
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          <HoverPressable
                            style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}
                            onPress={(e: any) => { e.stopPropagation(); handleSaveLiveRecording(item); }}
                          >
                            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>⭐ Save Recording</Text>
                          </HoverPressable>

                          {canDelete && (
                            <HoverPressable onPress={(e: any) => { e.stopPropagation(); handleDeleteNews(item.id, true); }} style={{ padding: 6 }}>
                              <Text style={{ fontSize: 14 }}>🗑️ Delete (Admin)</Text>
                            </HoverPressable>
                          )}
                        </View>
                      </View>

                      {needsBlur && (
                        <View 
                          style={styles.fullCardBlurOverlay}
                        >
                          <Text style={styles.blurEmoji}>⚠️</Text>
                          <Text style={styles.blurText}>Sensitive Content</Text>
                          <Text style={styles.blurTapText}>
                            This content has been identified as containing adult, graphic, or unsafe material. It has been permanently blurred for safety.
                          </Text>
                        </View>
                      )}
                    </HoverPressable>
                  );
                }}
              />
            )
          )}

          {selectedTab === 'Posts' && (
            posts.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No community updates posted yet.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredPosts}
                keyExtractor={(p) => p.id}
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max((insets?.bottom ?? 0) + 80, 110) }}
                renderItem={({ item }) => {
                  const needsBlur = item.needsBlur;
                  const canDelete = item.profile_id === activeProfile?.id || user?.role === 'super_admin';

                  return (
                    <HoverPressable 
                      style={[styles.postTabCard, { position: 'relative' }]}
                      onPress={() => setSelectedArticle({
                        id: item.id,
                        title: item.profile?.name ? `${item.profile.name}'s Post` : 'User Update',
                        summary: item.content,
                        body: item.content,
                        imageUrl: item.imageUrl,
                        publishedAt: item.createdAt,
                        location: item.location,
                        source: item.profile?.name || 'Community Member',
                        needsBlur: item.needsBlur,
                        blurReason: item.blurReason,
                        blurRegions: item.blurRegions,
                        likes: item.likes,
                        comments: item.comments,
                        isPost: true
                      })}
                    >
                      <View style={styles.feedHeader}>
                        <View style={[styles.feedAvatarCircle, { backgroundColor: item.profile?.color || colors.primary }]}>
                          <Text style={styles.feedAvatarText}>{(item.profile?.name || activeProfile?.name || 'U').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.feedHeaderDetails}>
                          <Text style={styles.feedProfileName}>{item.profile?.name || activeProfile?.name}</Text>
                          <Text style={styles.feedTime}>{timeAgo(item.createdAt)}</Text>
                        </View>
                        {canDelete && (
                          <HoverPressable onPress={() => handleDeletePost(item.id)} style={{ padding: 6 }}>
                            <Text style={{ fontSize: 14 }}>🗑️</Text>
                          </HoverPressable>
                        )}
                      </View>

                      <Text style={styles.feedContent} numberOfLines={expanded === item.id ? undefined : 3}><Translate text={item.content} /></Text>

                      {expanded === item.id && item.translatedText && (
                        <Text style={{ color: colors.textDim, fontSize: 12, fontStyle: 'italic', marginBottom: 10 }}>
                          🌐 <Translate text="Translated:" /> <Translate text={item.translatedText} />
                        </Text>
                      )}

                      {item.needsBlur && item.blurReason && (
                        <View style={{ marginTop: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '900' }}>🛡️ <Translate text="Safety Notice:" /></Text>
                          <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.9)' }}><Translate text={item.blurReason} /></Text>
                        </View>
                      )}

                      {item.imageUrl && (
                        <View style={styles.feedImageContainer}>
                          <View style={[
                            { width: '100%', height: '100%', overflow: 'hidden' },
                            needsBlur && Platform.OS === 'web' && { filter: 'blur(30px)', WebkitFilter: 'blur(30px)' } as any
                          ]}>
                            <Image 
                              source={{ uri: item.imageUrl }} 
                              style={styles.feedImage} 
                              blurRadius={needsBlur ? 30 : 0}
                            />
                            <BlurRegionsOverlay regions={item.blurRegions} />
                          </View>
                        </View>
                      )}
                      
                      <View style={[styles.feedFooter, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                          <HoverPressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: item.liked ? 'rgba(239, 68, 68, 0.15)' : 'transparent' }}
                            onPress={(e: any) => {
                              e.stopPropagation();
                              handleLikePost(item.id);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: item.liked ? '#EF4444' : colors.textDim }}>{item.liked ? '❤️' : '🖤'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: item.liked ? '#EF4444' : colors.textDim }}>{item.likes} <Translate text="Likes" /></Text>
                          </HoverPressable>

                          <HoverPressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: savedIds.has(item.id) ? 'rgba(234, 179, 8, 0.15)' : 'transparent' }}
                            onPress={(e: any) => {
                              e.stopPropagation();
                              handleSavePost(item);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: savedIds.has(item.id) ? '#EAB308' : colors.textDim }}>{savedIds.has(item.id) ? '🔖' : '▫️'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: savedIds.has(item.id) ? '#EAB308' : colors.textDim }}>{savedIds.has(item.id) ? <Translate text="Saved" /> : <Translate text="Save" />}</Text>
                          </HoverPressable>

                          <HoverPressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }}
                            onPress={(e: any) => {
                              e.stopPropagation();
                              handleShareNews(item);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: colors.textDim }}>↗️</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textDim }}><Translate text="Share" /></Text>
                          </HoverPressable>
                        </View>

                        {item.location && (
                          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>📍 <Translate text={item.location} /></Text>
                        )}
                      </View>
                    </HoverPressable>
                  );
                }}
              />
            )
          )}

          {selectedTab === 'Saved Live Recordings' && (
            savedLives.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}><Translate text="You haven’t saved any live recordings yet." /></Text>
                <Text style={styles.emptySub}><Translate text="Go to 'Past Live Sessions' and tap 'Save Recording' to save them here." /></Text>
              </View>
            ) : (
              <FlatList
                data={savedLives}
                keyExtractor={(s) => s.id}
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max((insets?.bottom ?? 0) + 80, 110) }}
                renderItem={({ item }) => {
                  const needsPlay = expanded === item.id && item.videoUrl && isFocused;
                  return (
                    <HoverPressable
                      style={[styles.article, expanded === item.id && { flexDirection: 'column' }]}
                      onPress={() => setExpanded(expanded === item.id ? null : item.id)}
                    >
                      <View style={{ position: 'relative' }}>
                        {needsPlay ? (
                          <NewsVideoPlayer uri={item.videoUrl} />
                        ) : (
                          <>
                            <Image source={{ uri: item.thumbnailUrl }} style={expanded === item.id ? styles.expandedThumb : styles.thumb} />
                            <View style={styles.playIconOverlay}>
                              <Text style={{ color: '#fff', fontSize: 18 }}>▶</Text>
                            </View>
                          </>
                        )}
                      </View>

                      <View style={styles.articleBody}>
                        <View style={styles.articleMetaRow}>
                          <View style={styles.aiSummaryBadge}>
                            <Text style={styles.aiSummaryBadgeText}>
                              {item.isOwnBroadcast ? <Translate text="📼 MY LIVE BROADCAST" /> : <Translate text="📼 WATCHLIST RECORDING" />}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.articleTitle} numberOfLines={expanded === item.id ? undefined : 2}><Translate text={item.title} /></Text>
                        
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          {item.isOwnBroadcast ? (
                            <HoverPressable
                              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}
                              onPress={(e: any) => { e.stopPropagation(); handleDeleteNews(item.id, true); }}
                            >
                              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>🗑️ Delete Recording</Text>
                            </HoverPressable>
                          ) : (
                            <HoverPressable
                              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}
                              onPress={(e: any) => { e.stopPropagation(); handleRemoveSavedLive(item.contentId); }}
                            >
                              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>❌ Remove Saved</Text>
                            </HoverPressable>
                          )}

                          <HoverPressable
                            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}
                            onPress={(e: any) => { e.stopPropagation(); setExpanded(expanded === item.id ? null : item.id); }}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                              {expanded === item.id ? '⏸ Close player' : '▶ Play Replay'}
                            </Text>
                          </HoverPressable>
                        </View>
                      </View>
                    </HoverPressable>
                  );
                }}
              />
            )
          )}
        </View>
      )}

      <NexusAssistantModal visible={showAssistant} onClose={() => setShowAssistant(false)} />

      {/* Upload News Modal */}
      <Modal
        visible={showUploadModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.newsModalContentWrapper} showsVerticalScrollIndicator={false}>
            <View style={styles.newsModalContent}>
              <Text style={styles.modalTitle}>Upload News Article</Text>

              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="News Title..."
                placeholderTextColor={colors.placeholder}
                value={uploadTitle}
                onChangeText={setUploadTitle}
              />

              <Text style={styles.inputLabel}>Summary (Short Description)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Short summary..."
                placeholderTextColor={colors.placeholder}
                value={uploadSummary}
                onChangeText={setUploadSummary}
              />

              <Text style={styles.inputLabel}>Body (Content) *</Text>
              <TextInput
                style={[styles.modalInput, { height: 80 }]}
                placeholder="Full news content..."
                placeholderTextColor={colors.placeholder}
                multiline
                value={uploadBody}
                onChangeText={setUploadBody}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <View style={[styles.categoriesContainer, { marginBottom: 12 }]}>
                {['Latest', 'Tech', 'Trending', 'General'].map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.catChip,
                      uploadCategory === cat && styles.catChipActive,
                    ]}
                    onPress={() => setUploadCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        uploadCategory === cat && styles.catChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Region</Text>
              <View style={[styles.categoriesContainer, { marginBottom: 12 }]}>
                {REGIONS.filter(r => r.id !== 'Past Live Streams').map((reg) => (
                  <Pressable
                    key={reg.id}
                    style={[
                      styles.catChip,
                      uploadRegion === reg.id && styles.catChipActive,
                    ]}
                    onPress={() => {
                      setUploadRegion(reg.id);
                      setUploadDistrict('All Districts');
                    }}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        uploadRegion === reg.id && styles.catChipTextActive,
                      ]}
                    >
                      {reg.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>District Zone</Text>
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(uploadRegion === 'AP' ? AP_DISTRICTS : uploadRegion === 'Telangana' ? TELANGANA_DISTRICTS : DELHI_DISTRICTS).map((dist) => (
                    <Pressable
                      key={dist}
                      style={[
                        styles.catChip,
                        { marginRight: 6 },
                        uploadDistrict === dist && styles.catChipActive,
                      ]}
                      onPress={() => setUploadDistrict(dist)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          uploadDistrict === dist && styles.catChipTextActive,
                        ]}
                      >
                        {dist}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.inputLabel}>Location (GPS & Search)</Text>
              <View style={styles.locationInputContainer}>
                <View style={styles.locationRow}>
                  <TextInput
                    style={styles.modalInputLoc}
                    placeholder="Search or enter location (e.g. Hyderabad, TS)"
                    placeholderTextColor={colors.placeholder}
                    value={uploadLocation}
                    onChangeText={(text: string) => {
                      setUploadLocation(text);
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
                        item.toLowerCase().includes(uploadLocation.toLowerCase())
                      ).map((item) => (
                        <Pressable
                          key={item}
                          style={({ hovered }: any) => [
                            styles.suggestionItem,
                            hovered && { backgroundColor: 'rgba(255, 255, 255, 0.08)' }
                          ]}
                          onPress={() => {
                            setUploadLocation(item);
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

              <Text style={styles.inputLabel}>Cover Image</Text>
              <View style={styles.filePickerContainer}>
                <HoverPressable style={styles.fileInputLabel} onPress={pickCoverImage}>
                  <Text style={styles.fileInputLabelText}>
                    {uploadFileName ? `Selected: ${uploadFileName}` : '📁 Choose Cover Image'}
                  </Text>
                </HoverPressable>
              </View>

              <Text style={styles.inputLabel}>News Video File (Optional, .mov or .mp4)</Text>
              <View style={styles.filePickerContainer}>
                <HoverPressable style={styles.fileInputLabel} onPress={pickNewsVideo}>
                  <Text style={styles.fileInputLabelText}>
                    {uploadVideoFileName ? `Selected: ${uploadVideoFileName}` : '📁 Choose Video File'}
                  </Text>
                </HoverPressable>
              </View>

              <Text style={styles.inputLabel}>Target Translation Language</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 16 }}>
                {['None', 'English', 'Telugu', 'Hindi', 'Kannada', 'Tamil'].map((lang) => {
                  const isSelected = uploadTargetLang === lang;
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
                      onPress={() => setUploadTargetLang(lang)}
                    >
                      <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                        {lang}
                      </Text>
                    </HoverPressable>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActions}>
                <HoverPressable
                  style={styles.cancelBtn}
                  onPress={() => setShowUploadModal(false)}
                  disabled={uploading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </HoverPressable>

                <HoverPressable
                  style={[styles.submitBtn, (!uploadTitle.trim() || !uploadBody.trim()) && styles.submitBtnDisabled]}
                  onPress={handleUploadSubmit}
                  disabled={uploading || !uploadTitle.trim() || !uploadBody.trim()}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Upload</Text>
                  )}
                </HoverPressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Upload Reel Modal */}
      <Modal
        visible={showUploadReelModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowUploadReelModal(false); resetReelUploadForm(); }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.newsModalContentWrapper} showsVerticalScrollIndicator={false}>
            <View style={styles.newsModalContent}>
              <Text style={styles.modalTitle}>Upload New Reel</Text>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reel Title..."
              placeholderTextColor={colors.placeholder}
              value={uploadReelTitle}
              onChangeText={setUploadReelTitle}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Description or hashtags..."
              placeholderTextColor={colors.placeholder}
              value={uploadReelDesc}
              onChangeText={setUploadReelDesc}
            />

            <Text style={styles.inputLabel}>Location (GPS & Search)</Text>
            <View style={styles.locationInputContainer}>
              <View style={styles.locationRow}>
                <TextInput
                  style={styles.modalInputLoc}
                  placeholder="Location (e.g. Nellore, AP)"
                  placeholderTextColor={colors.placeholder}
                  value={uploadReelLocation}
                  onChangeText={(text) => {
                    setUploadReelLocation(text);
                    setUploadReelLocSuggestions(true);
                  }}
                  onFocus={() => setUploadReelLocSuggestions(true)}
                />
                <HoverPressable
                  style={[styles.gpsBtnInline, isLocating && styles.gpsBtnDisabled]}
                  onPress={handleGetReelsLocation}
                  disabled={isLocating}
                >
                  <Text style={styles.gpsBtnTextInline}>
                    {isLocating ? '⏳...' : '📍 GPS'}
                  </Text>
                </HoverPressable>
              </View>

              {uploadReelLocSuggestions && (
                <View style={styles.suggestionsContainer}>
                  <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
                    {LOCATION_SUGGESTIONS.filter(item =>
                      item.toLowerCase().includes(uploadReelLocation.toLowerCase())
                    ).map((item) => (
                      <Pressable
                        key={item}
                        style={({ hovered }: any) => [
                          styles.suggestionItem,
                          hovered && { backgroundColor: 'rgba(255, 255, 255, 0.08)' }
                        ]}
                        onPress={() => {
                          setUploadReelLocation(item);
                          setUploadReelLocSuggestions(false);
                        }}
                      >
                        <Text style={styles.suggestionItemText}>📍 {item}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>Video File *</Text>
            <View style={styles.filePickerContainer}>
              <HoverPressable style={styles.fileInputLabel} onPress={pickReelVideo}>
                <Text style={styles.fileInputLabelText}>
                  {uploadReelFileName ? `Selected: ${uploadReelFileName}` : '📁 Choose Video File'}
                </Text>
              </HoverPressable>
            </View>

            {uploadReelVideo ? (
              <View style={{ marginVertical: 16, backgroundColor: colors.surfaceAlt, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 12 }}>🤖 AI Generated Thumbnails</Text>
                
                {generatingThumbs ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ fontSize: 11, color: colors.placeholder, marginTop: 8 }}>Extracting best frames and running AI enhancements...</Text>
                  </View>
                ) : generationError ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: colors.breaking, fontWeight: '600' }}>⚠️ {generationError}</Text>
                  </View>
                ) : (
                  <View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginBottom: 12 }}>
                      {reelThumbnailOptions.map((opt) => {
                        const isSelected = selectedReelThumbId === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            onPress={() => {
                              setSelectedReelThumbId(opt.id);
                              setUploadReelThumbData(opt.url);
                            }}
                            style={{
                              width: '48%',
                              aspectRatio: 0.75,
                              borderRadius: 10,
                              overflow: 'hidden',
                              borderWidth: 2,
                              borderColor: isSelected ? colors.primary : 'transparent',
                              position: 'relative',
                            }}
                          >
                            <Image source={{ uri: opt.url }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                            {isSelected && (
                              <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(59, 130, 246, 0.95)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>💡 AI SELECTED</Text>
                              </View>
                            )}
                            <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 9 }}>{opt.id === 1 ? 'Opt 1' : opt.id === 2 ? 'Opt 2' : opt.id === 3 ? 'Opt 3' : 'Opt 4'}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                    {aiThumbReason ? (
                      <Text style={{ fontSize: 11, color: colors.accent, fontStyle: 'italic', marginBottom: 12, lineHeight: 15 }}>
                        ✨ AI Advice: {aiThumbReason}
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* Cover selection state display */}
                {uploadReelThumbData && !selectedReelThumbId && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 8, borderRadius: 8 }}>
                    <Image source={{ uri: uploadReelThumbData.startsWith('http') ? uploadReelThumbData : `data:image/jpeg;base64,${uploadReelThumbData}` }} style={{ width: 40, height: 40, borderRadius: 6, marginRight: 10 }} />
                    <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600' }}>📁 Custom Cover Active</Text>
                  </View>
                )}

                {/* Actions row */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <HoverPressable
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                    onPress={() => {
                      const nextSeed = regenerationCount + 1;
                      setRegenerationCount(nextSeed);
                      triggerThumbnailGeneration(uploadReelVideo, uploadReelFileName, nextSeed);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>🔄 Regenerate AI</Text>
                  </HoverPressable>
                  <HoverPressable
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                    onPress={pickCustomThumbnail}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>📁 Custom Cover</Text>
                  </HoverPressable>
                </View>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Target Translation Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 16 }}>
              {['None', 'English', 'Telugu', 'Hindi', 'Kannada', 'Tamil'].map((lang) => {
                const isSelected = uploadReelTargetLang === lang;
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
                    onPress={() => setUploadReelTargetLang(lang)}
                  >
                    <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                      {lang}
                    </Text>
                  </HoverPressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <HoverPressable
                style={styles.cancelBtn}
                onPress={() => { setShowUploadReelModal(false); resetReelUploadForm(); }}
                disabled={isUploadingReel}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </HoverPressable>

              <HoverPressable
                style={[styles.submitBtn, (!uploadReelTitle.trim() || !uploadReelVideo) && styles.submitBtnDisabled]}
                onPress={handleUploadReelSubmit}
                disabled={isUploadingReel || !uploadReelTitle.trim() || !uploadReelVideo}
              >
                {isUploadingReel ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Upload</Text>
                )}
              </HoverPressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>

      {/* Create Post Modal */}
      <Modal
        visible={showCreatePostModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreatePostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.newsModalContentWrapper} showsVerticalScrollIndicator={false}>
            <View style={styles.newsModalContent}>
              <Text style={styles.modalTitle}>Share Update (Post)</Text>

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
                  placeholder="Location..."
                  placeholderTextColor={colors.placeholder}
                  value={postLocation}
                  onChangeText={(text) => {
                    setPostLocation(text);
                    setShowPostSuggestions(true);
                  }}
                  onFocus={() => setShowPostSuggestions(true)}
                />
                <HoverPressable
                  style={[styles.gpsBtnInline, isLocating && styles.gpsBtnDisabled]}
                  onPress={handleGetPostLocation}
                  disabled={isLocating}
                >
                  <Text style={styles.gpsBtnTextInline}>
                    {isLocating ? '⏳...' : '📍 GPS'}
                  </Text>
                </HoverPressable>
              </View>

              {showPostSuggestions && (
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
                          setShowPostSuggestions(false);
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

            <View style={styles.modalActions}>
              <HoverPressable
                style={styles.cancelBtn}
                onPress={() => setShowCreatePostModal(false)}
                disabled={isSubmittingPost}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </HoverPressable>

              <HoverPressable
                style={[styles.submitBtn, !postContent.trim() && styles.submitBtnDisabled]}
                onPress={handleCreatePostSubmit}
                disabled={isSubmittingPost || !postContent.trim()}
              >
                {isSubmittingPost ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Post</Text>
                )}
              </HoverPressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
    {/* Comments Drawer Modal */}
    <Modal
      visible={commentingReel !== null}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setCommentingReel(null)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.drawerOverlay}
      >
        <Pressable style={styles.drawerCloseZone} onPress={() => setCommentingReel(null)} />
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

    <AIUploadScanner visible={showScanner} progress={scanProgress} statusText={scanStatus} />

    {/* Article Detail Modal */}
    <Modal
      visible={selectedArticle !== null}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setSelectedArticle(null)}
    >
      <View style={styles.articleModalOverlay}>
        <View style={styles.articleModalContainer}>
          {selectedArticle && (
            <>
              {/* Header */}
              <View style={styles.articleModalHeader}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={styles.articleModalSource}>{selectedArticle.source || 'NEXUS Wire'}</Text>
                  <Text style={styles.articleModalTitle} numberOfLines={1}>{selectedArticle.title}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {selectedArticle.body && (selectedArticle.body.startsWith('http://') || selectedArticle.body.startsWith('https://')) && (
                    <HoverPressable
                      style={styles.articleModalHeaderBtn}
                      onPress={() => {
                        Platform.OS === 'web' 
                          ? window.open(selectedArticle.body, '_blank') 
                          : Linking.openURL(selectedArticle.body);
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>↗ Open Tab</Text>
                    </HoverPressable>
                  )}
                  <HoverPressable
                    style={[styles.articleModalHeaderBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleShareNews(selectedArticle)}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>🔗 Share</Text>
                  </HoverPressable>
                  <HoverPressable
                    style={[styles.articleModalHeaderBtn, { backgroundColor: colors.breaking }]}
                    onPress={() => setSelectedArticle(null)}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>✕ Close</Text>
                  </HoverPressable>
                </View>
              </View>

              {/* Content */}
              <View style={{ flex: 1, height: '100%', backgroundColor: colors.bg }}>
                <ScrollView contentContainerStyle={{ padding: 24, position: 'relative', minHeight: 400 }}>
                  {selectedArticle.imageUrl && (
                    <Pressable 
                      style={{ position: 'relative', width: '100%', minHeight: 320, maxHeight: 580, borderRadius: 14, overflow: 'hidden', marginBottom: 20, backgroundColor: '#090D1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, cursor: 'zoom-in' as any }}
                      onPress={() => {
                        const now = Date.now();
                        if (now - lastTapRef.current < 350 || Platform.OS === 'web') {
                          setImageZoomScale(2.5);
                          setShowImageZoomModal(true);
                        }
                        lastTapRef.current = now;
                      }}
                    >
                      <Image 
                        source={{ uri: selectedArticle.imageUrl }} 
                        style={{ width: '100%', height: 480, resizeMode: 'contain' }} 
                        blurRadius={selectedArticle.needsBlur ? 35 : 0}
                      />
                      <View style={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(15, 23, 42, 0.85)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>🔍 <Translate text="Double-Tap / Click to Zoom" /></Text>
                      </View>
                      <BlurRegionsOverlay regions={selectedArticle.blurRegions} />
                    </Pressable>
                  )}

                  {selectedArticle.needsBlur && (
                    <View style={styles.fullCardBlurOverlay}>
                      <Text style={styles.blurEmoji}>⚠️</Text>
                      <Text style={styles.blurText}><Translate text="Sensitive Content" /></Text>
                      <Text style={styles.blurTapText}>
                        <Translate text="This content has been identified as containing sensitive material. It has been permanently blurred for safety." />
                      </Text>
                    </View>
                  )}

                  {!selectedArticle.needsBlur ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                        <View style={styles.aiLocationBadge}>
                          <Text style={styles.aiLocationBadgeText}><Translate text={selectedArticle.category || 'General'} /></Text>
                        </View>
                        {selectedArticle.location && (
                          <View style={styles.aiLocationBadge}>
                            <Text style={styles.aiLocationBadgeText}>📍 <Translate text={selectedArticle.location} /></Text>
                          </View>
                        )}
                        <Text style={{ color: colors.textDim, fontSize: 12 }}>{selectedArticle.readMinutes || 3} <Translate text="min read" /></Text>
                        <Text style={{ color: colors.textFaint }}>·</Text>
                        <Text style={{ color: colors.textFaint, fontSize: 12 }}>{timeAgo(selectedArticle.publishedAt || selectedArticle.createdAt)}</Text>
                      </View>

                      <Text style={[styles.articleTitle, { fontSize: 26, lineHeight: 34, marginBottom: 14 }]}>
                        <Translate text={selectedArticle.title} />
                      </Text>

                      {selectedArticle.summary && (
                        <Text style={[styles.articleSummary, { fontSize: 16, lineHeight: 24, fontWeight: '500', marginBottom: 20, color: colors.textDim }]}>
                          <Translate text={selectedArticle.summary} />
                        </Text>
                      )}

                      {/* Video Player if available */}
                      {selectedArticle.videoUrl && (
                        <View style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden' }}>
                          <NewsVideoPlayer uri={selectedArticle.videoUrl} />
                        </View>
                      )}

                      {/* Body Content / External Link */}
                      {selectedArticle.body && (selectedArticle.body.startsWith('http://') || selectedArticle.body.startsWith('https://')) ? (
                        <View style={{ marginTop: 12, padding: 18, backgroundColor: colors.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                            🔗 <Translate text="External Article Link" />:
                          </Text>
                          <Text style={{ color: colors.accent, fontSize: 13 }} numberOfLines={2}>{selectedArticle.body}</Text>
                          <HoverPressable
                            style={{ backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'flex-start' }}
                            onPress={() => {
                              Platform.OS === 'web' 
                                ? window.open(selectedArticle.body, '_blank') 
                                : Linking.openURL(selectedArticle.body);
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>↗ <Translate text="Open Original Webpage" /></Text>
                          </HoverPressable>
                        </View>
                      ) : (
                        <Text style={{ color: colors.text, fontSize: 16, lineHeight: 26 }}>
                          <Translate text={selectedArticle.body || selectedArticle.summary || ''} />
                        </Text>
                      )}
                    </>
                  ) : (
                    <View style={{ minHeight: 200 }} />
                  )}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>

    {/* INTERACTIVE FULLSCREEN IMAGE ZOOM LIGHTBOX */}
    <Modal
      visible={showImageZoomModal}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowImageZoomModal(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        {/* Floating Controls Bar */}
        <View style={{ position: 'absolute', top: 20, zIndex: 100, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(15, 23, 42, 0.85)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', marginRight: 6 }}>🔍 <Translate text="Magnifier:" /></Text>
          <Pressable onPress={() => setImageZoomScale(1)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: imageZoomScale === 1 ? colors.primary : 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>1.0x</Text>
          </Pressable>
          <Pressable onPress={() => setImageZoomScale(1.8)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: imageZoomScale === 1.8 ? colors.primary : 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>1.8x</Text>
          </Pressable>
          <Pressable onPress={() => setImageZoomScale(2.5)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: imageZoomScale === 2.5 ? colors.primary : 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>2.5x</Text>
          </Pressable>
          <Pressable onPress={() => setImageZoomScale(3.5)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: imageZoomScale === 3.5 ? colors.primary : 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>3.5x</Text>
          </Pressable>
          <Pressable onPress={() => setShowImageZoomModal(false)} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444', marginLeft: 10 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✕ <Translate text="Close" /></Text>
          </Pressable>
        </View>

        {/* Scrollable & Zoomable Image Area */}
        <ScrollView
          maximumZoomScale={4.0}
          minimumZoomScale={1.0}
          zoomScale={imageZoomScale}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', minWidth: '100%', minHeight: '100%', paddingVertical: 60 }}
          showsHorizontalScrollIndicator={true}
          showsVerticalScrollIndicator={true}
        >
          <Pressable
            onPress={() => {
              // Double-click toggle between 1x and 2.5x
              setImageZoomScale(prev => (prev > 1 ? 1 : 2.5));
            }}
          >
            <Image
              source={{ uri: selectedArticle?.imageUrl }}
              style={[
                { width: Platform.OS === 'web' ? 1000 : 380, height: Platform.OS === 'web' ? 1400 : 650, resizeMode: 'contain' },
                Platform.OS === 'web' && { transform: [{ scale: imageZoomScale }], transformOrigin: 'center center', transition: 'transform 0.2s ease-out', cursor: 'grab' } as any
              ]}
            />
          </Pressable>
        </ScrollView>
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

    </View>
  );
}

const getStyles = (colors: any, insets: any, width: number) => {
  const isDesktop = Platform.OS === 'web' && width >= 768;
  return StyleSheet.create({
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
    headerRow: {
      paddingHorizontal: 16,
      paddingTop: isDesktop ? (Math.max((insets?.top ?? 0), 12) + 96) : (Math.max((insets?.top ?? 0), 12) + 56),
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  header: { color: colors.text, fontSize: 24, fontWeight: '900' },
  uploadHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  uploadHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ticker: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', height: 38, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(239, 68, 68, 0.35)' },
  tickerBadge: { backgroundColor: colors.breaking, paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  tickerBadgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  tickerViewport: { flex: 1, overflow: 'hidden', justifyContent: 'center' },
  tickerText: { color: colors.text, fontSize: 13, fontWeight: '600', paddingLeft: 12, position: 'absolute', width: 100000 },
  
  // Region Selector tabs styles
  regionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  regionTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regionTabActive: {
    backgroundColor: 'rgba(13, 71, 161, 0.12)',
    borderColor: colors.primary,
  },
  regionTabText: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 12,
  },
  regionTabTextActive: {
    color: colors.primary,
  },

  // District selector dropdown
  districtFilterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1000,
    position: 'relative',
  },
  dropdownTrigger: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  dropdownText: {
    color: colors.text,
    fontSize: 13,
  },
  dropdownContent: {
    position: 'absolute',
    top: 42,
    left: 16,
    width: 200,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 1001,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(13, 71, 161, 0.08)',
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 12,
  },
  
  // Categories list styles
  tabs: { paddingVertical: 8, zIndex: 1 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: colors.surfaceAlt, marginRight: 8 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 6 },

  // News cards
  article: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  thumb: { width: 110, height: 110, backgroundColor: colors.surfaceAlt },
  playIconOverlay: {
    position: 'absolute',
    top: 35,
    left: 35,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 9, 20, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  articleBody: { flex: 1, padding: 12 },
  articleMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 },
  breakingTag: { color: '#fff', backgroundColor: colors.breaking, fontSize: 9, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginRight: 4 },
  
  // AI dynamic labels
  aiLocationBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 4,
  },
  aiLocationBadgeText: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '800',
  },
  aiSummaryBadge: {
    backgroundColor: 'rgba(33, 192, 122, 0.12)',
    borderColor: 'rgba(33, 192, 122, 0.35)',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 4,
  },
  aiSummaryBadgeText: {
    color: '#21c07a',
    fontSize: 8,
    fontWeight: '800',
  },

  source: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  dot: { color: colors.textFaint, marginHorizontal: 3 },
  meta: { color: colors.textFaint, fontSize: 11 },
  articleTitle: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  articleSummary: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  articleBodyText: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 8 },
  time: { color: colors.textFaint, fontSize: 11 },
  premiumLockBadge: { color: '#ffd24a', fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(255,210,74,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#ffd24a' },
  expandedThumb: { width: '100%', height: 180, resizeMode: 'cover', backgroundColor: colors.surfaceAlt },

  // Premium lock overlay modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubTitle: {
    color: '#ffd24a',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalBody: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 14,
  },
  upgradeBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  upgradeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  
  // Custom modal content layouts
  newsModalContentWrapper: { flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  newsModalContent: { width: '100%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border },
  inputLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 5, marginTop: 4 },
  modalInput: { backgroundColor: colors.surfaceAlt, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 },
  modalInputLoc: { backgroundColor: colors.surfaceAlt, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, flex: 1 },
  locationInputContainer: { marginBottom: 10, position: 'relative', zIndex: 200 },
  locationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  gpsBtnInline: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 42, justifyContent: 'center', alignItems: 'center' },
  gpsBtnDisabled: { opacity: 0.5 },
  gpsBtnTextInline: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  suggestionsContainer: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, maxHeight: 120, zIndex: 300, overflow: 'hidden' },
  suggestionsScroll: { maxHeight: 120 },
  suggestionItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionItemText: { color: colors.text, fontSize: 11 },
  
  categoriesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: 'rgba(13, 71, 161, 0.12)', borderColor: colors.primary },
  catChipText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  catChipTextActive: { color: colors.primary },
  
  filePickerContainer: { marginBottom: 14 },
  fileInputLabel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInputLabelText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800' },

  // News hub 5 selector tabs
  newsGlassTabContainer: {
    paddingVertical: 12,
    backgroundColor: 'rgba(13, 71, 161, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }
    }) as any,
  },
  newsGlassTabScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  newsGlassTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newsGlassTabActive: {
    backgroundColor: 'rgba(13, 71, 161, 0.12)',
    borderColor: colors.primary,
  },
  newsGlassTabText: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 12,
  },
  newsGlassTabTextActive: {
    color: colors.primary,
  },

  // Reels row card styling (vertical lists in Reels tab)
  reelRowCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
    padding: 12,
  },
  reelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reelCreatorText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  reelPreviewContainer: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  reelPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  reelFooter: {
    marginTop: 10,
  },
  reelTitleText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  reelDescText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  reelStatsBar: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },

  // Posts tab card styles
  postTabCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  feedAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  feedAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  feedHeaderDetails: {
    flex: 1,
  },
  feedProfileName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  feedTime: {
    color: colors.textDim,
    fontSize: 10,
  },
  feedContent: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  feedImageContainer: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    marginBottom: 10,
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

  // Sensitive content blur overlays
  blurOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 10,
    borderRadius: 10,
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
    padding: 8,
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
  blurEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  blurText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  blurTapText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playFab: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFabGlyph: {
    color: '#fff',
    fontSize: 20,
    marginLeft: 3,
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
  articleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 10,
  },
  articleModalContainer: {
    width: '100%',
    height: Platform.OS === 'web' ? '92vh' : '92%',
    maxHeight: '92%',
    backgroundColor: colors.bg,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'column',
    maxWidth: 1200,
  },
  articleModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  articleModalSource: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  articleModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  articleModalHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
}
