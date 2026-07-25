import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, FlatList, StyleSheet, ActivityIndicator, Text, Animated, LayoutChangeEvent,
  ViewToken, Modal, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { ReelCard } from '../components/ReelCard';
import { useIsFocused, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIUploadScanner } from '../components/AIUploadScanner';
import { api } from '../api/client';
import { colors } from '../theme';
import { HoverPressable } from '../components/HoverPressable';
import type { Reel } from '../types';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { AppHeader } from '../components/AppHeader';

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

export default function ReelsScreen() {
  const isFocused = useIsFocused();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const initialReelId = route?.params?.initialReelId;
  const flatListRef = useRef<FlatList>(null);

  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [size, setSize] = useState({ h: 0, w: 0 });

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');

  // Comments state
  const [commentingReel, setCommentingReel] = useState<Reel | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');

  // Upload Reel Modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadVideoData, setUploadVideoData] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadLocation, setUploadLocation] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [modWarning, setModWarning] = useState<{
    visible: boolean;
    title: string;
    rejectReason: string;
    type: 'reel';
    formData: {
      title: string;
      description: string;
      videoData: string;
      location?: string;
    };
  } | null>(null);

  const handleModCancel = () => {
    if (modWarning) {
      setShowUploadModal(true);
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
      const newReel = await api.uploadReel(
        formData.title,
        formData.description,
        formData.videoData,
        formData.location,
        undefined,
        undefined,
        true
      );
      
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Uploaded! sensitive video segments will be blurred.');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setReels((prev) => [newReel, ...prev]);
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadDesc('');
      setUploadVideoData('');
      setUploadFileName('');
      setUploadLocation('');
      showToast('Reel uploaded successfully!');
      setActiveIndex(0);
    } catch (err: any) {
      clearInterval(progressInterval);
      setShowUploadModal(true);
      alert(err.message || 'Failed to submit content');
    } finally {
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  const cursor = useRef<number | null>(null);
  const hasMore = useRef(true);
  const loadingMore = useRef(false);

  const toast = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toast, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.delay(1200),
      Animated.timing(toast, { toValue: 0, duration: 240, useNativeDriver: false }),
    ]).start();
  }, [toast]);

  const load = useCallback(async (initial = false) => {
    if (loadingMore.current || (!initial && !hasMore.current)) return;
    loadingMore.current = true;
    try {
      const res = await api.getReels(initial ? null : cursor.current);
      cursor.current = res.nextCursor;
      hasMore.current = res.hasMore;
      setReels((prev) => (initial ? res.data : [...prev, ...res.data]));
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load reels');
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    // Load watchlist to check saved states
    api.getWatchlist().then((res) => {
      const ids = new Set(res.data.map((item) => item.contentId));
      setSavedIds(ids);
    }).catch(() => {});
  }, [load]);

  // Scroll to initialReelId if provided
  useEffect(() => {
    if (initialReelId && reels.length > 0) {
      const idx = reels.findIndex((r) => r.id === initialReelId);
      if (idx !== -1) {
        setActiveIndex(idx);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: idx, animated: false });
          if (route.params) {
            route.params.initialReelId = null; // clear parameter
          }
        }, 150);
      }
    }
  }, [initialReelId, reels]);

  // Load comments
  const handleOpenComments = async (reel: Reel) => {
    setCommentingReel(reel);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await api.getComments(reel.id);
      setComments(res.data);
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
            ? { ...r, stats: { ...r.stats, comments: r.stats.comments + 1 } }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  // Track active item and view
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActiveIndex(first.index);
      const r = first.item as Reel;
      if (r) api.viewReel(r.id);
    }
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handleLike = useCallback((index: number) => {
    setReels((prev) => {
      const next = [...prev];
      const r = next[index];
      const liked = !r.liked;
      next[index] = { ...r, liked, stats: { ...r.stats, likes: r.stats.likes + (liked ? 1 : -1) } };
      api.likeReel(r.id).then((res) => {
        setReels((cur) => cur.map((x) => (x.id === r.id ? { ...x, liked: res.liked, stats: { ...x.stats, likes: res.likes } } : x)));
      }).catch(() => {});
      return next;
    });
  }, []);

  const handleFollow = useCallback((index: number) => {
    setReels((prev) => {
      const creatorId = prev[index].creator.id;
      const target = !prev[index].creator.isFollowing;
      api.followCreator(creatorId).catch(() => {});
      return prev.map((x) => (x.creator.id === creatorId ? { ...x, creator: { ...x.creator, isFollowing: target } } : x));
    });
  }, []);

  const handleSave = useCallback((index: number) => {
    const r = reels[index];
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
          thumbnailUrl: r.creator.avatar || '', category: 'later', progressSec: 0,
        }).catch(() => {});
        showToast('Saved to watchlist');
      }
      return next;
    });
  }, [reels, showToast]);

  const handleSkipReel = useCallback((currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < reels.length) {
      setActiveIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [reels]);

  // Geolocation - Broadcaster retrieves current GPS location and reverse-geocodes it
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

  // Document Picker handler
  const pickVideo = async () => {
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
        setUploadFileName(asset.name);
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
          }
        } else {
          const base64data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setUploadVideoData(base64data);
        }
      }
    } catch (err) {
      console.error('Error picking video:', err);
      alert('Failed to pick video file');
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadTitle.trim() || !uploadVideoData) {
      alert('Title and video file are required');
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
      const newReel = await api.uploadReel(uploadTitle.trim(), uploadDesc.trim(), uploadVideoData, uploadLocation);
      
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanStatus('Approved! SafeGuard check passed successfully.');
      
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setReels((prev) => [newReel, ...prev]);
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadDesc('');
      setUploadVideoData('');
      setUploadFileName('');
      setUploadLocation('');
      showToast('Reel uploaded successfully!');
      setActiveIndex(0);
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
            title: uploadTitle.trim(),
            description: uploadDesc.trim(),
            videoData: uploadVideoData,
            location: uploadLocation || undefined,
          }
        });
      } else {
        alert(err.message || 'Failed to upload reel');
        setShowUploadModal(true);
      }
    } finally {
      setUploading(false);
      setShowScanner(false);
      setScanProgress(0);
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { height, width } = e.nativeEvent.layout;
    if (height && width && (height !== size.h || width !== size.w)) setSize({ h: height, w: width });
  };

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelCard
      reel={item}
      isActive={index === activeIndex && isFocused}
      height={size.h}
      width={size.w}
      saved={savedIds.has(item.id)}
      onLike={() => handleLike(index)}
      onFollow={() => handleFollow(index)}
      onComment={() => handleOpenComments(item)}
      onShare={() => showToast('Share link copied')}
      onSave={() => handleSave(index)}
      onSkip={() => handleSkipReel(index)}
    />
  ), [activeIndex, size, savedIds, handleLike, handleFollow, handleSave, showToast, isFocused, handleSkipReel]);

  const webFlatListStyles = Platform.OS === 'web' ? {
    scrollSnapType: 'y mandatory',
    overflowY: 'scroll',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    height: size.h || '100%',
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
  } as any : {};

  const CellRenderer = useCallback(({ children, style, ...props }: any) => {
    const cellStyle = [
      style,
      Platform.OS === 'web' ? { scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0 } : null
    ];
    return <View style={cellStyle} {...props}>{children}</View>;
  }, []);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {isDesktop && <AppHeader onPressAvatar={() => {}} />}
      <View style={[
        styles.headerRow,
        isDesktop 
          ? { height: 60, paddingTop: 0, marginTop: 78, backgroundColor: 'transparent' }
          : { height: 60 + (insets?.top ?? 0), paddingTop: (insets?.top ?? 0) }
      ]}>
        <Text style={styles.header}>Reels</Text>
        <HoverPressable style={styles.uploadHeaderBtn} onPress={() => setShowUploadModal(true)}>
          <Text style={styles.uploadHeaderBtnText}>＋ Upload Reel</Text>
        </HoverPressable>
      </View>

      {loading && reels.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#fff" /></View>
      ) : error && reels.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errTitle}>Couldn’t load reels</Text>
          <Text style={styles.errMsg}>{error}</Text>
          <Text style={styles.errHint}>Is the API running?</Text>
        </View>
      ) : size.h > 0 ? (
        <FlatList
          ref={flatListRef}
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={size.h}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onEndReached={() => load(false)}
          onEndReachedThreshold={1.2}
          getItemLayout={(_, index) => ({ length: size.h, offset: size.h * index, index })}
          initialNumToRender={3}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          style={webFlatListStyles}
          CellRendererComponent={CellRenderer}
        />
      ) : null}

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.newsModalContentWrapper} showsVerticalScrollIndicator={false}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Upload New Reel</Text>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Give your reel a title..."
              placeholderTextColor={colors.textFaint}
              value={uploadTitle}
              onChangeText={setUploadTitle}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              placeholder="Add description or hashtags..."
              placeholderTextColor={colors.textFaint}
              multiline
              value={uploadDesc}
              onChangeText={setUploadDesc}
            />

             <Text style={styles.inputLabel}>Location</Text>
             <View style={styles.locationInputContainer}>
               <View style={styles.locationRow}>
                 <TextInput
                   style={styles.modalInputLoc}
                   placeholder="Search or enter location (e.g. Guntur, AP)"
                   placeholderTextColor={colors.textFaint}
                   value={uploadLocation}
                   onChangeText={(text) => {
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
                           hovered && { backgroundColor: 'rgba(0, 0, 0, 0.05)' }
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

             <Text style={styles.inputLabel}>Video File</Text>
             <View style={styles.filePickerContainer}>
               <HoverPressable style={styles.fileInputLabel} onPress={pickVideo}>
                 <Text style={styles.fileInputLabelText}>
                   {uploadFileName ? `Selected: ${uploadFileName}` : '📁 Choose Video File'}
                 </Text>
               </HoverPressable>
             </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.submitBtn, (!uploadTitle.trim() || !uploadVideoData) && styles.submitBtnDisabled]}
                onPress={handleUploadSubmit}
                disabled={uploading || !uploadTitle.trim() || !uploadVideoData}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Upload</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>

      {/* Real-time Comments Drawer Modal */}
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
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
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

      <Animated.View
        pointerEvents="none"
        style={[styles.toast, { opacity: toast, transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
      >
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000',
    ...Platform.select({
      web: {
        minHeight: '100%',
        width: '100%',
      }
    }) as any,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  errMsg: { color: colors.textDim, textAlign: 'center', marginBottom: 6 },
  errHint: { color: colors.textFaint, fontSize: 12 },
  
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  header: { color: '#fff', fontSize: 22, fontWeight: '900' },
  uploadHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  uploadHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  toast: {
    position: 'absolute', alignSelf: 'center', bottom: 100,
    backgroundColor: 'rgba(31,156,255,0.9)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
    zIndex: 99,
  },
  toastText: { color: '#fff', fontWeight: '800' },

  // Upload Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)' },
  newsModalContentWrapper: { flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  modalContent: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  inputLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  modalInput: { backgroundColor: '#ffffff', color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 14 },
  filePickerContainer: { marginBottom: 20 },
  htmlFileInput: { display: 'none' },
  fileInputLabel: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  fileInputLabelText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtnText: { color: colors.textDim, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800' },

  modalInputLoc: { backgroundColor: '#ffffff', color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, flex: 1 },
  locationInputContainer: { marginBottom: 14, position: 'relative', zIndex: 100 },
  locationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  gpsBtnInline: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 42, justifyContent: 'center', alignItems: 'center' },
  gpsBtnDisabled: { opacity: 0.5 },
  gpsBtnTextInline: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  suggestionsContainer: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, maxHeight: 150, zIndex: 200, overflow: 'hidden' },
  suggestionsScroll: { maxHeight: 150 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionItemText: { color: colors.text, fontSize: 12 },

  // Drawer / Bottom Sheet Modal Styles
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  drawerCloseZone: { flex: 1 },
  drawerContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  drawerHeader: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dragBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  drawerTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  drawerList: { flex: 1, padding: 16 },
  noCommentsText: { color: colors.textDim, textAlign: 'center', marginVertical: 32, fontSize: 14 },
  commentItem: { flexDirection: 'row', marginBottom: 16 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  commentDetails: { flex: 1, justifyContent: 'center' },
  commentAuthor: { color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 2 },
  commentBody: { color: colors.textDim, fontSize: 13 },
  drawerInputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  drawerInput: { flex: 1, backgroundColor: colors.bg, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
  postButton: { justifyContent: 'center', paddingHorizontal: 16, marginLeft: 8 },
  postButtonText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
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
});
