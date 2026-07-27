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

export default function SuperAdminDashboardScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  // Sidebar navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'topStories' | 'news' | 'channels' | 'reporters' | 'users' | 'ads' | 'notifications' | 'media' | 'database' | 'backups' | 'logs'>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      } else if (activeTab === 'news') {
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
      }
    } catch (e) {
      console.error('Failed to load admin panel tab data:', e);
    } finally {
      setLoading(false);
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
      `Are you sure you want to permanently delete this item (${id})?`,
      async () => {
        try {
          await api.request(endpoint, { method: 'DELETE' });
          loadTabContent();
        } catch (err: any) {
          showAlert('Deletion failed', err.message);
        }
      }
    );
  };

  const handlePickMediaFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              try {
                await api.request('/api/admin/media-library/upload', {
                  method: 'POST',
                  body: JSON.stringify({ filename: asset.name, base64Data: base64 })
                });
                showAlert('Upload Success', `Uploaded ${asset.name}`);
                loadTabContent();
              } catch (e: any) {
                showAlert('File upload failed', e.message);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
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

  const sidebarItems = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'topStories', label: '⭐ Top Stories CMS' },
    { key: 'news', label: '📰 News Stories' },
    { key: 'channels', label: '📺 Live TV Channels' },
    { key: 'reporters', label: '🎙️ Reporter Station' },
    { key: 'users', label: '👥 User Profiles' },
    { key: 'ads', label: '💵 Ads Campaigns' },
    { key: 'notifications', label: '🔔 Push Notifications' },
    { key: 'media', label: '📁 Media Library' },
    { key: 'database', label: '🗄️ Database Manager' },
    { key: 'backups', label: '💾 Backup & Restore' },
    { key: 'logs', label: '📜 System Audit Logs' },
  ];

  return (
    <View style={styles.fill}>
      {/* Background */}
      <LinearGradient colors={['#070A14', '#020408']} style={StyleSheet.absoluteFill} />

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
                  {sidebarCollapsed ? item.label.split(' ')[0] : item.label}
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
              <Text style={styles.breadcrumbs}>Super Admin Dashboard  ›  {activeTab.toUpperCase()}</Text>
              <Text style={styles.pageTitle}>System Administration Control</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Root Admin: {user?.email}</Text>
              <Pressable onPress={() => navigation.navigate('Home')} style={styles.exitBtn}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Exit Portal</Text>
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
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{kpis.cpuUsage}</Text>
                        <Text style={styles.kpiLabel}>CPU Load</Text>
                      </View>
                      <View style={styles.statusBox}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{kpis.memUsage}</Text>
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
                      <Pressable style={styles.addBtn} onPress={openAddNews}><Text style={styles.addBtnText}>+ Add News Story</Text></Pressable>
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
              <Pressable onPress={() => setShowMediaPreviewModal(false)}><Text style={{ color: '#fff', fontSize: 20 }}>✕</Text></Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sidebar: {
    width: 220,
    backgroundColor: '#090D1A',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  sidebarCollapsed: { width: 50 },
  sidebarHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  sidebarTitle: { color: '#fff', fontSize: 13, fontWeight: '900', fontFamily: 'Outfit', textTransform: 'uppercase', letterSpacing: 0.5 },
  sidebarToggle: { padding: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4 },
  sidebarItem: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6, marginHorizontal: 8, marginVertical: 2 },
  sidebarItemActive: { backgroundColor: '#3B82F6' },
  sidebarItemText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700' },
  sidebarItemTextActive: { color: '#fff' },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#090D1A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breadcrumbs: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  pageTitle: { color: '#fff', fontSize: 16, fontWeight: '800', fontFamily: 'Outfit', marginTop: 2 },
  exitBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: '#EF4444' },
  contentScroller: { flex: 1, padding: 20 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 10 },
  kpiCard: { flex: 1, minWidth: 140, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 14 },
  kpiVal: { color: '#3B82F6', fontSize: 18, fontWeight: '800', fontFamily: 'Outfit' },
  kpiLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  statusBox: { flex: 1, minWidth: 140, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 14, alignItems: 'center' },
  sectionHeader: { color: '#fff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, letterSpacing: 0.5 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#3B82F6', borderRadius: 4 },
  addBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  table: { backgroundColor: 'rgba(255,255,255,0.01)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  th: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  trRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', alignItems: 'center' },
  tdText: { color: '#fff', fontSize: 12 },
  tdActions: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end', alignItems: 'center' },
  iconBtn: { width: 26, height: 26, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center' },
  actionPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  actionPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  filterPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  filterPillActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  filterPillText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  mediaCard: { width: 110, backgroundColor: 'rgba(255,255,255,0.02)', borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 6 },
  mediaCardImg: { width: 94, height: 68, borderRadius: 4, resizeMode: 'cover' },
  mediaDeleteBtn: { marginTop: 6, backgroundColor: 'rgba(239,68,68,0.15)', paddingVertical: 3, borderRadius: 3, alignItems: 'center' },

  // Modal styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  modalCard: { width: '100%', maxWidth: 500, maxHeight: '90%', backgroundColor: '#090D1A', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.01)' },
  modalTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  formContainer: { padding: 14 },
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  input: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 34, color: '#fff', paddingHorizontal: 10, fontSize: 12, marginBottom: 8 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.01)' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: '#3B82F6' },
  uploadBtnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', height: 34 },
});
