import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeColors {
  final Color bg;
  final Color surface;
  final Color surfaceAlt;
  final Color border;
  final Color text;
  final Color textDim;
  final Color textFaint;
  final Color primary;
  final Color accent;
  final Color like;
  final Color breaking;
  final Color success;
  final Color warning;
  final Color error;
  final Color placeholder;
  final Color cardBg;
  final Color textInverse;
  final Color headerBg;

  const ThemeColors({
    required this.bg,
    required this.surface,
    required this.surfaceAlt,
    required this.border,
    required this.text,
    required this.textDim,
    required this.textFaint,
    required this.primary,
    required this.accent,
    required this.like,
    required this.breaking,
    required this.success,
    required this.warning,
    required this.error,
    required this.placeholder,
    required this.cardBg,
    required this.textInverse,
    required this.headerBg,
  });
}

const lightColors = ThemeColors(
  bg: Color(0xFFFFFFFF),
  surface: Color(0xFFF8F9FA),
  surfaceAlt: Color(0xFFE9ECEF),
  border: Color(0xFFDEE2E6),
  text: Color(0xFF000000),
  textDim: Color(0xFF333333),
  textFaint: Color(0x80000000),
  primary: Color(0xFF0D47A1),
  accent: Color(0xFFD32F2F),
  like: Color(0xFFD32F2F),
  breaking: Color(0xFFD32F2F),
  success: Color(0xFF2E7D32),
  warning: Color(0xFFF57C00),
  error: Color(0xFFD32F2F),
  placeholder: Color(0x66000000),
  cardBg: Color(0xFFFFFFFF),
  textInverse: Color(0xFFFFFFFF),
  headerBg: Color(0xD9FFFFFF),
);

const darkColors = ThemeColors(
  bg: Color(0xFF0F172A),
  surface: Color(0xFF1E293B),
  surfaceAlt: Color(0xFF334155),
  border: Color(0xFF475569),
  text: Color(0xFFF8FAFC),
  textDim: Color(0xFF94A3B8),
  textFaint: Color(0x66F8FAFC),
  primary: Color(0xFF3B82F6),
  accent: Color(0xFFEF4444),
  like: Color(0xFFEF4444),
  breaking: Color(0xFFEF4444),
  success: Color(0xFF10B981),
  warning: Color(0xFFF59E0B),
  error: Color(0xFFEF4444),
  placeholder: Color(0x66F8FAFC),
  cardBg: Color(0xFF1E293B),
  textInverse: Color(0xFF0F172A),
  headerBg: Color(0xD90F172A),
);

class ThemeProvider extends ChangeNotifier {
  static const String _storageKey = 'nexus.theme.mode';

  ThemeMode _themeMode = ThemeMode.light;

  ThemeMode get themeMode => _themeMode;
  ThemeColors get colors => _themeMode == ThemeMode.light ? lightColors : darkColors;
  bool get isDark => _themeMode == ThemeMode.dark;

  ThemeProvider() {
    _loadSavedTheme();
  }

  Future<void> _loadSavedTheme() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final mode = prefs.getString(_storageKey);
      if (mode == 'dark') {
        _themeMode = ThemeMode.dark;
      } else {
        _themeMode = ThemeMode.light;
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggleTheme() async {
    _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, _themeMode == ThemeMode.dark ? 'dark' : 'light');
    } catch (_) {}
  }
}
