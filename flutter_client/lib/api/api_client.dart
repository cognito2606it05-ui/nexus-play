import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'models.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final Dio _dio = Dio();
  
  String? _accessToken;
  String? _refreshToken;
  String? _activeProfileId;
  VoidCallback? _onSessionExpired;

  // Initialize Dio configurations
  void init({VoidCallback? onSessionExpired}) {
    _onSessionExpired = onSessionExpired;

    _dio.options.baseUrl = _getApiBaseUrl();
    _dio.options.connectTimeout = const Duration(seconds: 15);
    _dio.options.receiveTimeout = const Duration(seconds: 15);

    // Add JWT Token & Profile Header Interceptor
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_accessToken != null) {
            options.headers['Authorization'] = 'Bearer $_accessToken';
          }
          // Do not send profile ID headers for Auth/Profile setup routes
          final path = options.path;
          final skipProfile = path.startsWith('/api/auth/') || path.startsWith('/api/profiles');
          if (!skipProfile && _activeProfileId != null) {
            options.headers['X-Profile-Id'] = _activeProfileId;
          }
          options.headers['Content-Type'] = 'application/json';
          return handler.next(options);
        },
        onError: (err, handler) async {
          // Attempt automatic token refresh on 401 Unauthorized
          if (err.response?.statusCode == 401 && _refreshToken != null) {
            final isRefreshed = await _tryTokenRefresh();
            if (isRefreshed) {
              // Retry the original failed request with updated headers
              final options = err.requestOptions;
              options.headers['Authorization'] = 'Bearer $_accessToken';
              try {
                final response = await _dio.fetch(options);
                return handler.resolve(response);
              } on DioException catch (retryErr) {
                return handler.next(retryErr);
              }
            } else {
              _onSessionExpired?.call();
            }
          }
          return handler.next(err);
        },
      ),
    );
  }

  // Set auth state
  void setTokens({required String accessToken, required String refreshToken}) {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  void clearTokens() {
    _accessToken = null;
    _refreshToken = null;
    _activeProfileId = null;
  }

  void setActiveProfileId(String? profileId) {
    _activeProfileId = profileId;
  }

  String? get activeProfileId => _activeProfileId;
  String? get accessToken => _accessToken;

  // Dynamic API base URL resolver
  String _getApiBaseUrl() {
    // If running in development Web, point to port 9001 of the current host
    if (kIsWeb) {
      final baseUri = Uri.base;
      return '${baseUri.scheme}://${baseUri.host}:9001';
    }
    // Standard android emulator loopback
    return 'http://10.0.2.2:9001';
  }

  // Refresh tokens
  Future<bool> _tryTokenRefresh() async {
    try {
      final response = await Dio().post(
        '${_getApiBaseUrl()}/api/auth/refresh',
        data: {'refreshToken': _refreshToken},
      );
      if (response.statusCode == 200) {
        final data = response.data;
        _accessToken = data['accessToken']?.toString();
        _refreshToken = data['refreshToken']?.toString();
        return true;
      }
    } catch (e) {
      debugPrint('[ApiClient] Token refresh failed: $e');
    }
    return false;
  }

  // SSE Events stream path generator
  String getEventsUrl() {
    final token = Uri.encodeComponent(_accessToken ?? '');
    final profile = Uri.encodeComponent(_activeProfileId ?? '');
    return '${_getApiBaseUrl()}/api/events?token=$token&profileId=$profile';
  }

  // --- API Routes implementations ---

  // Auth
  Future<AuthResponse> login(String email, String password) async {
    final response = await _dio.post('/api/auth/login', data: {
      'email': email,
      'password': password,
    });
    final res = AuthResponse.fromJson(response.data as Map<String, dynamic>);
    setTokens(accessToken: res.accessToken, refreshToken: res.refreshToken);
    return res;
  }

  Future<AuthResponse> register(String email, String password, String displayName) async {
    final response = await _dio.post('/api/auth/register', data: {
      'email': email,
      'password': password,
      'displayName': displayName,
    });
    final res = AuthResponse.fromJson(response.data as Map<String, dynamic>);
    setTokens(accessToken: res.accessToken, refreshToken: res.refreshToken);
    return res;
  }

  Future<Map<String, dynamic>> sendOtp(String phone) async {
    final response = await _dio.post('/api/auth/send-otp', data: {'phone': phone});
    return response.data as Map<String, dynamic>;
  }

  Future<AuthResponse> verifyOtp(String phone, String otp) async {
    final response = await _dio.post('/api/auth/verify-otp', data: {
      'phone': phone,
      'otp': otp,
    });
    final res = AuthResponse.fromJson(response.data as Map<String, dynamic>);
    setTokens(accessToken: res.accessToken, refreshToken: res.refreshToken);
    return res;
  }

  // Profiles
  Future<List<Profile>> getProfiles() async {
    final response = await _dio.get('/api/profiles');
    final list = response.data['profiles'] as List<dynamic>? ?? [];
    return list.map((p) => Profile.fromJson(p as Map<String, dynamic>)).toList();
  }

  Future<Profile> createProfile(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/profiles', data: body);
    return Profile.fromJson(response.data as Map<String, dynamic>);
  }

  // Reels
  Future<Map<String, dynamic>> getReels({int? cursor, int limit = 8, String? creatorName}) async {
    String path = '/api/reels?limit=$limit';
    if (cursor != null) path += '&cursor=$cursor';
    if (creatorName != null) path += '&creatorName=${Uri.encodeComponent(creatorName)}';

    final response = await _dio.get(path);
    final list = response.data['data'] as List<dynamic>? ?? [];
    return {
      'data': list.map((r) => Reel.fromJson(r as Map<String, dynamic>)).toList(),
      'hasMore': response.data['hasMore'] == true,
      'nextCursor': response.data['nextCursor'],
    };
  }

  Future<Map<String, dynamic>> likeReel(String id) async {
    final response = await _dio.post('/api/reels/$id/like');
    return response.data as Map<String, dynamic>;
  }

  Future<void> viewReel(String id) async {
    try {
      await _dio.post('/api/reels/$id/view');
    } catch (_) {}
  }

  Future<Map<String, dynamic>> followCreator(String id) async {
    final response = await _dio.post('/api/creators/$id/follow');
    return response.data as Map<String, dynamic>;
  }

  // Movies
  Future<Map<String, dynamic>> getMovies({String? genre}) async {
    final path = genre != null ? '/api/movies?genre=${Uri.encodeComponent(genre)}' : '/api/movies';
    final response = await _dio.get(path);
    final list = response.data['data'] as List<dynamic>? ?? [];
    final genresList = (response.data['genres'] as List<dynamic>? ?? []).map((g) => g.toString()).toList();
    return {
      'data': list.map((m) => Movie.fromJson(m as Map<String, dynamic>)).toList(),
      'genres': genresList,
    };
  }

  // News
  Future<Map<String, dynamic>> getNews({String? category, String? region, String? district}) async {
    final params = <String>[];
    if (category != null && category != 'All') params.add('category=${Uri.encodeComponent(category)}');
    if (region != null) params.add('region=${Uri.encodeComponent(region)}');
    if (district != null && district != 'All Districts') params.add('district=${Uri.encodeComponent(district)}');

    final query = params.isNotEmpty ? '?${params.join('&')}' : '';
    final response = await _dio.get('/api/news$query');
    final list = response.data['data'] as List<dynamic>? ?? [];
    final categoriesList = (response.data['categories'] as List<dynamic>? ?? []).map((c) => c.toString()).toList();
    return {
      'data': list.map((n) => NewsItem.fromJson(n as Map<String, dynamic>)).toList(),
      'categories': categoriesList,
    };
  }

  Future<List<dynamic>> getTicker() async {
    final response = await _dio.get('/api/news/ticker');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  // Watchlist
  Future<List<WatchlistItem>> getWatchlist() async {
    final response = await _dio.get('/api/watchlist');
    final list = response.data['data'] as List<dynamic>? ?? [];
    return list.map((w) => WatchlistItem.fromJson(w as Map<String, dynamic>)).toList();
  }

  Future<WatchlistItem> addToWatchlist(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/watchlist', data: body);
    return WatchlistItem.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> removeFromWatchlist(String contentType, String contentId) async {
    await _dio.delete('/api/watchlist/$contentType/$contentId');
  }

  // Recommendations
  Future<Map<String, dynamic>> getRecommendations() async {
    final response = await _dio.get('/api/recommendations');
    final reels = response.data['reels'] as List<dynamic>? ?? [];
    final movies = response.data['movies'] as List<dynamic>? ?? [];
    return {
      'reels': reels.map((r) => Reel.fromJson(r as Map<String, dynamic>)).toList(),
      'movies': movies.map((m) => Movie.fromJson(m as Map<String, dynamic>)).toList(),
    };
  }

  // Comments
  Future<List<dynamic>> getComments(String reelId) async {
    final response = await _dio.get('/api/comments?reelId=${Uri.encodeComponent(reelId)}');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<dynamic> postComment(String reelId, String body) async {
    final response = await _dio.post(
      '/api/comments?reelId=${Uri.encodeComponent(reelId)}',
      data: {'body': body},
    );
    return response.data;
  }

  // Streams
  Future<List<dynamic>> getStreams() async {
    final response = await _dio.get('/api/streams');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<dynamic> startStream(String title, String category, {String? location}) async {
    final map = {
      'title': title,
      'category': category,
    };
    if (location != null) map['location'] = location;
    final response = await _dio.post('/api/live/start', data: map);
    return response.data;
  }

  Future<dynamic> stopStream(String id) async {
    final response = await _dio.post('/api/live/end', data: {'streamId': id});
    return response.data;
  }

  Future<List<dynamic>> getUserStreams(String userId) async {
    final response = await _dio.get('/api/live/user-streams?userId=$userId&_t=${DateTime.now().millisecondsSinceEpoch}');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<void> sendStreamHeartbeat(String id) async {
    await _dio.post('/api/streams/$id/heartbeat');
  }

  // Other utilities
  Future<Map<String, dynamic>> sendAssistantMessage(String message, List<dynamic> history) async {
    final response = await _dio.post('/api/recommendations/assistant', data: {
      'message': message,
      'history': history,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> subscribeProfile(String profileId) async {
    await _dio.post('/api/profiles/$profileId/subscribe');
  }
}
