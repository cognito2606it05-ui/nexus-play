export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  isFollowing: boolean;
}

export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  duration: number;
  creator: Creator;
  stats: { likes: number; comments: number; shares: number; views: number };
  liked: boolean;
  needsBlur?: boolean;
  blurReason?: string | null;
  blurRegions?: any[];
  ocrText?: string | null;
  translatedText?: string | null;
  neutralizedText?: string | null;
}

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  color: string | null;
  isKids: boolean;
  subscribed?: boolean;
  bio?: string;
  website?: string;
  location?: string;
  joinDate?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  profiles: Profile[];
}

export interface Movie {
  id: string;
  title: string;
  year: number;
  genre: string;
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  videoUrl: string | null;
  description: string;
  duration: number;
  is_upcoming?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  source: string;
  isBreaking: boolean;
  imageUrl: string;
  readMinutes: number;
  publishedAt: string;
  videoUrl?: string | null;
  region?: string | null;
  state?: string | null;
  district?: string | null;
  city?: string | null;
  location?: string | null;
  subcategory?: string | null;
  language?: string;
  isFeatured?: boolean;
  priority?: number;
  publishStatus?: string;
  updatedAt?: string | null;
  likes?: number;
  shares?: number;
  views?: number;
  comments?: number;
  reporter?: string;
  thumbnail?: string;
  video?: string | null;
  needsBlur?: boolean;
  blurReason?: string | null;
  blurRegions?: any[];
  ocrText?: string | null;
  translatedText?: string | null;
  neutralizedText?: string | null;
}

export interface WatchlistItem {
  id: string;
  contentType: string;
  contentId: string;
  title: string | null;
  thumbnailUrl: string | null;
  category: string;
  progressSec: number;
  lastModified: number;
  deleted: boolean;
}
