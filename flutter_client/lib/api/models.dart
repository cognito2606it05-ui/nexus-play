class Creator {
  final String id;
  final String name;
  final String handle;
  final String? avatar;
  final bool isFollowing;

  Creator({
    required this.id,
    required this.name,
    required this.handle,
    this.avatar,
    required this.isFollowing,
  });

  factory Creator.fromJson(Map<String, dynamic> json) {
    return Creator(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      handle: json['handle']?.toString() ?? '',
      avatar: json['avatar']?.toString(),
      isFollowing: json['isFollowing'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'handle': handle,
    'avatar': avatar,
    'isFollowing': isFollowing,
  };
}

class Reel {
  final String id;
  final String videoUrl;
  final String? thumbnailUrl;
  final String title;
  final String description;
  final int duration;
  final Creator creator;
  final Map<String, int> stats;
  final bool liked;
  final bool needsBlur;
  final String? blurReason;
  final List<dynamic>? blurRegions;
  final String? ocrText;
  final String? translatedText;
  final String? neutralizedText;

  Reel({
    required this.id,
    required this.videoUrl,
    this.thumbnailUrl,
    required this.title,
    required this.description,
    required this.duration,
    required this.creator,
    required this.stats,
    required this.liked,
    this.needsBlur = false,
    this.blurReason,
    this.blurRegions,
    this.ocrText,
    this.translatedText,
    this.neutralizedText,
  });

  factory Reel.fromJson(Map<String, dynamic> json) {
    final statsMap = json['stats'] as Map<String, dynamic>? ?? {};
    return Reel(
      id: json['id']?.toString() ?? '',
      videoUrl: json['videoUrl']?.toString() ?? '',
      thumbnailUrl: json['thumbnailUrl']?.toString(),
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      duration: int.tryParse(json['duration']?.toString() ?? '') ?? 0,
      creator: Creator.fromJson(json['creator'] as Map<String, dynamic>? ?? {}),
      stats: statsMap.map((key, value) => MapEntry(key, int.tryParse(value.toString()) ?? 0)),
      liked: json['liked'] == true,
      needsBlur: json['needsBlur'] == true,
      blurReason: json['blurReason']?.toString(),
      blurRegions: json['blurRegions'] as List<dynamic>?,
      ocrText: json['ocrText']?.toString(),
      translatedText: json['translatedText']?.toString(),
      neutralizedText: json['neutralizedText']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'videoUrl': videoUrl,
    'thumbnailUrl': thumbnailUrl,
    'title': title,
    'description': description,
    'duration': duration,
    'creator': creator.toJson(),
    'stats': stats,
    'liked': liked,
    'needsBlur': needsBlur,
    'blurReason': blurReason,
    'blurRegions': blurRegions,
    'ocrText': ocrText,
    'translatedText': translatedText,
    'neutralizedText': neutralizedText,
  };
}

class Profile {
  final String id;
  final String name;
  final String? avatarUrl;
  final String? color;
  final bool isKids;
  final bool subscribed;
  final String? bio;
  final String? website;
  final String? location;
  final String? joinDate;

  Profile({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.color,
    required this.isKids,
    this.subscribed = false,
    this.bio,
    this.website,
    this.location,
    this.joinDate,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      avatarUrl: json['avatarUrl']?.toString(),
      color: json['color']?.toString(),
      isKids: json['isKids'] == true,
      subscribed: json['subscribed'] == true,
      bio: json['bio']?.toString(),
      website: json['website']?.toString(),
      location: json['location']?.toString(),
      joinDate: json['joinDate']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'avatarUrl': avatarUrl,
    'color': color,
    'isKids': isKids,
    'subscribed': subscribed,
    'bio': bio,
    'website': website,
    'location': location,
    'joinDate': joinDate,
  };
}

class User {
  final String id;
  final String email;
  final String displayName;
  final String? role;

  User({
    required this.id,
    required this.email,
    required this.displayName,
    this.role,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      role: json['role']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'displayName': displayName,
    'role': role,
  };
}

class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final User user;
  final List<Profile> profiles;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.profiles,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['accessToken']?.toString() ?? '',
      refreshToken: json['refreshToken']?.toString() ?? '',
      user: User.fromJson(json['user'] as Map<String, dynamic>? ?? {}),
      profiles: (json['profiles'] as List<dynamic>? ?? [])
          .map((p) => Profile.fromJson(p as Map<String, dynamic>))
          .toList(),
    );
  }
}

class Movie {
  final String id;
  final String title;
  final int year;
  final String genre;
  final double rating;
  final String posterUrl;
  final String backdropUrl;
  final String? videoUrl;
  final String description;
  final int duration;
  final int? isUpcoming;

  Movie({
    required this.id,
    required this.title,
    required this.year,
    required this.genre,
    required this.rating,
    required this.posterUrl,
    required this.backdropUrl,
    this.videoUrl,
    required this.description,
    required this.duration,
    this.isUpcoming,
  });

  factory Movie.fromJson(Map<String, dynamic> json) {
    return Movie(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      year: int.tryParse(json['year']?.toString() ?? '') ?? 0,
      genre: json['genre']?.toString() ?? '',
      rating: double.tryParse(json['rating']?.toString() ?? '') ?? 0.0,
      posterUrl: json['posterUrl']?.toString() ?? '',
      backdropUrl: json['backdropUrl']?.toString() ?? '',
      videoUrl: json['videoUrl']?.toString(),
      description: json['description']?.toString() ?? '',
      duration: int.tryParse(json['duration']?.toString() ?? '') ?? 0,
      isUpcoming: int.tryParse(json['is_upcoming']?.toString() ?? ''),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'year': year,
    'genre': genre,
    'rating': rating,
    'posterUrl': posterUrl,
    'backdropUrl': backdropUrl,
    'videoUrl': videoUrl,
    'description': description,
    'duration': duration,
    'is_upcoming': isUpcoming,
  };
}

class NewsItem {
  final String id;
  final String title;
  final String summary;
  final String body;
  final String category;
  final String source;
  final bool isBreaking;
  final String imageUrl;
  final int readMinutes;
  final String publishedAt;
  final String? videoUrl;
  final String? region;
  final String? district;
  final String? location;
  final bool needsBlur;
  final String? blurReason;
  final List<dynamic>? blurRegions;
  final String? ocrText;
  final String? translatedText;
  final String? neutralizedText;

  NewsItem({
    required this.id,
    required this.title,
    required this.summary,
    required this.body,
    required this.category,
    required this.source,
    required this.isBreaking,
    required this.imageUrl,
    required this.readMinutes,
    required this.publishedAt,
    this.videoUrl,
    this.region,
    this.district,
    this.location,
    this.needsBlur = false,
    this.blurReason,
    this.blurRegions,
    this.ocrText,
    this.translatedText,
    this.neutralizedText,
  });

  factory NewsItem.fromJson(Map<String, dynamic> json) {
    return NewsItem(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      summary: json['summary']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      category: json['category']?.toString() ?? 'General',
      source: json['source']?.toString() ?? 'NEXUS Network',
      isBreaking: json['isBreaking'] == true || json['is_breaking'] == 1,
      imageUrl: json['imageUrl']?.toString() ?? '',
      readMinutes: int.tryParse(json['readMinutes']?.toString() ?? '') ?? 5,
      publishedAt: json['publishedAt']?.toString() ?? json['createdAt']?.toString() ?? '',
      videoUrl: json['videoUrl']?.toString(),
      region: json['region']?.toString(),
      district: json['district']?.toString(),
      location: json['location']?.toString(),
      needsBlur: json['needsBlur'] == true,
      blurReason: json['blurReason']?.toString(),
      blurRegions: json['blurRegions'] as List<dynamic>?,
      ocrText: json['ocrText']?.toString(),
      translatedText: json['translatedText']?.toString(),
      neutralizedText: json['neutralizedText']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'summary': summary,
    'body': body,
    'category': category,
    'source': source,
    'isBreaking': isBreaking,
    'imageUrl': imageUrl,
    'readMinutes': readMinutes,
    'publishedAt': publishedAt,
    'videoUrl': videoUrl,
    'region': region,
    'district': district,
    'location': location,
    'needsBlur': needsBlur,
    'blurReason': blurReason,
    'blurRegions': blurRegions,
    'ocrText': ocrText,
    'translatedText': translatedText,
    'neutralizedText': neutralizedText,
  };
}

class WatchlistItem {
  final String id;
  final String contentType;
  final String contentId;
  final String? title;
  final String? thumbnailUrl;
  final String category;
  final int progressSec;
  final int lastModified;
  final bool deleted;

  WatchlistItem({
    required this.id,
    required this.contentType,
    required this.contentId,
    this.title,
    this.thumbnailUrl,
    required this.category,
    required this.progressSec,
    required this.lastModified,
    required this.deleted,
  });

  factory WatchlistItem.fromJson(Map<String, dynamic> json) {
    return WatchlistItem(
      id: json['id']?.toString() ?? '',
      contentType: json['contentType']?.toString() ?? '',
      contentId: json['contentId']?.toString() ?? '',
      title: json['title']?.toString(),
      thumbnailUrl: json['thumbnailUrl']?.toString(),
      category: json['category']?.toString() ?? 'later',
      progressSec: int.tryParse(json['progressSec']?.toString() ?? '') ?? 0,
      lastModified: int.tryParse(json['lastModified']?.toString() ?? '') ?? 0,
      deleted: json['deleted'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'contentType': contentType,
    'contentId': contentId,
    'title': title,
    'thumbnailUrl': thumbnailUrl,
    'category': category,
    'progressSec': progressSec,
    'lastModified': lastModified,
    'deleted': deleted,
  };
}
