import { API_URL } from '../config';
import type {
  AuthResponse, Movie, NewsItem, Profile, Reel, WatchlistItem,
} from '../types';

type Tokens = { accessToken: string; refreshToken: string };

// Module-level auth state, wired up by AuthContext.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let activeProfileId: string | null = null;
let onExpired: (() => void) | null = null;

export const apiAuth = {
  setTokens(t: Tokens | null) {
    accessToken = t?.accessToken ?? null;
    refreshToken = t?.refreshToken ?? null;
  },
  setActiveProfile(id: string | null) { activeProfileId = id; },
  onExpired(cb: () => void) { onExpired = cb; },
};

async function rawRequest(path: string, init: RequestInit, withProfile: boolean) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (withProfile && activeProfileId) headers['X-Profile-Id'] = activeProfileId;
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const t = (await res.json()) as Tokens;
  accessToken = t.accessToken;
  refreshToken = t.refreshToken;
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, withProfile = true): Promise<T> {
  let res = await rawRequest(path, init, withProfile);
  if (res.status === 401 && refreshToken) {
    const ok = await tryRefresh();
    if (ok) res = await rawRequest(path, init, withProfile);
    else { onExpired?.(); throw new Error('Session expired'); }
  }
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned status ${res.status}. Please check if the API server on your VPS is running (pm2 status).`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  request: <T>(path: string, init?: RequestInit, withProfile?: boolean) =>
    request<T>(path, init, withProfile),
  // auth
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
  register: (email: string, password: string, displayName: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }, false),
  sendOtp: (phone: string) =>
    request<{ success: boolean; message: string; otp?: string }>('/api/auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) }, false),
  verifyOtp: (phone: string, otp: string) =>
    request<AuthResponse>('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }, false),

  // profiles
  getProfiles: () => request<{ profiles: Profile[]; max: number }>('/api/profiles', {}, false),
  getProfilesAll: () => request<{ profiles: Profile[] }>('/api/profiles/all', {}, false),
  createProfile: (body: Partial<Profile>) =>
    request<Profile>('/api/profiles', { method: 'POST', body: JSON.stringify(body) }, false),

  // reels
  getReels: (cursor?: number | null, limit = 8, creatorName?: string) =>
    request<{ data: Reel[]; hasMore: boolean; nextCursor: number | null }>(
      `/api/reels?limit=${limit}${cursor != null ? `&cursor=${cursor}` : ''}${creatorName ? `&creatorName=${encodeURIComponent(creatorName)}` : ''}`,
    ),
  likeReel: (id: string) => request<{ liked: boolean; likes: number }>(`/api/reels/${id}/like`, { method: 'POST' }),
  viewReel: (id: string) => request<{ views: number }>(`/api/reels/${id}/view`, { method: 'POST' }).catch(() => null),
  followCreator: (id: string) => request<{ isFollowing: boolean }>(`/api/creators/${id}/follow`, { method: 'POST' }),

  // movies
  getMovies: (genre?: string) =>
    request<{ data: Movie[]; genres: string[] }>(`/api/movies${genre ? `?genre=${encodeURIComponent(genre)}` : ''}`),

  // news
  getNews: (category?: string, region?: string, district?: string) => {
    let query = '';
    const params: string[] = [];
    if (category && category !== 'All') params.push(`category=${encodeURIComponent(category)}`);
    if (region) params.push(`region=${encodeURIComponent(region)}`);
    if (district && district !== 'All Districts') params.push(`district=${encodeURIComponent(district)}`);
    if (params.length > 0) query = `?${params.join('&')}`;
    return request<{ data: any[]; categories: string[] }>(`/api/news${query}`);
  },
  getTicker: () => request<{ data: { id: string; title: string; source: string }[] }>('/api/news/ticker'),

  // watchlist
  getWatchlist: () => request<{ data: WatchlistItem[]; serverTime: number }>('/api/watchlist'),
  addToWatchlist: (body: Partial<WatchlistItem>) =>
    request<WatchlistItem>('/api/watchlist', { method: 'POST', body: JSON.stringify(body) }),
  removeFromWatchlist: (contentType: string, contentId: string) =>
    request<void>(`/api/watchlist/${contentType}/${contentId}`, { method: 'DELETE' }),
  syncWatchlist: (since: number, changes: Partial<WatchlistItem>[]) =>
    request<{ changes: WatchlistItem[]; serverTime: number }>('/api/watchlist/sync', {
      method: 'POST', body: JSON.stringify({ since, changes }),
    }),

  // recommendations
  getRecommendations: () =>
    request<{ reels: Reel[]; movies: Movie[] }>('/api/recommendations'),

  // comments
  getComments: (reelId: string) =>
    request<{ data: any[] }>(`/api/comments?reelId=${encodeURIComponent(reelId)}`),
  postComment: (reelId: string, body: string) =>
    request<any>(`/api/comments?reelId=${encodeURIComponent(reelId)}`, {
      method: 'POST',
      body: JSON.stringify({ body })
    }),

  // streams
  getStreams: () =>
    request<{ data: any[] }>('/api/streams'),
  startStream: (title: string, category: string, location?: string) =>
    request<any>('/api/live/start', {
      method: 'POST',
      body: JSON.stringify({ title, category, location })
    }),
  stopStream: (id: string) =>
    request<any>('/api/live/end', {
      method: 'POST',
      body: JSON.stringify({ streamId: id })
    }),
  endStream: (streamId: string) =>
    request<any>('/api/live/end', {
      method: 'POST',
      body: JSON.stringify({ streamId })
    }),
  getUserStreams: (userId: string) =>
    request<{ data: any[] }>(`/api/live/user-streams?userId=${userId}&_t=${Date.now()}`),
  getStreamDetails: (id: string) =>
    request<{ data: any }>(`/api/live/stream/${id}?_t=${Date.now()}`),
  updateUserStream: (id: string, body: any) =>
    request<any>(`/api/live/stream/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  deleteUserStream: (id: string) =>
    request<any>(`/api/live/stream/${id}`, { method: 'DELETE' }),
  sendStreamHeartbeat: (id: string) =>
    request<any>(`/api/streams/${id}/heartbeat`, { method: 'POST' }),
  uploadStreamThumbnail: (id: string, imageData: string) =>
    request<{ success: boolean; updated?: boolean; retry?: boolean }>('/api/streams/' + id + '/thumbnail', {
      method: 'POST',
      body: JSON.stringify({ imageData })
    }),
  uploadStreamRecording: (id: string, videoData: string) =>
    request<{ success: boolean; url: string }>('/api/live/stream/' + id + '/recording', {
      method: 'POST',
      body: JSON.stringify({ videoData })
    }),
  sendStreamChatMessage: (id: string, message: string) =>
    request<any>(`/api/streams/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message })
    }),
  getStreamChatMessages: (id: string) =>
    request<{ data: any[] }>(`/api/streams/${id}/chat`),
  sendStreamSignal: (id: string, targetProfileId: string, signal: any) =>
    request<any>(`/api/streams/${id}/signal`, {
      method: 'POST',
      body: JSON.stringify({ targetProfileId, signal })
    }),
  uploadVoiceMessage: (audioData: string) =>
    request<{ audioUrl: string }>('/api/streams/upload-voice', {
      method: 'POST',
      body: JSON.stringify({ audioData })
    }),
  leaveStream: (id: string) =>
    request<any>(`/api/streams/${id}/leave`, { method: 'POST' }),
  uploadReel: (title: string, description: string, videoData: string, location?: string, targetLang?: string, imageData?: string, continueAnyway?: boolean, imageName?: string) =>
    request<Reel>('/api/reels/upload', {
      method: 'POST',
      body: JSON.stringify({ title, description, videoData, location, targetLang, imageData, continueAnyway, imageName })
    }),
  generateReelThumbnails: (videoData: string, videoName?: string, seed?: number) =>
    request<{ options: { id: number; url: string }[]; recommendedId: number; aiReason: string; ratings: number[] }>('/api/reels/generate-thumbnails', {
      method: 'POST',
      body: JSON.stringify({ videoData, videoName, seed })
    }),
  subscribeProfile: (id: string) =>
    request<any>(`/api/profiles/${id}/subscribe`, { method: 'POST' }, false),

  // posts
  getPosts: () => request<{ data: any[] }>('/api/posts'),
  createPost: (content: string, location?: string, imageData?: string, targetLang?: string, continueAnyway?: boolean, imageName?: string) =>
    request<any>('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content, location, imageData, targetLang, continueAnyway, imageName })
    }),
  likePost: (id: string) => request<{ liked: boolean; likes: number }>(`/api/posts/${id}/like`, { method: 'POST' }),

  // news
  createNews: (body: { title: string; summary: string; body: string; category: string; region: string; district: string; location?: string; imageData?: string; imageName?: string; videoData?: string; videoName?: string; targetLang?: string; continueAnyway?: boolean }) =>
    request<any>('/api/news', {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  // Advanced enhancement endpoints
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    }, false),
  getAvatarOptions: () =>
    request<{ categories: Record<string, { name: string; path: string }[]> }>('/api/profiles/avatar-options', {}, false),
  updateProfile: (id: string, body: Partial<Profile>) =>
    request<Profile>(`/api/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }, false),
  getProfileActivity: (id: string) =>
    request<{ comments: any[]; follows: any[]; likedReels: any[]; likedPosts: any[]; watchlist: any[] }>(`/api/profiles/${id}/activity`, {}, false),
  updateUserInfo: (displayName: string) =>
    request<{ success: boolean; displayName: string }>('/api/auth/update-info', {
      method: 'PATCH',
      body: JSON.stringify({ displayName })
    }, false),
  getAdminAnalytics: () =>
    request<{
      metrics: {
        totalUsers: number;
        activeUsers: number;
        premiumSubscribers: number;
        revenue: number;
        newsPublished: number;
        liveStreams: number;
        engagement: { comments: number; reelLikes: number; postLikes: number };
      };
      trendingNewsCategories: { category: string; count: number }[];
      trendingMovieGenres: { category: string; count: number }[];
    }>('/api/admin/analytics', {}),
  getAdminDefaultThumbnails: () =>
    request<{ data: { category: string; filename: string; url: string }[] }>('/api/admin/default-thumbnails', {}),
  updateAdminDefaultThumbnail: (category: string, imageData: string) =>
    request<{ success: boolean; url: string }>('/api/admin/default-thumbnails', {
      method: 'POST',
      body: JSON.stringify({ category, imageData })
    }),
  adminGetUsers: (search?: string) =>
    request<{ data: any[] }>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  adminUpdateUser: (id: string, body: { displayName?: string; role?: string }) =>
    request<any>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  adminDeleteUser: (id: string) =>
    request<any>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  adminResetPassword: (id: string, password: string) =>
    request<any>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password })
    }),
  adminGetUserActivity: (id: string) =>
    request<{ data: any[] }>(`/api/admin/users/${id}/activity`),
  adminCreateAdmin: (body: any) =>
    request<any>('/api/admin/admins', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  adminGetContent: (type: 'news' | 'reels' | 'posts' | 'live-streams') =>
    request<{ data: any[] }>(`/api/admin/content/${type}`),
  adminDeleteContent: (type: string, id: string) =>
    request<any>(`/api/admin/content/${type}/${id}`, { method: 'DELETE' }),
  adminGetReports: () =>
    request<{ data: any[] }>('/api/admin/reports'),
  adminResolveReport: (id: string, action: 'resolve' | 'dismiss') =>
    request<any>(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action })
    }),
  adminGetCategories: () =>
    request<{ data: string[] }>('/api/admin/categories'),
  adminCreateCategory: (category: string) =>
    request<any>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ category })
    }),
  adminDeleteCategory: (name: string) =>
    request<any>(`/api/admin/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  adminGetSettings: () =>
    request<{ data: Record<string, string> }>('/api/admin/settings'),
  adminUpdateSettings: (body: Record<string, string>) =>
    request<any>('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  adminGetAuditLogs: () =>
    request<{ data: any[] }>('/api/admin/security/audit'),
  adminGetBlockedIps: () =>
    request<{ data: any[] }>('/api/admin/security/blocked-ips'),
  adminBlockIp: (ip: string, reason?: string, unblock?: boolean) =>
    request<any>('/api/admin/security/block-ip', {
      method: 'POST',
      body: JSON.stringify({ ip, reason, unblock })
    }),
  adminForceLogout: (userId: string) =>
    request<any>(`/api/admin/security/force-logout/${userId}`, { method: 'POST' }),
  sendAssistantMessage: (message: string, history: any[]) =>
    request<{ reply: string }>('/api/recommendations/assistant', {
      method: 'POST',
      body: JSON.stringify({ message, history })
    }),
  deleteNews: (id: string) => request<void>(`/api/news/${id}`, { method: 'DELETE' }),
  deleteReel: (id: string) => request<void>(`/api/reels/${id}`, { method: 'DELETE' }),
  deletePost: (id: string) => request<void>(`/api/posts/${id}`, { method: 'DELETE' }),
  getNewsArticle: (id: string) => request<any>(`/api/news/${id}`),

  // New modules database endpoints
  getOfficialChannels: () => request<{ data: any[] }>('/api/streams/official-channels'),
  createOfficialChannel: (body: any) => request<any>('/api/streams/official-channels', { method: 'POST', body: JSON.stringify(body) }),
  updateOfficialChannel: (id: string, body: any) => request<any>(`/api/streams/official-channels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOfficialChannel: (id: string) => request<void>(`/api/streams/official-channels/${id}`, { method: 'DELETE' }),

  getStories: () => request<{ data: any[] }>('/api/stories'),
  createStory: (body: { mediaData: string; mediaType: string; content?: string }) => request<any>('/api/stories', { method: 'POST', body: JSON.stringify(body) }),
  viewStory: (id: string) => request<{ views: number }>(`/api/stories/${id}/view`, { method: 'POST' }),
  reactToStory: (id: string, reaction: string) => request<{ reactions: Record<string, number> }>(`/api/stories/${id}/react`, { method: 'POST', body: JSON.stringify({ reaction }) }),
  deleteStory: (id: string) => request<void>(`/api/stories/${id}`, { method: 'DELETE' }),

  getSearchHistory: () => request<{ data: any[] }>('/api/search/history'),
  addSearchHistory: (query: string) => request<any>('/api/search/history', { method: 'POST', body: JSON.stringify({ query }) }),
  deleteSearchHistory: (id: string) => request<void>(`/api/search/history/${id}`, { method: 'DELETE' }),
  clearSearchHistory: () => request<void>('/api/search/history', { method: 'DELETE' }),
  getTrendingSearches: () => request<{ data: string[] }>('/api/search/trending'),

  reportContent: (body: { contentType: string; contentId: string; reason?: string; aiScore?: number }) => request<any>('/api/moderation/report', { method: 'POST', body: JSON.stringify(body) }),
  getModerationReports: () => request<{ data: any[] }>('/api/moderation/reports'),
  updateModerationReport: (id: string, status: string) => request<any>(`/api/moderation/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteModerationReport: (id: string) => request<void>(`/api/moderation/reports/${id}`, { method: 'DELETE' }),

  logAnalyticsEvent: (body: { eventType: string; targetId?: string; metadata?: any }) => request<void>('/api/analytics/event', { method: 'POST', body: JSON.stringify(body) }),
  getAssistantHistory: () => request<{ data: any[] }>('/api/recommendations/assistant/history'),

  // studio & broadcasting
  generateStreamKey: () => request<{ success: boolean; streamKey: string }>('/api/studio/keys', { method: 'POST' }),
  getStreamKey: () => request<{ success: boolean; streamKey: string | null }>('/api/studio/keys'),
  startMasterBroadcast: () => request<{ success: boolean; broadcastId: string }>('/api/studio/broadcast/start', { method: 'POST' }),
  updateMasterLayout: (body: { broadcastId: string; layoutMode?: string; promotedStreams?: string[]; tickerText?: string; showLogo?: boolean; breakingNews?: boolean }) =>
    request<{ success: boolean }>('/api/studio/broadcast/layout', { method: 'POST', body: JSON.stringify(body) }),
  stopMasterBroadcast: (broadcastId: string) =>
    request<{ success: boolean }>('/api/studio/broadcast/stop', { method: 'POST', body: JSON.stringify({ broadcastId }) }),
  getStudioReporters: () => request<{ success: boolean; data: any[] }>('/api/studio/reporters'),
  getCurrentBroadcast: () => request<{ success: boolean; data: any }>('/api/studio/broadcast/current'),
  sendStudioChatMessage: (message: string) => request<{ success: boolean; data: any }>('/api/studio/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  getStudioChatMessages: () => request<{ success: boolean; data: any[] }>('/api/studio/chat'),
  postStreamTranscript: (id: string, text: string, elapsedSecs: number) =>
    request<{ success: boolean }>(`/api/streams/${id}/transcript`, { method: 'POST', body: JSON.stringify({ text, elapsedSecs }) }),
};

export function getEventsUrl(): string {
  return `${API_URL}/api/events?token=${encodeURIComponent(accessToken || '')}&profileId=${encodeURIComponent(activeProfileId || '')}`;
}

