import React, { useEffect, useState, useRef } from 'react';
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
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../state/ThemeContext';
import { useAuth } from '../state/AuthContext';
import { api } from '../api/client';
import { API_URL } from '../config';
import { io } from 'socket.io-client';
import * as DocumentPicker from 'expo-document-picker';

export default function TopStoriesAdminScreen({ navigation, isNested = false }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('priority');

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  // Active selected story for Preview or Analytics
  const [selectedStory, setSelectedStory] = useState<any | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [headlineError, setHeadlineError] = useState(false);

  const autoDetectCategory = (text: string) => {
    const lower = text.toLowerCase();
    if (/cricket|football|sports|match|stadium|ipl|tennis|badminton|olympics|trophy|champion|messi|ronaldo|kohli|rohit|dhoni|wicket|runs|goal|score/.test(lower)) return 'Sports';
    if (/temple|devotional|god|pooja|ritual|bhagavad|gita|kashi|prashad|darshan|sloka|mantra|divine|spiritual/.test(lower)) return 'Devotional';
    if (/election|modi|minister|parliament|governance|politics|political|party|vote|bjp|congress/.test(lower)) return 'Politics';
    if (/market|stock|inflation|sensex|nifty|business|economy|billion|rupees|dollar|revenue/.test(lower)) return 'Business';
    if (/ai|tech|chip|technology|quantum|software|apple|google|phone|cyber|data/.test(lower)) return 'Technology';
    if (/movie|cinema|actor|film|box office|trailer|star|hollywood|tollywood|bollywood/.test(lower)) return 'Entertainment';
    return null;
  };
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formScrollViewRef = useRef<ScrollView>(null);
  const [description, setDescription] = useState('');
  const [article, setArticle] = useState('');
  const [category, setCategory] = useState('General');
  const [subcategory, setSubcategory] = useState('');
  const [language, setLanguage] = useState('English');
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('NEXUS Network');
  const [tags, setTags] = useState('');
  const [readingTime, setReadingTime] = useState('5');
  const [location, setLocation] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');

  // Toggles
  const [isBreaking, setIsBreaking] = useState(false);
  const [isTopStory, setIsTopStory] = useState(true);
  const [isTrending, setIsTrending] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('published');
  const [priority, setPriority] = useState('0');

  // Media
  const [imageData, setImageData] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [videoData, setVideoData] = useState('');
  const [videoFilename, setVideoFilename] = useState('');
  const [galleryData, setGalleryData] = useState<string[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // Interactive Cropping Simulator
  const [cropAspectRatio, setCropAspectRatio] = useState<'16:9' | '4:3' | '1:1'>('16:9');
  const [cropQuality, setCropQuality] = useState<number>(85); // Compression quality slider

  // Bulk Upload Queue State
  const [bulkQueue, setBulkQueue] = useState<{ id: string; filename: string; base64: string; progress: number; status: 'pending' | 'uploading' | 'completed' | 'failed' }[]>([]);
  const [uploadingBulk, setUploadingBulk] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<string>('Sports');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bulk Import File State
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');

  // Socket
  useEffect(() => {
    loadData();
    const socket = io(API_URL);
    socket.on('top-stories-update', () => {
      loadData();
    });
    return () => {
      socket.disconnect();
    };
  }, [search, categoryFilter, statusFilter, typeFilter, sortBy]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = `?search=${encodeURIComponent(search)}`;
      if (categoryFilter) query += `&category=${encodeURIComponent(categoryFilter)}`;
      if (statusFilter) query += `&status=${encodeURIComponent(statusFilter)}`;
      if (sortBy) query += `&sortBy=${encodeURIComponent(sortBy)}`;
      if (typeFilter === 'breaking') query += '&isBreaking=1';
      if (typeFilter === 'top_story') query += '&isTopStory=1';
      if (typeFilter === 'trending') query += '&isTrending=1';

      let res = await api.request<{ data: any[] }>(`/api/admin/top-stories${query}`);
      if (!res || !res.data || !Array.isArray(res.data)) {
        res = await api.request<{ data: any[] }>('/api/admin/top-stories/public');
      }
      if (res && res.data && Array.isArray(res.data)) {
        setStories(res.data);
      }
    } catch (err) {
      console.error('Failed to load top stories admin data:', err);
      try {
        const pubRes = await api.request<{ data: any[] }>('/api/admin/top-stories/public');
        if (pubRes && pubRes.data) setStories(pubRes.data);
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  const uploadComputerFile = async (mimeType: string, onUploaded: (url: string, name: string, base64: string) => void) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: mimeType, copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const processBase64 = async (base64: string) => {
          try {
            const res = await api.request<any>('/api/admin/media-library/upload', {
              method: 'POST',
              body: JSON.stringify({ filename: `${Date.now()}_${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, base64Data: base64 })
            }).catch(() => null);
            onUploaded(res?.url || '', asset.name, base64);
          } catch (e) {
            onUploaded('', asset.name, base64);
          }
        };

        if (Platform.OS === 'web' && asset.file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result?.toString().split(',')[1] || '';
            processBase64(base64);
          };
          reader.readAsDataURL(asset.file);
        } else {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result?.toString().split(',')[1] || '';
            processBase64(base64);
          };
          reader.readAsDataURL(blob);
        }
      }
    } catch (e) {
      console.error('Failed to pick file:', e);
    }
  };

  const handlePickCoverImage = async () => {
    uploadComputerFile('image/*', (url, name, base64) => {
      setImageData(base64);
      setImagePreview(url ? (url.startsWith('http') ? url : `${API_URL}${url}`) : `data:image/png;base64,${base64}`);

      // Auto-generate clean headline from image filename if empty
      if (!headline.trim() && name) {
        const cleanHeadline = name.replace(/\.[^/.]+$/, "").split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        setHeadline(cleanHeadline);
        setHeadlineError(false);
        const detected = autoDetectCategory(cleanHeadline);
        if (detected && (category === 'General' || !category)) {
          setCategory(detected);
        }
      }
    });
  };

  const handlePickVideo = async () => {
    uploadComputerFile('video/*', (url, name, base64) => {
      setVideoFilename(name);
      setVideoData(base64);
    });
  };

  const handlePickGalleryImage = async () => {
    uploadComputerFile('image/*', (url, name, base64) => {
      setGalleryData(prev => [...prev, base64]);
      setGalleryPreviews(prev => [...prev, url ? (url.startsWith('http') ? url : `${API_URL}${url}`) : `data:image/png;base64,${base64}`]);
    });
  };

  const handleSave = async () => {
    setHeadlineError(false);
    setFormError(null);

    if (!headline.trim()) {
      setHeadlineError(true);
      const msg = 'Headline is required! Please enter a title for this card above.';
      setFormError(msg);
      formScrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const payload = {
      headline: headline.trim(),
      description: description.trim(),
      article: article.trim() || description.trim(),
      category: category || 'General',
      subcategory: subcategory || undefined,
      language: language || 'English',
      author: author || user?.displayName || 'NEXUS Network',
      source: source || 'NEXUS Network',
      tags: tags || undefined,
      readingTime: readingTime || '5',
      location: location || undefined,
      publishDate: publishDate || new Date().toISOString(),
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      seoKeywords: seoKeywords || undefined,
      isBreaking,
      isTopStory,
      isTrending,
      status,
      priority,
      imageData: imageData || undefined,
      videoData: videoData || undefined,
      galleryImagesData: galleryData.length > 0 ? galleryData : undefined
    };

    setSaving(true);
    try {
      let res;
      if (editingId) {
        res = await api.request<any>(`/api/admin/top-stories/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await api.request<any>('/api/admin/top-stories', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowFormModal(false);
      resetForm();
      loadData();
      if (Platform.OS === 'web') {
        window.alert(`Success! Top Story card ${editingId ? 'updated' : 'created'} successfully.`);
      } else {
        Alert.alert('Success', `Top Story card ${editingId ? 'updated' : 'created'} successfully.`);
      }
    } catch (err: any) {
      const msg = err?.message || 'An unknown error occurred while saving.';
      setFormError(msg);
      if (Platform.OS === 'web') {
        window.alert(`Save Error: ${msg}`);
      } else {
        Alert.alert('Save Error', msg);
      }
      formScrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setHeadline('');
    setDescription('');
    setArticle('');
    setCategory('General');
    setSubcategory('');
    setLanguage('English');
    setAuthor('');
    setSource('NEXUS Network');
    setTags('');
    setReadingTime('5');
    setLocation('');
    setPublishDate('');
    setSeoTitle('');
    setSeoDescription('');
    setSeoKeywords('');
    setIsBreaking(false);
    setIsTopStory(true);
    setIsTrending(false);
    setStatus('published');
    setPriority('0');
    setImageData('');
    setImagePreview('');
    setVideoData('');
    setVideoFilename('');
    setHeadlineError(false);
    setFormError(null);
    setGalleryData([]);
    setGalleryPreviews([]);
  };

  const handleEdit = (story: any) => {
    setEditingId(story.id);
    setHeadline(story.headline);
    setDescription(story.description || '');
    setArticle(story.article || '');
    setCategory(story.category || 'General');
    setSubcategory(story.subcategory || '');
    setLanguage(story.language || 'English');
    setAuthor(story.author || '');
    setSource(story.source || 'NEXUS Network');
    setTags(story.tags || '');
    setReadingTime(String(story.reading_time || '5'));
    setLocation(story.location || '');
    setPublishDate(story.publish_date || '');
    setSeoTitle(story.seo_title || '');
    setSeoDescription(story.seo_description || '');
    setSeoKeywords(story.seo_keywords || '');
    setIsBreaking(story.is_breaking === 1);
    setIsTopStory(story.is_top_story === 1);
    setIsTrending(story.is_trending === 1);
    setStatus(story.status || 'published');
    setPriority(String(story.priority || '0'));
    setImagePreview(story.image_url ? (story.image_url.startsWith('http') ? story.image_url : `${API_URL}${story.image_url}`) : '');
    setVideoFilename(story.video_url ? 'Attached Video File' : '');
    setGalleryPreviews(story.gallery_urls ? JSON.parse(story.gallery_urls).map((url: string) => url.startsWith('http') ? url : `${API_URL}${url}`) : []);
    setShowFormModal(true);
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      try {
        const res = await api.request<any>(`/api/admin/top-stories/${id}`, { method: 'DELETE' });
        if (res) {
          loadData();
        }
      } catch (err: any) {
        if (Platform.OS === 'web') alert('Delete failed: ' + (err.message || err));
        else Alert.alert('Delete failed', err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to permanently delete this Top Story card?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Confirm Deletion',
        'Are you sure you want to permanently delete this Top Story card?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  const handleDuplicate = async (story: any) => {
    const payload = {
      headline: `${story.headline} (Copy)`,
      description: story.description,
      article: story.article,
      category: story.category,
      subcategory: story.subcategory,
      language: story.language,
      author: story.author,
      source: story.source,
      isBreaking: story.is_breaking === 1,
      isTopStory: story.is_top_story === 1,
      isTrending: story.is_trending === 1,
      status: 'draft',
      priority: String(Number(story.priority) + 1),
    };

    try {
      const res = await api.request<any>('/api/admin/top-stories', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res) {
        loadData();
      }
    } catch (e: any) {
      if (Platform.OS === 'web') alert('Duplication failed: ' + (e.message || e));
      else Alert.alert('Duplication failed', e.message);
    }
  };

  const handleTogglePublish = async (story: any, targetStatus?: 'published' | 'draft') => {
    const nextStatus = targetStatus || (story.status === 'published' ? 'draft' : 'published');
    try {
      await api.request<any>(`/api/admin/top-stories/${story.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      loadData();
    } catch (e: any) {
      if (Platform.OS === 'web') alert('Status toggle failed: ' + (e.message || e));
      else Alert.alert('Status toggle failed', e.message);
    }
  };

  const handlePinToTop = async (story: any) => {
    const remainingIds = stories.filter(s => s.id !== story.id).map(s => s.id);
    const orderedIds = [story.id, ...remainingIds];
    try {
      await api.request<any>('/api/admin/top-stories/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: orderedIds })
      });
      loadData();
    } catch (e: any) {
      if (Platform.OS === 'web') alert('Pin operation failed: ' + (e.message || e));
      else Alert.alert('Pin operation failed', e.message);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= stories.length) return;

    const listCopy = [...stories];
    const temp = listCopy[index];
    listCopy[index] = listCopy[nextIndex];
    listCopy[nextIndex] = temp;

    const orderedIds = listCopy.map(s => s.id);
    try {
      await api.request<any>('/api/admin/top-stories/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: orderedIds })
      });
      loadData();
    } catch (e: any) {
      if (Platform.OS === 'web') alert('Reorder failed: ' + (e.message || e));
      else Alert.alert('Reorder failed', e.message);
    }
  };

  // Bulk Image Upload Helpers
  const handleSelectBulkImages = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.onchange = (e: any) => {
          const files = Array.from(e.target.files || []) as File[];
          for (const file of files) {
            if (file.size > 50 * 1024 * 1024) continue;
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1] || '';
              const queueItem = {
                id: randomUUID(),
                filename: file.name,
                base64,
                progress: 0,
                status: 'pending' as const
              };
              setBulkQueue(prev => [...prev, queueItem]);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileList = result.assets;
        for (const asset of fileList) {
          if ((Platform.OS as any) === 'web') {
            const file = asset.file;
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = reader.result?.toString().split(',')[1] || '';
                const queueItem = {
                  id: randomUUID(),
                  filename: asset.name,
                  base64,
                  progress: 0,
                  status: 'pending' as const
                };
                setBulkQueue(prev => [...prev, queueItem]);
              };
              reader.readAsDataURL(file);
            }
          }
        }
      }
    } catch (e) {
      console.error('Bulk image selection error:', e);
    }
  };

  const handleStartBulkUpload = async () => {
    if (bulkQueue.length === 0) return;

    let pendingItems = bulkQueue.filter(item => item.status === 'pending' || item.status === 'failed');
    if (pendingItems.length === 0) {
      setBulkQueue(prev => prev.map(q => ({ ...q, status: 'pending' as const, progress: 0 })));
      pendingItems = bulkQueue.map(q => ({ ...q, status: 'pending' as const, progress: 0 }));
    }

    setUploadingBulk(true);
    abortControllerRef.current = new AbortController();

    let successCount = 0;

    for (const item of pendingItems) {
      if (abortControllerRef.current.signal.aborted) {
        break;
      }
      setBulkQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 40 } : q));

      try {
        const res = await api.request<any>('/api/admin/top-stories/bulk-upload', {
          method: 'POST',
          body: JSON.stringify({ images: [{ filename: item.filename, base64: item.base64 }], category: bulkCategory })
        });

        if (res && res.success) {
          setBulkQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'completed', progress: 100 } : q));
          successCount++;
        } else {
          setBulkQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', progress: 0 } : q));
        }
      } catch (err) {
        setBulkQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', progress: 0 } : q));
      }
    }

    setUploadingBulk(false);
    loadData();

    if (successCount > 0) {
      if (Platform.OS === 'web') {
        alert(`Successfully uploaded and created ${successCount} Top Story card(s)!`);
      } else {
        Alert.alert('Bulk Upload Complete', `Successfully created ${successCount} card(s)`);
      }
    }
  };

  const handleCancelBulkUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setUploadingBulk(false);
      if (Platform.OS === 'web') alert('The current bulk upload queue was cancelled.');
      else Alert.alert('Upload Cancelled', 'The current bulk upload queue was cancelled.');
    }
  };

  const handleRetryFailedUploads = async () => {
    setBulkQueue(prev => prev.map(q => q.status === 'failed' ? { ...q, status: 'pending' } : q));
    setTimeout(handleStartBulkUpload, 100);
  };

  const handleRemoveQueueItem = (id: string) => {
    setBulkQueue(prev => prev.filter(q => q.id !== id));
  };

  const handlePickImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImportFileName(asset.name);
        if (Platform.OS === 'web') {
          const file = asset.file;
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const text = reader.result?.toString() || '';
              if (asset.name.endsWith('.json')) {
                try {
                  const json = JSON.parse(text);
                  const rows = Array.isArray(json) ? json : [json];
                  setImportRows(rows);
                } catch (e) {
                  if (Platform.OS === 'web') alert('Invalid JSON file format');
                  else Alert.alert('Invalid JSON file format');
                }
              } else {
                const lines = text.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
                const list = [];
                for (let i = 1; i < lines.length; i++) {
                  if (!lines[i].trim()) continue;
                  const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
                  const row: any = {};
                  headers.forEach((h, idx) => {
                    row[h] = values[idx] || '';
                  });
                  list.push(row);
                }
                setImportRows(list);
              }
            };
            reader.readAsText(file);
          }
        }
      }
    } catch (e) {
      console.error('Bulk import error:', e);
    }
  };

  const handleStartImport = async () => {
    if (importRows.length === 0) return;
    try {
      const res = await api.request<any>('/api/admin/top-stories/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ rows: importRows })
      });
      if (res && res.success) {
        if (Platform.OS === 'web') alert(`Successfully imported ${res.count} articles`);
        else Alert.alert('Import complete', `Successfully imported ${res.count} articles`);
        setShowBulkImportModal(false);
        setImportRows([]);
        setImportFileName('');
        loadData();
      }
    } catch (err: any) {
      if (Platform.OS === 'web') alert('Import failed: ' + (err.message || err));
      else Alert.alert('Import failed', err.message);
    }
  };

  const randomUUID = () => {
    return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <View style={[styles.fill, isNested && { backgroundColor: 'transparent' }]}>
      {/* Background Gradient */}
      {!isNested && <LinearGradient colors={['#090D1A', '#02040A']} style={StyleSheet.absoluteFill} />}

      {/* Header bar */}
      {isNested ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>Manage Top Stories</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pressable style={styles.bulkBtn} onPress={() => setShowBulkImportModal(true)}>
              <Text style={styles.bulkBtnText}>📋 Import CSV/JSON</Text>
            </Pressable>
            <Pressable style={styles.bulkBtn} onPress={() => setShowBulkUploadModal(true)}>
              <Text style={styles.bulkBtnText}>📤 Bulk Upload Images</Text>
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => { resetForm(); setShowFormModal(true); }}>
              <Text style={styles.addBtnText}>+ Add New Top Story</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.adminHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.breadcrumbs}>Admin Panel  ›  Content Management  ›  Top Stories</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Pressable onPress={() => navigation.navigate('Home')} style={styles.backBtn}>
                <Text style={{ color: '#fff', fontSize: 16 }}>←</Text>
              </Pressable>
              <Text style={styles.adminTitle}>Manage Top Stories</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pressable style={styles.bulkBtn} onPress={() => setShowBulkImportModal(true)}>
              <Text style={styles.bulkBtnText}>📋 Import CSV/JSON</Text>
            </Pressable>
            <Pressable style={styles.bulkBtn} onPress={() => setShowBulkUploadModal(true)}>
              <Text style={styles.bulkBtnText}>📤 Bulk Upload Images</Text>
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => { resetForm(); setShowFormModal(true); }}>
              <Text style={styles.addBtnText}>+ Add New Top Story</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Search and Filters Bar */}
      <View style={styles.filterBar}>
        <TextInput
          placeholder="Search headline, author, category, tags..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Pressable style={[styles.filterPill, !categoryFilter && styles.filterPillActive]} onPress={() => setCategoryFilter('')}>
              <Text style={styles.filterPillText}>All Categories</Text>
            </Pressable>
            {['Politics', 'Business', 'Technology', 'Sports', 'Entertainment', 'Devotional', 'General'].map(cat => (
              <Pressable key={cat} style={[styles.filterPill, categoryFilter === cat && styles.filterPillActive]} onPress={() => setCategoryFilter(cat)}>
                <Text style={styles.filterPillText}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Pressable style={[styles.filterPill, !statusFilter && styles.filterPillActive]} onPress={() => setStatusFilter('')}>
              <Text style={styles.filterPillText}>All Status</Text>
            </Pressable>
            {['published', 'draft'].map(stat => (
              <Pressable key={stat} style={[styles.filterPill, statusFilter === stat && styles.filterPillActive]} onPress={() => setStatusFilter(stat)}>
                <Text style={styles.filterPillText}>{stat.toUpperCase()}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.filterPill, typeFilter === 'breaking' && styles.filterPillActive]} onPress={() => setTypeFilter(typeFilter === 'breaking' ? '' : 'breaking')}>
              <Text style={styles.filterPillText}>🚨 Breaking</Text>
            </Pressable>
            <Pressable style={[styles.filterPill, typeFilter === 'top_story' && styles.filterPillActive]} onPress={() => setTypeFilter(typeFilter === 'top_story' ? '' : 'top_story')}>
              <Text style={styles.filterPillText}>🔥 Top Story</Text>
            </Pressable>
            <Pressable style={[styles.filterPill, typeFilter === 'trending' && styles.filterPillActive]} onPress={() => setTypeFilter(typeFilter === 'trending' ? '' : 'trending')}>
              <Text style={styles.filterPillText}>⚡ Trending</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {/* Main Grid/List of Top Stories */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 100 }}>
          {stories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>No Top Stories found matching current filters.</Text>
            </View>
          ) : (
            <View style={styles.table}>
              {/* Dynamic Headers */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1 }]}>Thumbnail</Text>
                <Text style={[styles.th, { flex: 2 }]}>Headline</Text>
                <Text style={[styles.th, { flex: 1 }]}>Category</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Language</Text>
                <Text style={[styles.th, { flex: 1 }]}>Author</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Status</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Views</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Created Date</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Last Updated</Text>
                <Text style={[styles.th, { flex: 2.2, textAlign: 'right' }]}>Actions</Text>
              </View>

              {stories.map((story, index) => {
                const coverUrl = story.image_url ? (story.image_url.startsWith('http') ? story.image_url : `${API_URL}${story.image_url}`) : '';
                return (
                  <View key={story.id} style={styles.tr}>
                    {/* 1. Thumbnail */}
                    <View style={[styles.td, { flex: 1 }]}>
                      {coverUrl ? (
                        <Image source={{ uri: coverUrl }} style={styles.previewImage} />
                      ) : (
                        <View style={styles.fallbackPreview}>
                          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>No Image</Text>
                        </View>
                      )}
                    </View>

                    {/* 2. Headline */}
                    <View style={[styles.td, { flex: 2 }]}>
                      <Text style={styles.headlineText} numberOfLines={2}>{story.headline}</Text>
                      {story.is_breaking === 1 && (
                        <Text style={{ fontSize: 9, color: '#EF4444', fontWeight: '800', marginTop: 2 }}>🚨 BREAKING</Text>
                      )}
                    </View>

                    {/* 3. Category */}
                    <View style={[styles.td, { flex: 1 }]}>
                      <Text style={styles.categoryText}>{story.category}</Text>
                      {story.subcategory && <Text style={{ fontSize: 10, color: '#64748B' }}>{story.subcategory}</Text>}
                    </View>

                    {/* 4. Language */}
                    <View style={[styles.td, { flex: 0.8 }]}>
                      <Text style={{ color: '#0F172A', fontSize: 12, fontWeight: '600' }}>{story.language || 'English'}</Text>
                    </View>

                    {/* 5. Author */}
                    <View style={[styles.td, { flex: 1 }]}>
                      <Text style={{ color: '#0F172A', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{story.author || 'NEXUS Network'}</Text>
                      <Text style={{ fontSize: 9, color: '#64748B' }}>{story.source || 'NEXUS'}</Text>
                    </View>

                    {/* 6. Status */}
                    <View style={[styles.td, { flex: 0.8 }]}>
                      <View style={[styles.statusBadge, story.status === 'published' ? styles.statusPub : styles.statusDr]}>
                        <Text style={styles.statusText}>{story.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    {/* 7. Views */}
                    <View style={[styles.td, { flex: 0.8 }]}>
                      <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>👁️ {story.views || 0}</Text>
                    </View>

                    {/* 8. Created Date */}
                    <View style={[styles.td, { flex: 1.2 }]}>
                      <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600' }}>{formatDate(story.created_at)}</Text>
                    </View>

                    {/* 9. Last Updated */}
                    <View style={[styles.td, { flex: 1.2 }]}>
                      <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600' }}>{formatDate(story.updated_at)}</Text>
                    </View>

                    {/* 10. Actions Bar */}
                    <View style={[styles.td, { flex: 2.2, flexDirection: 'row', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }]}>
                      <Pressable style={styles.iconActionBtn} onPress={() => { setSelectedStory(story); setShowPreviewModal(true); }}>
                        <Text style={{ fontSize: 12 }}>👁️</Text>
                      </Pressable>
                      <Pressable style={styles.iconActionBtn} onPress={() => handleEdit(story)}>
                        <Text style={{ fontSize: 12 }}>✏️</Text>
                      </Pressable>
                      <Pressable style={styles.iconActionBtn} onPress={() => handlePinToTop(story)}>
                        <Text style={{ fontSize: 12 }}>📌</Text>
                      </Pressable>
                      <Pressable style={styles.iconActionBtn} onPress={() => handleTogglePublish(story)}>
                        <Text style={{ fontSize: 12 }}>{story.status === 'published' ? '📥' : '📤'}</Text>
                      </Pressable>
                      <Pressable style={styles.iconActionBtn} onPress={() => handleDuplicate(story)}>
                        <Text style={{ fontSize: 12 }}>📋</Text>
                      </Pressable>
                      <Pressable style={styles.iconActionBtn} onPress={() => { setSelectedStory(story); setShowAnalyticsModal(true); }}>
                        <Text style={{ fontSize: 12 }}>📊</Text>
                      </Pressable>
                      <Pressable style={[styles.iconActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]} onPress={() => handleDelete(story.id)}>
                        <Text style={{ fontSize: 12, color: '#EF4444' }}>🗑️</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* 1. Add/Edit Form Modal */}
      <Modal visible={showFormModal} animationType="fade" transparent={true} onRequestClose={() => setShowFormModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Top Story Details' : 'Create New Top Story Card'}</Text>
              <Pressable onPress={() => setShowFormModal(false)} style={{ padding: 4 }}><Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text></Pressable>
            </View>
            <ScrollView ref={formScrollViewRef} contentContainerStyle={styles.formContainer}>
              {formError && (
                <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#EF4444', borderWidth: 1, padding: 10, borderRadius: 6, marginBottom: 12 }}>
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>⚠️ {formError}</Text>
                </View>
              )}

              <Text style={styles.label}>Headline *</Text>
              <TextInput
                style={[styles.input, headlineError && { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]}
                value={headline}
                onChangeText={(txt) => {
                  setHeadline(txt);
                  setHeadlineError(false);
                  const detected = autoDetectCategory(txt);
                  if (detected && (category === 'General' || !category)) {
                    setCategory(detected);
                  }
                }}
                placeholder="Enter headline (e.g. Cricket Championship Victory)"
                placeholderTextColor="rgba(255,255,255,0.2)"
              />
              {headlineError && (
                <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800', marginTop: -6, marginBottom: 8, textTransform: 'uppercase' }}>
                  Headline is required!
                </Text>
              )}

              <Text style={styles.label}>Short Description</Text>
              <TextInput style={[styles.input, { height: 60 }]} multiline value={description} onChangeText={setDescription} placeholder="Brief card summary description" placeholderTextColor="rgba(255,255,255,0.2)" />

              <Text style={styles.label}>Full Article Text</Text>
              <TextInput style={[styles.input, { height: 110 }]} multiline value={article} onChangeText={setArticle} placeholder="Full body article text (markdown supported)" placeholderTextColor="rgba(255,255,255,0.2)" />

              <Text style={styles.label}>Category * (Auto-detected or Select Below)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 8 }}>
                {['Sports', 'Politics', 'Business', 'Technology', 'Entertainment', 'Devotional', 'General', 'Health', 'Education', 'World', 'Weather'].map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.filterPill, category === cat && styles.filterPillActive, { marginRight: 6 }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.filterPillText, category === cat && { color: '#fff', fontWeight: '800' }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Category Name</Text>
                  <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Sports, Devotional" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Subcategory</Text>
                  <TextInput style={styles.input} value={subcategory} onChangeText={setSubcategory} placeholder="e.g. Cricket, Temple News" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Language</Text>
                  <TextInput style={styles.input} value={language} onChangeText={setLanguage} placeholder="e.g. English, Telugu" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Author</Text>
                  <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Author name" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Location / Region</Text>
                  <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Hyderabad, India" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Read Time (Minutes)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={readingTime} onChangeText={setReadingTime} placeholder="5" placeholderTextColor="rgba(255,255,255,0.2)" />
                </View>
              </View>

              {/* Toggles */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginVertical: 8 }}>
                <View style={styles.miniToggle}>
                  <Text style={styles.toggleLabel}>🚨 Breaking</Text>
                  <Switch value={isBreaking} onValueChange={setIsBreaking} trackColor={{ true: '#3B82F6', false: '#334155' }} />
                </View>
                <View style={styles.miniToggle}>
                  <Text style={styles.toggleLabel}>🔥 Top Story</Text>
                  <Switch value={isTopStory} onValueChange={setIsTopStory} trackColor={{ true: '#3B82F6', false: '#334155' }} />
                </View>
                <View style={styles.miniToggle}>
                  <Text style={styles.toggleLabel}>⚡ Trending</Text>
                  <Switch value={isTrending} onValueChange={setIsTrending} trackColor={{ true: '#3B82F6', false: '#334155' }} />
                </View>
              </View>

              {/* Upload image area & aspect ratio simulated cropper */}
              <Text style={styles.label}>Featured Cover Image (JPG, PNG, WEBP max 20MB)</Text>
              <Pressable style={styles.uploadArea} onPress={handlePickCoverImage}>
                {imagePreview ? (
                  <View style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
                    <Image source={{ uri: imagePreview }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                    {/* Simulated Crop Grid Overlay */}
                    <View style={StyleSheet.absoluteFill}>
                      <View style={[styles.cropGridBox, { aspectRatio: cropAspectRatio === '16:9' ? 1.77 : cropAspectRatio === '4:3' ? 1.33 : 1 }]} />
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24 }}>🖼️</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Select Featured Image File</Text>
                  </View>
                )}
              </Pressable>

              {imagePreview && (
                <View style={styles.cropperToolbar}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Crop Ratio:</Text>
                  {['16:9', '4:3', '1:1'].map((ratio: any) => (
                    <Pressable key={ratio} style={[styles.ratioBtn, cropAspectRatio === ratio && styles.ratioBtnActive]} onPress={() => setCropAspectRatio(ratio)}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{ratio}</Text>
                    </Pressable>
                  ))}
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginLeft: 'auto' }}>Quality: {cropQuality}%</Text>
                </View>
              )}

              {/* Optional Video upload */}
              <Text style={styles.label}>Video Attachment (Optional)</Text>
              <Pressable style={[styles.uploadArea, { height: 60 }]} onPress={handlePickVideo}>
                <Text style={{ color: '#fff', fontSize: 12 }}>{videoFilename ? `📹 Video: ${videoFilename}` : '📁 Attach video file (.mp4)'}</Text>
              </Pressable>

              {/* Gallery Images List */}
              <Text style={styles.label}>Gallery Images (Optional)</Text>
              <ScrollView horizontal style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
                {galleryPreviews.map((url, idx) => (
                  <Image key={idx} source={{ uri: url }} style={styles.galleryPreviewThumb} />
                ))}
                <Pressable style={styles.addGalleryBtn} onPress={handlePickGalleryImage}>
                  <Text style={{ color: '#fff', fontSize: 20 }}>+</Text>
                </Pressable>
              </ScrollView>

              {/* SEO details */}
              <Text style={[styles.label, { marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 12 }]}>SEO Search Parameters</Text>
              <TextInput style={styles.input} value={seoTitle} onChangeText={setSeoTitle} placeholder="Meta title tags" placeholderTextColor="rgba(255,255,255,0.2)" />
              <TextInput style={styles.input} value={seoDescription} onChangeText={setSeoDescription} placeholder="Meta descriptions tag" placeholderTextColor="rgba(255,255,255,0.2)" />
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowFormModal(false)}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={handleSave}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Bulk Image Upload Modal */}
      <Modal visible={showBulkUploadModal} animationType="slide" transparent={true} onRequestClose={() => setShowBulkUploadModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulk Upload Story Images</Text>
              <Pressable onPress={() => setShowBulkUploadModal(false)} style={{ padding: 4 }}><Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text></Pressable>
            </View>
            <View style={{ padding: 16, flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>Target Category for Uploaded News *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 12 }}>
                {['Sports', 'Politics', 'Business', 'Technology', 'Entertainment', 'Devotional', 'General', 'Weather', 'World'].map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.filterPill, bulkCategory === cat && styles.filterPillActive, { marginRight: 6 }]}
                    onPress={() => setBulkCategory(cat)}
                  >
                    <Text style={[styles.filterPillText, bulkCategory === cat && { color: '#fff', fontWeight: '800' }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable style={styles.bulkUploadDropzone} onPress={handleSelectBulkImages}>
                <Text style={{ fontSize: 32 }}>📁</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 }}>Choose images to upload into "{bulkCategory}" category</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>Files will be auto-stored under {bulkCategory} section</Text>
              </Pressable>

              {bulkQueue.length > 0 && (
                <View style={{ flex: 1, marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Upload Queue ({bulkQueue.length} files)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable style={styles.miniToolBtn} onPress={handleRetryFailedUploads}>
                        <Text style={styles.miniToolBtnText}>🔄 Retry Failed</Text>
                      </Pressable>
                      {uploadingBulk && (
                        <Pressable style={[styles.miniToolBtn, { backgroundColor: '#EF4444' }]} onPress={handleCancelBulkUpload}>
                          <Text style={styles.miniToolBtnText}>✕ Cancel Upload</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <ScrollView style={{ flex: 1 }}>
                    {bulkQueue.map(item => (
                      <View key={item.id} style={styles.queueItemRow}>
                        {item.base64 ? (
                          <Image source={{ uri: `data:image/jpeg;base64,${item.base64}` }} style={styles.queueThumb} />
                        ) : (
                          <View style={styles.queueThumbFallback} />
                        )}
                        <Text style={{ color: '#fff', flex: 1, fontSize: 11, marginLeft: 8 }} numberOfLines={1}>{item.filename}</Text>
                        <View style={{ width: 80, height: 4, backgroundColor: '#334155', borderRadius: 2, overflow: 'hidden', marginHorizontal: 8 }}>
                          <View style={{ width: `${item.progress}%`, height: '100%', backgroundColor: item.status === 'failed' ? '#EF4444' : '#10B981' }} />
                        </View>
                        <Text style={{ color: item.status === 'completed' ? '#10B981' : item.status === 'failed' ? '#EF4444' : '#64748B', fontSize: 10 }}>{item.status.toUpperCase()}</Text>
                        <Pressable style={{ marginLeft: 8 }} onPress={() => handleRemoveQueueItem(item.id)}>
                          <Text style={{ color: '#EF4444', fontSize: 14 }}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowBulkUploadModal(false)}>
                <Text style={{ color: '#fff' }}>Close</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { opacity: bulkQueue.length === 0 || uploadingBulk ? 0.5 : 1 }]} disabled={bulkQueue.length === 0 || uploadingBulk} onPress={handleStartBulkUpload}>
                {uploadingBulk ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Upload & Create Cards</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. CSV/JSON Import Modal */}
      <Modal visible={showBulkImportModal} animationType="slide" transparent={true} onRequestClose={() => setShowBulkImportModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulk Import Dataset (CSV / JSON)</Text>
              <Pressable onPress={() => setShowBulkImportModal(false)} style={{ padding: 4 }}><Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text></Pressable>
            </View>
            <View style={{ padding: 16, flex: 1 }}>
              <Pressable style={styles.bulkUploadDropzone} onPress={handlePickImportFile}>
                <Text style={{ fontSize: 32 }}>📊</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 }}>{importFileName ? `Selected File: ${importFileName}` : 'Choose CSV, Excel or JSON Dataset'}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>Imports headlines, author lists, locations, and descriptions instantly</Text>
              </Pressable>

              {importRows.length > 0 && (
                <View style={{ flex: 1, marginTop: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 8 }}>Import Preview ({importRows.length} rows loaded)</Text>
                  <ScrollView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 6 }}>
                    {importRows.slice(0, 10).map((row, idx) => (
                      <Text key={idx} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }} numberOfLines={1}>
                        - Headline: "{row.headline || 'Untitled'}" | Author: {row.author || 'NEXUS'}
                      </Text>
                    ))}
                    {importRows.length > 10 && <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>...and {importRows.length - 10} more articles</Text>}
                  </ScrollView>
                </View>
              )}
            </View>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowBulkImportModal(false)}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { opacity: importRows.length === 0 ? 0.5 : 1 }]} disabled={importRows.length === 0} onPress={handleStartImport}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Import & Seed Cards</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Interactive Card Preview Modal (👁 View) */}
      <Modal visible={showPreviewModal} animationType="fade" transparent={true} onRequestClose={() => setShowPreviewModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Card Live View Preview</Text>
              <Pressable onPress={() => setShowPreviewModal(false)}><Text style={{ color: '#fff', fontSize: 20 }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {selectedStory && (
                <View style={styles.mockCardFrame}>
                  {/* Card Image Area */}
                  {selectedStory.image_url ? (
                    <Image source={{ uri: selectedStory.image_url.startsWith('http') ? selectedStory.image_url : `${API_URL}${selectedStory.image_url}` }} style={styles.mockCardImage} />
                  ) : (
                    <View style={[styles.mockCardImage, { backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: '#64748B' }}>No Image Attachment</Text>
                    </View>
                  )}
                  {/* Card Content Area */}
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: '#3B82F6', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
                      {selectedStory.category} {selectedStory.subcategory ? `• ${selectedStory.subcategory}` : ''}
                    </Text>
                    <Text style={styles.mockCardHeadline}>{selectedStory.headline}</Text>
                    <Text style={styles.mockCardDesc}>{selectedStory.description || 'No description provided.'}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 8 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>By {selectedStory.author || 'NEXUS Network'}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Language: {selectedStory.language || 'English'}</Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPreviewModal(false)}>
                <Text style={{ color: '#fff' }}>Close Preview</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. simulated Analytics Modal (📊 Analytics) */}
      <Modal visible={showAnalyticsModal} animationType="fade" transparent={true} onRequestClose={() => setShowAnalyticsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Engagement & Analytics</Text>
              <Pressable onPress={() => setShowAnalyticsModal(false)} style={{ padding: 4 }}><Text style={{ color: '#000', fontSize: 22, fontWeight: '900' }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {selectedStory && (
                <View>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 }}>{selectedStory.headline}</Text>

                  {/* Grid of KPIs */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                    <View style={styles.kpiBox}>
                      <Text style={styles.kpiVal}>👁️ {selectedStory.views || 0}</Text>
                      <Text style={styles.kpiLabel}>Total Views</Text>
                    </View>
                    <View style={styles.kpiBox}>
                      <Text style={styles.kpiVal}>❤️ {Math.round((selectedStory.views || 0) * 0.12)}</Text>
                      <Text style={styles.kpiLabel}>Likes</Text>
                    </View>
                    <View style={styles.kpiBox}>
                      <Text style={styles.kpiVal}>💬 {Math.round((selectedStory.views || 0) * 0.04)}</Text>
                      <Text style={styles.kpiLabel}>Comments</Text>
                    </View>
                  </View>

                  {/* Simulated Click-Through Rate Graph */}
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase' }}>Daily View Impressions (Last 7 Days)</Text>
                  <View style={styles.graphContainer}>
                    {[45, 60, 30, 80, 55, 90, 70].map((h, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                        <View style={[styles.graphBar, { height: `${h}%` }]} />
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, marginTop: 4 }}>Day {i + 1}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
                    Click-Through Rate (CTR): <Text style={{ color: '#3B82F6', fontWeight: '800' }}>{(3.2 + Math.random() * 2).toFixed(1)}%</Text>
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAnalyticsModal(false)}>
                <Text style={{ color: '#fff' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F8FAFC' },
  adminHeader: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breadcrumbs: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bulkBtnText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  filterBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    color: '#0F172A',
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterPillText: { color: '#0F172A', fontSize: 10, fontWeight: '700' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentScroll: { flex: 1, padding: 16 },
  emptyContainer: { padding: 48, alignItems: 'center' },
  table: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: { color: '#475569', fontWeight: '800', fontSize: 10, textTransform: 'uppercase' },
  tr: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  td: { justifyContent: 'center' },
  previewImage: { width: 44, height: 30, borderRadius: 3, resizeMode: 'cover' },
  fallbackPreview: { width: 44, height: 30, borderRadius: 3, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  headlineText: { color: '#0F172A', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  categoryText: { color: '#3B82F6', fontSize: 10, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start' },
  statusPub: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  statusDr: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  statusText: { fontSize: 8, color: '#047857', fontWeight: '900' },
  arrowBtn: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal styling
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  modalCard: { width: '100%', maxWidth: 580, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  modalTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  formContainer: { padding: 14 },
  label: { color: '#475569', fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, height: 36, color: '#0F172A', paddingHorizontal: 10, fontSize: 12, marginBottom: 10 },
  miniToggle: { flex: 1, minWidth: 110, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6 },
  toggleLabel: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  uploadArea: { height: 120, borderRadius: 6, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  galleryPreviewThumb: { width: 44, height: 44, borderRadius: 4, marginRight: 6 },
  addGalleryBtn: { width: 44, height: 44, borderRadius: 4, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#E2E8F0' },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#3B82F6' },
  bulkUploadDropzone: { height: 130, borderRadius: 8, borderStyle: 'dashed', borderWidth: 2, borderColor: 'rgba(59, 130, 246, 0.3)', backgroundColor: 'rgba(59, 130, 246, 0.02)', justifyContent: 'center', alignItems: 'center' },
  queueItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  queueThumb: { width: 32, height: 22, borderRadius: 3, resizeMode: 'cover' },
  queueThumbFallback: { width: 32, height: 22, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.05)' },
  miniToolBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  miniToolBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // simulated Cropper Overlay styles
  cropGridBox: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    right: '10%',
    bottom: '10%',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  cropperToolbar: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 12, padding: 6, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 6 },
  ratioBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' },
  ratioBtnActive: { backgroundColor: '#3B82F6' },

  // Live View Mock Card frame
  mockCardFrame: { backgroundColor: '#090D1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 },
  mockCardImage: { width: '100%', height: 180, resizeMode: 'cover' },
  mockCardHeadline: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 8, fontFamily: 'Outfit' },
  mockCardDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6, lineHeight: 18 },

  // Analytics graph styles
  kpiBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 6, alignItems: 'center' },
  kpiVal: { color: '#fff', fontSize: 15, fontWeight: '800' },
  kpiLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 2 },
  graphContainer: { height: 100, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  graphBar: { width: 14, backgroundColor: '#3B82F6', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});
