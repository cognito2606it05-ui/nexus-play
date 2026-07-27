import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

const Map<String, Map<String, String>> translationMap = {
  "Home": { "te": "ఇల్లు", "hi": "होम" },
  "Reels": { "te": "రీల్స్", "hi": "రీల్స్" },
  "News": { "te": "వార్తలు", "hi": "समाचार" },
  "Live TV": { "te": "లైవ్ టీవీ", "hi": "लाइव टीवी" },
  "Live": { "te": "ప్రత్యక్ష ప్రసారం", "hi": "लाइव" },
  "Profile": { "te": "ప్రొఫైల్", "hi": "प्रोफ़ाइल" },
  "Search news, creators, posts...": { "te": "వార్తలు, సృష్టికర్తలు, పోస్ట్‌లను శోధించండి...", "hi": "समाचार, निर्माता, पोस्ट खोजें..." },
  "Delhi": { "te": "ఢిల్లీ", "hi": "दिल्ली" },
  "No new direct messages.": { "te": "కొత్త సందేశాలు లేవు.", "hi": "कोई नया सीधा संदेश नहीं।" },
  "All systems operational! No new notifications.": { "te": "అన్ని సిస్టమ్‌లు పనిచేస్తున్నాయి! కొత్త నోటిఫికేషన్‌లు లేవు.", "hi": "सभी प्रणालियाँ चालू हैं! कोई नया नोटिफिकेशन नहीं।" },
  "Followers": { "te": "అనుసరించేవాళ్ళు", "hi": "फॉलोअर्स" },
  "Following": { "te": "అనుసరిస్తున్నారు", "hi": "फ़ॉलोइंग" },
  "Posts": { "te": "పోస్ట్‌లు", "hi": "पोस्ट" },
  "Streams": { "te": "స్ట్రీమ్‌లు", "hi": "स्ट्रीम" },
  "View Profile": { "te": "ప్రొఫైల్ చూడండి", "hi": "प्रोफाइल देखें" },
  "Edit Profile & Settings": { "te": "ప్రొఫైల్ సవరించండి", "hi": "प्रोफ़ाइल संपादित करें" },
  "Saved Posts & Reels": { "te": "భద్రపరిచిన పోస్ట్‌లు & రీల్స్", "hi": "सहेजे गए पोस्ट और रील्स" },
  "Dark Mode": { "te": "డార్క్ మోడ్", "hi": "डार्क मोड" },
  "Logout Account": { "te": "లాగౌట్", "hi": "लॉगआउट" },
  "Logout": { "te": "లాగౌట్", "hi": "लॉगआउट" },
  "Trending": { "te": "ట్రెండింగ్", "hi": "ट्रेंडिंग" },
  "Breaking": { "te": "బ్రేకింగ్", "hi": "ब्रेकिंग" },
  "Politics": { "te": "రాజకీయం", "hi": "राजनीति" },
  "Business": { "te": "వ్యాపారం", "hi": "व्यापार" },
  "Technology": { "te": "సాంకేతికత", "hi": "तकनीक" },
  "Sports": { "te": "క్రీడలు", "hi": "खेल" },
  "Entertainment": { "te": "వినోదం", "hi": "मनोरंजन" },
  "Education": { "te": "విద్య", "hi": "शिक्षा" },
  "Health": { "te": "ఆరోగ్యం", "hi": "स्वास्थ्य" },
  "World": { "te": "ప్రపంచం", "hi": "विश्व" },
  "likes": { "te": "లైకులు", "hi": "लाइक" },
  "comments": { "te": "వ్యాఖ్యలు", "hi": "कमेंट" },
  "shares": { "te": "షేర్లు", "hi": "शेयर" },
  "views": { "te": "వీక్షణలు", "hi": "व्यूज" },
  "Follow": { "te": "అనుసరించు", "hi": "फॉलो करें" },
  "Add Your Story": { "te": "మీ కథనం", "hi": "अपनी कहानी" },
  "Your Story": { "te": "మీ కథ", "hi": "आपकी कहानी" },
  "Top Stories": { "te": "ప్రముఖ కథనాలు", "hi": "मुख्य समाचार" },
  "LIVE FEED": { "te": "ప్రత్యక్ష ప్రసార ఫీడ్", "hi": "लाइव फीड" },
  "Graphic Content Blurred": { "te": "సున్నితమైన కంటెంట్ బ్లర్ చేయబడింది", "hi": "संवेदनशील सामग्री धुंधली की गई" },
  "Upload Another File": { "te": "మరో ఫైల్‌ను అప్‌లోడ్ చేయండి", "hi": "दूसरी फ़ाइल अपलोड करें" },
  "Continue Anyway": { "te": "అయినా కొనసాగించు", "hi": "वैसे भी जारी रखें" },
  "SafeGuard Safety Notice": { "te": "సేఫ్‌గార్డ్ భద్రతా నోటీసు", "hi": "सेफगार्ड सुरक्षा सूचना" },
  "View all comments": { "te": "అన్ని వ్యాఖ్యలను చూడండి", "hi": "सभी टिप्पणियां देखें" },
  "Add a comment...": { "te": "వ్యాఖ్యను జోడించండి...", "hi": "एक टिप्पणी जोड़ें..." },
  "Cancel": { "te": "రద్దు చేయి", "hi": "रद्द करें" },
  "Post": { "te": "పోస్ట్ చేయి", "hi": "पोस्ट करें" },
  "Zone District": { "te": "జిల్లా జోన్", "hi": "जोन जिला" },
  "All Districts": { "te": "అన్ని జిల్లాలు", "hi": "सभी जिले" },
  "Visakhapatnam": { "te": "విశాఖపట్నం", "hi": "विशाखापत्तनम" },
  "Guntur": { "te": "గుంటూరు", "hi": "गुंंटूर" },
  "Tirupati": { "te": "తిరుపతి", "hi": "तिरुपति" },
  "Kurnool": { "te": "కర్నూలు", "hi": "कुरनूल" },
  "Hyderabad": { "te": "హైదరాబాద్", "hi": "हैदराबाद" },
  "New Delhi": { "te": "న్యూఢిల్లీ", "hi": "नई दिल्ली" },
  "AP": { "te": "ఆంధ్రప్రదేశ్", "hi": "आंध्र प्रदेश" },
  "Telangana": { "te": "తెలంగాణ", "hi": "तेलंगाना" },
  "All": { "te": "అన్నీ", "hi": "सभी" }
};

class PendingTranslationQuery {
  final String text;
  final Completer<String> completer;

  PendingTranslationQuery(this.text, this.completer);
}

class LanguageProvider extends ChangeNotifier {
  static const String _langKey = 'NEXUS_PLAY_LANGUAGE';
  static const String _cacheKey = 'NEXUS_PLAY_TRANSLATIONS_CACHE';
  static const String _geminiApiKey = 'AQ.Ab8RN6JWu4K2TWaCX5pph1GMRr1wByLdwc9JNPoaoDdtBQvtpQ';

  String _language = 'en';
  Map<String, String> _dynamicCache = {};
  bool _cacheLoaded = false;

  final Map<String, List<PendingTranslationQuery>> _pendingQueries = {
    'te': [],
    'hi': [],
  };
  final Map<String, Timer?> _batchTimers = {
    'te': null,
    'hi': null,
  };

  String get language => _language;
  bool get cacheLoaded => _cacheLoaded;

  LanguageProvider() {
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _language = prefs.getString(_langKey) ?? 'en';
      
      final cacheRaw = prefs.getString(_cacheKey);
      if (cacheRaw != null) {
        _dynamicCache = Map<String, String>.from(jsonDecode(cacheRaw));
      }
    } catch (_) {}
    _cacheLoaded = true;
    notifyListeners();
  }

  Future<void> setLanguage(String lang) async {
    _language = lang;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_langKey, lang);
    } catch (_) {}
  }

  // Synchronous static translations dictionary lookup
  String translateStatic(String text) {
    if (_language == 'en') return text;

    // Exact match lookup
    if (translationMap[text]?[_language] != null) {
      return translationMap[text]![_language]!;
    }

    // Trimmed case-insensitive fallback lookup
    final cleanText = text.trim().toLowerCase();
    for (final entry in translationMap.entries) {
      if (entry.key.trim().toLowerCase() == cleanText) {
        if (entry.value[_language] != null) {
          return entry.value[_language]!;
        }
      }
    }
    return text;
  }

  // Asynchronous Dynamic translation via Gemini model
  Future<String> translateDynamic(String text) async {
    if (text.isEmpty || _language == 'en') return text;

    final trimmed = text.trim();
    final cacheKey = '$_language:$trimmed';

    if (_dynamicCache.containsKey(cacheKey)) {
      return _dynamicCache[cacheKey]!;
    }

    final completer = Completer<String>();
    _scheduleBatch(_language, trimmed, completer);
    return completer.future;
  }

  void _scheduleBatch(String lang, String text, Completer<String> completer) {
    if (lang != 'te' && lang != 'hi') {
      completer.complete(text);
      return;
    }

    _pendingQueries[lang]!.add(PendingTranslationQuery(text, completer));

    _batchTimers[lang]?.cancel();
    _batchTimers[lang] = Timer(const Duration(milliseconds: 600), () {
      _processBatch(lang);
    });
  }

  Future<void> _processBatch(String lang) async {
    final queue = List<PendingTranslationQuery>.from(_pendingQueries[lang]!);
    _pendingQueries[lang]!.clear();
    _batchTimers[lang] = null;

    if (queue.isEmpty) return;

    final uniqueTexts = queue.map((q) => q.text).toSet().toList();
    final targetLangName = lang == 'te' ? 'Telugu' : 'Hindi';

    Dio dio = Dio();
    Response? response;
    int attempt = 0;
    const maxAttempts = 6;
    int backoffDelay = 2500;

    while (attempt < maxAttempts) {
      try {
        response = await dio.post(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$_geminiApiKey',
          data: {
            'contents': [
              {
                'parts': [
                  {
                    'text': 'You are a professional translator. Translate this JSON array of strings into $targetLangName. Return ONLY a raw JSON array of translated strings in the exact same order, with no markdown backticks, no comments, no formatting, and no explanation.\nJSON to translate: ${jsonEncode(uniqueTexts)}'
                  }
                ]
              }
            ],
            'generationConfig': {
              'responseMimeType': 'application/json',
            }
          },
        );

        if (response.statusCode == 429) {
          await Future.delayed(Duration(milliseconds: backoffDelay));
          attempt++;
          backoffDelay *= 2;
          continue;
        }

        if (response.statusCode == 200) {
          break;
        }
      } catch (e) {
        attempt++;
        if (attempt >= maxAttempts) {
          for (final item in queue) {
            item.completer.complete(item.text);
          }
          return;
        }
        await Future.delayed(Duration(milliseconds: backoffDelay));
        backoffDelay *= 2;
      }
    }

    if (response == null || response.statusCode != 200) {
      for (final item in queue) {
        item.completer.complete(item.text);
      }
      return;
    }

    try {
      final rawText = response.data['candidates']?[0]?['content']?['parts']?[0]?['text']?.toString().trim() ?? '[]';
      final cleanedText = rawText.replaceAll(RegExp(r'```json|```'), '').trim();
      final List<dynamic> translations = jsonDecode(cleanedText);

      final translationMap = <String, String>{};
      for (int i = 0; i < uniqueTexts.length; i++) {
        if (i < translations.length) {
          translationMap[uniqueTexts[i]] = translations[i].toString();
        } else {
          translationMap[uniqueTexts[i]] = uniqueTexts[i];
        }
      }

      // Save to cache & state
      for (final original in uniqueTexts) {
        final cacheKey = '$lang:$original';
        _dynamicCache[cacheKey] = translationMap[original]!;
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(_dynamicCache));

      // Resolve completers
      for (final item in queue) {
        item.completer.complete(translationMap[item.text] ?? item.text);
      }
      notifyListeners();
    } catch (e) {
      debugPrint('[LanguageProvider] Failed to parse batch translations: $e');
      for (final item in queue) {
        item.completer.complete(item.text);
      }
    }
  }
}
