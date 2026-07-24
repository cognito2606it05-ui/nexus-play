import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { HoverPressable } from '../components/HoverPressable';
import { ThreeDForestBg } from '../components/ThreeDForestBg';
import { api } from '../api/client';
import { LinearGradient } from 'expo-linear-gradient';
import { AppHeader } from '../components/AppHeader';
import type { WatchlistItem, Reel } from '../types';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const getAvatarUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

const getDefaultThumbnailFilename = (category?: string, type?: string) => {
  const cat = (category || 'general').toLowerCase();
  if (cat.includes('sport')) return 'default-sports.jpg';
  if (cat.includes('news')) return 'default-news.jpg';
  if (cat.includes('tv') || cat.includes('live')) return 'default-livetv.jpg';
  return 'default-news.jpg';
};

const compact = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};

function MoviePlayer({ uri, styles }: { uri: string; styles: any }) {
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

  // Fallback for local MP4/playlist
  if (Platform.OS === 'web') {
    const playlist = React.useMemo(() => {
      if (uri.startsWith('[') && uri.endsWith(']')) {
        try {
          return JSON.parse(uri) as string[];
        } catch {}
      }
      return [uri];
    }, [uri]);

    const [trackIndex, setTrackIndex] = useState(0);
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
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
        onEnded={handleEnded}
      >
        <source src={playlist[trackIndex]} type={playlist[trackIndex].toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 13 }}>Playback optimized for Web browsers.</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { activeProfile, user, signOut, switchProfile, refreshProfiles, selectProfile } = useAuth();
  const { colors, themeMode, toggleTheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  // Parameter-driven profile view (viewing someone else)
  const { profileId, creatorName, creatorAvatar, creatorHandle } = route.params || {};
  const isViewingSelf = !profileId || profileId === activeProfile?.id;

  // Extra profile fields loaded from database profile context
  const [bio, setBio] = useState('Senior News Reader & Digital Content Creator at NEXUS Play.');
  const [website, setWebsite] = useState('https://nexusplay.app');
  const [location, setLocation] = useState('New Delhi, India');
  const [joinDate, setJoinDate] = useState('Joined July 2026');

  // Load custom profile metadata for own profile
  useEffect(() => {
    if (isViewingSelf && activeProfile) {
      setBio(activeProfile.bio || 'Senior News Reader & Digital Content Creator at NEXUS Play.');
      setWebsite(activeProfile.website || 'https://nexusplay.app');
      setLocation(activeProfile.location || 'New Delhi, India');
      setJoinDate(activeProfile.joinDate || 'Joined July 2026');
    }
  }, [isViewingSelf, activeProfile]);

  // Tab State
  // Tabs: Posts, Reels, Live Sessions, Comments, Saved, Liked, About
  type ProfileTab = 'posts' | 'reels' | 'live' | 'comments' | 'saved' | 'liked' | 'about';
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  // Data States
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [likedItems, setLikedItems] = useState<{ reels: any[]; posts: any[] }>({ reels: [], posts: [] });
  const [profileComments, setProfileComments] = useState<any[]>([]);
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);

  // Edit Profile Modal / Form State
  const [showEditModal, setShowEditModal] = useState(route.params?.editMode || false);
  const [editProfileName, setEditProfileName] = useState(activeProfile?.name || '');
  const [editAccountName, setEditAccountName] = useState(user?.displayName || '');
  const [editBio, setEditBio] = useState(bio);
  const [editWebsite, setEditWebsite] = useState(website);
  const [editLocation, setEditLocation] = useState(location);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Avatar Options
  const [avatarCategories, setAvatarCategories] = useState<Record<string, { name: string; path: string }[]> | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Upgrade Modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [paying, setPaying] = useState(false);

  // Admin Dashboard
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<'analytics' | 'thumbnails' | 'users' | 'content' | 'reports' | 'categories' | 'settings' | 'security'>('analytics');
  const [defaultThumbnails, setDefaultThumbnails] = useState<any[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [replacingThumbnailCat, setReplacingThumbnailCat] = useState<string | null>(null);

  // Super Admin state hooks
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [selectedAdminUser, setSelectedAdminUser] = useState<any | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminUserActivity, setAdminUserActivity] = useState<any[]>([]);

  const [adminContentType, setAdminContentType] = useState<'news' | 'reels' | 'posts' | 'live-streams'>('news');
  const [adminContentList, setAdminContentList] = useState<any[]>([]);

  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminCategoriesList, setAdminCategoriesList] = useState<string[]>([]);
  const [adminNewCategory, setAdminNewCategory] = useState('');

  const [adminSettings, setAdminSettings] = useState<Record<string, string>>({});
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [adminBlockedIps, setAdminBlockedIps] = useState<any[]>([]);
  const [adminNewBlockIp, setAdminNewBlockIp] = useState('');
  const [adminNewBlockReason, setAdminNewBlockReason] = useState('');
  const [adminForceLogoutUserId, setAdminForceLogoutUserId] = useState('');

  useEffect(() => {
    if (route.params?.editMode) {
      setShowEditModal(true);
    }
  }, [route.params?.editMode]);

  // Load avatar categories
  useEffect(() => {
    api.getAvatarOptions().then(res => setAvatarCategories(res.categories)).catch(() => {});
  }, []);

  const [selectedContent, setSelectedContent] = useState<any | null>(null);

  // Live stream management states
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [showStreamDetailModal, setShowStreamDetailModal] = useState(false);
  const [editStreamTitle, setEditStreamTitle] = useState('');
  const [editStreamDescription, setEditStreamDescription] = useState('');
  const [editStreamCategory, setEditStreamCategory] = useState('');
  const [editStreamType, setEditStreamType] = useState('public');
  const [isEditingStream, setIsEditingStream] = useState(false);
  const [savingStream, setSavingStream] = useState(false);
  const [activePlaybackUrl, setActivePlaybackUrl] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  const handleOpenStreamDetails = (stream: any) => {
    setSelectedStream(stream);
    setEditStreamTitle(stream.stream_title || '');
    setEditStreamDescription(stream.description || '');
    setEditStreamCategory(stream.category || 'General');
    setEditStreamType(stream.stream_type || 'public');
    setIsEditingStream(false);
    setShowStreamDetailModal(true);
  };

  const handleSaveStreamEdits = async () => {
    if (!selectedStream) return;
    setSavingStream(true);
    try {
      const res = await api.updateUserStream(selectedStream.id, {
        title: editStreamTitle,
        description: editStreamDescription,
        category: editStreamCategory,
        streamType: editStreamType
      });
      if (res.success) {
        Alert.alert('Success', 'Stream details updated successfully.');
        setIsEditingStream(false);
        await loadProfileData();
        setSelectedStream(res.data);
      } else {
        Alert.alert('Error', 'Failed to update stream details.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update stream.');
    } finally {
      setSavingStream(false);
    }
  };

  const handleDeleteStream = async (id: string) => {
    Alert.alert(
      'Delete Stream',
      'Are you sure you want to permanently delete this live stream recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteUserStream(id);
              setShowStreamDetailModal(false);
              setSelectedStream(null);
              Alert.alert('Success', 'Stream deleted successfully.');
              await loadProfileData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete stream.');
            }
          }
        }
      ]
    );
  };

  const handleSelectCustomThumbnail = async () => {
    if (!selectedStream) return;
    try {
      const docRes = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true
      });
      
      if (!docRes.canceled && docRes.assets && docRes.assets.length > 0) {
        const fileAsset = docRes.assets[0];
        
        let base64Data = '';
        if (Platform.OS === 'web') {
          const blobRes = await fetch(fileAsset.uri);
          const blob = await blobRes.blob();
          base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(blob);
          });
        } else {
          base64Data = await FileSystem.readAsStringAsync(fileAsset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        setSavingStream(true);
        const res = await api.updateUserStream(selectedStream.id, {
          thumbnailData: base64Data
        });
        if (res.success) {
          Alert.alert('Success', 'Thumbnail updated successfully.');
          setSelectedStream(res.data);
          await loadProfileData();
        } else {
          Alert.alert('Error', 'Failed to update thumbnail.');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to pick image.');
    } finally {
      setSavingStream(false);
    }
  };

  const handleShareStream = (stream: any) => {
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(stream.recorded_video_url || stream.live_stream_url || '');
      Alert.alert('Shared', 'Stream link copied to clipboard.');
    } else {
      Alert.alert('Shared', `Sharing: ${stream.stream_title}`);
    }
  };

  const handleDownloadStream = (url: string) => {
    if (url) {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Alert.alert('Download', 'Downloading is optimized for Web browsers.');
      }
    }
  };

  const handleOpenContent = (id: string, type: 'reel' | 'post' | 'news') => {
    const foundReel = reels.find(r => r.id === id) || likedItems.reels.find(r => r.id === id);
    if (foundReel && type === 'reel') {
      setSelectedContent({ ...foundReel, type: 'reel' });
      return;
    }
    const foundPost = posts.find(p => p.id === id) || likedItems.posts.find(p => p.id === id);
    if (foundPost && type === 'post') {
      setSelectedContent({ ...foundPost, type: 'post' });
      return;
    }
    setLoading(true);
    const fetchFunc = type === 'reel' ? api.getReels(null, 50) : type === 'post' ? api.getPosts() : api.getNews();
    fetchFunc.then((res: any) => {
      const item = res.data?.find((x: any) => x.id === id);
      if (item) {
        setSelectedContent({ ...item, type });
      } else {
        alert('Content not found');
      }
    }).catch(err => {
      console.error('Failed to preview content:', err);
    }).finally(() => {
      setLoading(false);
    });
  };

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const currentProfileId = isViewingSelf ? activeProfile?.id : profileId;
      const currentProfileName = isViewingSelf ? activeProfile?.name : creatorName;

      // 1. Fetch Follow activity to see if we follow this creator
      if (activeProfile?.id) {
        const selfActivity = await api.getProfileActivity(activeProfile.id).catch(() => null);
        if (selfActivity?.follows) {
          const followedIds = new Set(selfActivity.follows.map((f: any) => f.id));
          setFollowedCreatorIds(followedIds);
          if (profileId) {
            setIsFollowingCreator(followedIds.has(profileId));
          }
        }
      }

      // 2. Fetch Posts
      const postsRes = await api.getPosts().catch(() => ({ data: [] }));
      const allPosts = postsRes.data || [];
      const profilePosts = allPosts.filter((p: any) => 
        isViewingSelf ? p.profile?.id === currentProfileId : p.profile?.name === currentProfileName
      );
      setPosts(profilePosts);

      // 3. Fetch Reels
      const reelsRes = await api.getReels(null, 50, currentProfileName).catch(() => ({ data: [] }));
      setReels(reelsRes.data || []);

      // 4. Fetch Live Streams & Recordings (load from user_streams table!)
      const [liveRes, userStreamsRes] = await Promise.all([
        api.getStreams().catch(() => ({ data: [] })),
        api.getUserStreams(currentProfileId).catch(() => ({ data: [] }))
      ]);

      const activeStreams = (liveRes.data || []).filter((s: any) => s.profile_id === currentProfileId).map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        profile_id: s.profile_id,
        stream_title: s.title,
        description: s.description || '',
        category: s.category,
        stream_type: s.stream_type || 'public',
        stream_status: 'live',
        live_stream_url: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`,
        recorded_video_url: null,
        thumbnail_url: null,
        duration: 0,
        started_at: s.started_at,
        ended_at: null,
        total_views: s.viewers || 0,
        peak_viewers: s.peak_viewers || 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
        recording_status: 'Recording...',
        storage_provider: 'Supabase',
        created_at: new Date(s.started_at).toISOString(),
        updated_at: new Date(s.started_at).toISOString()
      }));

      const completedStreams = userStreamsRes.data || [];
      
      const activeIds = new Set(activeStreams.map((s: any) => s.id));
      const filteredCompleted = completedStreams.filter((s: any) => !activeIds.has(s.id));

      setLiveSessions([...activeStreams, ...filteredCompleted]);

      // 5. Fetch Watchlist (Saved items)
      if (isViewingSelf) {
        const watchRes = await api.getWatchlist().catch(() => ({ data: [] }));
        setWatchlist(watchRes.data || []);
      }

      // 6. Fetch Liked items and comments via activity route
      if (currentProfileId) {
        const actRes = await api.getProfileActivity(currentProfileId).catch(() => null);
        if (actRes) {
          setLikedItems({
            reels: actRes.likedReels || [],
            posts: actRes.likedPosts || [],
          });
          setProfileComments(actRes.comments || []);
        }
      }
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [profileId, activeProfile?.id, isViewingSelf])
  );

  const handleFollowToggle = async () => {
    const targetId = profileId;
    if (!targetId) return;
    try {
      setIsFollowingCreator(!isFollowingCreator);
      const res = await api.followCreator(targetId);
      setIsFollowingCreator(res.isFollowing);
      Alert.alert(res.isFollowing ? 'Following Creator' : 'Unfollowed Creator');
    } catch (err) {
      console.error('Failed to follow creator:', err);
    }
  };

  const handleShareProfile = () => {
    const name = isViewingSelf ? activeProfile?.name : creatorName;
    const link = `https://nexusplay.app/profile/${name?.toLowerCase().replace(/\s+/g, '')}`;
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(link);
      Alert.alert('Share Link Copied', 'Profile URL copied to clipboard!');
    } else {
      Alert.alert('Share Link', link);
    }
  };

  const handleUpdateProfileSubmit = async () => {
    if (!editProfileName.trim()) {
      Alert.alert('Validation Error', 'Profile name is required');
      return;
    }
    setUpdatingProfile(true);
    try {
      // 1. Update Profile Name, Bio, Website, and Location in DB
      const updated = await api.updateProfile(activeProfile!.id, { 
        name: editProfileName.trim(),
        bio: editBio,
        website: editWebsite,
        location: editLocation
      });
      await refreshProfiles();
      await selectProfile(updated);

      // 2. Update Display Name
      if (editAccountName.trim() && editAccountName.trim() !== user?.displayName) {
        await api.updateUserInfo(editAccountName.trim());
      }

      // 3. Update local component states
      setBio(editBio);
      setWebsite(editWebsite);
      setLocation(editLocation);

      // 4. Update password if filled
      if (currentPassword && newPassword) {
        if (newPassword.length < 6) {
          Alert.alert('Validation Error', 'New password must be at least 6 characters.');
        } else {
          await api.changePassword(currentPassword, newPassword);
          setCurrentPassword('');
          setNewPassword('');
        }
      }

      setShowEditModal(false);
      Alert.alert('Success', 'Profile updated successfully!');
      loadProfileData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile info');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleSelectAvatar = async (avatarPath: string) => {
    try {
      const updated = await api.updateProfile(activeProfile!.id, { avatarUrl: avatarPath });
      await refreshProfiles();
      await selectProfile(updated);
      setShowAvatarPicker(false);
      Alert.alert('Avatar Updated', 'Avatar applied successfully!');
      loadProfileData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update avatar.');
    }
  };

  const handleUpgradeSubmit = async () => {
    if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim() || !cardName.trim()) {
      Alert.alert('Validation Error', 'All payment fields are required.');
      return;
    }
    setPaying(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await api.subscribeProfile(activeProfile!.id);
      await refreshProfiles();
      const updatedProfile = { ...activeProfile!, subscribed: true };
      await selectProfile(updatedProfile);
      setShowUpgradeModal(false);
      Alert.alert('Payment Successful', 'Welcome to NEXUS Play Premium!');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardName('');
      loadProfileData();
    } catch (err: any) {
      Alert.alert('Payment Failed', err.message || 'Upgrade transaction failed.');
    } finally {
      setPaying(false);
    }
  };

  const handleOpenAdminPanel = async () => {
    setShowAdminModal(true);
    setActiveAdminTab('analytics');
  };

  const loadDefaultThumbnails = async () => {
    setLoadingThumbnails(true);
    try {
      const res = await api.getAdminDefaultThumbnails();
      setDefaultThumbnails(res.data || []);
    } catch (err) {
      console.error('Failed to load default thumbnails:', err);
    } finally {
      setLoadingThumbnails(false);
    }
  };

  const loadAdminTabDetail = useCallback(async () => {
    try {
      if (activeAdminTab === 'analytics') {
        setLoadingAnalytics(true);
        const data = await api.getAdminAnalytics();
        setAnalytics(data);
        setLoadingAnalytics(false);
      } else if (activeAdminTab === 'thumbnails') {
        loadDefaultThumbnails();
      } else if (activeAdminTab === 'users') {
        const res = await api.adminGetUsers(adminUserSearch);
        setAdminUsers(res.data || []);
      } else if (activeAdminTab === 'content') {
        const res = await api.adminGetContent(adminContentType);
        setAdminContentList(res.data || []);
      } else if (activeAdminTab === 'reports') {
        const res = await api.adminGetReports();
        setAdminReports(res.data || []);
      } else if (activeAdminTab === 'categories') {
        const res = await api.adminGetCategories();
        setAdminCategoriesList(res.data || []);
      } else if (activeAdminTab === 'settings') {
        const res = await api.adminGetSettings();
        setAdminSettings(res.data || {});
      } else if (activeAdminTab === 'security') {
        const [auditRes, blockedRes] = await Promise.all([
          api.adminGetAuditLogs().catch(() => ({ data: [] })),
          api.adminGetBlockedIps().catch(() => ({ data: [] }))
        ]);
        setAdminAuditLogs(auditRes.data || []);
        setAdminBlockedIps(blockedRes.data || []);
      }
    } catch (err) {
      console.error('Failed to load admin tab data:', err);
    }
  }, [activeAdminTab, adminUserSearch, adminContentType]);

  useEffect(() => {
    if (showAdminModal) {
      loadAdminTabDetail();
    }
  }, [showAdminModal, activeAdminTab, adminUserSearch, adminContentType]);

  const handleReplaceThumbnail = async (category: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setReplacingThumbnailCat(category);

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
          const res = await api.updateAdminDefaultThumbnail(category, base64);
          if (res.success) {
            Alert.alert('Success', `Updated default thumbnail for ${category}!`);
            loadDefaultThumbnails();
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to replace thumbnail');
    } finally {
      setReplacingThumbnailCat(null);
    }
  };

  const isSubscribed = isViewingSelf ? !!activeProfile?.subscribed : true; // creator accounts are verified
  const totalLikes = likedItems.reels.length + likedItems.posts.length;
  const totalComments = profileComments.length;

  return (
    <View style={{ flex: 1 }}>
      {isDesktop && <AppHeader onPressAvatar={() => {}} />}
      <ThreeDForestBg />
      <ScrollView 
        style={[styles.container, { backgroundColor: 'transparent' }]}
        contentContainerStyle={{ 
          paddingBottom: Math.max(insets.bottom + 80, 110), 
          paddingTop: isDesktop ? 96 : 76 
        }}
      >
        {/* COVER PHOTO SECTION */}
        <View style={styles.coverWrapper}>
          <LinearGradient
            colors={['#1e3a8a', '#581c87', '#030712']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverOverlay} />
        </View>

        {/* PROFILE INFO HEADER */}
        <View style={[
          styles.profileHeaderCard,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
          }
        ]}>
          <View style={styles.avatarRow}>
            {/* Avatar */}
            <Pressable 
              style={[styles.avatarWrapper, isViewingSelf && { cursor: 'pointer' } as any]}
              onPress={() => isViewingSelf && setShowAvatarPicker(true)}
            >
              <Image
                source={{ 
                  uri: isViewingSelf 
                    ? (activeProfile?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/png')
                    : (creatorAvatar || 'https://api.dicebear.com/7.x/bottts/png')
                }}
                style={[styles.profileAvatar, { borderColor: isSubscribed ? '#ffd24a' : '#3B82F6' }] as any}
              />
              {isSubscribed && (
                <View style={[styles.verifiedBadge, { borderColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                </View>
              )}
            </Pressable>
 
            {/* Actions Buttons */}
            <View style={styles.headerActions}>
              {isViewingSelf ? (
                <>
                  <HoverPressable style={styles.primaryActionBtn} onPress={() => setShowEditModal(true)}>
                    <Text style={styles.primaryActionBtnText}>✏️ Edit Profile</Text>
                  </HoverPressable>
                  <HoverPressable 
                    style={[styles.secondaryActionBtn, { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)' }]} 
                    onPress={handleShareProfile}
                  >
                    <Text style={[styles.secondaryActionBtnText, { color: isDark ? '#E2E8F0' : '#334155' }]}>🔗 Share</Text>
                  </HoverPressable>
                </>
              ) : (
                <>
                  <HoverPressable 
                    style={[styles.primaryActionBtn, isFollowingCreator && { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)' }]} 
                    onPress={handleFollowToggle}
                  >
                    <Text style={styles.primaryActionBtnText}>
                      {isFollowingCreator ? '🤝 Following' : '➕ Follow'}
                    </Text>
                  </HoverPressable>
                  <HoverPressable 
                    style={[styles.secondaryActionBtn, { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)' }]} 
                    onPress={handleShareProfile}
                  >
                    <Text style={[styles.secondaryActionBtnText, { color: isDark ? '#E2E8F0' : '#334155' }]}>🔗 Share</Text>
                  </HoverPressable>
                </>
              )}
            </View>
          </View>
 
          {/* User Names */}
          <View style={styles.nameBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.profileNameText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                {isViewingSelf ? activeProfile?.name : creatorName}
              </Text>
              {isSubscribed && <Text style={{ fontSize: 16 }}>👑</Text>}
            </View>
            <Text style={[styles.usernameText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              @{isViewingSelf ? activeProfile?.name?.toLowerCase().replace(/\s+/g, '') : creatorHandle?.replace('@', '')}
            </Text>
          </View>
 
          {/* Bio Description */}
          <Text style={[styles.bioText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
            {isViewingSelf ? bio : 'NEXUS Content Creator pushing live news, reels and high impact coverage.'}
          </Text>
 
          {/* Location / Website Metadata row */}
          <View style={styles.metadataRow}>
            <Text style={[styles.metadataItem, { color: isDark ? '#94A3B8' : '#475569' }]}>📍 {isViewingSelf ? location : 'India'}</Text>
            {isViewingSelf && website && (
              <Text style={[styles.metadataItem, { color: colors.primary }]}>🔗 {website}</Text>
            )}
            <Text style={[styles.metadataItem, { color: isDark ? '#94A3B8' : '#475569' }]}>📅 {isViewingSelf ? joinDate : 'Joined 2026'}</Text>
          </View>
 
          {/* STATISTICS GRID */}
          <View style={[styles.statsGridContainer, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                {isViewingSelf ? compact(isSubscribed ? 2450 : 124) : compact(isFollowingCreator ? 1241 : 1240)}
              </Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                {isViewingSelf ? compact(followedCreatorIds.size) : '85'}
              </Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Following</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{posts.length}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{reels.length}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Reels</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{liveSessions.length}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Live TV</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{compact(totalComments)}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Comments</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{compact(totalLikes)}</Text>
              <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>Likes</Text>
            </View>
          </View>
        </View>

        {/* TABS HEADER ROW */}
        <View style={[styles.tabsHeaderContainer, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['posts', 'reels', 'live', 'comments', ...(isViewingSelf ? ['saved'] : []), 'liked', 'about'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab as ProfileTab)}
                  style={[styles.tabTriggerBtn, active && { borderBottomColor: colors.primary }]}
                >
                  <Text style={[styles.tabTriggerText, { color: active ? colors.primary : (isDark ? '#94A3B8' : '#64748B') }, active && { fontWeight: '700' }]}>
                    {tab === 'live' ? 'PAST LIVE SESSIONS' : tab.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* DYNAMIC TAB BODY */}
        <View style={styles.tabContentContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
          ) : (
            <>
              {/* POSTS TAB */}
              {activeTab === 'posts' && (
                posts.length === 0 ? (
                  <Text style={styles.emptyText}>No social posts published yet.</Text>
                ) : (
                  <View style={styles.postsGrid}>
                    {posts.map((post) => (
                      <View key={post.id} style={[styles.postCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
                        <View style={styles.postCardHeader}>
                          <Text style={[styles.postCardLocation, { color: colors.primary }]}>📍 {post.location || 'Unknown'}</Text>
                          <Text style={styles.postCardTime}>{new Date(post.createdAt).toLocaleDateString()}</Text>
                        </View>
                        <Text style={[styles.postCardBody, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>{post.content}</Text>
                        {post.imageUrl && (
                          <Image source={{ uri: post.imageUrl }} style={styles.postCardImage} />
                        )}
                        <View style={styles.postCardFooter}>
                          <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>❤️ {post.likes} Likes · 💬 {post.comments} Comments</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )
              )}

              {/* REELS TAB */}
              {activeTab === 'reels' && (
                reels.length === 0 ? (
                  <Text style={styles.emptyText}>No video reels published yet.</Text>
                ) : (
                  <View style={styles.reelsGrid}>
                    {reels.map((reel) => (
                      <Pressable
                        key={reel.id}
                        style={styles.reelGridItem}
                        onPress={() => handleOpenContent(reel.id, 'reel')}
                      >
                        <Image source={{ uri: reel.thumbnailUrl || undefined }} style={styles.reelThumb} />
                        <View style={styles.reelOverlay}>
                          <Text style={styles.reelViewsText}>▶ {compact(reel.stats?.views || 0)}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )
              )}

              {/* COMMENTS TAB */}
              {activeTab === 'comments' && (
                profileComments.length === 0 ? (
                  <Text style={styles.emptyText}>No comments written yet.</Text>
                ) : (
                  <View style={styles.postsGrid}>
                    {profileComments.map((comment) => {
                      const typeLabel = comment.content_type === 'reel' ? '🎥 Reel' : comment.content_type === 'post' ? '📝 Post' : comment.content_type === 'news' ? '📰 Article' : '🎥 Content';
                      const linkText = comment.content_title || 'View Content';
                      const handlePressContent = () => {
                        handleOpenContent(comment.reel_id, comment.content_type);
                      };
                      return (
                        <View key={comment.id} style={[styles.postCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
                          <View style={styles.postCardHeader}>
                            <Pressable onPress={handlePressContent}>
                              <Text style={[styles.postCardLocation, { color: colors.primary, textDecorationLine: 'underline' }]} numberOfLines={1}>
                                {typeLabel}: {linkText}
                              </Text>
                            </Pressable>
                            <Text style={styles.postCardTime}>{new Date(comment.created_at).toLocaleDateString()}</Text>
                          </View>
                          <Text style={[styles.postCardBody, { color: isDark ? '#E2E8F0' : '#1E293B', fontStyle: 'italic' }]}>
                            "{comment.body}"
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )
              )}

              {/* LIVE SESSIONS TAB */}
              {activeTab === 'live' && (
                liveSessions.length === 0 ? (
                  <Text style={styles.emptyText}>No live stream archives yet.</Text>
                ) : (
                  <View style={styles.postsGrid}>
                    {liveSessions.map((session) => {
                      const isLive = session.stream_status === 'LIVE' || session.stream_status === 'live';
                      const thumb = session.thumbnail_url || `${API_URL}/media/uploads/${getDefaultThumbnailFilename(session.category, 'live')}`;
                      const formattedDuration = session.duration > 0
                        ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s`
                        : '0s';
                      
                      let statusBg = 'rgba(59, 130, 246, 0.15)';
                      let statusColor = '#3B82F6';
                      if (isLive) {
                        statusBg = 'rgba(239, 68, 68, 0.15)';
                        statusColor = '#EF4444';
                      } else if (session.recording_status === 'Processing...' || session.recording_status === 'PROCESSING') {
                        statusBg = 'rgba(245, 158, 11, 0.15)';
                        statusColor = '#F59E0B';
                      } else if (session.recording_status === 'Uploading...' || session.recording_status === 'UPLOADING') {
                        statusBg = 'rgba(234, 179, 8, 0.15)';
                        statusColor = '#EAB308';
                      } else if (session.recording_status === 'READY' || session.recording_status === 'Ready' || session.recording_status === 'Completed') {
                        statusBg = 'rgba(16, 185, 129, 0.15)';
                        statusColor = '#10B981';
                      } else if (session.recording_status === 'FAILED' || session.recording_status === 'Failed') {
                        statusBg = 'rgba(220, 38, 38, 0.15)';
                        statusColor = '#DC2626';
                      }

                      return (
                        <Pressable 
                          key={session.id} 
                          onPress={() => {
                            if (session.recorded_video_url) {
                              setActivePlaybackUrl(session.recorded_video_url);
                              setShowPlayerModal(true);
                            } else if (isLive) {
                              Alert.alert('Info', 'This live stream is currently broadcasting live.');
                            } else {
                              Alert.alert('Info', 'This live stream is still recording or processing.');
                            }
                          }}
                          style={[styles.postCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border, cursor: 'pointer' } as any]}
                        >
                          <View style={[styles.postCardHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: statusColor, fontSize: 10, fontWeight: 'bold' }}>
                                  {isLive ? 'LIVE' : (session.recording_status || 'RECORDING')}
                                </Text>
                              </View>
                              {isViewingSelf && (
                                <HoverPressable 
                                  style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.primary }}
                                  onPress={(e: any) => {
                                    e.stopPropagation();
                                    handleOpenStreamDetails(session);
                                  }}
                                >
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>✏️ Edit</Text>
                                </HoverPressable>
                              )}
                            </View>
                            <Text style={styles.postCardTime}>{new Date(session.started_at).toLocaleString()}</Text>
                          </View>
                          
                          {(!isLive || session.thumbnail_url) && (
                            <View style={{ position: 'relative', width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', marginVertical: 8 }}>
                              <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                              {!isLive && (session.recording_status === 'READY' || session.recording_status === 'Ready' || session.recording_status === 'Completed') && (
                                <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ color: '#fff', fontSize: 10 }}>▶ Play Recording</Text>
                                </View>
                              )}
                            </View>
                          )}

                          <Text style={[styles.postCardBody, { color: isDark ? '#E2E8F0' : '#1E293B', fontWeight: 'bold' }]}>{session.stream_title}</Text>
                          {session.description ? (
                            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, marginTop: 2 }} numberOfLines={2}>{session.description}</Text>
                          ) : null}
                          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, marginTop: 4 }}>Category: {session.category} · Status: {session.stream_type.toUpperCase()}</Text>
                          
                          <View style={[styles.postCardFooter, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }]}>
                            <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>
                              {isLive ? `👁️ Viewers: ${session.peak_viewers}` : `👁️ ${session.total_views || 0} views · ⏱️ ${formattedDuration}`}
                            </Text>
                            <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>
                              ❤️ {session.total_likes} · 💬 {session.total_comments}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )
              )}

              {/* SAVED TAB (Self only) */}
              {activeTab === 'saved' && isViewingSelf && (
                watchlist.length === 0 ? (
                  <Text style={styles.emptyText}>No saved items found in your watchlist.</Text>
                ) : (
                  <View style={styles.postsGrid}>
                    {watchlist.map((item) => (
                      <Pressable 
                        key={item.id} 
                        style={[styles.watchlistRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border, cursor: 'pointer' } as any]}
                        onPress={() => handleOpenContent(item.contentId, item.contentType as any)}
                      >
                        {item.thumbnailUrl ? (
                          <Image source={{ uri: item.thumbnailUrl }} style={styles.watchlistThumb as any} />
                        ) : (
                          <View style={[styles.watchlistFallback, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                            <Text style={{ fontSize: 18 }}>🎥</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.watchlistTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>{item.title}</Text>
                          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, marginTop: 2 }}>{item.contentType.toUpperCase()} · {item.category}</Text>
                        </View>
                        <HoverPressable 
                          style={{ padding: 8 }} 
                          onPress={async (e: any) => {
                            e.stopPropagation();
                            await api.removeFromWatchlist(item.contentType, item.contentId);
                            loadProfileData();
                          }}
                        >
                          <Text style={{ color: '#EF4444', fontSize: 14 }}>✕</Text>
                        </HoverPressable>
                      </Pressable>
                    ))}
                  </View>
                )
              )}

              {/* LIKED TAB */}
              {activeTab === 'liked' && (
                (likedItems.reels.length === 0 && likedItems.posts.length === 0) ? (
                  <Text style={styles.emptyText}>No liked posts or reels found.</Text>
                ) : (
                  <View style={styles.postsGrid}>
                    {likedItems.reels.map((r, index) => (
                      <Pressable 
                        key={`liked-reel-${r.id || index}`} 
                        style={[styles.watchlistRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border, cursor: 'pointer' } as any]}
                        onPress={() => handleOpenContent(r.id, 'reel')}
                      >
                        <Text style={{ fontSize: 18, marginRight: 8 }}>🎥</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.watchlistTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Liked Reel: {r.title}</Text>
                        </View>
                      </Pressable>
                    ))}
                    {likedItems.posts.map((p, index) => (
                      <Pressable 
                        key={`liked-post-${p.id || index}`} 
                        style={[styles.watchlistRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border, cursor: 'pointer' } as any]}
                        onPress={() => handleOpenContent(p.id, 'post')}
                      >
                        <Text style={{ fontSize: 18, marginRight: 8 }}>📝</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.watchlistTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>Liked Post: {p.content}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )
              )}

              {/* ABOUT TAB */}
              {activeTab === 'about' && (
                <View style={[styles.aboutCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}>
                  <Text style={[styles.aboutTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>About this profile</Text>
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Role</Text>
                    <Text style={[styles.aboutVal, { color: isDark ? '#CBD5E1' : '#334155' }]}>{String(user?.role).replace('_', ' ').toUpperCase()}</Text>
                  </View>
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Location</Text>
                    <Text style={[styles.aboutVal, { color: isDark ? '#CBD5E1' : '#334155' }]}>{isViewingSelf ? location : 'India'}</Text>
                  </View>
                  {isViewingSelf && (
                    <>
                      <View style={styles.aboutRow}>
                        <Text style={styles.aboutLabel}>Website</Text>
                        <Text style={[styles.aboutVal, { color: colors.primary }]}>{website}</Text>
                      </View>
                      <View style={styles.aboutRow}>
                        <Text style={styles.aboutLabel}>Registration Email</Text>
                        <Text style={[styles.aboutVal, { color: isDark ? '#CBD5E1' : '#334155' }]}>{user?.email}</Text>
                      </View>
                    </>
                  )}
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Join Date</Text>
                    <Text style={[styles.aboutVal, { color: isDark ? '#CBD5E1' : '#334155' }]}>{isViewingSelf ? joinDate : 'July 2026'}</Text>
                  </View>

                  {/* Actions mapping inside about card for self */}
                  {isViewingSelf && (
                    <View style={{ marginTop: 24, gap: 10 }}>
                      {!isSubscribed && (
                        <HoverPressable style={styles.aboutActionBtn} onPress={() => setShowUpgradeModal(true)}>
                          <Text style={{ color: '#ffd24a', fontWeight: 'bold' }}>🚀 Upgrade to Premium Membership</Text>
                        </HoverPressable>
                      )}
                      {user?.role === 'super_admin' && (
                        <HoverPressable style={[styles.aboutActionBtn, { borderColor: colors.accent }]} onPress={handleOpenAdminPanel}>
                          <Text style={{ color: colors.accent, fontWeight: 'bold' }}>📊 Open Admin Control Center</Text>
                        </HoverPressable>
                      )}
                      <HoverPressable style={[styles.aboutActionBtn, { borderColor: '#EF4444' }]} onPress={switchProfile}>
                        <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>👥 Switch Active Profile</Text>
                      </HoverPressable>
                      <HoverPressable style={[styles.aboutActionBtn, { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]} onPress={signOut}>
                        <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>🚪 Logout from Account</Text>
                      </HoverPressable>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditModal} animationType="slide" transparent={true} onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '85%' }]}>
            <Text style={styles.modalTitle}>Edit Profile Settings</Text>
            <ScrollView style={{ flex: 1, marginVertical: 14 }}>
              
              <Text style={styles.inputLabel}>Profile Display Name</Text>
              <TextInput style={styles.modalInput} value={editProfileName} onChangeText={setEditProfileName} placeholder="Display Name" placeholderTextColor={colors.placeholder} />

              <Text style={styles.inputLabel}>Bio Description</Text>
              <TextInput style={[styles.modalInput, { height: 70 }]} multiline value={editBio} onChangeText={setEditBio} placeholder="e.g. Content Creator..." placeholderTextColor={colors.placeholder} />

              <Text style={styles.inputLabel}>Website URL</Text>
              <TextInput style={styles.modalInput} value={editWebsite} onChangeText={setEditWebsite} placeholder="https://example.com" placeholderTextColor={colors.placeholder} />

              <Text style={styles.inputLabel}>Location</Text>
              <TextInput style={styles.modalInput} value={editLocation} onChangeText={setEditLocation} placeholder="e.g. Visakhapatnam, AP" placeholderTextColor={colors.placeholder} />

              <Text style={styles.inputLabel}>Account Display Name (Owner)</Text>
              <TextInput style={styles.modalInput} value={editAccountName} onChangeText={setEditAccountName} placeholder="Account Owner Name" placeholderTextColor={colors.placeholder} />

              <HoverPressable style={[styles.secondaryActionBtn, { alignSelf: 'flex-start', marginVertical: 10 }]} onPress={() => setShowAvatarPicker(true)}>
                <Text style={styles.secondaryActionBtnText}>🎨 Change Avatar Image</Text>
              </HoverPressable>

              <Text style={[styles.inputLabel, { marginTop: 14, fontWeight: 'bold' }]}>Change Password (Optional)</Text>
              <TextInput style={styles.modalInput} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current Password" placeholderTextColor={colors.placeholder} />
              <TextInput style={styles.modalInput} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="New Password" placeholderTextColor={colors.placeholder} />

            </ScrollView>
            <View style={styles.modalActions}>
              <HoverPressable style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </HoverPressable>
              <HoverPressable style={styles.submitBtn} onPress={handleUpdateProfileSubmit} disabled={updatingProfile}>
                {updatingProfile ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Save Updates</Text>}
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* AVATAR PICKER MODAL */}
      <Modal visible={showAvatarPicker} animationType="fade" transparent={true} onRequestClose={() => setShowAvatarPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500, height: '70%' }]}>
            <Text style={styles.modalTitle}>Choose Cartoon Avatar</Text>
            <Text style={styles.modalSubTitle}>Select a style to customize your profile</Text>
            {avatarCategories ? (
              <ScrollView style={{ flex: 1, marginTop: 10 }}>
                {Object.keys(avatarCategories).map((categoryName) => (
                  <View key={categoryName} style={{ marginBottom: 18 }}>
                    <Text style={styles.avatarCatTitle}>{categoryName}</Text>
                    <View style={styles.avatarGrid}>
                      {avatarCategories[categoryName].map((av) => (
                        <Pressable key={av.name} style={styles.avatarGridItem} onPress={() => handleSelectAvatar(av.path)}>
                          <Image source={{ uri: getAvatarUrl(av.path) }} style={styles.pickerAvatarImg} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
            )}
            <HoverPressable style={[styles.cancelBtn, { marginTop: 14, alignSelf: 'center' }]} onPress={() => setShowAvatarPicker(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </HoverPressable>
          </View>
        </View>
      </Modal>

      {/* BILLING / PREMIUM MODAL */}
      <Modal visible={showUpgradeModal} animationType="slide" transparent={true} onRequestClose={() => setShowUpgradeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={['#3b82f6', '#8b5cf6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardHeaderDecoration} />
            <Text style={styles.modalTitle}>Credit Card Payment</Text>
            <Text style={styles.modalSubTitle}>Unlock Premium Membership Instantly</Text>

            <Text style={styles.inputLabel}>Name on Card</Text>
            <TextInput style={styles.modalInput} placeholder="e.g. Anil Kumar" placeholderTextColor={colors.placeholder} value={cardName} onChangeText={setCardName} />

            <Text style={styles.inputLabel}>Card Number</Text>
            <TextInput style={styles.modalInput} placeholder="4111 2222 3333 4444" placeholderTextColor={colors.placeholder} keyboardType="numeric" value={cardNumber} onChangeText={setCardNumber} />

            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Expiry (MM/YY)</Text>
                <TextInput style={styles.modalInput} placeholder="12/28" placeholderTextColor={colors.placeholder} value={cardExpiry} onChangeText={setCardExpiry} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.inputLabel}>CVV</Text>
                <TextInput style={styles.modalInput} placeholder="123" placeholderTextColor={colors.placeholder} secureTextEntry keyboardType="numeric" value={cardCvv} onChangeText={setCardCvv} />
              </View>
            </View>

            <View style={styles.modalActions}>
              <HoverPressable style={styles.cancelBtn} onPress={() => setShowUpgradeModal(false)} disabled={paying}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </HoverPressable>
              <HoverPressable style={styles.submitBtn} onPress={handleUpgradeSubmit} disabled={paying}>
                {paying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Pay $9.99/mo</Text>}
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN PANEL ANALYTICS MODAL */}
      <Modal visible={showAdminModal} animationType="slide" transparent={true} onRequestClose={() => setShowAdminModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%', height: '85%' }]}>
            <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardHeaderDecoration} />
            <Text style={styles.modalTitle}>📊 Super Admin Console</Text>
            <Text style={styles.modalSubTitle}>Nexus Play Category Defaults & Insights</Text>

            {/* Tab Controls */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42, marginVertical: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
                {[
                  { id: 'analytics', label: '📊 Stats' },
                  { id: 'thumbnails', label: '🖼️ Thumbnails' },
                  { id: 'users', label: '👥 Users' },
                  { id: 'content', label: '📝 Content' },
                  { id: 'reports', label: '⚠️ Reports' },
                  { id: 'categories', label: '📁 Categories' },
                  { id: 'settings', label: '⚙️ Settings' },
                  { id: 'security', label: '🔒 Security' }
                ].map((tab) => (
                  <Pressable 
                    key={tab.id}
                    style={{ 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 8, 
                      backgroundColor: activeAdminTab === tab.id ? colors.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                      justifyContent: 'center',
                      alignItems: 'center'
                    }} 
                    onPress={() => setActiveAdminTab(tab.id as any)}
                  >
                    <Text style={{ color: activeAdminTab === tab.id ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700' }}>{tab.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {activeAdminTab === 'analytics' ? (
              loadingAnalytics ? (
                <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 60 }} />
              ) : analytics ? (
                <ScrollView style={{ flex: 1, marginTop: 10 }}>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Total Users</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.totalUsers}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Active Users</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.activeUsers}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Subscribers</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.premiumSubscribers}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Total Revenue</Text>
                      <Text style={[styles.metricVal, { color: '#10B981' }]}>${analytics.metrics.revenue.toFixed(2)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>News Articles</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.newsPublished}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Live Streams</Text>
                      <Text style={[styles.metricVal, { color: '#EF4444' }]}>{analytics.metrics.liveStreams}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Reels</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.totalReels || 0}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Posts</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.totalPosts || 0}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Comments</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.totalComments || 0}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Flagged Reports</Text>
                      <Text style={[styles.metricVal, { color: '#F59E0B' }]}>{analytics.metrics.totalReports || 0}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Categories</Text>
                      <Text style={styles.metricVal}>{analytics.metrics.totalCategories || 0}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>System Health</Text>
                      <Text style={[styles.metricVal, { color: '#10B981', fontSize: 11 }]}>{analytics.metrics.systemHealth || '100% OK'}</Text>
                    </View>
                  </View>
                  <View style={styles.aiInsightsPanel}>
                    <Text style={styles.insightsTitle}>💡 Gemini AI Platform Insights</Text>
                    <Text style={styles.insightsBody}>{analytics.aiInsights}</Text>
                  </View>
                </ScrollView>
              ) : (
                <Text style={{ color: colors.text, textAlign: 'center', marginTop: 30 }}>Failed to fetch analytics data.</Text>
              )
            ) : activeAdminTab === 'thumbnails' ? (
              loadingThumbnails ? (
                <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 60 }} />
              ) : (
                <ScrollView style={{ flex: 1, marginTop: 10 }}>
                  <Text style={{ fontSize: 13, color: colors.textDim, marginBottom: 12, lineHeight: 18 }}>
                    Customize the default fallback thumbnails for content uploaded without manual cover images. Tapping "Replace" lets you upload a new image.
                  </Text>
                  {defaultThumbnails.map((item) => (
                    <View key={item.category} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', gap: 14 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.text }}>{item.category}</Text>
                        <Text style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{item.filename}</Text>
                      </View>
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Image source={{ uri: item.url }} style={{ width: 100, height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.border }} />
                        <HoverPressable 
                          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' }}
                          onPress={() => handleReplaceThumbnail(item.category)}
                          disabled={replacingThumbnailCat !== null}
                        >
                          <Text style={{ fontSize: 10, color: colors.primary, fontWeight: 'bold' }}>
                            {replacingThumbnailCat === item.category ? 'Uploading...' : 'Replace'}
                          </Text>
                        </HoverPressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )
            ) : activeAdminTab === 'users' ? (
              <View style={{ flex: 1, marginTop: 10 }}>
                <TextInput 
                  style={[styles.modalInput, { marginBottom: 10 }]} 
                  placeholder="🔍 Search users by name or email..." 
                  placeholderTextColor={colors.placeholder}
                  value={adminUserSearch}
                  onChangeText={setAdminUserSearch}
                />
                <ScrollView style={{ flex: 1 }}>
                  {adminUsers.map(user => (
                    <Pressable 
                      key={user.id} 
                      style={{ padding: 12, marginVertical: 4, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: selectedAdminUser?.id === user.id ? colors.primary : 'transparent' }}
                      onPress={() => {
                        setSelectedAdminUser(user);
                        setAdminNewPassword('');
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.text }}>{user.display_name} ({user.role.toUpperCase()})</Text>
                      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>{user.email} · Created: {new Date(user.created_at).toLocaleDateString()}</Text>
                      
                      {selectedAdminUser?.id === user.id && (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', gap: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {['user', 'admin', 'super_admin', 'suspended'].map((r) => (
                              <HoverPressable 
                                key={r}
                                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: user.role === r ? colors.primary : 'transparent', borderWidth: 1, borderColor: colors.border }}
                                onPress={async () => {
                                  await api.adminUpdateUser(user.id, { role: r });
                                  const updated = adminUsers.map(u => u.id === user.id ? { ...u, role: r } : u);
                                  setAdminUsers(updated);
                                  setSelectedAdminUser({ ...user, role: r });
                                }}
                              >
                                <Text style={{ fontSize: 11, color: user.role === r ? '#fff' : colors.text, fontWeight: 'bold' }}>{r.toUpperCase()}</Text>
                              </HoverPressable>
                            ))}
                          </View>
                          
                          <TextInput 
                            style={[styles.modalInput, { height: 36, fontSize: 12 }]} 
                            placeholder="Reset password..." 
                            placeholderTextColor={colors.placeholder}
                            value={adminNewPassword}
                            onChangeText={setAdminNewPassword}
                            secureTextEntry
                          />
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <HoverPressable 
                              style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.accent, alignItems: 'center' }}
                              onPress={async () => {
                                if (!adminNewPassword.trim()) return Alert.alert('Error', 'Password cannot be empty');
                                await api.adminResetPassword(user.id, adminNewPassword);
                                Alert.alert('Success', 'Password reset successfully');
                                setAdminNewPassword('');
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Reset Password</Text>
                            </HoverPressable>
                            <HoverPressable 
                              style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EF4444', alignItems: 'center' }}
                              onPress={async () => {
                                Alert.alert('Confirm Delete', 'Are you sure you want to delete this user account permanently?', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Delete', style: 'destructive', onPress: async () => {
                                    await api.adminDeleteUser(user.id);
                                    setAdminUsers(adminUsers.filter(u => u.id !== user.id));
                                    setSelectedAdminUser(null);
                                  }}
                                ]);
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Delete User</Text>
                            </HoverPressable>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : activeAdminTab === 'content' ? (
              <View style={{ flex: 1, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                  {[
                    { id: 'news', label: 'News' },
                    { id: 'reels', label: 'Reels' },
                    { id: 'posts', label: 'Posts' },
                    { id: 'live-streams', label: 'Streams' }
                  ].map((type) => (
                    <Pressable 
                      key={type.id}
                      style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center', backgroundColor: adminContentType === type.id ? colors.primary : (isDark ? '#334155' : '#E2E8F0') }}
                      onPress={() => setAdminContentType(type.id as any)}
                    >
                      <Text style={{ color: adminContentType === type.id ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>{type.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {adminContentList.map(item => (
                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{item.title || item.stream_title || item.content || item.id}</Text>
                        <Text style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>ID: {item.id}</Text>
                      </View>
                      <HoverPressable 
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444' }}
                        onPress={async () => {
                          Alert.alert('Confirm Delete', 'Delete this content permanently?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              await api.adminDeleteContent(adminContentType, item.id);
                              setAdminContentList(adminContentList.filter(c => c.id !== item.id));
                            }}
                          ]);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Delete</Text>
                      </HoverPressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : activeAdminTab === 'reports' ? (
              <View style={{ flex: 1, marginTop: 10 }}>
                <Text style={{ fontSize: 12, color: colors.textDim, marginBottom: 8 }}>Review and moderate flagged system content.</Text>
                <ScrollView style={{ flex: 1 }}>
                  {adminReports.map(report => (
                    <View key={report.id} style={{ padding: 12, marginVertical: 4, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderLeftWidth: 4, borderLeftColor: report.status === 'pending' ? '#F59E0B' : '#10B981' }}>
                      <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>Report on {report.content_type.toUpperCase()}</Text>
                      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>Reason: {report.reason} · AI Score: {report.ai_score || 0}</Text>
                      <Text style={{ fontSize: 11, color: colors.textDim }}>Status: {report.status.toUpperCase()}</Text>
                      {report.status === 'pending' && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                          <HoverPressable 
                            style={{ flex: 1, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444', alignItems: 'center' }}
                            onPress={async () => {
                              await api.adminResolveReport(report.id, 'resolve');
                              setAdminReports(adminReports.map(r => r.id === report.id ? { ...r, status: 'resolved' } : r));
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Approve (Remove)</Text>
                          </HoverPressable>
                          <HoverPressable 
                            style={{ flex: 1, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary, alignItems: 'center' }}
                            onPress={async () => {
                              await api.adminResolveReport(report.id, 'dismiss');
                              setAdminReports(adminReports.map(r => r.id === report.id ? { ...r, status: 'dismissed' } : r));
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Dismiss</Text>
                          </HoverPressable>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : activeAdminTab === 'categories' ? (
              <View style={{ flex: 1, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  <TextInput 
                    style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} 
                    placeholder="Add new category..." 
                    placeholderTextColor={colors.placeholder}
                    value={adminNewCategory}
                    onChangeText={setAdminNewCategory}
                  />
                  <HoverPressable 
                    style={{ paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.primary, justifyContent: 'center' }}
                    onPress={async () => {
                      if (!adminNewCategory.trim()) return;
                      const res = await api.adminCreateCategory(adminNewCategory.trim());
                      setAdminCategoriesList(res.data || []);
                      setAdminNewCategory('');
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Add</Text>
                  </HoverPressable>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {adminCategoriesList.map((cat) => (
                    <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                      <Text style={{ fontSize: 13, color: colors.text }}>{cat}</Text>
                      <HoverPressable 
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444' }}
                        onPress={async () => {
                          const res = await api.adminDeleteCategory(cat);
                          setAdminCategoriesList(res.data || []);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>Remove</Text>
                      </HoverPressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : activeAdminTab === 'settings' ? (
              <ScrollView style={{ flex: 1, marginTop: 10 }}>
                <Text style={styles.inputLabel}>Platform Name</Text>
                <TextInput 
                  style={styles.modalInput} 
                  value={adminSettings.platformName || ''} 
                  onChangeText={(v) => setAdminSettings({ ...adminSettings, platformName: v })} 
                />
                <Text style={styles.inputLabel}>Theme Mode</Text>
                <TextInput 
                  style={styles.modalInput} 
                  value={adminSettings.theme || ''} 
                  onChangeText={(v) => setAdminSettings({ ...adminSettings, theme: v })} 
                />
                <Text style={styles.inputLabel}>Logo URL</Text>
                <TextInput 
                  style={styles.modalInput} 
                  value={adminSettings.logo || ''} 
                  onChangeText={(v) => setAdminSettings({ ...adminSettings, logo: v })} 
                />
                <HoverPressable 
                  style={{ paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', marginTop: 10 }}
                  onPress={async () => {
                    await api.adminUpdateSettings(adminSettings);
                    Alert.alert('Success', 'Settings updated successfully');
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Save Settings</Text>
                </HoverPressable>
              </ScrollView>
            ) : (
              <View style={{ flex: 1, marginTop: 10 }}>
                {/* Block IP Section */}
                <View style={{ padding: 12, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>Block IP Address</Text>
                  <TextInput 
                    style={[styles.modalInput, { height: 36, fontSize: 12, marginBottom: 6 }]} 
                    placeholder="IP Address (e.g. 192.168.1.50)" 
                    placeholderTextColor={colors.placeholder}
                    value={adminNewBlockIp}
                    onChangeText={setAdminNewBlockIp}
                  />
                  <TextInput 
                    style={[styles.modalInput, { height: 36, fontSize: 12, marginBottom: 8 }]} 
                    placeholder="Reason for blocking" 
                    placeholderTextColor={colors.placeholder}
                    value={adminNewBlockReason}
                    onChangeText={setAdminNewBlockReason}
                  />
                  <HoverPressable 
                    style={{ paddingVertical: 6, borderRadius: 6, backgroundColor: '#EF4444', alignItems: 'center' }}
                    onPress={async () => {
                      if (!adminNewBlockIp.trim()) return;
                      await api.adminBlockIp(adminNewBlockIp.trim(), adminNewBlockReason.trim());
                      setAdminNewBlockIp('');
                      setAdminNewBlockReason('');
                      const blockedRes = await api.adminGetBlockedIps().catch(() => ({ data: [] }));
                      setAdminBlockedIps(blockedRes.data || []);
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Block IP</Text>
                  </HoverPressable>
                </View>

                <ScrollView style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textDim, marginBottom: 6 }}>🔒 Blocked IPs</Text>
                  {adminBlockedIps.map(ip => (
                    <View key={ip.ip} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                      <Text style={{ fontSize: 12, color: colors.text }}>{ip.ip} - {ip.reason}</Text>
                      <HoverPressable 
                        onPress={async () => {
                          await api.adminBlockIp(ip.ip, '', true);
                          setAdminBlockedIps(adminBlockedIps.filter(item => item.ip !== ip.ip));
                        }}
                      >
                        <Text style={{ color: '#10B981', fontSize: 11, fontWeight: 'bold' }}>Unblock</Text>
                      </HoverPressable>
                    </View>
                  ))}

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textDim, marginTop: 14, marginBottom: 6 }}>📝 System Audit Logs</Text>
                  {adminAuditLogs.map(log => (
                    <View key={log.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                      <Text style={{ fontSize: 12, color: colors.text }}>{log.user_email || 'system'}: {log.action}</Text>
                      {log.target && <Text style={{ fontSize: 10, color: colors.textDim }}>Target: {log.target}</Text>}
                      <Text style={{ fontSize: 9, color: colors.textDim }}>{new Date(log.created_at).toLocaleString()}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <HoverPressable style={[styles.cancelBtn, { marginTop: 16, alignSelf: 'center' }]} onPress={() => setShowAdminModal(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </HoverPressable>
          </View>
        </View>
      </Modal>

      {/* Content Preview Detail Modal */}
      <Modal
        visible={selectedContent !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedContent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%', height: '80%', padding: 0, overflow: 'hidden' }]}>
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
                <View>
                  <View style={{ width: '100%', aspectRatio: 0.6, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16 }}>
                    <MoviePlayer uri={selectedContent.videoUrl || selectedContent.video_file || ''} styles={{ modalVideo: { width: '100%', height: '100%' } }} />
                  </View>
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
                        {selectedContent.profile?.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', fontFamily: 'Outfit' }}>
                        📍 {selectedContent.location || 'General'} · {new Date(selectedContent.createdAt).toLocaleDateString()}
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

      {/* Live Stream Details / Management Modal */}
      <Modal
        visible={showStreamDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStreamDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%', maxHeight: '90%', padding: 0, overflow: 'hidden' }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit' }}>
                {isEditingStream ? '✏️ Edit Stream Details' : '📹 Stream Recording Details'}
              </Text>
              <HoverPressable
                style={{ padding: 6, backgroundColor: colors.breaking, borderRadius: 8 }}
                onPress={() => setShowStreamDetailModal(false)}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'Outfit' }}>✕ Close</Text>
              </HoverPressable>
            </View>

            <ScrollView style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }} contentContainerStyle={{ padding: 20 }}>
              {selectedStream && (
                <View>
                  {/* Thumbnail / Image Preview */}
                  <View style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16, position: 'relative' }}>
                    <Image
                      source={{ uri: selectedStream.thumbnail_url || `${API_URL}/media/uploads/${getDefaultThumbnailFilename(selectedStream.category, 'live')}` }}
                      style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                    />
                    {!isEditingStream && (selectedStream.recording_status === 'READY' || selectedStream.recording_status === 'Ready' || selectedStream.recording_status === 'Completed') && (
                      <HoverPressable
                        style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(59, 130, 246, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                        onPress={() => {
                          if (selectedStream.recorded_video_url) {
                            setActivePlaybackUrl(selectedStream.recorded_video_url);
                            setShowPlayerModal(true);
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>▶ Play Recording</Text>
                      </HoverPressable>
                    )}
                  </View>

                  {/* Form Mode */}
                  {isEditingStream ? (
                    <View style={{ gap: 12 }}>
                      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 'bold' }}>STREAM TITLE</Text>
                      <TextInput
                        style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]}
                        value={editStreamTitle}
                        onChangeText={setEditStreamTitle}
                        placeholder="Enter stream title"
                        placeholderTextColor="#64748B"
                      />

                      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 'bold' }}>DESCRIPTION</Text>
                      <TextInput
                        style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border, height: 80, textAlignVertical: 'top' }]}
                        value={editStreamDescription}
                        onChangeText={setEditStreamDescription}
                        placeholder="Enter stream description"
                        placeholderTextColor="#64748B"
                        multiline
                      />

                      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 'bold' }}>CATEGORY</Text>
                      <TextInput
                        style={[styles.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border }]}
                        value={editStreamCategory}
                        onChangeText={setEditStreamCategory}
                        placeholder="e.g. Sports, News, Entertainment"
                        placeholderTextColor="#64748B"
                      />

                      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 'bold' }}>VISIBILITY</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 4 }}>
                        <Pressable
                          style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: editStreamType === 'public' ? colors.primary : colors.border, backgroundColor: editStreamType === 'public' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', alignItems: 'center' }}
                          onPress={() => setEditStreamType('public')}
                        >
                          <Text style={{ color: editStreamType === 'public' ? colors.primary : (isDark ? '#E2E8F0' : '#475569'), fontWeight: 'bold' }}>Public</Text>
                        </Pressable>
                        <Pressable
                          style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: editStreamType === 'private' ? colors.primary : colors.border, backgroundColor: editStreamType === 'private' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', alignItems: 'center' }}
                          onPress={() => setEditStreamType('private')}
                        >
                          <Text style={{ color: editStreamType === 'private' ? colors.primary : (isDark ? '#E2E8F0' : '#475569'), fontWeight: 'bold' }}>Private</Text>
                        </Pressable>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                        <HoverPressable
                          style={{ flex: 1, padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: 'center' }}
                          onPress={handleSaveStreamEdits}
                          disabled={savingStream}
                        >
                          {savingStream ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save Changes</Text>}
                        </HoverPressable>
                        <HoverPressable
                          style={{ flex: 1, padding: 12, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 8, alignItems: 'center' }}
                          onPress={() => setIsEditingStream(false)}
                        >
                          <Text style={{ color: isDark ? '#E2E8F0' : '#1E293B', fontWeight: 'bold' }}>Cancel</Text>
                        </HoverPressable>
                      </View>
                    </View>
                  ) : (
                    /* Display Mode */
                    <View>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'Outfit', marginBottom: 6 }}>
                        {selectedStream.stream_title}
                      </Text>
                      {selectedStream.description ? (
                        <Text style={{ fontSize: 14, color: isDark ? '#CBD5E1' : '#334155', fontFamily: 'Outfit', lineHeight: 20, marginBottom: 12 }}>
                          {selectedStream.description}
                        </Text>
                      ) : null}

                      {/* Info Metadata Badges */}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(59, 130, 246, 0.12)' }}>
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: 'bold' }}>🏷️ {selectedStream.category}</Text>
                        </View>
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.12)' }}>
                          <Text style={{ color: '#10B981', fontSize: 11, fontWeight: 'bold' }}>Status: {selectedStream.stream_type.toUpperCase()}</Text>
                        </View>
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.12)' }}>
                          <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>💾 Recording: {selectedStream.recording_status}</Text>
                        </View>
                      </View>

                      {/* Analytics Matrix Grid */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                        <View style={{ flex: 1, minWidth: 100, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Views</Text>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>📈 {selectedStream.total_views}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Peak Viewers</Text>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>👁️ {selectedStream.peak_viewers}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Duration</Text>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>⏱️ {Math.floor(selectedStream.duration / 60)}m {selectedStream.duration % 60}s</Text>
                        </View>
                      </View>

                      <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', marginBottom: 20 }} />

                      {/* Management Action buttons */}
                      <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <HoverPressable
                            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}
                            onPress={() => setIsEditingStream(true)}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>✏️ Edit Metadata</Text>
                          </HoverPressable>
                          
                          <HoverPressable
                            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#0EA5E9', borderRadius: 8 }}
                            onPress={handleSelectCustomThumbnail}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>🖼️ Edit Cover Image</Text>
                          </HoverPressable>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <HoverPressable
                            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#8B5CF6', borderRadius: 8 }}
                            onPress={() => handleShareStream(selectedStream)}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>🔗 Share Stream</Text>
                          </HoverPressable>

                          <HoverPressable
                            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#10B981', borderRadius: 8 }}
                            onPress={() => handleDownloadStream(selectedStream.recorded_video_url)}
                            disabled={!selectedStream.recorded_video_url}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, opacity: selectedStream.recorded_video_url ? 1 : 0.5 }}>📥 Download Recording</Text>
                          </HoverPressable>
                        </View>

                        <HoverPressable
                          style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#EF4444', borderRadius: 8, marginTop: 10 }}
                          onPress={() => handleDeleteStream(selectedStream.id)}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>🗑️ Delete Recording</Text>
                        </HoverPressable>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        visible={showPlayerModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowPlayerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 800, width: '95%', aspectRatio: 1.77, padding: 0, overflow: 'hidden', backgroundColor: '#000' }]}>
            {activePlaybackUrl && (
              <MoviePlayer uri={activePlaybackUrl} styles={{ modalVideo: { width: '100%', height: '100%' } }} />
            )}
            <HoverPressable
              style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
              onPress={() => {
                setShowPlayerModal(false);
                setActivePlaybackUrl(null);
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✕ Close Player</Text>
            </HoverPressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: 'transparent',
    marginBottom: 10,
  },
  coverWrapper: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  profileHeaderCard: {
    marginHorizontal: 16,
    marginTop: -50,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  avatarWrapper: {
    position: 'relative',
    marginTop: -20,
  },
  profileAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3.5,
    backgroundColor: '#334155',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  primaryActionBtn: {
    backgroundColor: '#3B82F6',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
    fontFamily: 'Outfit',
  },
  secondaryActionBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  secondaryActionBtnText: {
    color: '#E2E8F0',
    fontWeight: '600',
    fontSize: 12.5,
    fontFamily: 'Outfit',
  },
  nameBlock: {
    marginTop: 14,
  },
  profileNameText: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  usernameText: {
    fontSize: 14,
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  bioText: {
    fontSize: 13.5,
    fontFamily: 'Outfit',
    marginTop: 10,
    lineHeight: 19,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  metadataItem: {
    fontSize: 12.5,
    color: '#64748B',
    fontFamily: 'Outfit',
  },
  statsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 18,
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    paddingVertical: 6,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  tabsHeaderContainer: {
    borderBottomWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  tabTriggerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginRight: 8,
  },
  tabTriggerText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Outfit',
    letterSpacing: 0.5,
  },
  tabContentContainer: {
    padding: 16,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13.5,
    textAlign: 'center',
    marginVertical: 40,
    fontFamily: 'Outfit',
  },
  postsGrid: {
    gap: 16,
  },
  postCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  postCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  postCardLocation: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  postCardTime: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'Outfit',
  },
  postCardBody: {
    fontSize: 14,
    fontFamily: 'Outfit',
    lineHeight: 20,
  },
  postCardImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 12,
  },
  postCardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.08)',
    marginTop: 12,
    paddingTop: 8,
  },
  reelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  reelGridItem: {
    width: '31%',
    aspectRatio: 0.65,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  reelThumb: {
    width: '100%',
    height: '100%',
  },
  reelOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  reelViewsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  watchlistThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  watchlistFallback: {
    width: 50,
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchlistTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  aboutCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Outfit',
    marginBottom: 14,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.06)',
  },
  aboutLabel: {
    fontSize: 13,
    color: '#64748B',
    fontFamily: 'Outfit',
  },
  aboutVal: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  aboutActionBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: 'Outfit',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'Outfit',
    marginTop: 2,
    marginBottom: 10,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
    fontFamily: 'Outfit',
  },
  modalInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    fontFamily: 'Outfit',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cancelBtnText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  avatarCatTitle: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
    fontFamily: 'Outfit',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  avatarGridItem: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  pickerAvatarImg: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  cardHeaderDecoration: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  metricItem: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10.5,
  },
  metricVal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  aiInsightsPanel: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  insightsTitle: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 13.5,
  },
  insightsBody: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
});
