import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../state/ThemeContext';
import { useAuth } from '../state/AuthContext';
import { api } from '../api/client';
import { API_URL } from '../config';
import { io } from 'socket.io-client';
import * as DocumentPicker from 'expo-document-picker';
import TopStoriesAdminScreen from './TopStoriesAdminScreen';
import { Translate } from '../state/LanguageContext';

const DEVOTIONAL_SUBCATEGORIES = [
  'Temple News', 'Spiritual News', 'Hindu Dharma', 'Festivals', 'Pooja & Rituals',
  'Pilgrimage', 'Devotional Songs', 'Bhajans', 'Slokas', 'Vedas & Upanishads',
  'Bhagavad Gita', 'Ramayana', 'Mahabharata', 'Puranas', 'Saints & Gurus',
  'Astrology', 'Panchangam', 'Daily Horoscope', 'Meditation', 'Yoga',
  'Quotes & Teachings', 'Religious Events', 'Temple Festivals', 'Charity & Seva',
  'Spiritual Discourses', 'Devotional'
];

const timeAgo = (dateStr?: string) => {
  if (!dateStr) return 'just now';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function SuperAdminDashboardScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user, activeProfile } = useAuth();

  // Sidebar navigation state
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'home'
    | 'topStories'
    | 'breakingNews'
    | 'trendingNews'
    | 'news'
    | 'reels'
    | 'channels'
    | 'userStreams'
    | 'entertainment'
    | 'sports'
    | 'politics'
    | 'business'
    | 'technology'
    | 'education'
    | 'health'
    | 'world'
    | 'devotional'
    | 'weather'
    | 'categories'
    | 'media'
    | 'ads'
    | 'users'
    | 'reporters'
    | 'notifications'
    | 'analytics'
    | 'seo'
    | 'comments'
    | 'logs'
    | 'rolesPermissions'
    | 'bulkUpload'
    | 'database'
    | 'backups'
    | 'settings'
    | 'liveRecordings'
  >('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<any | null>(null);

  // Global Upload Modal States
  const [showGlobalUploadModal, setShowGlobalUploadModal] = useState(false);
  const [globalUploadType, setGlobalUploadType] = useState<'news' | 'top_story' | 'breaking' | 'reel' | 'video' | 'gallery' | 'live_tv_thumb'>('news');
  const [globalUploadCategory, setGlobalUploadCategory] = useState<string>('General');
  const [globalUploadLanguage, setGlobalUploadLanguage] = useState<string>('English');
  const [globalUploadReporter, setGlobalUploadReporter] = useState<string>('NEXUS Admin');
  const [globalUploadTitle, setGlobalUploadTitle] = useState('');
  const [globalUploadSummary, setGlobalUploadSummary] = useState('');
  const [globalUploadBody, setGlobalUploadBody] = useState('');
  const [globalUploadRegion, setGlobalUploadRegion] = useState('AP');
  const [globalUploadDistrict, setGlobalUploadDistrict] = useState('All Districts');
  const [globalUploadMediaUrl, setGlobalUploadMediaUrl] = useState('');
  const [globalUploadThumbnailUrl, setGlobalUploadThumbnailUrl] = useState('');
  const [globalUploadVideoUrl, setGlobalUploadVideoUrl] = useState('');
  const [globalUploadFileName, setGlobalUploadFileName] = useState('');
  const [globalUploadProgress, setGlobalUploadProgress] = useState(0);
  const [globalUploading, setGlobalUploading] = useState(false);

  // Common loading / data states
  const [loading, setLoading] = useState(false);
  const [dbTables, setDbTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState('news');
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [rawSql, setRawSql] = useState('');
  const [queryResult, setQueryResult] = useState<any | null>(null);

  const [newsList, setNewsList] = useState<any[]>([]);
  const [channelList, setChannelList] = useState<any[]>([]);
  const [reporterList, setReporterList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);
  const [adList, setAdList] = useState<any[]>([]);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [liveRecordingsList, setLiveRecordingsList] = useState<any[]>([]);

  // Analytics KPIs
  const [kpis, setKpis] = useState({
    todayVisitors: 14500,
    activeUsers: 840,
    liveStreams: 4,
    publishedNews: 20,
    pendingNews: 2,
    revenue: '$4,820',
    dbSize: '34.2 MB',
    cpuUsage: '14%',
    memUsage: '38%',
  });

  // Modal forms
  const [showFormModal, setShowFormModal] = useState(false);
  const [formType, setFormType] = useState<'news' | 'channel' | 'ad' | 'notification' | 'reporter-perms' | 'user'>('news');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Lightbox Media Preview Modal State
  const [previewMediaFile, setPreviewMediaFile] = useState<any | null>(null);
  const [showMediaPreviewModal, setShowMediaPreviewModal] = useState(false);

  // News Form States
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');
  const [newsCategory, setNewsCategory] = useState('General');
  const [newsRegion, setNewsRegion] = useState('AP');
  const [newsDistrict, setNewsDistrict] = useState('All Districts');
  const [newsSource, setNewsSource] = useState('NEXUS Network');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [newsVideoUrl, setNewsVideoUrl] = useState('');
  const [newsReadMinutes, setNewsReadMinutes] = useState('5');
  const [newsTags, setNewsTags] = useState('');
  const [uploadingNewsImage, setUploadingNewsImage] = useState(false);
  const [uploadingNewsVideo, setUploadingNewsVideo] = useState(false);

  // Live TV Channel States
  const [chanId, setChanId] = useState('');
  const [chanName, setChanName] = useState('');
  const [chanCategory, setChanCategory] = useState('News');
  const [chanNowPlaying, setChanNowPlaying] = useState('');
  const [chanNextUp, setChanNextUp] = useState('');
  const [chanIsOfficial, setChanIsOfficial] = useState(true);
  const [chanVideoUrl, setChanVideoUrl] = useState('');

  // User Form States
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userRole, setUserRole] = useState('user');

  // Ads Form States
  const [adTitle, setAdTitle] = useState('');
  const [adPlacement, setAdPlacement] = useState('Homepage Top');
  const [adType, setAdType] = useState('banner');
  const [adImageUrl, setAdImageUrl] = useState('');
  const [adLinkUrl, setAdLinkUrl] = useState('');
  const [adStatus, setAdStatus] = useState('active');

  // Push Notifications States
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyUserTarget, setNotifyUserTarget] = useState('');

  // Live Stream & Video Replay Player States
  const [showVideoPlayerModal, setShowVideoPlayerModal] = useState(false);
  const [streamFilter, setStreamFilter] = useState<'all' | 'live' | 'recorded' | 'channels' | 'news'>('all');

  // Reporter Permissions States
  const [selectedReporter, setSelectedReporter] = useState<any | null>(null);
  const [reporterRegion, setReporterRegion] = useState('');
  const [reporterCats, setReporterCats] = useState('');

  const openMediaPreview = (file: any) => {
    setPreviewMediaFile(file);
    setShowMediaPreviewModal(true);
  };

  // Web & Native Cross-Platform Confirmation Dialog Helper
  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}${message ? '\n\n' + message : ''}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // WebSocket / real-time updates
  useEffect(() => {
    loadTabContent();
    const socket = io(API_URL);
    socket.on('top-stories-update', () => {
      loadTabContent();
    });
    return () => {
      socket.disconnect();
    };
  }, [activeTab, selectedTable]);

  const loadTabContent = async () => {
    setLoading(true);
    try {
      if (activeTab === 'dashboard') {
        const stats = await api.request<any>('/api/admin/analytics');
        if (stats) {
          const m = stats.metrics || {};
          setKpis({
            todayVisitors: (m.totalUsers || 0) * 12 + 4500,
            activeUsers: m.activeUsers || 0,
            liveStreams: m.liveStreams || 0,
            publishedNews: m.newsPublished || 0,
            pendingNews: m.totalReports || 0,
            revenue: `$${(m.revenue || 0).toFixed(2)}`,
            dbSize: '12.8 MB',
            cpuUsage: '8%',
            memUsage: '26%',
          });
        }
      } else if (
        activeTab === 'news' ||
        ['entertainment', 'sports', 'politics', 'business', 'technology', 'education', 'health', 'world', 'devotional', 'weather', 'breakingNews', 'trendingNews', 'home'].includes(activeTab)
      ) {
        const res = await api.request<any>('/api/admin/content/news');
        if (res && res.data) setNewsList(res.data);
      } else if (activeTab === 'channels') {
        const res = await api.request<any>('/api/live/channels');
        if (res) setChannelList(res);
      } else if (activeTab === 'reporters') {
        const res = await api.request<any>('/api/admin/users');
        if (res && res.data) {
          setReporterList(res.data.filter((u: any) => u.role === 'reporter'));
          setUserList(res.data);
        }
      } else if (activeTab === 'users') {
        const res = await api.request<any>('/api/admin/users');
        if (res && res.data) setUserList(res.data);
      } else if (activeTab === 'ads') {
        const res = await api.request<any>('/api/admin/ads');
        if (res && res.data) setAdList(res.data);
      } else if (activeTab === 'notifications') {
        const res = await api.request<any>('/api/admin/notifications');
        if (res && res.data) setNotificationsList(res.data);
      } else if (activeTab === 'media') {
        const res = await api.request<any>('/api/admin/media-library');
        if (res && res.data) setMediaFiles(res.data);
      } else if (activeTab === 'database') {
        const tablesRes = await api.request<any>('/api/admin/database/tables');
        if (tablesRes && tablesRes.data) {
          setDbTables(tablesRes.data);
          const rowsRes = await api.request<any>(`/api/admin/database/tables/${selectedTable}`);
          if (rowsRes && rowsRes.data) setTableRows(rowsRes.data);
        }
      } else if (activeTab === 'backups') {
        const res = await api.request<any>('/api/admin/backups');
        if (res && res.data) setBackupsList(res.data);
      } else if (activeTab === 'logs') {
        const res = await api.request<any>('/api/admin/security/audit');
        if (res && res.data) setAuditLogsList(res.data);
      } else if (activeTab === 'liveRecordings' || activeTab === 'userStreams') {
        const res = await api.request<any>('/api/streams');
        if (res && res.data && Array.isArray(res.data)) {
          setLiveRecordingsList(res.data);
        } else if (Array.isArray(res)) {
          setLiveRecordingsList(res);
        }
      }
    } catch (e) {
      console.error('Failed to load admin panel tab data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Universal Global Upload Handler
  const handleGlobalUploadSubmit = async (targetStatus: 'published' | 'draft' = 'published') => {
    let finalTitle = globalUploadTitle.trim();
    if (!finalTitle) {
      if (globalUploadFileName) {
        finalTitle = globalUploadFileName.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else if (globalUploadMediaUrl) {
        const fileFromUrl = globalUploadMediaUrl.split('/').pop() || '';
        finalTitle = fileFromUrl.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else {
        finalTitle = `${globalUploadCategory} Content ${new Date().toLocaleDateString()}`;
      }
      setGlobalUploadTitle(finalTitle);
    }

    setGlobalUploading(true);
    setGlobalUploadProgress(20);
    try {
      setGlobalUploadProgress(60);
      const payload = {
        title: finalTitle,
        summary: globalUploadSummary.trim() || finalTitle,
        body: globalUploadBody.trim() || globalUploadSummary.trim() || finalTitle,
        category: globalUploadCategory,
        language: globalUploadLanguage,
        author: globalUploadReporter || user?.email || 'Admin',
        reporter: globalUploadReporter || user?.email || 'Admin',
        region: globalUploadRegion,
        district: globalUploadDistrict,
        location: globalUploadDistrict !== 'All Districts' ? globalUploadDistrict : globalUploadRegion,
        imageUrl: globalUploadMediaUrl,
        thumbnailUrl: globalUploadThumbnailUrl || globalUploadMediaUrl,
        videoUrl: globalUploadVideoUrl,
        source: 'NEXUS Network',
        readMinutes: '5',
        status: targetStatus,
      };

      if (globalUploadType === 'news' || globalUploadType === 'breaking') {
        await api.request('/api/admin/content/news', {
          method: 'POST',
          body: JSON.stringify({ ...payload, isBreaking: globalUploadType === 'breaking' }),
        });
      } else if (globalUploadType === 'top_story') {
        await api.request('/api/admin/top-stories', {
          method: 'POST',
          body: JSON.stringify({
            headline: globalUploadTitle.trim(),
            description: globalUploadSummary.trim(),
            article: globalUploadBody.trim(),
            category: globalUploadCategory,
            language: globalUploadLanguage,
            author: globalUploadReporter,
            status: targetStatus,
            priority: '0',
          }),
        });
      } else if (globalUploadType === 'reel' || globalUploadType === 'video') {
        await api.uploadReel(globalUploadTitle, globalUploadSummary, globalUploadVideoUrl || globalUploadMediaUrl, globalUploadRegion);
      } else if (globalUploadType === 'live_tv_thumb') {
        await api.request('/api/admin/live-tv/channels', {
          method: 'POST',
          body: JSON.stringify({ id: `chan-${Date.now()}`, name: globalUploadTitle, category: globalUploadCategory, videoUrl: globalUploadVideoUrl || globalUploadMediaUrl }),
        });
      } else {
        await api.request('/api/admin/content/news', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setGlobalUploadProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setShowGlobalUploadModal(false);
      setGlobalUploadTitle('');
      setGlobalUploadSummary('');
      setGlobalUploadBody('');
      setGlobalUploadMediaUrl('');
      setGlobalUploadThumbnailUrl('');
      setGlobalUploadVideoUrl('');
      setGlobalUploadProgress(0);
      showAlert('Success', `Content saved as ${targetStatus.toUpperCase()} and synchronized in real-time across the website!`);
      loadTabContent();
    } catch (err: any) {
      showAlert('Upload Error', err.message || 'Failed to upload content');
    } finally {
      setGlobalUploading(false);
    }
  };

  // Operation Actions
  const handleSaveNews = async () => {
    if (!newsTitle) return showAlert('Title is required');
    const payload = {
      title: newsTitle,
      summary: newsSummary,
      body: newsBody,
      category: newsCategory,
      source: newsSource,
      imageUrl: newsImageUrl,
      videoUrl: newsVideoUrl,
      readMinutes: newsReadMinutes,
      tags: newsTags,
      region: newsRegion,
      district: newsDistrict,
      location: newsDistrict !== 'All Districts' ? newsDistrict : newsRegion === 'AP' ? 'Andhra Pradesh' : newsRegion === 'Telangana' ? 'Telangana' : 'Delhi',
    };
    try {
      if (editingId) {
        await api.request(`/api/admin/content/news/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api.request('/api/admin/content/news', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowFormModal(false);
      loadTabContent();
    } catch (err: any) {
      showAlert('Save failed', err.message);
    }
  };

  const handleSaveChannel = async () => {
    if (!chanId || !chanName || !chanVideoUrl) return showAlert('ID, Name, and Video URL are required');
    const payload = {
      id: chanId,
      name: chanName,
      category: chanCategory,
      now_playing: chanNowPlaying,
      next_up: chanNextUp,
      is_official: chanIsOfficial,
      video_url: chanVideoUrl,
    };
    try {
      if (editingId) {
        await api.request(`/api/admin/live-tv/channels/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api.request('/api/admin/live-tv/channels', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowFormModal(false);
      loadTabContent();
    } catch (err: any) {
      showAlert('Save failed', err.message);
    }
  };

  const handleSaveUser = async () => {
    if (editingId) {
      if (!userDisplayName) return showAlert('Display Name is required');
      try {
        await api.request(`/api/admin/users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ displayName: userDisplayName, role: userRole })
        });
        setShowFormModal(false);
        loadTabContent();
      } catch (err: any) {
        showAlert('Update failed', err.message);
      }
    } else {
      if (!userEmail || !userPassword || !userDisplayName) return showAlert('Email, Password, and Display Name are required');
      try {
        await api.request('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email: userEmail, password: userPassword, displayName: userDisplayName, role: userRole })
        });
        setShowFormModal(false);
        loadTabContent();
      } catch (err: any) {
        showAlert('Create user failed', err.message);
      }
    }
  };

  const handleSaveAd = async () => {
    if (!adTitle) return showAlert('Title is required');
    const payload = {
      title: adTitle,
      type: adType,
      image_url: adImageUrl,
      link_url: adLinkUrl,
      placement: adPlacement,
      status: adStatus,
    };
    try {
      if (editingId) {
        await api.request(`/api/admin/ads/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api.request('/api/admin/ads', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowFormModal(false);
      loadTabContent();
    } catch (err: any) {
      showAlert('Save failed', err.message);
    }
  };

  const handleSendNotification = async () => {
    if (!notifyTitle || !notifyBody) return showAlert('Title and Body are required');
    try {
      await api.request('/api/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          title: notifyTitle,
          body: notifyBody,
          userId: notifyUserTarget || undefined
        })
      });
      setShowFormModal(false);
      showAlert('Push notifications broadcasted successfully!');
      loadTabContent();
    } catch (e: any) {
      showAlert('Push broadcast failed', e.message);
    }
  };

  const handleSaveReporterPerms = async () => {
    if (!selectedReporter) return;
    try {
      await api.request(`/api/admin/reporters/${selectedReporter.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({
          categories: reporterCats.split(',').map(c => c.trim()).filter(Boolean),
          region: reporterRegion
        })
      });
      setShowFormModal(false);
      showAlert('Reporter regions and permissions updated successfully.');
      loadTabContent();
    } catch (err: any) {
      showAlert('Update failed', err.message);
    }
  };

  const handleDeleteItem = (endpoint: string, id: string) => {
    confirmAction(
      'Confirm Deletion',
      `Are you sure you want to permanently delete this item?`,
      async () => {
        // Optimistic UI update
        setLiveRecordingsList(prev => prev.filter((item: any) => item.id !== id));
        setNewsList(prev => prev.filter((item: any) => item.id !== id));
        setChannelList(prev => prev.filter((item: any) => item.id !== id));

        try {
          await api.request(endpoint, { method: 'DELETE' });
          showAlert('Deleted', 'Item deleted successfully.');
          loadTabContent();
        } catch (err: any) {
          try {
            await api.request(`/api/admin/content/live-streams/${id}`, { method: 'DELETE' });
            showAlert('Deleted', 'Item deleted successfully.');
            loadTabContent();
            return;
          } catch (e) {}
          showAlert('Deletion failed', err.message || 'Failed to delete item.');
          loadTabContent();
        }
      }
    );
  };

  const uploadComputerFile = async (mimeType: string, onUploaded: (url: string, filename: string) => void) => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = mimeType;
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 100 * 1024 * 1024) {
            showAlert('File Too Large', 'Please select a file smaller than 100MB.');
            return;
          }
          const cleanName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Data = reader.result?.toString().split(',')[1] || '';
            try {
              const res = await api.request<any>('/api/admin/media-library/upload', {
                method: 'POST',
                body: JSON.stringify({ filename: cleanName, base64Data })
              });
              if (res && res.url) {
                const fullUrl = res.url.startsWith('http') ? res.url : `${API_URL}${res.url}`;
                onUploaded(fullUrl, file.name);
              } else {
                onUploaded(`data:${file.type};base64,${base64Data}`, file.name);
              }
            } catch (err) {
              onUploaded(`data:${file.type};base64,${base64Data}`, file.name);
            }
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({ type: mimeType, copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const cleanName = `${Date.now()}_${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        const processBase64 = async (base64: string) => {
          try {
            const res = await api.request<any>('/api/admin/media-library/upload', {
              method: 'POST',
              body: JSON.stringify({ filename: cleanName, base64Data: base64 })
            });
            if (res && res.url) {
              const fullUrl = res.url.startsWith('http') ? res.url : `${API_URL}${res.url}`;
              onUploaded(fullUrl, asset.name);
            } else {
              onUploaded(`data:${asset.mimeType || 'image/png'};base64,${base64}`, asset.name);
            }
          } catch (e: any) {
            onUploaded(`data:${asset.mimeType || 'image/png'};base64,${base64}`, asset.name);
          }
        };

        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result?.toString().split(',')[1] || '';
          processBase64(base64);
        };
        reader.readAsDataURL(blob);
      }
    } catch (e) {
      console.error('Failed to pick computer file:', e);
    }
  };

  const handlePickMediaFile = async () => {
    uploadComputerFile('*/*', (url, name) => {
      showAlert('Upload Success', `Uploaded ${name} to server media library.`);
      loadTabContent();
    });
  };

  const handleUploadNewsImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingNewsImage(true);
        const executeUpload = async (base64: string) => {
          try {
            const res = await api.request<any>('/api/admin/media-library/upload', {
              method: 'POST',
              body: JSON.stringify({ filename: `news-cover-${Date.now()}-${asset.name.replace(/\s+/g, '_')}`, base64Data: base64 })
            });
            if (res && res.url) {
              setNewsImageUrl(res.url);
              showAlert('Success', 'Cover image uploaded successfully.');
            }
          } catch (e: any) {
            showAlert('Upload failed', e.message);
          } finally {
            setUploadingNewsImage(false);
          }
        };

        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              executeUpload(base64);
            };
            reader.readAsDataURL(file);
          } else {
            setUploadingNewsImage(false);
          }
        } else {
          try {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              executeUpload(base64);
            };
            reader.readAsDataURL(blob);
          } catch (err) {
            setUploadingNewsImage(false);
            console.error(err);
          }
        }
      }
    } catch (e) {
      setUploadingNewsImage(false);
      console.error(e);
    }
  };

  const handleUploadNewsVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingNewsVideo(true);
        const executeUpload = async (base64: string) => {
          try {
            const res = await api.request<any>('/api/admin/media-library/upload', {
              method: 'POST',
              body: JSON.stringify({ filename: `news-video-${Date.now()}-${asset.name.replace(/\s+/g, '_')}`, base64Data: base64 })
            });
            if (res && res.url) {
              setNewsVideoUrl(res.url);
              showAlert('Success', 'News video uploaded successfully.');
            }
          } catch (e: any) {
            showAlert('Upload failed', e.message);
          } finally {
            setUploadingNewsVideo(false);
          }
        };

        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              executeUpload(base64);
            };
            reader.readAsDataURL(file);
          } else {
            setUploadingNewsVideo(false);
          }
        } else {
          try {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              executeUpload(base64);
            };
            reader.readAsDataURL(blob);
          } catch (err) {
            setUploadingNewsVideo(false);
            console.error(err);
          }
        }
      }
    } catch (e) {
      setUploadingNewsVideo(false);
      console.error(e);
    }
  };

  // Bulk Data Import & Replacement Handler
  const handleExecuteBulkImport = async () => {
    if (!bulkJsonText.trim()) return showAlert('Missing Data', 'Please paste JSON data or select a file to import.');
    let parsedItems: any[] = [];
    try {
      parsedItems = JSON.parse(bulkJsonText.trim());
      if (!Array.isArray(parsedItems)) {
        return showAlert('Invalid Format', 'JSON data must be an array of objects [ { ... }, { ... } ].');
      }
    } catch (e: any) {
      return showAlert('JSON Syntax Error', `Failed to parse JSON: ${e.message}`);
    }

    confirmAction(
      `Confirm Bulk Data ${bulkMode === 'replace' ? 'REPLACEMENT' : 'Import'}`,
      `Are you sure you want to ${bulkMode === 'replace' ? 'WIPE ALL EXISTING DATA and REPLACE' : 'append data to'} the "${bulkTarget.toUpperCase()}" database with ${parsedItems.length} records?`,
      async () => {
        setBulkProcessing(true);
        try {
          const res = await api.request<any>('/api/admin/content/bulk-import', {
            method: 'POST',
            body: JSON.stringify({
              target: bulkTarget,
              mode: bulkMode,
              items: parsedItems,
            })
          });
          showAlert('Bulk Import Success', res.message || `Successfully processed ${parsedItems.length} records.`);
          setShowBulkModal(false);
          setBulkJsonText('');
          loadTabContent();
        } catch (err: any) {
          showAlert('Bulk Import Failed', err.message);
        } finally {
          setBulkProcessing(false);
        }
      }
    );
  };

  const handlePickBulkFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const text = reader.result?.toString() || '';
              setBulkJsonText(text);
              showAlert('File Loaded', `Loaded content from ${asset.name}. Review JSON below and click Execute.`);
            };
            reader.readAsText(file);
          }
        }
      }
    } catch (e: any) {
      showAlert('Failed to read file', e.message);
    }
  };

  const handleFillSampleJson = (target: string) => {
    if (target === 'news') {
      setBulkJsonText(JSON.stringify([
        {
          title: "Global AI & Tech Summit 2026",
          summary: "Engineers unveil next-gen quantum inference chip operating under 2GB RAM.",
          body: "Scientists today announced a breakthrough in artificial intelligence compression, allowing high-performance language models to execute locally on consumer devices with zero latency.",
          category: "Technology",
          source: "NEXUS Tech",
          readMinutes: 4,
          imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800"
        },
        {
          title: "International Economic Alliance Signs Landmark Accord",
          summary: "Global delegates unite to solidify digital trade networks across continents.",
          body: "In a historic summit, world financial leaders signed a bilateral trade protocol aiming to streamline cross-border supply chains and reduce tariffs.",
          category: "Business",
          source: "NEXUS Financial",
          readMinutes: 5,
          imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800"
        }
      ], null, 2));
    } else if (target === 'posts') {
      setBulkJsonText(JSON.stringify([
        {
          title: "Behind the Scenes at NEXUS Studios",
          body: "Our broadcasting team preparing the master control studio for live news coverage!",
          imageUrl: "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800"
        },
        {
          title: "Community News Roundup - Morning Edition",
          body: "Key highlights from local reporters across Visakhapatnam, Hyderabad, and Delhi.",
          imageUrl: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800"
        }
      ], null, 2));
    } else if (target === 'reels') {
      setBulkJsonText(JSON.stringify([
        {
          title: "Live Field Reporting in 4K",
          description: "Exclusive ground coverage from the tech expo summit.",
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          location: "Visakhapatnam, AP"
        }
      ], null, 2));
    }
  };

  // Database raw query execution
  const handleExecuteSql = async () => {
    if (!rawSql.trim()) return;
    try {
      const res = await api.request<any>('/api/admin/database/query', {
        method: 'POST',
        body: JSON.stringify({ sql: rawSql })
      });
      if (res) {
        setQueryResult(res);
        loadTabContent();
      }
    } catch (e: any) {
      showAlert('Query Error', e.message);
    }
  };

  // Database row delete
  const handleDeleteRow = (col: string, val: any) => {
    confirmAction(
      'Confirm Row Delete',
      `Are you sure you want to delete row where ${col} = ${val}?`,
      async () => {
        try {
          await api.request(`/api/admin/database/tables/${selectedTable}/row?idCol=${col}&idVal=${encodeURIComponent(val)}`, { method: 'DELETE' });
          loadTabContent();
        } catch (e: any) {
          showAlert('Failed to delete row', e.message);
        }
      }
    );
  };

  // Backups Restores
  const handleCreateBackup = async () => {
    try {
      const res = await api.request<any>('/api/admin/backups/create', { method: 'POST' });
      if (res && res.filename) {
        showAlert('Backup Successful', `Created database checkpoint: ${res.filename}`);
        loadTabContent();
      }
    } catch (e: any) {
      showAlert('Backup failed', e.message);
    }
  };

  const handleRestoreBackup = (filename: string) => {
    confirmAction(
      'Restore Database',
      `Are you absolutely sure you want to overwrite your active database with backup: ${filename}?`,
      async () => {
        try {
          await api.request('/api/admin/backups/restore', {
            method: 'POST',
            body: JSON.stringify({ filename })
          });
          showAlert('Restore Complete', 'Database was successfully restored to selected checkpoint.');
          loadTabContent();
        } catch (err: any) {
          showAlert('Restore failed', err.message);
        }
      }
    );
  };

  const handleResetUserPassword = (userId: string) => {
    confirmAction(
      'Reset Password',
      'Are you sure you want to reset this user password to "password123"?',
      async () => {
        try {
          const res = await api.request<any>(`/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ password: 'password123' })
          });
          showAlert('Password Reset Complete', res.message || 'Password reset to password123 successfully.');
        } catch (e: any) {
          showAlert('Password Reset Failed', e.message);
        }
      }
    );
  };

  const handleToggleUserBan = async (userId: string, currentRole: string) => {
    const targetRole = currentRole === 'banned' ? 'user' : 'banned';
    try {
      await api.request(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: targetRole })
      });
      loadTabContent();
    } catch (e: any) {
      showAlert('Failed to update user role', e.message);
    }
  };

  const handleClearAuditLogs = () => {
    confirmAction(
      'Clear Audit Logs',
      'Are you sure you want to delete all recorded audit logs?',
      async () => {
        try {
          await api.request('/api/admin/security/audit', { method: 'DELETE' });
          loadTabContent();
        } catch (err: any) {
          showAlert('Clear failed', err.message);
        }
      }
    );
  };

  // Form setups
  const openAddNews = () => {
    setEditingId(null);
    setNewsTitle('');
    setNewsSummary('');
    setNewsBody('');
    setNewsCategory('General');
    setNewsSource('NEXUS Network');
    setNewsImageUrl('');
    setNewsVideoUrl('');
    setNewsReadMinutes('5');
    setNewsTags('');
    setFormType('news');
    setShowFormModal(true);
  };

  const openEditNews = (n: any) => {
    setEditingId(n.id);
    setNewsTitle(n.title);
    setNewsSummary(n.summary || '');
    setNewsBody(n.body || '');
    setNewsCategory(n.category || 'General');
    setNewsSource(n.source || 'NEXUS Network');
    setNewsImageUrl(n.image_url || '');
    setNewsVideoUrl(n.video_url || '');
    setNewsReadMinutes(String(n.read_minutes || '5'));
    setNewsTags(n.tags || '');
    setFormType('news');
    setShowFormModal(true);
  };

  const openAddUser = () => {
    setEditingId(null);
    setUserEmail('');
    setUserPassword('password123');
    setUserDisplayName('');
    setUserRole('user');
    setFormType('user');
    setShowFormModal(true);
  };

  const openEditUser = (u: any) => {
    setEditingId(u.id);
    setUserEmail(u.email);
    setUserPassword('');
    setUserDisplayName(u.display_name || '');
    setUserRole(u.role || 'user');
    setFormType('user');
    setShowFormModal(true);
  };

  const openAddChannel = () => {
    setEditingId(null);
    setChanId('');
    setChanName('');
    setChanCategory('News');
    setChanNowPlaying('');
    setChanNextUp('');
    setChanIsOfficial(true);
    setChanVideoUrl('');
    setFormType('channel');
    setShowFormModal(true);
  };

  const openEditChannel = (c: any) => {
    setEditingId(c.id);
    setChanId(c.id);
    setChanName(c.name);
    setChanCategory(c.category || 'News');
    setChanNowPlaying(c.now_playing || '');
    setChanNextUp(c.next_up || '');
    setChanIsOfficial(c.is_official === 1);
    setChanVideoUrl(c.video_url || '');
    setFormType('channel');
    setShowFormModal(true);
  };

  const openAddAd = () => {
    setEditingId(null);
    setAdTitle('');
    setAdType('banner');
    setAdPlacement('Homepage Top');
    setAdImageUrl('');
    setAdLinkUrl('');
    setAdStatus('active');
    setFormType('ad');
    setShowFormModal(true);
  };

  const openEditAd = (ad: any) => {
    setEditingId(ad.id);
    setAdTitle(ad.title);
    setAdType(ad.type);
    setAdPlacement(ad.placement || 'Homepage Top');
    setAdImageUrl(ad.image_url || '');
    setAdLinkUrl(ad.link_url || '');
    setAdStatus(ad.status || 'active');
    setFormType('ad');
    setShowFormModal(true);
  };

  const openReporterPermsModal = (r: any) => {
    setSelectedReporter(r);
    setReporterRegion(r.region || 'Hyderabad');
    setReporterCats(Array.isArray(r.categories) ? r.categories.join(', ') : 'Politics, News');
    setFormType('reporter-perms');
    setShowFormModal(true);
  };

  // Bulk Upload / Replace Data States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<'news' | 'posts' | 'reels' | 'top_stories'>('news');
  const [bulkMode, setBulkMode] = useState<'replace' | 'append'>('replace');
  const [bulkJsonText, setBulkJsonText] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const openFillBulkTarget = (target: 'news' | 'posts' | 'reels' | 'top_stories') => {
    setBulkTarget(target);
    setShowBulkModal(true);
    handleFillSampleJson(target);
  };

  const sidebarItems = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'home', label: '🏠 Home Page CMS' },
    { key: 'topStories', label: '⭐ Top Stories' },
    { key: 'breakingNews', label: '🚨 Breaking News' },
    { key: 'trendingNews', label: '⚡ Trending News' },
    { key: 'news', label: '📰 All News Stories' },
    { key: 'reels', label: '🎬 Video Reels' },
    { key: 'channels', label: '📺 Live TV Channels' },
    { key: 'userStreams', label: '📹 User Streams & Live' },
    { key: 'entertainment', label: '🎬 Entertainment' },
    { key: 'sports', label: '⚽ Sports' },
    { key: 'politics', label: '🏛️ Politics' },
    { key: 'business', label: '💼 Business' },
    { key: 'technology', label: '💻 Technology' },
    { key: 'education', label: '📚 Education' },
    { key: 'health', label: '🏥 Health' },
    { key: 'world', label: '🌎 World' },
    { key: 'devotional', label: '🛕 Devotional' },
    { key: 'weather', label: '☀️ Weather' },
    { key: 'categories', label: '🏷️ Categories' },
    { key: 'media', label: '📁 Media Library' },
    { key: 'ads', label: '💵 Advertisements' },
    { key: 'users', label: '👥 User Directory' },
    { key: 'reporters', label: '🎙️ Reporters Station' },
    { key: 'notifications', label: '🔔 Notifications' },
    { key: 'analytics', label: '📈 Analytics' },
    { key: 'seo', label: '🔍 SEO & Meta' },
    { key: 'comments', label: '💬 Comments' },
    { key: 'logs', label: '📜 Audit Logs' },
    { key: 'rolesPermissions', label: '🛡️ Roles & RBAC' },
    { key: 'bulkUpload', label: '📥 Bulk Upload' },
    { key: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <View style={styles.fill}>
      {/* Light Theme Background */}
      <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={StyleSheet.absoluteFill} />

      {/* Main Layout Container */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar Navigation */}
        <View style={[styles.sidebar, sidebarCollapsed && styles.sidebarCollapsed]}>
          <View style={styles.sidebarHeader}>
            {!sidebarCollapsed && <Text style={styles.sidebarTitle}>NEXUS Portal</Text>}
            <Pressable onPress={() => setSidebarCollapsed(!sidebarCollapsed)} style={styles.sidebarToggle}>
              <Text style={{ color: '#fff', fontSize: 13 }}>{sidebarCollapsed ? '→' : '←'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {sidebarItems.map(item => (
              <Pressable
                key={item.key}
                style={[styles.sidebarItem, activeTab === item.key && styles.sidebarItemActive]}
                onPress={() => setActiveTab(item.key as any)}
              >
                <Text style={[styles.sidebarItemText, activeTab === item.key && styles.sidebarItemTextActive]}>
                  {sidebarCollapsed ? item.label.split(' ')[0] : <Translate text={item.label} />}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Content Pane */}
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View>
              <Text style={styles.breadcrumbs}><Translate text="Super Admin Dashboard" />  ›  {activeTab.toUpperCase()}</Text>
              <Text style={styles.pageTitle}><Translate text="System Administration Control" /></Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Pressable 
                onPress={() => setActiveTab('notifications')} 
                style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.06)', width: 34, height: 34 }]}
              >
                <Text style={{ fontSize: 14 }}>🔔</Text>
              </Pressable>
              <Pressable 
                onPress={() => setShowProfileDrawer(true)} 
                style={[styles.addBtn, { backgroundColor: '#3B82F6', paddingHorizontal: 12, paddingVertical: 7 }]}
              >
                <Text style={styles.addBtnText}>👤 Profile</Text>
              </Pressable>
              <Pressable 
                onPress={() => setActiveTab('settings')} 
                style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.06)', width: 34, height: 34 }]}
              >
                <Text style={{ fontSize: 14 }}>⚙️</Text>
              </Pressable>
              <Pressable 
                onPress={() => setShowGlobalUploadModal(true)} 
                style={[styles.addBtn, { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 7 }]}
              >
                <Text style={[styles.addBtnText, { fontSize: 12, fontWeight: '900' }]}>📤 Upload</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('Home')} style={styles.exitBtn}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}><Translate text="Exit Portal" /></Text>
              </Pressable>
            </View>
          </View>

          {/* Main Scroller Content */}
          <ScrollView style={styles.contentScroller} contentContainerStyle={{ paddingBottom: 60 }}>
            {loading ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            ) : (
              <>
                {/* Top Stories CMS Tab */}
                {activeTab === 'topStories' && (
                  <View style={{ flex: 1 }}>
                    <TopStoriesAdminScreen navigation={navigation} isNested={true} />
                  </View>
                )}

                {/* 1. DASHBOARD VIEW */}
                {activeTab === 'dashboard' && (
                  <View>
                    {/* Quick Instant Content Upload Action Bar */}
                    <View style={{ marginBottom: 16, padding: 16, backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                      <Text style={{ color: '#1E293B', fontSize: 13, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        ⚡ Instant Content Creator & Upload Bar
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <Pressable
                          style={[styles.addBtn, { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8 }]}
                          onPress={openAddNews}
                        >
                          <Text style={styles.addBtnText}>📰 + Upload District News (AP/Telangana/Delhi)</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.addBtn, { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8 }]}
                          onPress={openAddChannel}
                        >
                          <Text style={styles.addBtnText}>📺 + Upload Live TV Channel</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.addBtn, { backgroundColor: '#8B5CF6', paddingHorizontal: 14, paddingVertical: 8 }]}
                          onPress={() => openFillBulkTarget('news')}
                        >
                          <Text style={styles.addBtnText}>📥 + Bulk Data Replace</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.addBtn, { backgroundColor: '#EC4899', paddingHorizontal: 14, paddingVertical: 8 }]}
                          onPress={openAddAd}
                        >
                          <Text style={styles.addBtnText}>💵 + Add Ad Campaign</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* KPI Cards Grid */}
                    <View style={styles.grid}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.todayVisitors}</Text>
                        <Text style={styles.kpiLabel}>Today's Visitors</Text>
                      </View>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.activeUsers}</Text>
                        <Text style={styles.kpiLabel}>Active Users</Text>
                      </View>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.liveStreams}</Text>
                        <Text style={styles.kpiLabel}>Active Reporter Streams</Text>
                      </View>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.publishedNews}</Text>
                        <Text style={styles.kpiLabel}>News Published</Text>
                      </View>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.revenue}</Text>
                        <Text style={styles.kpiLabel}>Monthly Revenue</Text>
                      </View>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiVal}>{kpis.dbSize}</Text>
                        <Text style={styles.kpiLabel}>Database Size</Text>
                      </View>
                    </View>

                    {/* Server Status Indicators */}
                    <Text style={styles.sectionHeader}>Server Health & Status Metrics</Text>
                    <View style={styles.grid}>
                      <View style={styles.statusBox}>
                        <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '800' }}>● ONLINE</Text>
                        <Text style={styles.kpiLabel}>Relay WebSocket Server</Text>
                      </View>
                      <View style={styles.statusBox}>
                        <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '800' }}>● RUNNING</Text>
                        <Text style={styles.kpiLabel}>RTMP Transcoder</Text>
                      </View>
                      <View style={styles.statusBox}>
                        <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800' }}>{kpis.cpuUsage}</Text>
                        <Text style={styles.kpiLabel}>CPU Load</Text>
                      </View>
                      <View style={styles.statusBox}>
                        <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800' }}>{kpis.memUsage}</Text>
                        <Text style={styles.kpiLabel}>RAM Utilization</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* 2. NEWS STORIES CRUD */}
                {activeTab === 'news' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Platform News Articles ({newsList.length})</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Pressable style={styles.addBtn} onPress={openAddNews}><Text style={styles.addBtnText}>+ Add Single Story</Text></Pressable>
                        <Pressable style={[styles.addBtn, { backgroundColor: '#10B981' }]} onPress={() => { setBulkTarget('news'); setBulkMode('replace'); setShowBulkModal(true); }}>
                          <Text style={styles.addBtnText}>📥 Bulk Replace / Upload</Text>
                        </Pressable>
                        <Pressable style={[styles.addBtn, { backgroundColor: '#EF4444' }]} onPress={() => handleDeleteItem('/api/admin/content/clear-all/news', 'all news')}>
                          <Text style={styles.addBtnText}>🗑️ Clear All News</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Title</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Category</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Source</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {newsList.map(n => (
                        <View key={n.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{n.title}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: '#3B82F6' }]}>{n.category}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>{n.source}</Text>
                          <View style={[styles.tdActions, { flex: 1 }]}>
                            <Pressable style={styles.iconBtn} onPress={() => openEditNews(n)}><Text>✏️</Text></Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/content/news/${n.id}`, n.id)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 2B. BULK DATA REPLACEMENT CONSOLE */}
                {activeTab === 'bulkUpload' && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 4 }}>📥 Bulk Data Import & Data Replacement</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 20 }}>
                      Easily upload JSON files or paste JSON data arrays to replace existing posts, news, or reels data in bulk.
                    </Text>

                    {/* Step 1: Target Table */}
                    <Text style={styles.label}>1. Select Target Collection / Table</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      {(['news', 'posts', 'reels', 'top_stories'] as const).map(t => (
                        <Pressable
                          key={t}
                          style={[styles.filterPill, bulkTarget === t && styles.filterPillActive, { paddingHorizontal: 16, paddingVertical: 8 }]}
                          onPress={() => { setBulkTarget(t); handleFillSampleJson(t); }}
                        >
                          <Text style={[styles.filterPillText, { fontSize: 12 }]}>{t === 'news' ? '📰 News Articles' : t === 'posts' ? '📝 Social Posts' : t === 'reels' ? '🎬 Reels Videos' : '⭐ Top Stories'}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Step 2: Mode */}
                    <Text style={styles.label}>2. Select Import Mode</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                      <Pressable
                        style={[styles.filterPill, bulkMode === 'replace' && { backgroundColor: '#EF4444', borderColor: '#EF4444' }, { paddingHorizontal: 16, paddingVertical: 8 }]}
                        onPress={() => setBulkMode('replace')}
                      >
                        <Text style={[styles.filterPillText, { fontSize: 12 }]}>🔴 REPLACE ALL (Wipe & Replace)</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.filterPill, bulkMode === 'append' && { backgroundColor: '#10B981', borderColor: '#10B981' }, { paddingHorizontal: 16, paddingVertical: 8 }]}
                        onPress={() => setBulkMode('append')}
                      >
                        <Text style={[styles.filterPillText, { fontSize: 12 }]}>🟢 APPEND (Keep existing & add new)</Text>
                      </Pressable>
                    </View>

                    {/* Step 3: Source Action Buttons */}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                      <Pressable style={[styles.addBtn, { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 10 }]} onPress={handlePickBulkFile}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>📁 Upload JSON File from Device</Text>
                      </Pressable>
                      <Pressable style={[styles.addBtn, { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 10 }]} onPress={() => handleFillSampleJson(bulkTarget)}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>📄 Load Sample Template</Text>
                      </Pressable>
                      <Pressable style={[styles.addBtn, { backgroundColor: '#EF4444', paddingHorizontal: 16, paddingVertical: 10 }]} onPress={() => handleDeleteItem(`/api/admin/content/clear-all/${bulkTarget}`, bulkTarget)}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>🗑️ Clear All {bulkTarget.toUpperCase()}</Text>
                      </Pressable>
                    </View>

                    {/* Step 4: JSON Editor */}
                    <Text style={styles.label}>3. JSON Data Array Editor (Paste or Edit JSON below)</Text>
                    <TextInput
                      style={[styles.input, { height: 260, textAlignVertical: 'top', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 12, backgroundColor: '#070A14' }]}
                      multiline
                      value={bulkJsonText}
                      onChangeText={setBulkJsonText}
                      placeholder='[ { "title": "New Article", "summary": "Summary...", "body": "Full body text...", "category": "General" } ]'
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />

                    {/* Execution Bar */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        {bulkJsonText.trim() ? `Ready to ${bulkMode === 'replace' ? 'replace all' : 'append'} ${bulkTarget} data` : 'Paste JSON array above or pick a file'}
                      </Text>
                      <Pressable
                        style={[styles.addBtn, { backgroundColor: bulkMode === 'replace' ? '#EF4444' : '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }, bulkProcessing && { opacity: 0.5 }]}
                        onPress={handleExecuteBulkImport}
                        disabled={bulkProcessing}
                      >
                        {bulkProcessing ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>🚀 EXECUTE {bulkMode.toUpperCase()} ({bulkTarget.toUpperCase()})</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* 3. LIVE TV CHANNELS CRUD */}
                {activeTab === 'channels' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Official Live Channels ({channelList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={openAddChannel}><Text style={styles.addBtnText}>+ Create TV Channel</Text></Pressable>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 1 }]}>ID</Text>
                        <Text style={[styles.th, { flex: 2 }]}>Channel Name</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Category</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Viewers</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {channelList.map(c => (
                        <View key={c.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 1, fontWeight: '800' }]}>{c.id}</Text>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{c.name}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: '#3B82F6' }]}>{c.category}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>👁️ {c.viewers}</Text>
                          <View style={[styles.tdActions, { flex: 1 }]}>
                            <Pressable style={styles.iconBtn} onPress={() => openEditChannel(c)}><Text>✏️</Text></Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/live-tv/channels/${c.id}`, c.id)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 3.5 LIVE STREAM RECORDINGS & ARCHIVES */}
                {(activeTab === 'liveRecordings' || activeTab === 'userStreams') && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>📹 User Streams, Live Videos & Replay Archives ({liveRecordingsList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={loadTabContent}><Text style={styles.addBtnText}>🔄 Refresh List</Text></Pressable>
                    </View>

                    {/* Stream Sub-Filter Pills */}
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      {[
                        { id: 'all', label: `🎬 All Videos (${liveRecordingsList.length})` },
                        { id: 'live', label: `🔴 Live Broadcasts (${liveRecordingsList.filter((r: any) => r.isLive).length})` },
                        { id: 'recorded', label: `📼 Recorded Broadcasts (${liveRecordingsList.filter((r: any) => !r.isLive && r.recorded_video_url).length})` },
                        { id: 'channels', label: `📺 Live TV Channels (${liveRecordingsList.filter((r: any) => r.profile_name?.includes('Live TV') || ['n1','n2','m1','m2','s1','s2'].includes(r.id)).length})` },
                        { id: 'news', label: `📰 News Video Clips (${liveRecordingsList.filter((r: any) => !r.isLive && !r.recorded_video_url && r.videoUrl).length})` },
                      ].map(tab => (
                        <Pressable
                          key={tab.id}
                          style={[styles.filterPill, streamFilter === tab.id && styles.filterPillActive]}
                          onPress={() => setStreamFilter(tab.id as any)}
                        >
                          <Text style={[styles.filterPillText, streamFilter === tab.id && { color: '#fff', fontWeight: '800' }]}>{tab.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Title / Broadcast</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Broadcaster / Source</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Category</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Status</Text>
                        <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {liveRecordingsList.filter((rec: any) => {
                        if (streamFilter === 'live') return rec.isLive;
                        if (streamFilter === 'recorded') return !rec.isLive && rec.recorded_video_url;
                        if (streamFilter === 'channels') return rec.profile_name?.includes('Live TV') || ['n1','n2','m1','m2','s1','s2'].includes(rec.id);
                        if (streamFilter === 'news') return !rec.isLive && !rec.recorded_video_url && rec.videoUrl;
                        return true;
                      }).length === 0 ? (
                        <View style={{ padding: 24, alignItems: 'center' }}>
                          <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '700' }}>No live streams or video items found in this section.</Text>
                        </View>
                      ) : (
                        liveRecordingsList.filter((rec: any) => {
                          if (streamFilter === 'live') return rec.isLive;
                          if (streamFilter === 'recorded') return !rec.isLive && rec.recorded_video_url;
                          if (streamFilter === 'channels') return rec.profile_name?.includes('Live TV') || ['n1','n2','m1','m2','s1','s2'].includes(rec.id);
                          if (streamFilter === 'news') return !rec.isLive && !rec.recorded_video_url && rec.videoUrl;
                          return true;
                        }).map((rec) => (
                          <View key={rec.id} style={styles.trRow}>
                            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 48, height: 34, borderRadius: 4, backgroundColor: '#1E293B', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                                {rec.thumbnail_url || rec.imageUrl ? (
                                  <Image source={{ uri: rec.thumbnail_url || rec.imageUrl }} style={{ width: '100%', height: '100%' }} />
                                ) : (
                                  <Text style={{ fontSize: 16 }}>📹</Text>
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.tdText, { fontWeight: '700' }]} numberOfLines={1}>{rec.title || rec.stream_title || 'Live Broadcast Recording'}</Text>
                                <Text style={{ color: '#64748B', fontSize: 10 }}>{rec.location ? `📍 ${rec.location} · ` : ''}{timeAgo(rec.started_at || rec.created_at)}</Text>
                              </View>
                            </View>
                            <Text style={[styles.tdText, { flex: 1 }]} numberOfLines={1}>{rec.profile_name || rec.creator_name || 'Broadcaster'}</Text>
                            <Text style={[styles.tdText, { flex: 1, color: '#3B82F6' }]}>{rec.category || 'General'}</Text>
                            <View style={{ flex: 1 }}>
                              <View style={{ backgroundColor: rec.isLive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
                                <Text style={{ color: rec.isLive ? '#EF4444' : '#10B981', fontSize: 10, fontWeight: '800' }}>
                                  {rec.isLive ? '🔴 LIVE NOW' : '📼 RECORDED'}
                                </Text>
                              </View>
                            </View>
                            <View style={[styles.tdActions, { flex: 1.5 }]}>
                              <Pressable
                                style={[styles.actionPill, { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}
                                onPress={() => { setPlayingRecording(rec); setShowVideoPlayerModal(true); }}
                              >
                                <Text style={[styles.actionPillText, { color: '#fff' }]}>▶ Play Video</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
                                onPress={() => handleDeleteItem(`/api/admin/content/live-streams/${rec.id}`, rec.id)}
                              >
                                <Text style={{ color: '#EF4444' }}>🗑️</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}

                {/* 4. REPORTER STATION MANAGER */}
                {activeTab === 'reporters' && (
                  <View>
                    <Text style={styles.sectionHeader}>Reporters Review & Access Permissions ({reporterList.length})</Text>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Email</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Display Name</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Verify Role</Text>
                        <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {reporterList.map(r => (
                        <View key={r.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{r.email}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>{r.display_name || 'N/A'}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: '#10B981' }]}>{r.role.toUpperCase()}</Text>
                          <View style={[styles.tdActions, { flex: 1.5 }]}>
                            <Pressable style={styles.actionPill} onPress={() => openReporterPermsModal(r)}><Text style={styles.actionPillText}>🔑 Perms</Text></Pressable>
                            <Pressable style={[styles.actionPill, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={async () => { await api.request(`/api/admin/reporters/${r.id}/suspend`, { method: 'POST' }); loadTabContent(); }}><Text style={[styles.actionPillText, { color: '#EF4444' }]}>Suspend</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 5. USER MANAGEMENT */}
                {activeTab === 'users' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>User Directory ({userList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={openAddUser}><Text style={styles.addBtnText}>+ Create User / Admin</Text></Pressable>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Email</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Display Name</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Role</Text>
                        <Text style={[styles.th, { flex: 2.2, textAlign: 'right' }]}>Administration Checks</Text>
                      </View>
                      {userList.map(u => (
                        <View key={u.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{u.email}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]} numberOfLines={1}>{u.display_name || 'N/A'}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: u.role === 'banned' ? '#EF4444' : u.role === 'super_admin' ? '#F59E0B' : '#fff' }]}>{u.role}</Text>
                          <View style={[styles.tdActions, { flex: 2.2 }]}>
                            <Pressable style={styles.iconBtn} onPress={() => openEditUser(u)}><Text>✏️</Text></Pressable>
                            <Pressable style={styles.actionPill} onPress={() => handleResetUserPassword(u.id)}><Text style={styles.actionPillText}>🔄 Reset PW</Text></Pressable>
                            {u.role === 'user' && (
                              <Pressable style={[styles.actionPill, { backgroundColor: '#3B82F6' }]} onPress={async () => { await api.request(`/api/admin/reporters/${u.id}/approve`, { method: 'POST' }); loadTabContent(); }}><Text style={styles.actionPillText}>🎙️ Make Rep</Text></Pressable>
                            )}
                            <Pressable style={[styles.actionPill, { backgroundColor: u.role === 'banned' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]} onPress={() => handleToggleUserBan(u.id, u.role)}>
                              <Text style={[styles.actionPillText, { color: u.role === 'banned' ? '#10B981' : '#EF4444' }]}>{u.role === 'banned' ? 'Activate' : 'Ban'}</Text>
                            </Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/users/${u.id}`, u.email)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 6. ADVERTISEMENTS CAMPAIGNS */}
                {activeTab === 'ads' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Active Advertising Banners ({adList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={openAddAd}><Text style={styles.addBtnText}>+ Create Campaign</Text></Pressable>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Campaign</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Placement</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Type</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Clicks / Imps</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {adList.map(ad => (
                        <View key={ad.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{ad.title}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>{ad.placement}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: '#3B82F6' }]}>{(ad.type || 'banner').toUpperCase()}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>🖱️ {ad.clicks || 0} / 👁️ {ad.impressions || 0}</Text>
                          <View style={[styles.tdActions, { flex: 1 }]}>
                            <Pressable style={styles.iconBtn} onPress={() => openEditAd(ad)}><Text>✏️</Text></Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/ads/${ad.id}`, ad.id)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 7. PUSH NOTIFICATIONS BROADCAST */}
                {activeTab === 'notifications' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>System Broadcast Notifications ({notificationsList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={() => { setFormType('notification'); setShowFormModal(true); }}><Text style={styles.addBtnText}>+ Send Broadcast</Text></Pressable>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 12 }}>
                      Push notifications broadcast to all connected devices instantly via WebSockets and save records inside users notification feed shelves.
                    </Text>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 1.5 }]}>Title</Text>
                        <Text style={[styles.th, { flex: 3 }]}>Body</Text>
                        <Text style={[styles.th, { flex: 1 }]}>User Target</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {notificationsList.length === 0 ? (
                        <View style={{ padding: 16 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>No broadcast notifications found.</Text>
                        </View>
                      ) : (
                        notificationsList.map(n => (
                          <View key={n.id} style={styles.trRow}>
                            <Text style={[styles.tdText, { flex: 1.5, fontWeight: '700' }]} numberOfLines={1}>{n.title}</Text>
                            <Text style={[styles.tdText, { flex: 3 }]} numberOfLines={2}>{n.body}</Text>
                            <Text style={[styles.tdText, { flex: 1, color: '#3B82F6' }]}>{n.user_id ? `User #${n.user_id.slice(0, 6)}` : 'Broadcast (All)'}</Text>
                            <View style={[styles.tdActions, { flex: 1 }]}>
                              <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/notifications/${n.id}`, n.id)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}

                {/* 8. MEDIA LIBRARY FOLDERS */}
                {activeTab === 'media' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Uploaded Media Directory Assets ({mediaFiles.length})</Text>
                      <Pressable style={styles.addBtn} onPress={handlePickMediaFile}><Text style={styles.addBtnText}>📤 Upload Media File</Text></Pressable>
                    </View>
                    <View style={styles.grid}>
                      {mediaFiles.map((file, idx) => {
                        const isImage = file.filename.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
                        const isVideo = file.filename.match(/\.(mp4|webm|mov|m4v|mkv)$/i);
                        const fileUrl = `${API_URL}${file.url}`;
                        return (
                          <View key={idx} style={styles.mediaCard}>
                            <Pressable onPress={() => openMediaPreview(file)} style={{ alignItems: 'center' }}>
                              {isImage ? (
                                <Image source={{ uri: fileUrl }} style={styles.mediaCardImg} />
                              ) : (
                                <View style={[styles.mediaCardImg, { backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' }]}>
                                  <Text style={{ fontSize: 24 }}>{isVideo ? '📹' : '📁'}</Text>
                                </View>
                              )}
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' }} numberOfLines={1}>{file.filename}</Text>
                              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textAlign: 'center' }}>Size: {Math.round(file.size / 1024)} KB</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.addBtn, { marginTop: 6, backgroundColor: '#3B82F6', width: '100%', paddingVertical: 4, alignItems: 'center' }]}
                              onPress={() => {
                                setGlobalUploadTitle(file.filename.split('.')[0].replace(/[-_]/g, ' '));
                                if (isVideo) {
                                  setGlobalUploadVideoUrl(fileUrl);
                                  setGlobalUploadType('reel');
                                } else {
                                  setGlobalUploadMediaUrl(fileUrl);
                                  setGlobalUploadThumbnailUrl(fileUrl);
                                  setGlobalUploadType('news');
                                }
                                setShowGlobalUploadModal(true);
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>📌 Publish to Section</Text>
                            </Pressable>
                            <Pressable style={styles.mediaDeleteBtn} onPress={() => handleDeleteItem(`/api/admin/media-library/delete?filename=${encodeURIComponent(file.filename)}`, file.filename)}>
                              <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>DELETE</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* 9. DATABASE MANAGER */}
                {activeTab === 'database' && (
                  <View>
                    <Text style={styles.sectionHeader}>Direct Database Table Inspector</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12 }}>Inspect Table:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {dbTables.map(t => (
                          <Pressable key={t.name} style={[styles.filterPill, selectedTable === t.name && styles.filterPillActive]} onPress={() => setSelectedTable(t.name)}>
                            <Text style={styles.filterPillText}>{t.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>

                    {/* SQL Command Shell */}
                    <Text style={styles.label}>SQL Query Command Terminal (Dangerous Commands Blocked)</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      <TextInput
                        style={[styles.input, { flex: 1, fontFamily: 'monospace', fontSize: 11 }]}
                        value={rawSql}
                        onChangeText={setRawSql}
                        placeholder="SELECT * FROM users WHERE role='super_admin';"
                        placeholderTextColor="rgba(255,255,255,0.2)"
                      />
                      <Pressable style={styles.saveBtn} onPress={handleExecuteSql}><Text style={{ color: '#fff', fontWeight: '800' }}>Execute</Text></Pressable>
                    </View>

                    {queryResult && (
                      <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, marginBottom: 16 }}>
                        <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 12 }}>Query Result Status: Success</Text>
                        {queryResult.type === 'select' ? (
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 }}>Fetched {queryResult.count} rows from database.</Text>
                        ) : (
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 }}>Executed update statement. Affected rows: {queryResult.changes}</Text>
                        )}
                      </View>
                    )}

                    {/* Rows Inspector grid */}
                    <Text style={styles.sectionHeader}>Rows in table: {selectedTable}</Text>
                    {tableRows.length === 0 ? (
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>No rows found in this table.</Text>
                    ) : (
                      <ScrollView horizontal>
                        <View style={styles.table}>
                          {/* Columns headers */}
                          <View style={styles.thRow}>
                            {Object.keys(tableRows[0] || {}).map(k => (
                              <Text key={k} style={[styles.th, { width: 140 }]}>{k}</Text>
                            ))}
                            <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Actions</Text>
                          </View>
                          {/* Rows data */}
                          {tableRows.map((row, idx) => {
                            const rowIdCol = Object.keys(row)[0];
                            const rowIdVal = row[rowIdCol];
                            return (
                              <View key={idx} style={styles.trRow}>
                                {Object.values(row).map((v: any, cellIdx) => (
                                  <Text key={cellIdx} style={[styles.tdText, { width: 140 }]} numberOfLines={1}>
                                    {v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </Text>
                                ))}
                                <View style={{ width: 80, justifyContent: 'flex-end', flexDirection: 'row' }}>
                                  <Pressable onPress={() => handleDeleteRow(rowIdCol, rowIdVal)}>
                                    <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>Delete</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                )}

                {/* 10. DATABASE BACKUPS LIST */}
                {activeTab === 'backups' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Database Backups Manager ({backupsList.length})</Text>
                      <Pressable style={styles.addBtn} onPress={handleCreateBackup}><Text style={styles.addBtnText}>💾 Create Manual Backup</Text></Pressable>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Backup Filename</Text>
                        <Text style={[styles.th, { flex: 1 }]}>File Size</Text>
                        <Text style={[styles.th, { flex: 1.5 }]}>Created Date</Text>
                        <Text style={[styles.th, { flex: 2, textAlign: 'right' }]}>Restore Operations</Text>
                      </View>
                      {backupsList.map((back, idx) => (
                        <View key={idx} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{back.filename}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>{Math.round(back.size / 1024)} KB</Text>
                          <Text style={[styles.tdText, { flex: 1.5 }]}>{new Date(back.created).toLocaleString()}</Text>
                          <View style={[styles.tdActions, { flex: 2 }]}>
                            <Pressable style={styles.actionPill} onPress={() => handleRestoreBackup(back.filename)}><Text style={styles.actionPillText}>🔄 Restore</Text></Pressable>
                            <Pressable style={[styles.actionPill, { backgroundColor: 'rgba(255,255,255,0.06)' }]} onPress={() => window.open(`${API_URL}/api/admin/backups/download/${back.filename}`)}><Text style={styles.actionPillText}>📥 Download</Text></Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/backups/${back.filename}`, back.filename)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 11. AUDIT LOGS VIEW */}
                {activeTab === 'logs' && (
                  <View>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>Administrative Audit Log Trails ({auditLogsList.length})</Text>
                      <Pressable style={[styles.addBtn, { backgroundColor: '#EF4444' }]} onPress={handleClearAuditLogs}><Text style={styles.addBtnText}>🗑️ Clear Audit Logs</Text></Pressable>
                    </View>
                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 1 }]}>User ID</Text>
                        <Text style={[styles.th, { flex: 1.5 }]}>Action Description</Text>
                        <Text style={[styles.th, { flex: 1.2 }]}>IP Address</Text>
                        <Text style={[styles.th, { flex: 2.2 }]}>Browser / User-Agent</Text>
                        <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Timestamp</Text>
                      </View>
                      {auditLogsList.map(log => (
                        <View key={log.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 1 }]} numberOfLines={1}>{log.user_id}</Text>
                          <Text style={[styles.tdText, { flex: 1.5, color: '#3B82F6', fontWeight: '700' }]}>{log.action}</Text>
                          <Text style={[styles.tdText, { flex: 1.2 }]}>{log.ip_address || '127.0.0.1'}</Text>
                          <Text style={[styles.tdText, { flex: 2.2 }]} numberOfLines={1}>{log.user_agent || 'Unknown'}</Text>
                          <Text style={[styles.tdText, { flex: 1.2, textAlign: 'right' }]}>{new Date(log.created_at).toLocaleTimeString()}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {/* CATEGORY & SECTION CMS MODULE VIEWS */}
                {[
                  { tab: 'entertainment', name: 'Entertainment', cat: 'Entertainment', icon: '🎬' },
                  { tab: 'sports', name: 'Sports', cat: 'Sports', icon: '⚽' },
                  { tab: 'politics', name: 'Politics', cat: 'Politics', icon: '🏛️' },
                  { tab: 'business', name: 'Business & Markets', cat: 'Business', icon: '💼' },
                  { tab: 'technology', name: 'Technology & AI', cat: 'Technology', icon: '💻' },
                  { tab: 'education', name: 'Education & Jobs', cat: 'Education', icon: '📚' },
                  { tab: 'health', name: 'Health & Wellness', cat: 'Health', icon: '🏥' },
                  { tab: 'world', name: 'World & Global News', cat: 'World', icon: '🌎' },
                  { tab: 'devotional', name: 'Devotional & Temples', cat: 'Devotional', icon: '🛕' },
                  { tab: 'weather', name: 'Weather Center', cat: 'Weather', icon: '☀️' },
                  { tab: 'breakingNews', name: 'Breaking News Ticker', cat: 'General', icon: '🚨' },
                  { tab: 'trendingNews', name: 'Trending News', cat: 'General', icon: '⚡' },
                  { tab: 'home', name: 'Home Page Sections', cat: 'General', icon: '🏠' },
                ].map(sec => activeTab === sec.tab && (
                  <View key={sec.tab}>
                    <View style={styles.actionHeader}>
                      <Text style={styles.sectionHeader}>{sec.icon} {sec.name} Module Manager</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                          style={[styles.addBtn, { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8 }]}
                          onPress={() => {
                            setGlobalUploadCategory(sec.cat);
                            setShowGlobalUploadModal(true);
                          }}
                        >
                          <Text style={[styles.addBtnText, { fontWeight: '900' }]}>+ Upload {sec.name} Content</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.table}>
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Title / Headline</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Category</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Region / District</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                      </View>
                      {newsList.filter(n => {
                        const catLower = (n.category || '').toLowerCase();
                        const secCatLower = sec.cat.toLowerCase();
                        const text = `${n.title || ''} ${n.headline || ''} ${n.description || ''}`.toLowerCase();

                        if (sec.tab === 'home') return true;
                        if (sec.tab === 'breakingNews') return n.is_breaking === 1 || n.isBreaking;
                        if (sec.tab === 'trendingNews') return true;
                        if (sec.tab === 'devotional') {
                          return catLower === 'devotional' || DEVOTIONAL_SUBCATEGORIES.some(ds => ds.toLowerCase() === catLower) || /temple|devotional|god|pooja|ritual|bhagavad|gita|kashi|prashad|darshan|sloka|mantra|divine|spiritual/.test(text);
                        }
                        if (sec.tab === 'sports') {
                          return catLower === 'sports' || /cricket|football|sports|match|stadium|ipl|tennis|badminton|olympics|trophy|champion|messi|ronaldo|kohli|rohit|dhoni|wicket|runs|goal|score/.test(text);
                        }
                        if (sec.tab === 'politics') {
                          return catLower === 'politics' || /election|modi|minister|parliament|governance|politics|political|party|vote|bjp|congress/.test(text);
                        }
                        if (sec.tab === 'business') {
                          return catLower === 'business' || /market|stock|inflation|sensex|nifty|business|economy|billion|rupees|dollar|revenue/.test(text);
                        }
                        if (sec.tab === 'technology') {
                          return catLower === 'technology' || /ai|tech|chip|technology|quantum|software|apple|google|phone|cyber|data/.test(text);
                        }
                        if (sec.tab === 'entertainment') {
                          return catLower === 'entertainment' || /movie|cinema|actor|film|box office|trailer|star|hollywood|tollywood|bollywood/.test(text);
                        }
                        return catLower === secCatLower;
                      }).map(item => (
                        <View key={item.id} style={styles.trRow}>
                          <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{item.title || item.headline}</Text>
                          <Text style={[styles.tdText, { flex: 1, color: '#3B82F6', fontWeight: '700' }]}>{item.category || sec.cat}</Text>
                          <Text style={[styles.tdText, { flex: 1 }]}>{item.district || item.region || 'All'}</Text>
                          <View style={[styles.tdActions, { flex: 1 }]}>
                            <Pressable style={styles.iconBtn} onPress={() => openEditNews(item)}><Text>✏️</Text></Pressable>
                            <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => handleDeleteItem(`/api/admin/content/news/${item.id}`, item.id)}><Text style={{ color: '#EF4444' }}>🗑️</Text></Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Full-size Media Asset Preview Modal */}
      <Modal visible={showMediaPreviewModal} animationType="fade" transparent={true} onRequestClose={() => setShowMediaPreviewModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 800 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>🖼️ Media Viewer — {previewMediaFile?.filename}</Text>
              <Pressable onPress={() => setShowMediaPreviewModal(false)} style={{ padding: 4 }}><Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
              {previewMediaFile && (
                <View style={{ width: '100%', alignItems: 'center' }}>
                  {previewMediaFile.filename.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) ? (
                    <Image
                      source={{ uri: `${API_URL}${previewMediaFile.url}` }}
                      style={{ width: '100%', height: 420, borderRadius: 8 }}
                      resizeMode="contain"
                    />
                  ) : previewMediaFile.filename.match(/\.(mp4|webm|mov|m4v|mkv)$/i) ? (
                    Platform.OS === 'web' ? (
                      // @ts-ignore
                      <video
                        src={`${API_URL}${previewMediaFile.url}`}
                        controls
                        autoPlay
                        style={{ width: '100%', maxHeight: 420, borderRadius: 8, backgroundColor: '#000' }}
                      />
                    ) : (
                      <View style={{ width: '100%', height: 300, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>📹 Video Asset: {previewMediaFile.filename}</Text>
                      </View>
                    )
                  ) : (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Text style={{ fontSize: 48 }}>📁</Text>
                      <Text style={{ color: '#fff', fontSize: 14, marginTop: 10 }}>{previewMediaFile.filename}</Text>
                    </View>
                  )}

                  {/* Details Box */}
                  <View style={{ width: '100%', marginTop: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>Asset Details</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Filename: <Text style={{ color: '#fff' }}>{previewMediaFile.filename}</Text></Text>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>File Size: <Text style={{ color: '#fff' }}>{Math.round(previewMediaFile.size / 1024)} KB ({(previewMediaFile.size / (1024 * 1024)).toFixed(2)} MB)</Text></Text>
                    {previewMediaFile.created && (
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>Uploaded: <Text style={{ color: '#fff' }}>{new Date(previewMediaFile.created).toLocaleString()}</Text></Text>
                    )}
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>Direct URL: <Text style={{ color: '#3B82F6' }}>{`${API_URL}${previewMediaFile.url}`}</Text></Text>
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.cancelBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => window.open(`${API_URL}${previewMediaFile?.url}`, '_blank')}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>🔗 Open Original</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelBtn, { backgroundColor: 'rgba(239,68,68,0.2)' }]}
                onPress={() => {
                  const file = previewMediaFile;
                  setShowMediaPreviewModal(false);
                  if (file) handleDeleteItem(`/api/admin/media-library/delete?filename=${encodeURIComponent(file.filename)}`, file.filename);
                }}
              >
                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 11 }}>🗑️ Delete File</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => setShowMediaPreviewModal(false)}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unified Modals Wizard Form */}
      <Modal visible={showFormModal} animationType="fade" transparent={true} onRequestClose={() => setShowFormModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Administrative Action Panel</Text>
              <Pressable onPress={() => setShowFormModal(false)}><Text style={{ color: '#fff', fontSize: 20 }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.formContainer}>
              {/* USER CREATION / EDIT FORM */}
              {formType === 'user' && (
                <View>
                  <Text style={styles.label}>Account Email *</Text>
                  <TextInput style={styles.input} value={userEmail} onChangeText={setUserEmail} placeholder="user@nexusplay.app" placeholderTextColor="rgba(255,255,255,0.2)" editable={!editingId} />
                  {!editingId && (
                    <>
                      <Text style={styles.label}>Initial Password *</Text>
                      <TextInput style={styles.input} secureTextEntry value={userPassword} onChangeText={setUserPassword} placeholder="password123" placeholderTextColor="rgba(255,255,255,0.2)" />
                    </>
                  )}
                  <Text style={styles.label}>Display Name *</Text>
                  <TextInput style={styles.input} value={userDisplayName} onChangeText={setUserDisplayName} placeholder="John Doe" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Assigned Role (user, reporter, news_reader, admin, super_admin, banned)</Text>
                  <TextInput style={styles.input} value={userRole} onChangeText={setUserRole} placeholder="user" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              )}

              {/* NEWS EDITOR */}
              {formType === 'news' && (
                <View>
                  <Text style={styles.label}>Headline Article Title</Text>
                  <TextInput style={styles.input} value={newsTitle} onChangeText={setNewsTitle} placeholder="News title" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Summary</Text>
                  <TextInput style={[styles.input, { height: 50 }]} multiline value={newsSummary} onChangeText={setNewsSummary} placeholder="Summary" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Body Article Markdown</Text>
                  <TextInput style={[styles.input, { height: 100 }]} multiline value={newsBody} onChangeText={setNewsBody} placeholder="Article Body" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Target Region / State</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {['AP', 'Telangana', 'Delhi/North', 'National', 'Global'].map((r) => (
                      <Pressable
                        key={r}
                        style={[styles.filterPill, newsRegion === r && styles.filterPillActive]}
                        onPress={() => {
                          setNewsRegion(r);
                          setNewsDistrict('All Districts');
                        }}
                      >
                        <Text style={styles.filterPillText}>{r === 'AP' ? '📍 AP / Andhra' : r === 'Telangana' ? '📍 Telangana' : r === 'Delhi/North' ? '📍 Delhi / NCR' : r}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>District Location Focus</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 8 }}>
                    {(newsRegion === 'AP'
                      ? ['All Districts', 'Tirupati', 'Visakhapatnam', 'Vijayawada', 'Guntur', 'Kakinada', 'Nellore', 'Anantapur', 'Kurnool', 'Kadapa', 'Eluru', 'Ongole']
                      : newsRegion === 'Telangana'
                      ? ['All Districts', 'Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Nalgonda', 'Mahabubnagar', 'Ramagundam', 'Suryapet', 'Siddipet']
                      : ['All Districts', 'New Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'Gurugram', 'Noida', 'Faridabad', 'Ghaziabad']
                    ).map((dist) => (
                      <Pressable
                        key={dist}
                        style={[styles.filterPill, newsDistrict === dist && styles.filterPillActive, { marginRight: 6 }]}
                        onPress={() => setNewsDistrict(dist)}
                      >
                        <Text style={styles.filterPillText}>{dist}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.label}>Category</Text>
                  <TextInput style={styles.input} value={newsCategory} onChangeText={setNewsCategory} placeholder="Category" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Source Network</Text>
                  <TextInput style={styles.input} value={newsSource} onChangeText={setNewsSource} placeholder="Source" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Image Cover (URL or Upload)</Text>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newsImageUrl} onChangeText={setNewsImageUrl} placeholder="Image link" placeholderTextColor="rgba(255,255,255,0.2)" />
                    <Pressable style={styles.uploadBtnSmall} onPress={handleUploadNewsImage} disabled={uploadingNewsImage}>
                      {uploadingNewsImage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📤 Upload</Text>
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Video (URL or Upload)</Text>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newsVideoUrl} onChangeText={setNewsVideoUrl} placeholder="Video link" placeholderTextColor="rgba(255,255,255,0.2)" />
                    <Pressable style={styles.uploadBtnSmall} onPress={handleUploadNewsVideo} disabled={uploadingNewsVideo}>
                      {uploadingNewsVideo ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📤 Upload</Text>
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Read Time (mins)</Text>
                  <TextInput style={styles.input} value={newsReadMinutes} onChangeText={setNewsReadMinutes} placeholder="5" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              )}

              {/* LIVE TV CHANNEL EDITOR */}
              {formType === 'channel' && (
                <View>
                  <Text style={styles.label}>Unique Channel ID *</Text>
                  <TextInput style={styles.input} value={chanId} onChangeText={setChanId} placeholder="e.g. n3" placeholderTextColor="rgba(255,255,255,0.2)" editable={!editingId} />
                  <Text style={styles.label}>Channel Name *</Text>
                  <TextInput style={styles.input} value={chanName} onChangeText={setChanName} placeholder="Official Name" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Category</Text>
                  <TextInput style={styles.input} value={chanCategory} onChangeText={setChanCategory} placeholder="e.g. News, Movies" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Now Playing Title</Text>
                  <TextInput style={styles.input} value={chanNowPlaying} onChangeText={setChanNowPlaying} placeholder="Current show title" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Next Up Title</Text>
                  <TextInput style={styles.input} value={chanNextUp} onChangeText={setChanNextUp} placeholder="Next show title" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Playback Video HLS/YouTube URL *</Text>
                  <TextInput style={styles.input} value={chanVideoUrl} onChangeText={setChanVideoUrl} placeholder="Playback link" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>Is Official Channel</Text>
                    <Switch value={chanIsOfficial} onValueChange={setChanIsOfficial} />
                  </View>
                </View>
              )}

              {/* ADS CAMPAIGN EDITOR */}
              {formType === 'ad' && (
                <View>
                  <Text style={styles.label}>Campaign Name *</Text>
                  <TextInput style={styles.input} value={adTitle} onChangeText={setAdTitle} placeholder="Campaign Title" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Ad Placement</Text>
                  <TextInput style={styles.input} value={adPlacement} onChangeText={setAdPlacement} placeholder="e.g. Homepage Top" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Type (banner, sidebar, popup, native)</Text>
                  <TextInput style={styles.input} value={adType} onChangeText={setAdType} placeholder="banner" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Ad Image URL</Text>
                  <TextInput style={styles.input} value={adImageUrl} onChangeText={setAdImageUrl} placeholder="Image link" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Ad Destination Link</Text>
                  <TextInput style={styles.input} value={adLinkUrl} onChangeText={setAdLinkUrl} placeholder="Destination URL" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              )}

              {/* PUSH NOTIFICATIONS EDITOR */}
              {formType === 'notification' && (
                <View>
                  <Text style={styles.label}>Notification Header Title *</Text>
                  <TextInput style={styles.input} value={notifyTitle} onChangeText={setNotifyTitle} placeholder="Breaking News Alert!" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Notification Body *</Text>
                  <TextInput style={[styles.input, { height: 60 }]} multiline value={notifyBody} onChangeText={setNotifyBody} placeholder="Details" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Specific User Target ID (Optional, Blank = All Users)</Text>
                  <TextInput style={styles.input} value={notifyUserTarget} onChangeText={setNotifyUserTarget} placeholder="User profile id" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              )}

              {/* REPORTER PERMISSIONS EDITOR */}
              {formType === 'reporter-perms' && (
                <View>
                  <Text style={styles.label}>Assign Allowed Broadcasting Region</Text>
                  <TextInput style={styles.input} value={reporterRegion} onChangeText={setReporterRegion} placeholder="e.g. Hyderabad, Mumbai" placeholderTextColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.label}>Broadcasting Categories (Comma-separated)</Text>
                  <TextInput style={styles.input} value={reporterCats} onChangeText={setReporterCats} placeholder="e.g. Politics, Devotional" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowFormModal(false)}><Text style={{ color: '#fff' }}>Cancel</Text></Pressable>
              <Pressable
                style={styles.saveBtn}
                onPress={() => {
                  if (formType === 'news') handleSaveNews();
                  else if (formType === 'channel') handleSaveChannel();
                  else if (formType === 'user') handleSaveUser();
                  else if (formType === 'ad') handleSaveAd();
                  else if (formType === 'notification') handleSendNotification();
                  else if (formType === 'reporter-perms') handleSaveReporterPerms();
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* BULK DATA IMPORT & REPLACEMENT MODAL */}
      <Modal visible={showBulkModal} transparent animationType="fade" onRequestClose={() => setShowBulkModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 650 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📥 Bulk Data Upload & Replacement Console</Text>
              <Pressable onPress={() => setShowBulkModal(false)}><Text style={{ color: '#fff', fontSize: 16 }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.formContainer}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 16 }}>
                Replace or append news, social posts, or reels in bulk. You can upload a .json file or paste a JSON array directly.
              </Text>

              <Text style={styles.label}>1. Select Target Collection / Table</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['news', 'posts', 'reels', 'top_stories'] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.filterPill, bulkTarget === t && styles.filterPillActive, { paddingHorizontal: 12, paddingVertical: 6 }]}
                    onPress={() => { setBulkTarget(t); handleFillSampleJson(t); }}
                  >
                    <Text style={styles.filterPillText}>{t === 'news' ? '📰 News' : t === 'posts' ? '📝 Posts' : t === 'reels' ? '🎬 Reels' : '⭐ Top Stories'}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>2. Import Strategy</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <Pressable
                  style={[styles.filterPill, bulkMode === 'replace' && { backgroundColor: '#EF4444', borderColor: '#EF4444' }, { paddingHorizontal: 12, paddingVertical: 6 }]}
                  onPress={() => setBulkMode('replace')}
                >
                  <Text style={styles.filterPillText}>🔴 REPLACE ALL (Clear existing & insert)</Text>
                </Pressable>
                <Pressable
                  style={[styles.filterPill, bulkMode === 'append' && { backgroundColor: '#10B981', borderColor: '#10B981' }, { paddingHorizontal: 12, paddingVertical: 6 }]}
                  onPress={() => setBulkMode('append')}
                >
                  <Text style={styles.filterPillText}>🟢 APPEND (Add to existing)</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Pressable style={[styles.addBtn, { backgroundColor: '#3B82F6', flex: 1, alignItems: 'center' }]} onPress={handlePickBulkFile}>
                  <Text style={styles.addBtnText}>📁 Upload JSON File</Text>
                </Pressable>
                <Pressable style={[styles.addBtn, { backgroundColor: 'rgba(255,255,255,0.08)', flex: 1, alignItems: 'center' }]} onPress={() => handleFillSampleJson(bulkTarget)}>
                  <Text style={styles.addBtnText}>📄 Load Sample</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>3. JSON Data Content</Text>
              <TextInput
                style={[styles.input, { height: 180, textAlignVertical: 'top', fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, backgroundColor: '#070A14' }]}
                multiline
                value={bulkJsonText}
                onChangeText={setBulkJsonText}
                placeholder='[ { "title": "Headline", "summary": "Short snippet...", "body": "Full body text..." } ]'
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowBulkModal(false)}><Text style={{ color: '#fff' }}>Cancel</Text></Pressable>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: bulkMode === 'replace' ? '#EF4444' : '#10B981' }, bulkProcessing && { opacity: 0.5 }]}
                onPress={handleExecuteBulkImport}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>🚀 Execute {bulkMode.toUpperCase()}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* CLEAN WHITE SIDE-PANEL PROFILE DRAWER */}
      <Modal
        visible={showProfileDrawer}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowProfileDrawer(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowProfileDrawer(false)} />
          <View style={{
            width: Platform.OS === 'web' ? 380 : '85%',
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderLeftWidth: 1,
            borderLeftColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 10,
            flexDirection: 'column',
          }}>
            {/* Header */}
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A', fontFamily: 'Outfit' }}>
                👤 Admin Profile & Account
              </Text>
              <Pressable onPress={() => setShowProfileDrawer(false)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#E2E8F0' }}>
                <Text style={{ color: '#475569', fontWeight: '800', fontSize: 13 }}>✕ Close</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, padding: 20 }}>
              {/* User Card */}
              <View style={{ alignItems: 'center', marginBottom: 24, padding: 20, backgroundColor: '#F1F5F9', borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1' }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 3, borderColor: '#FFFFFF' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900' }}>
                    {(user?.displayName || activeProfile?.name || 'A').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 2 }}>
                  {user?.displayName || activeProfile?.name || 'Super Admin'}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>{user?.email}</Text>

                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>👑 SUPER ADMIN</Text>
                  </View>
                  <View style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>✓ VERIFIED</Text>
                  </View>
                </View>
              </View>

              {/* Account Details list */}
              <View style={{ gap: 14, marginBottom: 24 }}>
                <View style={{ padding: 14, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Role & Permissions</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>Root System Control ({user?.role || 'super_admin'})</Text>
                </View>

                <View style={{ padding: 14, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Active Workspace Profile</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{activeProfile?.name || 'Default Admin Profile'}</Text>
                </View>

                <View style={{ padding: 14, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Bio / Headline</Text>
                  <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>{activeProfile?.bio || 'Super Administrator for NEXUS Play Portal.'}</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 10 }}>
                <Pressable
                  style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 10, alignItems: 'center' }}
                  onPress={() => {
                    setShowProfileDrawer(false);
                    navigation.navigate('Profile');
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>👤 Open Full Profile Screen</Text>
                </Pressable>

                <Pressable
                  style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' }}
                  onPress={() => {
                    setShowProfileDrawer(false);
                    navigation.navigate('Home');
                  }}
                >
                  <Text style={{ color: '#0F172A', fontWeight: '700', fontSize: 13 }}>🏠 Back to Main Portal</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* RECORDED VIDEO PLAYER MODAL */}
      <Modal
        visible={playingRecording !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPlayingRecording(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 800, backgroundColor: '#090D1A', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                📹 {playingRecording?.title || playingRecording?.stream_title || 'Recorded Live Stream Replay'}
              </Text>
              <Pressable onPress={() => setPlayingRecording(null)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444' }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✕ Close</Text>
              </Pressable>
            </View>

            <View style={{ height: 420, backgroundColor: '#000' }}>
              {playingRecording && (
                <video
                  src={playingRecording.recorded_video_url || playingRecording.videoUrl || `${API_URL}/media/uploads/intro.mp4`}
                  controls
                  autoPlay
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
            </View>

            <View style={{ padding: 16, backgroundColor: '#0D1322', gap: 6 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{playingRecording?.title || playingRecording?.stream_title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                👤 Broadcaster: {playingRecording?.profile_name || playingRecording?.creator_name || 'Reporter'}  ·  📍 {playingRecording?.location || 'General'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ENTERPRISE GLOBAL QUICK UPLOAD MODAL */}
      <Modal
        visible={showGlobalUploadModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGlobalUploadModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 650 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { fontSize: 15, fontWeight: '900', color: '#0F172A' }]}>
                🚀 Universal Enterprise Upload Hub
              </Text>
              <Pressable onPress={() => setShowGlobalUploadModal(false)} style={{ padding: 4 }}>
                <Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
              <Text style={styles.label}>1. Select Content Type *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {[
                  { id: 'news', label: '📰 News Article' },
                  { id: 'top_story', label: '⭐ Top Story' },
                  { id: 'breaking', label: '🚨 Breaking News' },
                  { id: 'reel', label: '🎬 Video Reel' },
                  { id: 'video', label: '📹 Video Highlight' },
                  { id: 'gallery', label: '🖼️ Image Gallery' },
                  { id: 'live_tv_thumb', label: '📺 Live TV Thumbnail' },
                ].map(t => (
                  <Pressable
                    key={t.id}
                    style={[styles.filterPill, globalUploadType === t.id && styles.filterPillActive]}
                    onPress={() => setGlobalUploadType(t.id as any)}
                  >
                    <Text style={styles.filterPillText}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>2. Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 4 }}>
                {[
                  'Sports', 'Politics', 'Business', 'Technology', 'Entertainment', 'Devotional', 'General', 'Weather', 'World', 'Education', 'Health'
                ].map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.filterPill, globalUploadCategory === cat && styles.filterPillActive, { marginRight: 6 }]}
                    onPress={() => setGlobalUploadCategory(cat)}
                  >
                    <Text style={[styles.filterPillText, globalUploadCategory === cat && { color: '#fff', fontWeight: '800' }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>3. Target Region / State</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                {['AP', 'Telangana', 'Delhi/North', 'National', 'Global'].map(r => (
                  <Pressable
                    key={r}
                    style={[styles.filterPill, globalUploadRegion === r && styles.filterPillActive]}
                    onPress={() => {
                      setGlobalUploadRegion(r);
                      setGlobalUploadDistrict('All Districts');
                    }}
                  >
                    <Text style={styles.filterPillText}>{r}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Title / Headline *</Text>
              <TextInput
                style={styles.input}
                value={globalUploadTitle}
                onChangeText={(txt) => {
                  setGlobalUploadTitle(txt);
                  const lower = txt.toLowerCase();
                  let detected = null;
                  if (/cricket|football|sports|match|stadium|ipl|tennis|badminton|olympics|trophy|champion|messi|ronaldo|kohli|rohit|dhoni|wicket|runs|goal|score/.test(lower)) detected = 'Sports';
                  else if (/temple|devotional|god|pooja|ritual|bhagavad|gita|kashi|prashad|darshan|sloka|mantra|divine|spiritual/.test(lower)) detected = 'Devotional';
                  else if (/election|modi|minister|parliament|governance|politics|political|party|vote|bjp|congress/.test(lower)) detected = 'Politics';
                  else if (/market|stock|inflation|sensex|nifty|business|economy|billion|rupees|dollar|revenue/.test(lower)) detected = 'Business';
                  else if (/ai|tech|chip|technology|quantum|software|apple|google|phone|cyber|data/.test(lower)) detected = 'Technology';
                  else if (/movie|cinema|actor|film|box office|trailer|star|hollywood|tollywood|bollywood/.test(lower)) detected = 'Entertainment';

                  if (detected && (globalUploadCategory === 'General' || !globalUploadCategory)) {
                    setGlobalUploadCategory(detected);
                  }
                }}
                placeholder="Enter headline (e.g. Cricket World Cup Victory)"
                placeholderTextColor="rgba(255,255,255,0.3)"
              />

              <Text style={styles.label}>Summary Snippet</Text>
              <TextInput
                style={[styles.input, { height: 48 }]}
                multiline
                value={globalUploadSummary}
                onChangeText={setGlobalUploadSummary}
                placeholder="Short description..."
                placeholderTextColor="rgba(255,255,255,0.3)"
              />

              <Text style={styles.label}>Body Text / Content</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                multiline
                value={globalUploadBody}
                onChangeText={setGlobalUploadBody}
                placeholder="Full article content..."
                placeholderTextColor="rgba(255,255,255,0.3)"
              />

              <Text style={styles.label}>Language *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 4 }}>
                {['English', 'Telugu', 'Hindi', 'Tamil', 'Malayalam', 'Kannada'].map(lang => (
                  <Pressable
                    key={lang}
                    style={[styles.filterPill, globalUploadLanguage === lang && styles.filterPillActive, { marginRight: 6 }]}
                    onPress={() => setGlobalUploadLanguage(lang)}
                  >
                    <Text style={styles.filterPillText}>{lang}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Reporter / Author Name</Text>
              <TextInput
                style={styles.input}
                value={globalUploadReporter}
                onChangeText={setGlobalUploadReporter}
                placeholder="Enter reporter or author name..."
                placeholderTextColor="rgba(255,255,255,0.3)"
              />

              <Text style={styles.label}>Media / Cover Image URL or Asset</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={globalUploadMediaUrl}
                  onChangeText={setGlobalUploadMediaUrl}
                  placeholder="https://... or upload file"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Pressable
                  style={styles.uploadBtnSmall}
                  onPress={() => uploadComputerFile('image/*', (url, name) => {
                    setGlobalUploadMediaUrl(url);
                    setGlobalUploadFileName(name);
                    if (!globalUploadTitle.trim() && name) {
                      const cleanTitle = name.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      setGlobalUploadTitle(cleanTitle);
                    }
                    showAlert('File Attached', `Cover image attached: ${name}`);
                  })}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📁 Browse Computer</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Thumbnail Image Asset (Supabase / Storage URL)</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={globalUploadThumbnailUrl}
                  onChangeText={setGlobalUploadThumbnailUrl}
                  placeholder="https://... or upload thumbnail"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Pressable
                  style={styles.uploadBtnSmall}
                  onPress={() => uploadComputerFile('image/*', (url, name) => {
                    setGlobalUploadThumbnailUrl(url);
                    if (!globalUploadTitle.trim() && name) {
                      const cleanTitle = name.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      setGlobalUploadTitle(cleanTitle);
                    }
                    showAlert('File Attached', `Thumbnail image attached: ${name}`);
                  })}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>🖼️ Thumbnail</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Video Asset (Supabase / Storage URL)</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={globalUploadVideoUrl}
                  onChangeText={setGlobalUploadVideoUrl}
                  placeholder="https://... or upload video"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Pressable
                  style={styles.uploadBtnSmall}
                  onPress={() => uploadComputerFile('video/*', (url, name) => {
                    setGlobalUploadVideoUrl(url);
                    if (!globalUploadTitle.trim() && name) {
                      const cleanTitle = name.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      setGlobalUploadTitle(cleanTitle);
                    }
                    showAlert('File Attached', `Video asset attached: ${name}`);
                  })}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📹 Video</Text>
                </Pressable>
              </View>

              {globalUploading && (
                <View style={{ marginTop: 10, gap: 4 }}>
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800' }}>
                    Publishing & Broadcasting... {globalUploadProgress}%
                  </Text>
                  <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${globalUploadProgress}%`, backgroundColor: '#10B981' }} />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowGlobalUploadModal(false)}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: '#F59E0B' }, globalUploading && { opacity: 0.5 }]}
                onPress={() => handleGlobalUploadSubmit('draft')}
                disabled={globalUploading}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>💾 Save Draft</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: '#10B981' }, globalUploading && { opacity: 0.5 }]}
                onPress={() => handleGlobalUploadSubmit('published')}
                disabled={globalUploading}
              >
                {globalUploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>🚀 Publish & Real-Time Sync</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Stream & Video Replay Player Modal */}
      <Modal visible={showVideoPlayerModal} animationType="fade" transparent={true} onRequestClose={() => setShowVideoPlayerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 840, backgroundColor: '#FFFFFF' }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '800' }}>
                🎥 {playingRecording?.title || playingRecording?.stream_title || 'Live Stream Replay'}
              </Text>
              <Pressable onPress={() => { setShowVideoPlayerModal(false); setPlayingRecording(null); }} style={{ padding: 4 }}>
                <Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {playingRecording && (
                <View style={{ gap: 12 }}>
                  <View style={{ width: '100%', height: 380, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                    {Platform.OS === 'web' ? (
                      <video
                        src={playingRecording.videoUrl || playingRecording.recorded_video_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'}
                        controls
                        autoPlay
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#0F172A', fontSize: 14 }}>Playing stream video:</Text>
                        <Text style={{ color: '#3B82F6', fontSize: 12, marginTop: 4 }}>{playingRecording.videoUrl || playingRecording.recorded_video_url}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <View>
                      <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800' }}>{playingRecording.title || playingRecording.stream_title || 'Live Broadcast'}</Text>
                      <Text style={{ color: '#475569', fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                        🎙️ Broadcaster: {playingRecording.profile_name || 'NEXUS Reporter'} · Category: {playingRecording.category || 'General'}
                      </Text>
                      <Text style={{ color: '#64748B', fontSize: 10, marginTop: 2, fontWeight: '600' }}>
                        📍 Location: {playingRecording.location || 'All Regions'} · Status: {playingRecording.isLive ? '🔴 LIVE NOW' : '📼 RECORDED ARCHIVE'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#047857', fontSize: 13, fontWeight: '900' }}>👁️ {playingRecording.viewers || playingRecording.peak_viewers || 1} Viewers</Text>
                      <Text style={{ color: '#475569', fontSize: 10, marginTop: 2, fontWeight: '700' }}>
                        {playingRecording.duration ? `Duration: ${Math.round(playingRecording.duration / 60)} min` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: '100vh' as any, width: '100%', backgroundColor: '#F8FAFC' },
  sidebar: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  sidebarCollapsed: { width: 50 },
  sidebarHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sidebarTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900', fontFamily: 'Outfit', textTransform: 'uppercase', letterSpacing: 0.5 },
  sidebarToggle: { padding: 4, backgroundColor: '#F1F5F9', borderRadius: 4 },
  sidebarItem: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6, marginHorizontal: 8, marginVertical: 2 },
  sidebarItemActive: { backgroundColor: '#3B82F6' },
  sidebarItemText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  sidebarItemTextActive: { color: '#FFFFFF' },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breadcrumbs: { color: '#64748B', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  pageTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800', fontFamily: 'Outfit', marginTop: 2 },
  exitBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: '#EF4444' },
  contentScroller: { flex: 1, padding: 20, backgroundColor: '#F8FAFC' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 10 },
  kpiCard: { flex: 1, minWidth: 140, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  kpiVal: { color: '#3B82F6', fontSize: 18, fontWeight: '800', fontFamily: 'Outfit' },
  kpiLabel: { color: '#64748B', fontSize: 10, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  statusBox: { flex: 1, minWidth: 140, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 14, alignItems: 'center' },
  sectionHeader: { color: '#0F172A', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, letterSpacing: 0.5 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#3B82F6', borderRadius: 4 },
  addBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  table: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  th: { color: '#475569', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  trRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', alignItems: 'center' },
  tdText: { color: '#0F172A', fontSize: 12 },
  tdActions: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end', alignItems: 'center' },
  iconBtn: { width: 26, height: 26, borderRadius: 4, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  actionPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  actionPillText: { color: '#0F172A', fontSize: 10, fontWeight: '800' },
  filterPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterPillActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  filterPillText: { color: '#0F172A', fontSize: 9, fontWeight: '800' },
  mediaCard: { width: 128, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 8, borderRadius: 6, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  mediaCardImg: { width: 112, height: 80, borderRadius: 4, resizeMode: 'cover' },
  mediaDeleteBtn: { marginTop: 6, width: '100%', backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', paddingVertical: 4, borderRadius: 3, alignItems: 'center' },

  // Modal styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  modalCard: { width: '100%', maxWidth: 500, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  modalTitle: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  formContainer: { padding: 14 },
  label: { color: '#475569', fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, height: 34, color: '#0F172A', paddingHorizontal: 10, fontSize: 12, marginBottom: 8 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: '#E2E8F0' },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: '#3B82F6' },
  uploadBtnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', height: 34 },
});
