import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/models.dart';

class AuthProvider extends ChangeNotifier {
  static const String _storageKey = 'nexus.auth.v1';
  static const String _activeProfileKey = 'nexus.activeProfile.v1';

  final ApiClient _apiClient = ApiClient();
  
  bool _loading = true;
  User? _user;
  List<Profile> _profiles = [];
  Profile? _activeProfile;

  bool get loading => _loading;
  User? get user => _user;
  List<Profile> get profiles => _profiles;
  Profile? get activeProfile => _activeProfile;
  bool get isAuthenticated => _user != null;

  AuthProvider() {
    _apiClient.init(onSessionExpired: () => signOut());
    bootstrap();
  }

  // Restore or bootstrap auth session on app launch
  Future<void> bootstrap() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      
      // As per original logic: clear session on startup to redirect to login
      await prefs.remove(_storageKey);
      await prefs.remove(_activeProfileKey);
      
      _apiClient.clearTokens();
    } catch (e) {
      debugPrint('[AuthProvider] Bootstrap failed: $e');
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  // Apply AuthResponse tokens and profile metadata
  Future<void> _applyAuth(AuthResponse auth) async {
    _user = auth.user;
    _profiles = auth.profiles;
    _apiClient.setTokens(accessToken: auth.accessToken, refreshToken: auth.refreshToken);

    final prefs = await SharedPreferences.getInstance();
    
    // Save locally
    final authData = {
      'accessToken': auth.accessToken,
      'refreshToken': auth.refreshToken,
      'user': auth.user.toJson(),
      'profiles': auth.profiles.map((p) => p.toJson()).toList(),
    };
    await prefs.setString(_storageKey, jsonEncode(authData));

    // If there is only one profile, select it immediately
    if (auth.profiles.length == 1) {
      final single = auth.profiles.first;
      _activeProfile = single;
      _apiClient.setActiveProfileId(single.id);
      await prefs.setString(_activeProfileKey, single.id);
    } else {
      _activeProfile = null;
      _apiClient.setActiveProfileId(null);
    }
    notifyListeners();
  }

  // Sign In with email & password
  Future<void> signIn(String email, String password) async {
    final response = await _apiClient.login(email, password);
    await _applyAuth(response);
  }

  // Sign Up / Register
  Future<void> signUp(String email, String password, String displayName) async {
    final response = await _apiClient.register(email, password, displayName);
    await _applyAuth(response);
  }

  // Verification via OTP
  Future<void> signInWithOtp(String phone, String otp) async {
    final response = await _apiClient.verifyOtp(phone, otp);
    await _applyAuth(response);
  }

  // Sign Out / Clear Sessions
  Future<void> signOut() async {
    _user = null;
    _profiles = [];
    _activeProfile = null;
    _apiClient.clearTokens();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    await prefs.remove(_activeProfileKey);
    
    notifyListeners();
  }

  // Select profile
  Future<void> selectProfile(Profile profile) async {
    _activeProfile = profile;
    _apiClient.setActiveProfileId(profile.id);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_activeProfileKey, profile.id);
    notifyListeners();
  }

  // Switch profile back to profiles gate
  Future<void> switchProfile() async {
    _activeProfile = null;
    _apiClient.setActiveProfileId(null);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_activeProfileKey);
    notifyListeners();
  }

  // Refresh Profiles list
  Future<void> refreshProfiles() async {
    try {
      final fresh = await _apiClient.getProfiles();
      _profiles = fresh;
      
      if (_activeProfile != null) {
        final match = fresh.where((p) => p.id == _activeProfile!.id);
        if (match.isNotEmpty) {
          _activeProfile = match.first;
        }
      }

      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw != null) {
        final Map<String, dynamic> authData = jsonDecode(raw);
        authData['profiles'] = fresh.map((p) => p.toJson()).toList();
        await prefs.setString(_storageKey, jsonEncode(authData));
      }
    } catch (e) {
      debugPrint('[AuthProvider] Failed to refresh profiles: $e');
    }
    notifyListeners();
  }
}
