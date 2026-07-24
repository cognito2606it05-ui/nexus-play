// components/ReelsComponent/ReelsScreen.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FlatList, View, Dimensions, StyleSheet, ActivityIndicator } from 'react-native';
import { useSharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import Gesture from 'react-native-gesture-handler';
import ReelCard from './ReelCard';
import { fetchReels, trackReelView } from '../../api/reelsApi';

interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  creator: {
    id: string;
    name: string;
    avatar: string;
    isFollowing: boolean;
  };
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  liked: boolean;
  duration: number;
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const ReelsScreen: React.FC = () => {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);

  // Load reels on mount
  useEffect(() => {
    loadReels();
  }, []);

  // Track reel view when index changes
  useEffect(() => {
    if (reels.length > 0 && reels[currentIndex]) {
      trackReelView(reels[currentIndex].id).catch(console.error);
    }
  }, [currentIndex, reels]);

  const loadReels = async (cursor = '') => {
    try {
      const response = await fetchReels({ cursor, limit: 10 });
      
      if (cursor === '') {
        setReels(response.data);
      } else {
        setReels(prev => [...prev, ...response.data]);
      }
      
      setHasMore(response.hasMore);
      setLoading(false);
    } catch (error) {
      console.error('Error loading reels:', error);
      setLoading(false);
    }
  };

  const handleEndReached = useCallback(() => {
    if (hasMore && reels.length > 0) {
      const lastReel = reels[reels.length - 1];
      loadReels(lastReel.id);
    }
  }, [hasMore, reels]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const renderReel = useCallback(
    ({ item, index }: { item: Reel; index: number }) => (
      <View style={styles.reelContainer}>
        <ReelCard
          reel={item}
          isActive={index === currentIndex}
          onLike={() => handleLike(index)}
          onFollow={() => handleFollow(index)}
          onComment={() => handleComment(index)}
          onShare={() => handleShare(index)}
        />
      </View>
    ),
    [currentIndex]
  );

  const handleLike = useCallback((index: number) => {
    setReels(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        liked: !updated[index].liked,
        stats: {
          ...updated[index].stats,
          likes: updated[index].liked
            ? updated[index].stats.likes - 1
            : updated[index].stats.likes + 1,
        },
      };
      return updated;
    });
  }, []);

  const handleFollow = useCallback((index: number) => {
    setReels(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        creator: {
          ...updated[index].creator,
          isFollowing: !updated[index].creator.isFollowing,
        },
      };
      return updated;
    });
  }, []);

  const handleComment = useCallback((index: number) => {
    // Navigate to comments screen
    console.log('Open comments for:', reels[index].id);
  }, [reels]);

  const handleShare = useCallback((index: number) => {
    // Share functionality
    console.log('Share reel:', reels[index].id);
  }, [reels]);

  if (loading && reels.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={reels}
        renderItem={renderReel}
        keyExtractor={item => item.id}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : null
        }
        removeClippedSubviews={true}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        scrollEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  reelContainer: {
    height: SCREEN_HEIGHT,
    width: SCREEN_WIDTH,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  footerLoader: {
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ReelsScreen;

---

// components/ReelsComponent/ReelCard.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Dimensions,
} from 'react-native';
import { Video } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LottieView from 'lottie-react-native';
import Icon from 'react-native-vector-icons/Feather';

interface ReelCardProps {
  reel: any;
  isActive: boolean;
  onLike: () => void;
  onFollow: () => void;
  onComment: () => void;
  onShare: () => void;
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  isActive,
  onLike,
  onFollow,
  onComment,
  onShare,
}) => {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(isActive);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const likeScale = useSharedValue(0);
  const likeOpacity = useSharedValue(0);

  // Play/pause video based on visibility
  useEffect(() => {
    if (isActive && videoRef.current) {
      videoRef.current.playAsync();
      setIsPlaying(true);
    } else if (!isActive && videoRef.current) {
      videoRef.current.pauseAsync();
      setIsPlaying(false);
    }
  }, [isActive]);

  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
    opacity: likeOpacity.value,
  }));

  const handleDoubleTap = () => {
    if (!reel.liked) {
      likeScale.value = withSpring(0.3, { damping: 2 });
      likeOpacity.value = withSpring(1);

      setTimeout(() => {
        likeScale.value = withSpring(1.5, { damping: 2 });
      }, 100);

      setTimeout(() => {
        likeOpacity.value = withSpring(0, { damping: 2 });
      }, 500);

      onLike();
    }
  };

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      // Toggle play/pause on single tap
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      handleDoubleTap();
    });

  const gesture = Gesture.Simultaneous(singleTap, doubleTap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        {/* Video Player */}
        <Video
          ref={videoRef}
          source={{ uri: reel.videoUrl }}
          style={styles.video}
          rate={1.0}
          volume={1.0}
          isMuted={false}
          resizeMode="cover"
          shouldPlay={isActive}
          isLooping
          onError={(error) => console.error('Video error:', error)}
        />

        {/* Gradient Overlay */}
        <View style={styles.gradientOverlay} />

        {/* Double-tap Like Animation */}
        {showLikeAnimation && (
          <Animated.View style={[styles.likeAnimation, likeAnimatedStyle]}>
            <Icon name="heart" size={60} color="#fff" />
          </Animated.View>
        )}

        {/* Creator Info */}
        <View style={styles.creatorSection}>
          <Image
            source={{ uri: reel.creator.avatar }}
            style={styles.avatar}
          />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName}>{reel.creator.name}</Text>
            <Text style={styles.creatorBio}>@{reel.creator.name.toLowerCase()}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.followButton,
              reel.creator.isFollowing && styles.followingButton,
            ]}
            onPress={onFollow}
          >
            <Text style={styles.followButtonText}>
              {reel.creator.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Reel Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{reel.title}</Text>
        </View>

        {/* Right-side Actions */}
        <View style={styles.actionsContainer}>
          {/* Like */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onLike}
          >
            <Icon
              name={reel.liked ? 'heart' : 'heart'}
              size={28}
              color={reel.liked ? '#ff3b30' : '#fff'}
              fill={reel.liked ? '#ff3b30' : 'none'}
            />
            <Text style={styles.actionLabel}>
              {reel.stats.likes > 1000
                ? `${(reel.stats.likes / 1000).toFixed(1)}K`
                : reel.stats.likes}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onComment}
          >
            <Icon name="message-circle" size={28} color="#fff" />
            <Text style={styles.actionLabel}>
              {reel.stats.comments > 1000
                ? `${(reel.stats.comments / 1000).toFixed(1)}K`
                : reel.stats.comments}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onShare}
          >
            <Icon name="share-2" size={28} color="#fff" />
            <Text style={styles.actionLabel}>
              {reel.stats.shares > 1000
                ? `${(reel.stats.shares / 1000).toFixed(1)}K`
                : reel.stats.shares}
            </Text>
          </TouchableOpacity>

          {/* More Options */}
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="more-vertical" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progress,
              {
                // Animated based on video progress
                width: '45%', // Will be animated based on playback position
              },
            ]}
          />
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    background:
      'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)',
  },
  likeAnimation: {
    position: 'absolute',
    top: SCREEN_HEIGHT / 2 - 30,
    left: SCREEN_WIDTH / 2 - 30,
    width: 60,
    height: 60,
    zIndex: 100,
  },
  creatorSection: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    right: 70,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  creatorBio: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  followingButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: '#fff',
  },
  followButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  titleSection: {
    position: 'absolute',
    bottom: 40,
    left: 12,
    right: 70,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  actionsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 80,
    alignItems: 'center',
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 24,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progress: {
    height: 2,
    backgroundColor: '#fff',
  },
});

export default ReelCard;

---

// api/reelsApi.ts
import axios from 'axios';
import { API_BASE_URL } from '../config/env';

interface FetchReelsParams {
  cursor?: string;
  limit?: number;
  category?: string;
}

interface ReelsResponse {
  data: Reel[];
  hasMore: boolean;
  nextCursor: string;
}

export const fetchReels = async (
  params: FetchReelsParams
): Promise<ReelsResponse> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/reels`, {
      params: {
        limit: params.limit || 10,
        cursor: params.cursor,
        category: params.category,
      },
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching reels:', error);
    throw error;
  }
};

export const likeReel = async (reelId: string): Promise<void> => {
  try {
    await axios.post(
      `${API_BASE_URL}/api/reels/${reelId}/like`,
      {},
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );
  } catch (error) {
    console.error('Error liking reel:', error);
    throw error;
  }
};

export const trackReelView = async (reelId: string): Promise<void> => {
  try {
    await axios.post(
      `${API_BASE_URL}/api/reels/${reelId}/view`,
      {},
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );
  } catch (error) {
    console.error('Error tracking reel view:', error);
  }
};

export const followCreator = async (creatorId: string): Promise<void> => {
  try {
    await axios.post(
      `${API_BASE_URL}/api/creators/${creatorId}/follow`,
      {},
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );
  } catch (error) {
    console.error('Error following creator:', error);
    throw error;
  }
};

// Helper function to get stored token
const getToken = (): string => {
  // Implementation depends on your storage solution
  // e.g., AsyncStorage, Keychain, etc.
  return '';
};

---

// Configuration for video playback optimization
export const VIDEO_CONFIG = {
  // Bitrate thresholds (in kbps)
  BITRATES: {
    LOW: 480,      // WiFi with low signal / 4G
    MEDIUM: 720,   // 4G/5G
    HIGH: 1080,    // 5G or WiFi
    ULTRA: 2160,   // High-speed WiFi/5G
  },

  // Buffer sizes (in seconds)
  BUFFER_SIZE: {
    INITIAL: 2,    // Before starting playback
    REBUFFER: 1,   // When buffering during playback
    MAX: 10,       // Maximum buffer
  },

  // Adaptive bitrate configuration
  ABR: {
    enabled: true,
    autoSwitchUpThreshold: 0.8,  // 80% buffer
    autoSwitchDownThreshold: 0.3, // 30% buffer
  },

  // Network detection
  NETWORK_TYPES: {
    UNKNOWN: 'unknown',
    WIFI: 'wifi',
    CELLULAR_2G: '2g',
    CELLULAR_3G: '3g',
    CELLULAR_4G: '4g',
    CELLULAR_5G: '5g',
  },
};
