import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LanguageType = 'en' | 'te' | 'hi';

interface LanguageContextProps {
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  t: (text: string) => string;
  translateDynamic: (text: string) => Promise<string>;
  cacheLoaded: boolean;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

// Comprehensive Static UI Localization Dictionary
const TRANSLATION_MAP: Record<string, Record<'te' | 'hi', string>> = {
  // Navigation Sidebar & Bottom Tabs
  "Home": { te: "ఇల్లు", hi: "होम" },
  "Reels": { te: "రీల్స్", hi: "रील्स" },
  "News": { te: "వార్తలు", hi: "समाचार" },
  "Live TV": { te: "లైవ్ టీవీ", hi: "लाइव टीवी" },
  "Live": { te: "ప్రత్యక్ష ప్రసారం", hi: "लाइव" },
  "Profile": { te: "ప్రొఫైల్", hi: "प्रोफ़ाइल" },
  "HOME": { te: "హోమ్", hi: "होम" },
  "REELS": { te: "రీల్స్", hi: "रील्स" },
  "NEWS": { te: "వార్తలు", hi: "समाचार" },
  "LIVE TV": { te: "లైవ్ టీవీ", hi: "लाइव टीवी" },
  "PROFILE": { te: "ప్రొఫైల్", hi: "प्रोफ़ाइल" },
  "STUDIO": { te: "స్టూడియో", hi: "स्टूडियो" },
  "ADMIN": { te: "అడ్మిన్", hi: "एडमिन" },
  "SUPER ADMIN": { te: "సూపర్ అడ్మిన్", hi: "सुपर एडमिन" },
  "LOGOUT": { te: "లాగౌట్", hi: "लॉगआउट" },

  // Header Elements
  "Search news, creators, posts...": { te: "వార్తలు, సృష్టికర్తలు, పోస్ట్‌లను శోధించండి...", hi: "समाचार, निर्माता, पोस्ट खोजें..." },
  "LIVE": { te: "లైవ్", hi: "लाइव" },
  "Delhi": { te: "ఢిల్లీ", hi: "दिल्ली" },
  "No new direct messages.": { te: "కొత్త సందేశాలు లేవు.", hi: "कोई नया सीधा संदेश नहीं।" },
  "All systems operational! No new notifications.": { te: "అన్ని సిస్టమ్‌లు పనిచేస్తున్నాయి! కొత్త నోటిఫికేషన్‌లు లేవు.", hi: "सभी प्रणालियाँ चालू हैं! कोई नया नोटिफिकेशन नहीं।" },
  "Search News, Videos...": { te: "వార్తలు, వీడియోలను శోధించండి...", hi: "समाचार, वीडियो खोजें..." },
  "Search News, Creators, Live TV...": { te: "వార్తలు, లైవ్ టీవీలను శోధించండి...", hi: "समाचार, लाइव टीवी खोजें..." },
  "Search": { te: "శోధించండి", hi: "खोजें" },
  "Select Language": { te: "భాషను ఎంచుకోండి", hi: "भाषा चुनें" },
  "NEXUS APPS": { te: "నెక్సస్ యాప్‌లు", hi: "नेक्सस ऐप्स" },
  "NEXUS News": { te: "నెక్సస్ వార్తలు", hi: "नेक्सस समाचार" },
  "NEXUS Cinema": { te: "నెక్సస్ సినిమా", hi: "नेक्सस सिनेमा" },
  "NEXUS Music": { te: "నెక్సస్ సంగీతం", hi: "नेक्सस संगीत" },
  "NEXUS Sports": { te: "నెక్సస్ క్రీడలు", hi: "नेक्सस खेल" },
  "Recent Searches": { te: "ఇటీవలి శోధనలు", hi: "हाल की खोजें" },
  "Trending Searches": { te: "ట్రెండింగ్ శోధనలు", hi: "ट्रेंडिंग खोजें" },
  "Ask Nexus AI Assistant": { te: "నెక్సస్ AI అసిస్టెంట్‌ని అడగండి", hi: "नेक्सस एआई सहायक से पूछें" },
  "Forecast": { te: "వాతావరణ అంచనా", hi: "पूर्वाभास" },
  "Feels Like": { te: "అనిపిస్తోంది", hi: "महसूस हो रहा है" },
  "Humidity": { te: "తేమ", hi: "आर्द्रता" },
  "Wind Speed": { te: "గాలి వేగం", hi: "हवा की गति" },
  "Pressure": { te: "పీడనం", hi: "दबाव" },
  "Sunrise": { te: "సూర్యోదయం", hi: "सूर्योदय" },
  "Sunset": { te: "సూర్యాస్తమయం", hi: "सूर्यास्त" },
  "Hourly Forecast": { te: "గంటవారీ అంచనా", hi: "प्रति घंटा पूर्वानुमान" },
  "7-Day Forecast": { te: "7-రోజుల అంచనా", hi: "7-दिवसीय पूर्वानुमान" },
  "Saved News": { te: "భద్రపరిచిన వార్తలు", hi: "सहेजे गए समाचार" },
  "Watch Later": { te: "తర్వాత చూడండి", hi: "बाद में देखें" },
  "History": { te: "చరిత్ర", hi: "इतिहास" },
  "Settings": { te: "సెట్టింగ్‌లు", hi: "सेटिंग्स" },

  // Profile Dropdown
  "Followers": { te: "అనుసరించేవాళ్ళు", hi: "फॉलोअर्स" },
  "Following": { te: "అనుసరిస్తున్నారు", hi: "फ़ॉलोइंग" },
  "Posts": { te: "పోస్ట్‌లు", hi: "पोस्ट" },
  "Streams": { te: "స్ట్రీమ్‌లు", hi: "स्ट्रीम" },
  "View Profile": { te: "ప్రొఫైల్ చూడండి", hi: "प्रोफाइल देखें" },
  "Edit Profile & Settings": { te: "ప్రొఫైల్ సవరించండి", hi: "प्रोफ़ाइल संपादित करें" },
  "Saved Posts & Reels": { te: "భద్రపరిచిన పోస్ట్‌లు & రీల్స్", hi: "सहेजे गए पोस्ट और रील्स" },
  "Dark Mode": { te: "డార్క్ మోడ్", hi: "डार्क मोड" },
  "Logout Account": { te: "లాగౌట్", hi: "लॉगआउट" },
  "Logout": { te: "లాగౌట్", hi: "लॉगआउट" },

  // Categories & Subheaders
  "Trending": { te: "ట్రెండింగ్", hi: "ट्रेंडिंग" },
  "Breaking": { te: "బ్రేకింగ్", hi: "ब्रेकिंग" },
  "Politics": { te: "రాజకీయం", hi: "राजनीति" },
  "Business": { te: "వ్యాపారం", hi: "व्यापार" },
  "Technology": { te: "సాంకేతికత", hi: "तकनीक" },
  "Sports": { te: "క్రీడలు", hi: "खेल" },
  "Entertainment": { te: "వినోదం", hi: "मनोरंजन" },
  "Education": { te: "విద్య", hi: "शिक्षा" },
  "Health": { te: "ఆరోగ్యం", hi: "स्वास्थ्य" },
  "World": { te: "ప్రపంచం", hi: "विश्व" },
  "Devotional": { te: "భక్తి", hi: "भक्ति" },
  "International": { te: "అంతర్జాతీయం", hi: "अंतर्राष्ट्रीय" },
  "Fact Check": { te: "నిజ నిర్ధారణ", hi: "फ़ैक्ट चेक" },
  "Opinion": { te: "అభిప్రాయం", hi: "राय" },
  "Temple News": { te: "దేవాలయ వార్తలు", hi: "मंदिर समाचार" },
  "Bhagavad Gita": { te: "భగవద్గీత", hi: "भगवद गीता" },
  "Festivals": { te: "పండుగలు", hi: "त्यौहार" },
  "Meditation": { te: "ధ్యానం", hi: "ध्यान" },
  "AP News": { te: "ఆంధ్రప్రదేశ్ వార్తలు", hi: "आंध्र प्रदेश समाचार" },
  "Telangana News": { te: "తెలంగాణ వార్తలు", hi: "तेलंगाना समाचार" },
  "Delhi / National": { te: "ఢిల్లీ / జాతీయ వార్తలు", hi: "दिल्ली / राष्ट्रीय समाचार" },
  "Trending News": { te: "ట్రెండింగ్ వార్తలు", hi: "ट्रेंडिंग समाचार" },
  "World News": { te: "అంతర్జాతీయ వార్తలు", hi: "विश्व समाचार" },
  "Editor's Picks": { te: "ఎడిటర్స్ ఛాయిస్", hi: "संपादक की पसंद" },
  "Most Viewed": { te: "అత్యధికులు చూసినవి", hi: "सर्वाधिक देखे गए" },
  "Latest Updates": { te: "తాజా అప్‌డేట్‌లు", hi: "नवीनतम अपडेट" },
  "Breaking News Feed": { te: "బ్రేకింగ్ న్యూస్ ఫీడ్", hi: "ब्रेकिंग न्यूज फीड" },
  "Trending on NEXUS": { te: "నెక్సస్‌లో ట్రెండింగ్", hi: "नेक्सस पर ट्रेंडिंग" },
  "More": { te: "మరింత", hi: "अधिक" },
  "+ More": { te: "మరింత", hi: "अधिक" },

  // Feed Cards & Common Actions
  "likes": { te: "లైకులు", hi: "लाइक" },
  "comments": { te: "వ్యాఖ్యలు", hi: "कमेंट" },
  "shares": { te: "షేర్లు", hi: "शेयर" },
  "views": { te: "వీక్షణలు", hi: "व्यूज" },
  "Follow": { te: "అనుసరించు", hi: "फॉलो करें" },
  "Add Your Story": { te: "మీ కథనం", hi: "अपनी कहानी" },
  "Your Story": { te: "మీ కథ", hi: "आपकी कहानी" },
  "Top Stories": { te: "ప్రముఖ కథనాలు", hi: "मुख्य समाचार" },
  "LIVE FEED": { te: "ప్రత్యక్ష ప్రసార ఫీడ్", hi: "लाइव फीड" },
  "Graphic Content Blurred": { te: "సున్నితమైన కంటెంట్ బ్లర్ చేయబడింది", hi: "संवेदनशील सामग्री धुंधली की गई" },
  "Safety Notice:": { te: "భద్రతా నోటీసు:", hi: "सुरक्षा सूचना:" },
  "Upload Another File": { te: "మరో ఫైల్‌ను అప్‌లోడ్ చేయండి", hi: "दूसरी फ़ाइल अपलोड करें" },
  "Continue Anyway": { te: "అయినా కొనసాగించు", hi: "वैसे भी जारी रखें" },
  "SafeGuard Safety Notice": { te: "సేఫ్‌గార్డ్ భద్రతా నోటీసు", hi: "सेफगार्ड सुरक्षा सूचना" },
  "Our AI moderation scan detected potentially sensitive content:": { te: "మా AI మోడరేషన్ స్కాన్ సున్నితమైన కంటెంట్‌ను గుర్తించింది:", hi: "हमारे एआई मॉडरेशन स्कैन ने संभावित रूप से संवेदनशील सामग्री का पता लगाया है:" },
  "View all comments": { te: "అన్ని వ్యాఖ్యలను చూడండి", hi: "सभी टिप्पणियां देखें" },
  "Add a comment...": { te: "వ్యాఖ్యను జోడించండి...", hi: "एक टिप्पणी जोड़ें..." },
  "Cancel": { te: "రద్దు చేయి", hi: "रद्द करें" },
  "Post": { te: "పోస్ట్ చేయి", hi: "पोस्ट करें" },
  "Create Social Post": { te: "పోస్ట్ సృష్టించండి", hi: "सोशल पोस्ट बनाएं" },
  "Content *": { te: "కంటెంట్ *", hi: "सामग्री *" },
  "Location (GPS & Search)": { te: "స్థానం (GPS & శోధన)", hi: "स्थान (जीपीएस और खोज)" },
  "Attach Image": { te: "చిత్రాన్ని జతచేయి", hi: "छवि संलग्न करें" },
  "Target Translation Language": { te: "అనువాద భాష", hi: "अनुवाद भाषा" },
  "None": { te: "ఏదీ లేదు", hi: "कोई नहीं" },
  "NEXUS Movies & Cinema": { te: "నెక్సస్ సినిమాలు & సినిమా", hi: "नेक्सस फिल्में और सिनेमा" },
  "Vibrant Cinema Collection": { te: "సినిమా కలెక్షన్", hi: "वाइब्रेंट सिनेमा संग्रह" },
  "Upcoming Blockbusters": { te: "రాబోయే సినిమాలు", hi: "आगामी ब्लॉकबस्टर" },
  "Featured Movies": { te: "ఫీచర్ చేసిన సినిమాలు", hi: "विशेष रुप से प्रदर्शित फिल्में" },
  "Past Live Sessions": { te: "గత లైవ్ సెషన్లు", hi: "पिछले लाइव सत्र" },
  "Saved Live Recordings": { te: "భద్రపరిచిన లైవ్ రికార్డింగ్‌లు", hi: "सहेजे गए लाइव रिकॉर्डिंग्स" },
  "Archived Live Sessions": { te: "గత లైవ్ రికార్డింగ్‌లు", hi: "संग्रहीत लाइव सत्र" },
  "Add News": { te: "వార్తను జోడించు", hi: "समाचार जोड़ें" },
  "Upload Reel": { te: "రీల్ అప్‌లోడ్ చేయి", hi: "रील अपलोड करें" },
  "Share Update": { te: "అప్‌డేట్ షేర్ చేయి", hi: "अपडेट साझा करें" },
  "Zone District": { te: "జిల్లా జోన్", hi: "जोन जिला" },
  "All Districts": { te: "అన్ని జిల్లాలు", hi: "सभी जिले" },
  "Visakhapatnam": { te: "విశాఖపట్నం", hi: "विशाखापत्तनम" },
  "NTR (Vijayawada)": { te: "ఎన్టీఆర్ (విజయవాడ)", hi: "एनटीआर (विजयवाड़ा)" },
  "Guntur": { te: "గుంటూరు", hi: "गुंटूर" },
  "Tirupati": { te: "తిరుపతి", hi: "तिरुपति" },
  "Sri Potti Sriramulu Nellore": { te: "శ్రీ పొట్టి శ్రీరాములు నెల్లూరు", hi: "श्री पोट्टि श्रीरामुलु नेल्लोर" },
  "Kurnool": { te: "కర్నూలు", hi: "कुरनूल" },
  "YSR Kadapa": { te: "వైఎస్ఆర్ కడప", hi: "वाईएसआर कड़पा" },
  "Anantapur": { te: "అనంతపురం", hi: "अनंतपुर" },
  "Chittoor": { te: "చిత్తూరు", hi: "चित्तूर" },
  "Kakinada": { te: "కాకినాడ", hi: "काकिनाडा" },
  "Eluru": { te: "ఏలూరు", hi: "एलुरु" },
  "Hyderabad": { te: "హైదరాబాద్", hi: "हैदराबाद" },
  "Warangal": { te: "వరంగల్", hi: "वारंगल" },
  "Karimnagar": { te: "కరీంనగర్", hi: "करीमनगर" },
  "Khammam": { te: "ఖమ్మం", hi: "खम्मम" },
  "Nalgonda": { te: "నల్గొండ", hi: "नलगोंडा" },
  "Siddipet": { te: "సిద్దిపేట", hi: "सिद्धिपेट" },
  "New Delhi": { te: "న్యూఢిల్లీ", hi: "नई दिल्ली" },
  "North Delhi": { te: "ఉత్తర ఢిల్లీ", hi: "उत्तर दिल्ली" },
  "South Delhi": { te: "దక్షిణ ఢిల్లీ", hi: "दक्षिण दिल्ली" },
  "West Delhi": { te: "పశ్చిమ ఢిల్లీ", hi: "पश्चिम दिल्ली" },
  "East Delhi": { te: "తూర్పు ఢిల్లీ", hi: "पूर्व दिल्ली" },
  "AP": { te: "ఆంధ్రప్రదేశ్", hi: "आंध्र प्रदेश" },
  "Telangana": { te: "తెలంగాణ", hi: "तेलंगाना" },
  "Delhi/North": { te: "ఢిల్లీ/ఉత్తరం", hi: "दिल्ली/उत्तर" },
  "All": { te: "అన్నీ", hi: "सभी" },
  "Super Admin Dashboard": { te: "సూపర్ అడ్మిన్ డాష్‌బోర్డ్", hi: "सुपर एडमिन डैशबोर्ड" },
  "System Administration Control": { te: "సిస్టమ్ అడ్మినిస్ట్రేషన్ కంట్రోల్", hi: "सिस्टम प्रशासन नियंत्रण" },
  "Dashboard": { te: "డాష్‌బోర్డ్", hi: "डैशबोर्ड" },
  "Top Stories CMS": { te: "టాప్ స్టోరీస్ CMS", hi: "टॉप स्टोरीज सीएमएस" },
  "News Stories": { te: "వార్తా కథనాలు", hi: "समाचार कहानियां" },
  "Bulk Data Replace": { te: "బల్క్ డేటా రీప్లేస్", hi: "थोक डेटा प्रतिस्थापन" },
  "Live TV Channels": { te: "లైవ్ టీవీ ఛానెళ్లు", hi: "लाइव टीवी चैनल" },
  "Reporter Station": { te: "రిపోర్టర్ స్టేషన్", hi: "रिपोर्टर स्टेशन" },
  "User Directory": { te: "యూజర్ డైరెక్టరీ", hi: "उपयोगकर्ता निर्देशिका" },
  "Ads Campaigns": { te: "ప్రకటనల ప్రచారాలు", hi: "विज्ञापन अभियान" },
  "Push Notifications": { te: "పుష్ నోటిఫికేషన్లు", hi: "पुश सूचनाएं" },
  "Media Library": { te: "మీడియా లైబ్రరీ", hi: "मीडिया लाइब्रेरी" },
  "Database Manager": { te: "డేటాబేస్ మేనేజర్", hi: "डेटाबेस प्रबंधक" },
  "Backup & Restore": { te: "బ్యాకప్ & రీస్టోర్", hi: "बैकअप और पुनर्स्थापना" },
  "System Audit Logs": { te: "సిస్టమ్ ఆడిట్ లాగ్‌లు", hi: "सिस्टम ऑडिट लॉग" },
  "Exit Portal": { te: "పోర్టల్ నుండి నిష్క్రమించు", hi: "पोर्टल से बाहर निकलें" },
  "Login": { te: "లాగిన్", hi: "लॉगिन" },
  "Register": { te: "రిజిస్టర్", hi: "पंजीकरण करें" },
  "Sign In": { te: "సైన్ ఇన్ చేయండి", hi: "साइन इन करें" },
  "Sign Up": { te: "సైన్ అప్ చేయండి", hi: "साइन अप करें" },
  "Email Address": { te: "ఇమెయిల్ చిరునామా", hi: "ईमेल पता" },
  "Password": { te: "పాస్‌వర్డ్", hi: "पासवर्ड" },
  "Phone Number": { te: "ఫోన్ నంబర్", hi: "फोन नंबर" },
  "Send OTP": { te: "OTP పంపండి", hi: "ओटीपी भेजें" },
  "Verify OTP": { te: "OTP సరిచూడండి", hi: "ओटीपी सत्यापित करें" },
  "Forgot Password?": { te: "పాస్‌వర్డ్ మర్చిపోయారా?", hi: "पासवर्ड भूल गए?" },
  "Don't have an account?": { te: "ఖాతా లేదా?", hi: "खाता नहीं है?" },
  "Already have an account?": { te: "ఇప్పటికే ఖాతా ఉందా?", hi: "पहले से ही एक खाता है?" },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageType>('en');
  const [dynamicCache, setDynamicCache] = useState<Record<string, string>>({});
  const [cacheLoaded, setCacheLoaded] = useState(false);

  const pendingQueries = useRef<Record<'te' | 'hi', Array<{ text: string; resolve: (val: string) => void }>>>({
    te: [],
    hi: [],
  });
  const batchTimeout = useRef<Record<'te' | 'hi', any>>({
    te: null,
    hi: null,
  });

  useEffect(() => {
    // Load persisted language preference
    AsyncStorage.getItem('NEXUS_PLAY_LANGUAGE').then((saved) => {
      if (saved && (saved === 'en' || saved === 'te' || saved === 'hi')) {
        setLanguageState(saved as LanguageType);
      }
    });

    // Load persisted dynamic translations cache
    AsyncStorage.getItem('NEXUS_PLAY_TRANSLATIONS_CACHE').then((savedCache) => {
      if (savedCache) {
        try {
          setDynamicCache(JSON.parse(savedCache));
        } catch (e) {
          console.warn('Failed to parse dynamic translations cache');
        }
      }
      setCacheLoaded(true);
    }).catch(() => {
      setCacheLoaded(true);
    });
  }, []);

  const setLanguage = (lang: LanguageType) => {
    setLanguageState(lang);
    AsyncStorage.setItem('NEXUS_PLAY_LANGUAGE', lang);
  };

  // Synchronous Static Translation Lookup
  const t = (text: string): string => {
    if (language === 'en') return text;
    
    // Exact match
    if (TRANSLATION_MAP[text]?.[language]) {
      return TRANSLATION_MAP[text][language];
    }

    // Trimmed case-insensitive match
    const trimmed = text.trim();
    const match = Object.keys(TRANSLATION_MAP).find(
      (k) => k.toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (match && TRANSLATION_MAP[match]?.[language]) {
      return TRANSLATION_MAP[match][language];
    }

    return text;
  };

  const processBatch = async (lang: 'te' | 'hi') => {
    const queue = pendingQueries.current[lang];
    pendingQueries.current[lang] = [];
    batchTimeout.current[lang] = null;

    if (queue.length === 0) return;

    const uniqueTexts = Array.from(new Set(queue.map(q => q.text)));
    const targetLangName = lang === 'te' ? 'Telugu' : 'Hindi';

    const apiKey = 'AQ.Ab8RN6JWu4K2TWaCX5pph1GMRr1wByLdwc9JNPoaoDdtBQvtpQ';
    let response: Response | null = null;
    let attempt = 0;
    const maxAttempts = 6;
    let backoffDelay = 2500; // Start with 2.5s delay

    while (attempt < maxAttempts) {
      try {
        console.log(`[Translate Batch] Translating batch of ${uniqueTexts.length} items to ${targetLangName} (Attempt ${attempt + 1}/${maxAttempts})`);
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a professional translator. Translate this JSON array of strings into ${targetLangName}. Return ONLY a raw JSON array of translated strings in the exact same order, with no markdown backticks, no comments, no formatting, and no explanation.\nJSON to translate: ${JSON.stringify(uniqueTexts)}`
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (response.status === 429) {
          console.warn(`[Translate Batch] 429 Rate Limit hit. Retrying in ${backoffDelay}ms...`);
          await new Promise(r => setTimeout(r, backoffDelay));
          attempt++;
          backoffDelay *= 2;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Batch translation status: ${response.status}`);
        }

        break; // Success, break out of loop
      } catch (err) {
        console.error(`[Translate Batch] Attempt ${attempt + 1} failed:`, err);
        attempt++;
        if (attempt >= maxAttempts) {
          queue.forEach((item) => item.resolve(item.text));
          return;
        }
        await new Promise(r => setTimeout(r, backoffDelay));
        backoffDelay *= 2;
      }
    }

    if (!response) {
      queue.forEach((item) => item.resolve(item.text));
      return;
    }

    try {
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
      
      const cleanedText = rawText.replace(/```json|```/gi, '').trim();
      const translations: string[] = JSON.parse(cleanedText);

      const translationMap: Record<string, string> = {};
      uniqueTexts.forEach((original, index) => {
        translationMap[original] = translations[index] || original;
      });

      setDynamicCache((prev) => {
        const next = { ...prev };
        uniqueTexts.forEach((original) => {
          const cacheKey = `${lang}:${original}`;
          next[cacheKey] = translationMap[original];
        });
        AsyncStorage.setItem('NEXUS_PLAY_TRANSLATIONS_CACHE', JSON.stringify(next));
        return next;
      });

      queue.forEach((item) => {
        const resolved = translationMap[item.text] || item.text;
        item.resolve(resolved);
      });

    } catch (err) {
      console.error(`[Translate Batch] Error translating batch to ${targetLangName}:`, err);
      queue.forEach((item) => {
        item.resolve(item.text);
      });
    }
  };

  const scheduleBatch = (lang: 'te' | 'hi', text: string, resolve: (val: string) => void) => {
    pendingQueries.current[lang].push({ text, resolve });
    
    if (!batchTimeout.current[lang]) {
      batchTimeout.current[lang] = setTimeout(() => {
        processBatch(lang);
      }, 600);
    }
  };

  // Asynchronous Dynamic Translation via Gemini API
  const translateDynamic = async (text: string): Promise<string> => {
    if (!text || !text.trim() || language === 'en') return text;
    const trimmed = text.trim();
    const cacheKey = `${language}:${trimmed}`;

    if (dynamicCache[cacheKey]) {
      return dynamicCache[cacheKey];
    }

    return new Promise<string>((resolve) => {
      scheduleBatch(language, trimmed, resolve);
    });
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateDynamic, cacheLoaded }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// React component helper for inline UI text & dynamic content translation
export function Translate({ text }: { text: string }) {
  const { language, t, translateDynamic, cacheLoaded } = useLanguage();
  const staticVal = t(text);
  const [asyncVal, setAsyncVal] = useState<string | null>(null);

  useEffect(() => {
    setAsyncVal(null);
    if (!cacheLoaded || language === 'en' || staticVal !== text) return;

    let active = true;
    translateDynamic(text).then((res) => {
      if (active) {
        setAsyncVal(res);
      }
    });

    return () => {
      active = false;
    };
  }, [text, language, cacheLoaded, staticVal]);

  if (!text) return null;
  const displayVal = language === 'en' ? text : (staticVal !== text ? staticVal : (asyncVal || text));
  return <>{displayVal}</>;
}
