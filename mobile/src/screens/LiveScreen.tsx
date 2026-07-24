import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
  Dimensions,
  Animated,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { HoverPressable } from '../components/HoverPressable';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../state/ThemeContext';
import { AppHeader } from '../components/AppHeader';
import { api, getEventsUrl } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { API_URL } from '../config';

const { width, height } = Dimensions.get('window');

// Fallback TV channels HLS/MP4 streams
const HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const WEB_FALLBACK = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const LIVE_SRC = Platform.OS === 'web' ? WEB_FALLBACK : HLS_URL;


const CATEGORIES = ['News', 'Tech', 'Sports', 'Movies', 'Gaming', 'Music', 'Education', 'Devotional', 'General'];

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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

// Dictionary mapping for dynamic English -> Indian languages translations
const TRANSLATION_DICTIONARY: Record<string, { te: string; hi: string; ta: string; ml: string; kn: string; bn: string; mr: string }> = {
  "hello": { te: "నమస్కారం (Namaskaram)", hi: "नमस्ते (Namaste)", ta: "வணக்கம் (Vanakkam)", ml: "ഹലോ (Hello)", kn: "ನಮಸ್ಕಾರ (Namaskara)", bn: "নমস্কার (Nomoshkar)", mr: "नमस्कार (Namaskar)" },
  "welcome": { te: "సుస్వాగతం (Suswagatham)", hi: "स्वागत है (Swagat)", ta: "வரவேற்பு (Varaveppu)", ml: "സ്വാഗതം (Swagatham)", kn: "ಸ್ವಾಗತ (Swagata)", bn: "স্বাগতম (Shagotom)", mr: "स्वागत आहे (Swagat)" },
  "live": { te: "ప్రత్యక్ష ప్రసారం", hi: "लाइव", ta: "நேரடி", ml: "തത്സമയം", kn: "ನೇರ ಪ್ರಸಾರ", bn: "লাইভ", mr: "थेट" },
  "stream": { te: "ప్రసారం", hi: "प्रसारण", ta: "ஒளிபரப்பு", ml: "സ്ട്രീം", kn: "ಪ್ರಸಾರ", bn: "সম্প্রচার", mr: "प्रवाह" },
  "news": { te: "వార్తలు", hi: "समाचार", ta: "செய்திகள்", ml: "വാർത്തകൾ", kn: "ಸುದ್ದಿ", bn: "খবর", mr: "बातमी" },
  "movies": { te: "సినిమాలు", hi: "फिल्में", ta: "திரைப்படங்கள்", ml: "സിനിമകൾ", kn: "ಚಲನಚಿತ್ರಗಳು", bn: "চলচ্চিত্র", mr: "चित्रपट" },
  "sports": { te: "క్రీడలు", hi: "खेल", ta: "விளையாட்டு", ml: "കായിക", kn: "ಕ್ರೀಡೆಗಳು", bn: "খেলাধুলা", mr: "क्रीडा" },
  "devotional": { te: "భక్తి", hi: "भक्ति", ta: "பக்தி", ml: "ഭക്തിഗാനം", kn: "ಭಕ್ತಿ", bn: "ভক্তিগীতি", mr: "भक्ती" },
  "happy": { te: "సంతోషం", hi: "खुश", ta: "மகிழ்ச்சி", ml: "സന്തോഷം", kn: "ಸಂತೋಷ", bn: "খুশি", mr: "आनंदी" },
  "sad": { te: "బాధ", hi: "दुखी", ta: "சோகம்", ml: "സങ്കടം", kn: "ದುಃಖ", bn: "দুঃখিত", mr: "दुःखी" },
  "thank": { te: "ధన్యవాదాలు", hi: "धन्यवाद", ta: "நன்றி", ml: "നന്ദി", kn: "ಧನ್ಯವಾದ", bn: "ধন্যবাদ", mr: "धन्यवाद" },
  "you": { te: "మీకు", hi: "आप", ta: "உங்களுக்கு", ml: "നിങ്ങൾക്ക്", kn: "ನಿಮಗೆ", bn: "আপনাকে", mr: "तुम्हाला" },
  "love": { te: "ప్రేమ", hi: "प्यार", ta: "அன்பு", ml: "സ്നേഹം", kn: "ಪ್ರೀತಿ", bn: "ভালোবাসা", mr: "प्रेम" },
  "great": { te: "అద్భుతం", hi: "महान", ta: "சிறந்தது", ml: "വളരെ നല്ലത്", kn: "ಉತ್ತಮ", bn: "দারুণ", mr: "उत्कृष्ट" },
  "amazing": { te: "అద్భుతంగా", hi: "अद्भुत", ta: "அற்புதமானது", ml: "അത്ഭുതകരം", kn: "ಅದ್ಭುತ", bn: "অসাধারণ", mr: "अद्भुत" }
};

// Preset phrases for high-fidelity simulation in English, Telugu, Hindi, Tamil, Malayalam, Kannada, Bengali, and Marathi
const PHRASES = [
  {
    en: "Hello and welcome to my live stream today!",
    te: "నమస్కారం మరియు ఈరోజు నా ప్రత్యక్ష ప్రసారానికి సుస్వాగతం!",
    hi: "नमस्ते और आज मेरे लाइव स्ट्रीम में आपका स्वागत है!",
    ta: "வணக்கம் மற்றும் இன்று எனது நேரடி ஒளிபரப்பிற்கு உங்களை வரவேற்கிறேன்!",
    ml: "ഹലോ, ഇന്ന് എന്റെ ലൈവ് സ്ട്രീമിലേക്ക് സ്വാഗതം!",
    kn: "ಹಲೋ ಮತ್ತು ಇಂದು ನನ್ನ ನೇರ ಪ್ರಸಾರಕ್ಕೆ ಸ್ವಾಗત!",
    bn: "হ্যালো এবং আজ আমার লাইভ স্ট্রিমে আপনাদের স্বাগত জানাই!",
    mr: "नमस्कार आणि आज माझ्या थेट प्रवाहात तुमचे स्वागत आहे!"
  },
  {
    en: "Today we are live with devotional session.",
    te: "ఈరోజు మనం భక్తిపూర్వక సెషన్‌తో ప్రత్యక్ష ప్రసారంలో ఉన్నాము.",
    hi: "आज हम भक्ति सत्र के साथ लाइव हैं।",
    ta: "இன்று நாங்கள் பக்தி அமர்வுடன் நேரலையில் உள்ளோம்.",
    ml: "ഇന്ന് ഞങ്ങൾ ഭക്തിനിർഭരമായ ചടങ്ങുമായി തത്സമയമുണ്ട്.",
    kn: "ಇಂದು ನಾವು ಭಕ್ತಿ ಸೆಷನ್‌ನೊಂದಿಗೆ ನೇರ ಪ್ರಸಾರದಲ್ಲಿದ್ದೇವೆ.",
    bn: "আজ আমরা ভক্তিপূর্ণ অনুষ্ঠানের সাথে লাইভ আছি।",
    mr: "आज आपण भक्ती सत्रासह थेट प्रक्षेपण करत आहोत."
  },
  {
    en: "NEXUS Play is the best personalized entertainment platform.",
    te: "నెక్సస్ ప్లే అత్యుత్తమ వ్యక్తిగతీకరించిన వినోద వేదిక.",
    hi: "नेक्सस प्ले सबसे अच्छा व्यक्तिगत मनोरंजन मंच है।",
    ta: "நெக்ஸஸ் ப்ளே சிறந்த தனிப்பயனாக்கப்பட்ட பொழுதுபோக்கு தளமாகும்.",
    ml: "നെക്സസ് പ്ലേ മികച്ച വ്യക്തിഗതമാക്കിയ വിനോദ പ്ലാറ്റ്‌ഫോമാണ്.",
    kn: "ನೆಕ್ಸಸ್ ಪ್ಲೇ ಅತ್ಯುತ್ಥಮ ವೈಯಕ್ತಿಕಗೊಳಿಸಿದ ಮನರಂಜನಾ ವೇದಿಕೆಯಾಗಿದೆ.",
    bn: "নেক্সাস প্লে হলো সেরা ব্যক্তিগতকৃত বিনোদন প্ল্যাটফর্ম।",
    mr: "नेक्सस प्ले हे सर्वोत्तम वैयक्तिकृत मनोरंजन व्यासपीठ आहे."
  },
  {
    en: "I am happy to see you all in the comments flow.",
    te: "కామెంట్ల ప్రవాహంలో మిమ్మల్ని అందరినీ చూడటం నాకు సంతోషంగా ఉంది.",
    hi: "टिप्पणियों के प्रवाह में आप सभी को देखकर मुझे खुशी हो रही है।"
  },
  {
    en: "Thank you for watching and supporting our channel!",
    te: "మా ఛానెల్‌ని వీక్షించినందుకు మరియు మద్దతు ఇచ్చినందుకు ధన్యవాదాలు!",
    hi: "हमारे चैनल को देखने और समर्थन करने के लिए धन्यवाद!"
  }
];

function WebRTCVideo({ stream, muted, mirrored }: { stream: MediaStream | null; muted: boolean; mirrored?: boolean }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const videoRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(muted);

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Auto-play muted fallback logic
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error: any) => {
          console.warn("Autoplay blocked by browser. Retrying muted:", error);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch((playError: any) => {
              console.error("Muted autoplay also failed:", playError);
            });
          }
        });
      }
    }
  }, [stream]);

  if (Platform.OS === 'web' && stream) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirrored ? 'scaleX(-1)' : 'none',
        }}
      />
    );
  }

  return (
    <View style={styles.nativeFallbackContainer}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.nativeFallbackText}>Active WebRTC Live Feed...</Text>
    </View>
  );
}

// Separate component for TV channels / fallback movies
function FallbackPlayerView({ videoUrl }: { videoUrl: string }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = Platform.OS === 'web';
    p.play();
  });
  return <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />;
}

function TVChannelPlayer({ uri }: { uri: string }) {
  if (Platform.OS === 'web' && (uri.includes('youtube.com') || uri.includes('youtu.be'))) {
    let videoId = '';
    if (uri.includes('youtu.be/')) {
      videoId = uri.split('youtu.be/')[1]?.split('?')[0];
    } else if (uri.includes('v=')) {
      videoId = uri.split('v=')[1]?.split('&')[0];
    } else if (uri.includes('embed/')) {
      videoId = uri.split('embed/')[1]?.split('?')[0];
    } else if (uri.includes('live/')) {
      videoId = uri.split('live/')[1]?.split('?')[0];
    }
    return (
      <View style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&rel=0&modestbranding=1`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 'none', width: '100%', height: '100%', backgroundColor: '#000' }}
        />
        {/* Top Title/Share Block Overlay to prevent YouTube redirect */}
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 50, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
        {/* Bottom Right YouTube Logo Block Overlay to prevent YouTube redirect */}
        <Pressable
          style={{ position: 'absolute', bottom: 0, right: 0, width: 85, height: 40, backgroundColor: 'transparent' }}
          onPress={(e) => { e.stopPropagation(); }}
        />
      </View>
    );
  }

  // Fallback for native
  return <FallbackPlayerView videoUrl={uri.includes('http') && !uri.includes('youtube') ? uri : LIVE_SRC} />;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function VoicePlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const audio = new Audio(url);
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (event: any) => {
    if (!audioRef.current || duration === 0) return;
    const { width, left } = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - left;
    const newTime = (clickX / width) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10 }}>
        <Text style={{ color: '#fff', fontSize: 12 }}>🔊 Voice Note (Native App)</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, width: 240, gap: 10 }}>
      <Pressable onPress={togglePlay} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Text style={{ color: '#fff', fontSize: 10 }}>{isPlaying ? '⏸️' : '▶️'}</Text>
      </Pressable>
      
      <View style={{ flex: 1 }}>
        <Pressable onPress={handleSeek} style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
          <View style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, height: '100%', backgroundColor: '#3B82F6' }} />
        </Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{formatTime(currentTime)}</Text>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{formatTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function LiveScreen({ route }: { route?: any }) {
  const { user, activeProfile, refreshProfiles, selectProfile } = useAuth();
  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && screenWidth >= 768;
  const { colors, themeMode, toggleTheme, isDark } = useTheme();
  const styles = getStyles(colors);
  
  // Tab Selection: 'channels' | 'users'
  const [activeTab, setActiveTab] = useState<'channels' | 'users'>('channels');
  
  // Selected stream/channel
  const [selectedStream, setSelectedStream] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Official TV channels loaded from database
  const [officialChannels, setOfficialChannels] = useState<any[]>([]);

  // Fetch official channels on mount
  useEffect(() => {
    api.getOfficialChannels().then((res) => {
      setOfficialChannels(res.data);
      if (route?.params?.mode === 'tv' || (!route?.params?.mode && activeTab === 'channels')) {
        if (!selectedStreamRef.current) {
          setSelectedStream(res.data[0]);
        }
      }
    }).catch(err => console.error('Failed to load official channels:', err));
  }, []);

  // Live Trial restriction states
  const [timeLeft, setTimeLeft] = useState(300);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [paying, setPaying] = useState(false);
  
  // Active User Streams list
  const [userStreams, setUserStreams] = useState<any[]>([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);
  
  // Go Live modal
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [streamCategory, setStreamCategory] = useState('General');
  const [streamLocation, setStreamLocation] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  
  // Broadcaster WebRTC state
  const [isStreaming, setIsStreaming] = useState(false);
  const [myStream, setMyStream] = useState<any>(null);
  const [streamDuration, setStreamDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Viewer WebRTC state
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Video rotation state (degrees: 0, 90, 180, 270)
  const [rotation, setRotation] = useState(0);

  // Floating 3D Animated Emojis state
  const [floatingEmojis, setFloatingEmojis] = useState<any[]>([]);

  // Immersive Chat layouts state: closed (minimal bottomLeft list) OR open (half-screen comments box)
  const [showHalfScreenChat, setShowHalfScreenChat] = useState(false);

  // AI Transcript and translation states
  const [isAiSubtitlesEnabled, setIsAiSubtitlesEnabled] = useState(false);
  
  // User translation target configurations (English, Telugu, Hindi, Tamil, Malayalam, Kannada, Bengali, Marathi)
  const [subtitleLang, setSubtitleLang] = useState<'en' | 'te' | 'hi' | 'ta' | 'ml' | 'kn' | 'bn' | 'mr'>('en');
  const [voiceLang, setVoiceLang] = useState<'none' | 'en' | 'te' | 'hi' | 'ta' | 'ml' | 'kn' | 'bn' | 'mr'>('none');
  const [spokenLang, setSpokenLang] = useState<'en' | 'te' | 'hi' | 'ta' | 'ml' | 'kn' | 'bn' | 'mr'>('en');
  const [subtitleStatus, setSubtitleStatus] = useState<'listening' | 'error' | 'ok'>('listening');

  const [currentSubtitle, setCurrentSubtitle] = useState<{
    en: string;
    te: string;
    hi: string;
    ta: string;
    ml: string;
    kn: string;
    bn: string;
    mr: string;
  } | null>(null);
  const [simulatedPhraseIndex, setSimulatedPhraseIndex] = useState(0);

  // Voice message recording states & functions
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceAudioBlob, setVoiceAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startVoiceRecording = async () => {
    if (Platform.OS !== 'web') {
      alert('Voice recording is supported in browsers only.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = { mimeType: 'audio/webm' };
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        mediaRecorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setVoiceAudioBlob(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingDuration(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 59) {
            stopVoiceRecordingAndPrepare();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: any) {
      console.error('Microphone permission denied / recording failure:', err);
      alert('Microphone permission denied or recording failed.');
    }
  };

  const pauseVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecordingPaused(true);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const resumeVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 59) {
            stopVoiceRecordingAndPrepare();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = () => {};
      try { mediaRecorderRef.current.stop(); } catch (e) {}
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingDuration(0);
    setVoiceAudioBlob(null);
  };

  const stopVoiceRecordingAndPrepare = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
  };

  const handleSendVoiceMessage = async () => {
    if (!voiceAudioBlob && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAndSendBlob(audioBlob);
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
        }
      };
      mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setIsRecordingPaused(false);
      return;
    }

    if (voiceAudioBlob) {
      await uploadAndSendBlob(voiceAudioBlob);
    }
  };

  const uploadAndSendBlob = async (blob: Blob) => {
    try {
      const base64Audio = await blobToBase64(blob);
      const { audioUrl } = await api.uploadVoiceMessage(base64Audio);
      
      const fullUrl = audioUrl.startsWith('http') ? audioUrl : `${API_URL}${audioUrl}`;
      const msgText = `[AUDIO]:${fullUrl}`;
      
      if (selectedStream?.isOfficial) {
        const mockMsg = {
          id: String(Math.random()),
          name: activeProfile?.name || 'User',
          message: msgText,
          createdAt: Date.now(),
        };
        setChatMessages((prev) => [...prev, mockMsg]);
        setTimeout(() => chatEndRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (activeStreamIdRef.current) {
        await api.sendStreamChatMessage(activeStreamIdRef.current, msgText);
      }
      
      setVoiceAudioBlob(null);
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingDuration(0);
    } catch (err) {
      console.error('Failed to send voice message:', err);
      alert('Failed to send voice message.');
    }
  };

  // Refs for WebRTC connections
  const localStreamRef = useRef<MediaStream | null>(null);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const compositeAnimationRef = useRef<number | null>(null);
  const [isDualCamera, setIsDualCamera] = useState(false);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // viewerProfileId -> RTCPeerConnection
  const pcRef = useRef<RTCPeerConnection | null>(null); // viewer's connection to host

  // General references
  const heartbeatIntervalRef = useRef<any>(null);
  const durationIntervalRef = useRef<any>(null);
  const thumbnailIntervalRef = useRef<any>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const selectedStreamRef = useRef<any>(null);
  const chatEndRef = useRef<ScrollView>(null);
  const recognitionRef = useRef<any>(null);
  const subtitleTimeoutRef = useRef<any>(null);

  // Parse direct navigation from Home Screen (via routes/params)
  const routeStreamId = route?.params?.streamId;

  // Set initial tab based on route params mode ('tv' or 'live')
  useEffect(() => {
    if (route?.params?.mode === 'tv') {
      setActiveTab('channels');
      if (officialChannels.length > 0 && (!selectedStream || !selectedStream.isOfficial)) {
        setSelectedStream(officialChannels[0]);
      }
    } else if (route?.params?.mode === 'live') {
      setActiveTab('users');
      setSelectedStream(null);
    }
  }, [route?.params?.mode, officialChannels]);

  // Keep references synced
  useEffect(() => {
    activeStreamIdRef.current = selectedStream ? selectedStream.id : (myStream ? myStream.id : null);
    selectedStreamRef.current = selectedStream;
  }, [selectedStream, myStream]);

  // Live streaming trial restriction timer (5-minute countdown)
  useEffect(() => {
    if (!selectedStream) {
      setTimeLeft(300);
      return;
    }
    if (activeProfile?.subscribed) {
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSelectedStream(null);
          setShowPremiumModal(true);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedStream, activeProfile?.subscribed]);

  // Pre-load speech voices for translation speech synthesis
  useEffect(() => {
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Fetch active streams from backend
  const fetchActiveStreams = async () => {
    setIsLoadingStreams(true);
    try {
      const res = await api.getStreams();
      const filtered = res.data.filter((s: any) => !myStream || s.id !== myStream.id);
      setUserStreams(filtered);
    } catch (err) {
      console.error('Failed to fetch user streams:', err);
    } finally {
      setIsLoadingStreams(false);
    }
  };

  useEffect(() => {
    fetchActiveStreams();
    const interval = setInterval(fetchActiveStreams, 12000);
    return () => clearInterval(interval);
  }, [myStream]);

  // Handle direct navigation to a stream from route params
  useEffect(() => {
    if (routeStreamId && officialChannels.length > 0) {
      const official = officialChannels.find((c) => c.id === routeStreamId);
      if (official) {
        setSelectedStream(official);
        setActiveTab('channels');
      } else {
        api.getStreams().then((res) => {
          const found = res.data.find((s: any) => s.id === routeStreamId);
          if (found) {
            setSelectedStream(found);
            setActiveTab('users');
          }
        }).catch((err) => console.error(err));
      }
    }
  }, [routeStreamId, officialChannels]);

  // WebRTC - Broadcaster starts camera (supports single & dual sync modes)
  const startCamera = async (mode: 'user' | 'environment', useDual = isDualCamera) => {
    if (Platform.OS !== 'web') return;
    try {
      // Clean up previous streams
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (secondaryStreamRef.current) {
        secondaryStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (compositeAnimationRef.current) {
        cancelAnimationFrame(compositeAnimationRef.current);
      }

      console.log(`Starting camera in mode: ${mode}, useDual: ${useDual}`);

      if (useDual) {
        // Dual camera mode - get both front & back camera streams
        const primaryFacing = mode;
        const secondaryFacing = mode === 'user' ? 'environment' : 'user';

        // 1. Get primary stream
        const primaryStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: primaryFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        // 2. Get secondary stream (no audio)
        let secondaryStream = null;
        try {
          secondaryStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: secondaryFacing, width: { ideal: 480 }, height: { ideal: 360 } },
            audio: false,
          });
          secondaryStreamRef.current = secondaryStream;
        } catch (sErr) {
          console.warn('Failed to access secondary camera for dual-cam:', sErr);
        }

        if (secondaryStream) {
          // Both cameras acquired successfully! Set up canvas composite for picture-in-picture.
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');

          const vPrimary = document.createElement('video');
          vPrimary.autoplay = true;
          vPrimary.playsInline = true;
          vPrimary.muted = true;
          vPrimary.srcObject = primaryStream;
          vPrimary.play();

          const vSecondary = document.createElement('video');
          vSecondary.autoplay = true;
          vSecondary.playsInline = true;
          vSecondary.muted = true;
          vSecondary.srcObject = secondaryStream;
          vSecondary.play();

          let active = true;
          const draw = () => {
            if (!active) return;
            if (!ctx) return;

            // Draw primary stream (full screen background)
            if (vPrimary.readyState >= vPrimary.HAVE_CURRENT_DATA) {
              ctx.save();
              if (primaryFacing === 'user') {
                // Mirror the front camera horizontally
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(vPrimary, 0, 0, canvas.width, canvas.height);
              } else {
                ctx.drawImage(vPrimary, 0, 0, canvas.width, canvas.height);
              }
              ctx.restore();
            } else {
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Draw secondary stream (PiP inset top-right)
            if (vSecondary.readyState >= vSecondary.HAVE_CURRENT_DATA) {
              const pipW = 320;
              const pipH = 180;
              const pipX = canvas.width - pipW - 30;
              const pipY = 30;

              ctx.save();
              // White rounded border
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fillRect(pipX - 4, pipY - 4, pipW + 8, pipH + 8);

              if (secondaryFacing === 'user') {
                // Mirror the front camera horizontally
                ctx.translate(pipX + pipW, pipY);
                ctx.scale(-1, 1);
                ctx.drawImage(vSecondary, 0, 0, pipW, pipH);
              } else {
                ctx.drawImage(vSecondary, pipX, pipY, pipW, pipH);
              }
              ctx.restore();
            }

            compositeAnimationRef.current = requestAnimationFrame(draw);
          };
          draw();

          // Cleanup animation on track end
          primaryStream.getVideoTracks()[0].addEventListener('ended', () => {
            active = false;
          });

          // Create composite stream from canvas and append microphone audio
          const compositeStream = canvas.captureStream(30);
          const audioTrack = primaryStream.getAudioTracks()[0];
          if (audioTrack) {
            compositeStream.addTrack(audioTrack);
          }

          localStreamRef.current = compositeStream;
          setLocalStream(compositeStream);
        } else {
          // Fall back to single camera if secondary failed
          localStreamRef.current = primaryStream;
          setLocalStream(primaryStream);
          setIsDualCamera(false);
        }
      } else {
        // Single camera mode
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
      }

      // Sync active peer connections to route the new stream tracks dynamically
      if (localStreamRef.current) {
        const stream = localStreamRef.current;
        pcsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          stream.getTracks().forEach((track) => {
            const sender = senders.find((s) => s.track?.kind === track.kind);
            if (sender) {
              sender.replaceTrack(track);
            }
          });
        });
      }

    } catch (err) {
      console.error('Failed to access camera/mic:', err);
      alert('Camera / microphone access was denied or is unavailable.');
    }
  };

  // WebRTC - Broadcaster rotates camera (front/back hardware or swaps layout in dual cam mode)
  const handleRotateCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    await startCamera(nextMode, isDualCamera);
  };

  // WebRTC - Broadcaster toggles Dual Camera sync mode (Front and Back side-by-side PIP)
  const handleToggleDualCamera = async () => {
    const nextDual = !isDualCamera;
    setIsDualCamera(nextDual);
    if (isStreaming) {
      await startCamera(facingMode, nextDual);
    }
  };

  // UI - Rotation of player screen (0/90/180/270 degrees)
  const handleScreenRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Geolocation - Broadcaster retrieves current GPS location and reverse-geocodes it
  const handleGetCurrentLocation = () => {
    if (Platform.OS !== 'web') return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data && data.address) {
            const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || 'Detected Location';
            const state = data.address.state || '';
            setStreamLocation(`${city}${state ? ', ' + state : ''}`);
          } else {
            setStreamLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (e) {
          setStreamLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
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
  };

  // Capture local stream frame as base64 JPEG
  const captureStreamFrame = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (Platform.OS !== 'web') {
        resolve(null);
        return;
      }
      try {
        const stream = localStreamRef.current;
        if (!stream) {
          resolve(null);
          return;
        }
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          resolve(null);
          return;
        }

        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
          setTimeout(() => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 360;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl.split(',')[1]); // base64 payload
              } else {
                resolve(null);
              }
            } catch (e) {
              console.error('Failed to draw stream frame to canvas:', e);
              resolve(null);
            } finally {
              video.srcObject = null;
            }
          }, 200);
        };

        video.onerror = () => {
          video.srcObject = null;
          resolve(null);
        };
      } catch (err) {
        console.error('Error capturing stream frame:', err);
        resolve(null);
      }
    });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Start Streaming (Broadcaster)
  const handleStartStream = async () => {
    if (!streamTitle.trim()) return;
    setShowGoLiveModal(false);
    
    try {
      const stream = await api.startStream(streamTitle, streamCategory, streamLocation);
      setMyStream(stream);
      setIsStreaming(true);
      setStreamDuration(0);
      setChatMessages([]);
      setSelectedStream(null); 

      if (Platform.OS === 'web') {
        await startCamera(facingMode);
        
        // Start recording the stream locally
        if (localStreamRef.current) {
          const recorderChunks: Blob[] = [];
          const uploadWithRetry = async (streamId: string, base64Video: string, retries = 3) => {
            for (let attempt = 1; attempt <= retries; attempt++) {
              try {
                console.log(`[Recording] Uploading actual live stream recording to server (attempt ${attempt}/${retries})...`);
                await api.uploadStreamRecording(streamId, base64Video);
                console.log("[Recording] Actual live stream recording uploaded successfully!");
                alert("Live recording saved successfully!");
                return;
              } catch (uploadErr) {
                console.error(`[Recording] Upload attempt ${attempt} failed:`, uploadErr);
                if (attempt === retries) {
                  alert("Failed to save the live recording file. The recording was discarded due to network failure, but session details are saved.");
                } else {
                  await new Promise((r) => setTimeout(r, 2000));
                }
              }
            }
          };

          try {
            const recorder = new MediaRecorder(localStreamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                recorderChunks.push(e.data);
              }
            };
            recorder.onstop = async () => {
              if (recorderChunks.length > 0) {
                const videoBlob = new Blob(recorderChunks, { type: 'video/webm' });
                try {
                  const base64Video = await blobToBase64(videoBlob);
                  await uploadWithRetry(stream.id, base64Video);
                } catch (err) {
                  console.error("[Recording] Error converting blob to base64:", err);
                }
              }
            };
            recorder.start(1000); // chunk every 1 sec
            (window as any).currentStreamRecorder = recorder;
          } catch (recErr) {
            console.warn("[Recording] Failed to start MediaRecorder (retrying with default mimeType):", recErr);
            try {
              const recorder = new MediaRecorder(localStreamRef.current);
              recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                  recorderChunks.push(e.data);
                }
              };
              recorder.onstop = async () => {
                if (recorderChunks.length > 0) {
                  const videoBlob = new Blob(recorderChunks, { type: 'video/webm' });
                  try {
                    const base64Video = await blobToBase64(videoBlob);
                    await uploadWithRetry(stream.id, base64Video);
                  } catch (err) {
                    console.error("[Recording] Error converting blob to base64:", err);
                  }
                }
              };
              recorder.start(1000);
              (window as any).currentStreamRecorder = recorder;
            } catch (recFallbackErr) {
              console.error("[Recording] MediaRecorder fallback failed:", recFallbackErr);
            }
          }
        }
      }

      // Start background thumbnail capture logic
      const runThumbnailCaptureLoop = () => {
        let firstThumbnailUploaded = false;
        let initialAttempts = 0;

        const captureInitialThumbnail = async () => {
          if (firstThumbnailUploaded || initialAttempts >= 5) return;
          initialAttempts++;

          const base64 = await captureStreamFrame();
          if (base64) {
            try {
              console.log(`[Thumbnail] Sending initial frame attempt ${initialAttempts} for stream ${stream.id}...`);
              const res = await api.uploadStreamThumbnail(stream.id, base64);
              if ((res as any).success && !(res as any).retry) {
                firstThumbnailUploaded = true;
                console.log(`[Thumbnail] Successfully established initial thumbnail cover.`);
                startPeriodicUpdates();
              } else {
                console.warn(`[Thumbnail] First capture rejected by AI (retry scheduled): ${(res as any).reason}`);
                setTimeout(captureInitialThumbnail, 3000);
              }
            } catch (err) {
              console.warn('[Thumbnail] Failed upload of initial thumbnail cover, scheduling retry...', err);
              setTimeout(captureInitialThumbnail, 3000);
            }
          } else {
            setTimeout(captureInitialThumbnail, 3000);
          }
        };

        const startPeriodicUpdates = () => {
          const intervalId = setInterval(async () => {
            const base64 = await captureStreamFrame();
            if (base64) {
              try {
                console.log(`[Thumbnail] Uploading periodic preview frame comparison...`);
                await api.uploadStreamThumbnail(stream.id, base64);
              } catch (err) {
                console.warn('[Thumbnail] Failed upload of periodic preview frame comparison:', err);
              }
            }
          }, 45000);
          thumbnailIntervalRef.current = intervalId;
        };

        setTimeout(captureInitialThumbnail, 4000);
      };

      runThumbnailCaptureLoop();

      let consecutiveFailures = 0;
      const sendHeartbeatWithRetry = async () => {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const heart = await api.sendStreamHeartbeat(stream.id);
            setMyStream((prev: any) => prev ? { ...prev, viewers: heart.viewers, peak_viewers: heart.peakViewers } : null);
            consecutiveFailures = 0; // reset on success
            return;
          } catch (err) {
            console.error(`Broadcaster heartbeat attempt ${attempt} failed:`, err);
            if (attempt === maxRetries) {
              consecutiveFailures++;
              if (consecutiveFailures >= 3) {
                console.warn('Broadcaster heartbeat failed consecutively 3 times. Connection issues detected.');
              }
            } else {
              // Wait 1 second before retrying
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      };

      heartbeatIntervalRef.current = setInterval(sendHeartbeatWithRetry, 8000);

      durationIntervalRef.current = setInterval(() => {
        setStreamDuration((d) => d + 1);
      }, 1000);

      if (isAiSubtitlesEnabled) {
        startSpeechRecognition();
      }

    } catch (err) {
      alert('Could not start live stream. Please check network connection.');
      console.error(err);
    }
  };

  // Stop Streaming (Broadcaster)
  const handleStopStream = async () => {
    if (!myStream) return;

    clearInterval(heartbeatIntervalRef.current);
    clearInterval(durationIntervalRef.current);
    clearInterval(thumbnailIntervalRef.current);
    stopSpeechRecognition();

    const activeStream = localStreamRef.current;

    const stopTracks = () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (secondaryStreamRef.current) {
        secondaryStreamRef.current.getTracks().forEach((track) => track.stop());
        secondaryStreamRef.current = null;
      }
      if (compositeAnimationRef.current) {
        cancelAnimationFrame(compositeAnimationRef.current);
        compositeAnimationRef.current = null;
      }
      setLocalStream(null);
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
    };

    if ((window as any).currentStreamRecorder && (window as any).currentStreamRecorder.state !== 'inactive') {
      try {
        const recorder = (window as any).currentStreamRecorder;
        recorder.stop();
      } catch (e) {
        console.error("[Recording] Failed to stop MediaRecorder safely:", e);
      }
      (window as any).currentStreamRecorder = null;
    }
    stopTracks();
    
    try {
      await api.stopStream(myStream.id);
    } catch (err) {
      console.error('Failed to notify server of stopped stream:', err);
    }

    setIsStreaming(false);
    setMyStream(null);
    setStreamDuration(0);
    setRotation(0);
    setCurrentSubtitle(null);
    setShowHalfScreenChat(false);
    if (officialChannels.length > 0) {
      setSelectedStream(officialChannels[0]);
    }
    fetchActiveStreams();
  };

  // Stop streaming/viewing on tab blur
  useEffect(() => {
    if (!isFocused) {
      if (isStreaming) {
        handleStopStream();
      }
    }
  }, [isFocused, isStreaming]);

  // WebRTC - Viewer connection to host
  const initViewerConnection = useCallback(async (streamId: string, hostProfileId: string) => {
    if (Platform.OS !== 'web') return;
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);

    try {
      await api.sendStreamSignal(streamId, hostProfileId, { type: 'join' });
    } catch (err) {
      console.error('Failed to send join signal to broadcaster:', err);
    }
  }, []);

  // Sync / select streams & trigger viewer setup
  useEffect(() => {
    if (!selectedStream) return;
    
    const streamId = selectedStream.id;
    const isOfficial = selectedStream.isOfficial;

    setChatMessages([]);
    setRemoteStream(null);
    setRotation(0);
    setCurrentSubtitle(null);
    setShowHalfScreenChat(false);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (selectedStream.isOfficial) {
      setChatMessages([
        { id: 'm1', name: 'Srujana', message: 'NEXUS news stream is ultra clean!', createdAt: Date.now() - 60000 },
        { id: 'm2', name: 'Shyam', message: 'Amazing audio quality.', createdAt: Date.now() - 30000 },
        { id: 'm3', name: 'Phani', message: 'Looking forward to the sports match.', createdAt: Date.now() - 10000 },
      ]);
    } else {
      api.getStreamChatMessages(selectedStream.id)
        .then((res) => {
          setChatMessages(res.data);
          setTimeout(() => chatEndRef.current?.scrollToEnd({ animated: false }), 200);
        })
        .catch((err) => console.error('Failed to load chat history:', err));

      initViewerConnection(selectedStream.id, selectedStream.profile_id);
    }

    return () => {
      if (!isOfficial) {
        api.leaveStream(streamId).catch(() => {});
      }
    };
  }, [selectedStream, initViewerConnection]);

  // Viewer ping heartbeat to broadcaster's room
  useEffect(() => {
    if (isStreaming || !selectedStream || selectedStream.isOfficial) return;

    const interval = setInterval(async () => {
      try {
        await api.sendStreamHeartbeat(selectedStream.id);
      } catch (err) {
        console.error('Viewer heartbeat failed:', err);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedStream, isStreaming]);

  // Floating Emoji reaction system animation
  const triggerFlyingEmoji = (emoji: string) => {
    const id = Math.random().toString();
    const xAnim = new Animated.Value(0);
    const yAnim = new Animated.Value(0);
    const scaleAnim = new Animated.Value(0.5);
    const opacityAnim = new Animated.Value(1);
    const rotAnim = new Animated.Value(0);

    const newEmoji = { id, emoji, xAnim, yAnim, scaleAnim, opacityAnim, rotAnim };
    setFloatingEmojis((prev) => [...prev, newEmoji]);

    Animated.parallel([
      Animated.timing(yAnim, {
        toValue: -320,
        duration: 2400,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.sequence([
        Animated.timing(xAnim, {
          toValue: (Math.random() - 0.5) * 60,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(xAnim, {
          toValue: (Math.random() - 0.5) * 80,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(xAnim, {
          toValue: (Math.random() - 0.5) * 100,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.timing(scaleAnim, {
        toValue: 1.6,
        duration: 2400,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 2400,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(rotAnim, {
        toValue: (Math.random() - 0.5) * 60,
        duration: 2400,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    });
  };

  const sendEmojiSignal = async (emoji: string) => {
    triggerFlyingEmoji(emoji);
    if (activeStreamIdRef.current) {
      try {
        if (selectedStream?.isOfficial) {
          // Local simulation
        } else {
          await api.sendStreamChatMessage(activeStreamIdRef.current, `[EMOJI]:${emoji}`);
        }
      } catch (err) {
        console.error('Failed to send emoji:', err);
      }
    }
  };

  // Helper function to dynamically translate text inputs using vocabulary dictionaries
  const translateText = (text: string, sourceLang: string, targetLang: string): string => {
    if (sourceLang === targetLang) return text;
    
    const lower = text.toLowerCase().trim();
    
    // 1. Search for matching predefined phrase
    for (const phraseObj of PHRASES) {
      const srcPhrase = (phraseObj as any)[sourceLang]?.toLowerCase().trim() || '';
      if (srcPhrase.includes(lower) || lower.includes(srcPhrase)) {
        return (phraseObj as any)[targetLang] || text;
      }
    }

    // 2. Word by word translation fallback
    const words = lower.split(/\s+/);
    const translated = words.map((w) => {
      const cleanW = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").trim().toLowerCase();
      if (!cleanW) return w;

      // Find in dictionary
      let enKey: string | null = null;
      if (sourceLang === 'en') {
        if (TRANSLATION_DICTIONARY[cleanW]) {
          enKey = cleanW;
        }
      } else {
        // Search values
        for (const [key, val] of Object.entries(TRANSLATION_DICTIONARY)) {
          const dictVal = ((val as any)[sourceLang] || '').toLowerCase();
          if (dictVal.includes(cleanW) || cleanW.includes(dictVal)) {
            enKey = key;
            break;
          }
          // Also strip out any parentheses / transliterations and compare
          const strippedDictVal = dictVal.replace(/\([^)]*\)/g, '').trim();
          if (strippedDictVal.includes(cleanW) || cleanW.includes(strippedDictVal)) {
            enKey = key;
            break;
          }
        }
      }

      if (enKey) {
        if (targetLang === 'en') return enKey;
        return (TRANSLATION_DICTIONARY[enKey] as any)[targetLang] || enKey;
      }
      return w;
    });

    return translated.join(' ');
  };

  // Text-To-Speech dynamic synthesis voice logic (English, Telugu, Hindi)
  const speakTranslationVoice = (text: string, langCode: string) => {
    if (Platform.OS !== 'web' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Clean English tags in parentheses for neat synthesized audio output
    const cleanSpeechText = text.replace(/\([^)]*\)/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    
    let targetLocale = 'en-US';
    if (langCode === 'te') targetLocale = 'te-IN';
    else if (langCode === 'hi') targetLocale = 'hi-IN';
    else if (langCode === 'ta') targetLocale = 'ta-IN';
    else if (langCode === 'ml') targetLocale = 'ml-IN';
    else if (langCode === 'kn') targetLocale = 'kn-IN';
    else if (langCode === 'bn') targetLocale = 'bn-IN';
    else if (langCode === 'mr') targetLocale = 'mr-IN';
    
    utterance.lang = targetLocale;
    
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find((v) => v.lang.startsWith(langCode));
    if (targetVoice) {
      utterance.voice = targetVoice;
    }
    window.speechSynthesis.speak(utterance);
  };

  // AI Multilingual online translation tool with Google Gemini API call
  const translateTextAsync = async (text: string, fromLang: string): Promise<Record<string, string>> => {
    const result: Record<string, string> = {
      en: translateText(text, fromLang, 'en'),
      te: translateText(text, fromLang, 'te'),
      hi: translateText(text, fromLang, 'hi'),
      ta: translateText(text, fromLang, 'ta'),
      ml: translateText(text, fromLang, 'ml'),
      kn: translateText(text, fromLang, 'kn'),
      bn: translateText(text, fromLang, 'bn'),
      mr: translateText(text, fromLang, 'mr'),
    };

    try {
      const apiKey = 'AQ.Ab8RN6JWu4K2TWaCX5pph1GMRr1wByLdwc9JNPoaoDdtBQvtpQ';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a real-time translator. Translate this sentence "${text}" from language code "${fromLang}" into: English (en), Telugu (te), Hindi (hi), Tamil (ta), Malayalam (ml), Kannada (kn), Bengali (bn), Marathi (mr). Return a raw JSON object only (no markdown, no backticks, no comments):
{
  "en": "...",
  "te": "...",
  "hi": "...",
  "ta": "...",
  "ml": "...",
  "kn": "...",
  "bn": "...",
  "mr": "..."
}`
            }]
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const resText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (resText) {
          const cleaned = resText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          for (const lang of ['en', 'te', 'hi', 'ta', 'ml', 'kn', 'bn', 'mr']) {
            if (parsed[lang]) {
              result[lang] = parsed[lang];
            }
          }
          setSubtitleStatus('ok');
        }
      }
    } catch (err) {
      console.warn('Gemini translation failed, using offline fallback dictionary:', err);
    }
    return result;
  };

  // Web Speech recognition starter (Broadcaster camera triggers speech mic)
  const startSpeechRecognition = () => {
    if (Platform.OS !== 'web') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSubtitleStatus('error');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    
    const localeMap: Record<string, string> = {
      en: 'en-US',
      te: 'te-IN',
      hi: 'hi-IN',
      ta: 'ta-IN',
      ml: 'ml-IN',
      kn: 'kn-IN',
      bn: 'bn-IN',
      mr: 'mr-IN'
    };
    rec.lang = localeMap[spokenLang] || 'en-US';

    rec.onresult = async (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = finalTranscript || interimTranscript;
      if (activeText.trim()) {
        setSubtitleStatus('ok');
        const translations = await translateTextAsync(activeText, spokenLang);
        const payload = {
          en: translations.en,
          te: translations.te,
          hi: translations.hi,
          ta: translations.ta,
          ml: translations.ml,
          kn: translations.kn,
          bn: translations.bn,
          mr: translations.mr
        };
        setCurrentSubtitle(payload);

        // Broadcast to viewers via chat signaling
        if (finalTranscript.trim() && activeStreamIdRef.current) {
          try {
            await api.sendStreamChatMessage(
              activeStreamIdRef.current,
              `[TRANSCRIPT]:${JSON.stringify(payload)}`
            );
          } catch (err) {
            console.error('Failed to send transcript packet:', err);
          }
        }
      }
    };

    rec.onerror = (err: any) => {
      console.error('Speech recognition error:', err);
      if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
        setSubtitleStatus('error');
      }
    };
    rec.onend = () => {
      if (isStreaming && isAiSubtitlesEnabled && recognitionRef.current === rec) {
        try { rec.start(); } catch (e) {}
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setSubtitleStatus('listening');
    } catch (err) {
      console.error(err);
      setSubtitleStatus('error');
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
  };

  // Simulated Speech Broadcaster to test translation outputs (All 8 supported languages)
  const handleSimulateSpeech = async () => {
    if (!activeStreamIdRef.current) return;
    const phraseObj = PHRASES[simulatedPhraseIndex];
    setSimulatedPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    
    const payload = {
      en: phraseObj.en,
      te: phraseObj.te,
      hi: phraseObj.hi,
      ta: phraseObj.ta || phraseObj.en,
      ml: phraseObj.ml || phraseObj.en,
      kn: phraseObj.kn || phraseObj.en,
      bn: phraseObj.bn || phraseObj.en,
      mr: phraseObj.mr || phraseObj.en,
    };
    setCurrentSubtitle(payload);

    try {
      await api.sendStreamChatMessage(
        activeStreamIdRef.current,
        `[TRANSCRIPT]:${JSON.stringify(payload)}`
      );
    } catch (err) {
      console.error('Failed to dispatch simulated transcript:', err);
    }
  };

  // Handle subtitle display and voice output matching target preference settings
  const handleTranscriptPacket = (payload: any) => {
    setCurrentSubtitle(payload);
    setSubtitleStatus('ok');
    
    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    subtitleTimeoutRef.current = setTimeout(() => {
      setCurrentSubtitle(null);
    }, 6000);

    // Speak voice translator in chosen language
    if (voiceLang !== 'none') {
      const speechText = payload[voiceLang] || payload.en;
      speakTranslationVoice(speechText, voiceLang);
    }
  };

  // SSE Signal & Chat Receiver
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const url = getEventsUrl();
    const es = new EventSource(url);

    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 1. Live Chat Message
        if (data.type === 'live_chat_message') {
          const msg = data.payload;
          if (msg.streamId === activeStreamIdRef.current) {
            if (msg.message.startsWith('[EMOJI]:')) {
              const emojiSymbol = msg.message.replace('[EMOJI]:', '');
              triggerFlyingEmoji(emojiSymbol);
              
              setChatMessages((prev) => [...prev, msg]);
              setTimeout(() => chatEndRef.current?.scrollToEnd({ animated: true }), 100);
            } else if (msg.message.startsWith('[TRANSCRIPT]:')) {
              try {
                const packet = JSON.parse(msg.message.replace('[TRANSCRIPT]:', ''));
                handleTranscriptPacket(packet);
              } catch (err) {
                console.error(err);
              }
            } else {
              setChatMessages((prev) => [...prev, msg]);
              setTimeout(() => chatEndRef.current?.scrollToEnd({ animated: true }), 100);
            }
          }
        } 
        
        // 2. WebRTC Signaling Relay
        else if (data.type === 'live_stream_signal') {
          const { senderProfileId, signal, streamId } = data.payload;

          if (isStreaming && myStream && streamId === myStream.id) {
            if (signal.type === 'join') {
              const pc = new RTCPeerConnection(RTC_CONFIG);
              pcsRef.current.set(senderProfileId, pc);

              if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => {
                  pc.addTrack(track, localStreamRef.current!);
                });
              }

              pc.onicecandidate = (e) => {
                if (e.candidate) {
                  api.sendStreamSignal(myStream.id, senderProfileId, {
                    type: 'candidate',
                    candidate: e.candidate,
                  }).catch(err => console.error(err));
                }
              };

              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              await api.sendStreamSignal(myStream.id, senderProfileId, {
                type: 'offer',
                offer,
              }).catch(err => console.error(err));

            } else if (signal.type === 'answer') {
              const pc = pcsRef.current.get(senderProfileId);
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
              }
            } else if (signal.type === 'candidate') {
              const pc = pcsRef.current.get(senderProfileId);
              if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              }
            }
          }

          else if (!isStreaming && selectedStreamRef.current && streamId === selectedStreamRef.current.id) {
            if (signal.type === 'offer') {
              const pc = new RTCPeerConnection(RTC_CONFIG);
              pcRef.current = pc;

              pc.ontrack = (e) => {
                if (e.streams && e.streams[0]) {
                  setRemoteStream(e.streams[0]);
                }
              };

              pc.onicecandidate = (e) => {
                if (e.candidate) {
                  api.sendStreamSignal(selectedStreamRef.current.id, selectedStreamRef.current.profile_id, {
                    type: 'candidate',
                    candidate: e.candidate,
                  }).catch(err => console.error(err));
                }
              };

              await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              await api.sendStreamSignal(selectedStreamRef.current.id, selectedStreamRef.current.profile_id, {
                type: 'answer',
                answer,
              }).catch(err => console.error(err));

            } else if (signal.type === 'candidate') {
              if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
              }
            }
          }
        } 
        
        else if (data.type === 'live_stream_started') {
          fetchActiveStreams();
        } 
        
        else if (data.type === 'live_stream_ended') {
          const endedPayload = data.payload;
          if (selectedStreamRef.current && endedPayload.id === selectedStreamRef.current.id) {
            alert(`"${selectedStreamRef.current.title || selectedStreamRef.current.name}" has ended.`);
            if (officialChannels.length > 0) {
              setSelectedStream(officialChannels[0]);
            }
          }
          fetchActiveStreams();
        }
      } catch (err) {
        console.error('Error handling SSE message:', err);
      }
    };

    es.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      es.close();
    };
  }, [isStreaming, myStream]);

  // Send Chat Message
  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeStreamIdRef.current) return;
    const msgText = chatInput.trim();
    setChatInput('');

    try {
      if (selectedStream?.isOfficial) {
        const mockMsg = {
          id: String(Math.random()),
          name: activeProfile?.name || 'User',
          message: msgText,
          createdAt: Date.now(),
        };
        setChatMessages((prev) => [...prev, mockMsg]);
        setTimeout(() => chatEndRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        await api.sendStreamChatMessage(activeStreamIdRef.current, msgText);
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  // Toggle AI Subtitles activation state
  const handleToggleSubtitles = () => {
    const nextState = !isAiSubtitlesEnabled;
    setIsAiSubtitlesEnabled(nextState);
    if (isStreaming) {
      if (nextState) startSpeechRecognition();
      else stopSpeechRecognition();
    }
  };

  // Periodic simulated transcription loop for official channels
  useEffect(() => {
    if (!isAiSubtitlesEnabled || !selectedStream || !selectedStream.isOfficial) {
      return;
    }

    let phraseIndex = 0;
    const runSimulation = () => {
      const phraseObj = PHRASES[phraseIndex];
      phraseIndex = (phraseIndex + 1) % PHRASES.length;
      
      const payload = {
        en: phraseObj.en,
        te: phraseObj.te,
        hi: phraseObj.hi,
        ta: phraseObj.ta || phraseObj.en,
        ml: phraseObj.ml || phraseObj.en,
        kn: phraseObj.kn || phraseObj.en,
        bn: phraseObj.bn || phraseObj.en,
        mr: phraseObj.mr || phraseObj.en,
      };
      setCurrentSubtitle(payload);
      setSubtitleStatus('ok');
    };

    runSimulation();
    const interval = setInterval(runSimulation, 6000);

    return () => clearInterval(interval);
  }, [isAiSubtitlesEnabled, selectedStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (secondaryStreamRef.current) {
        secondaryStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (compositeAnimationRef.current) {
        cancelAnimationFrame(compositeAnimationRef.current);
      }
      pcsRef.current.forEach((pc) => pc.close());
      if (pcRef.current) pcRef.current.close();
      stopSpeechRecognition();
    };
  }, []);

  const handleUpgradeLive = async () => {
    if (!activeProfile) return;
    if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim() || !cardName.trim()) {
      Alert.alert('Validation Error', 'All payment fields are required.');
      return;
    }
    
    setPaying(true);
    try {
      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Update on API server
      await api.subscribeProfile(activeProfile.id);
      
      // Refresh Auth profile states locally
      await refreshProfiles();
      
      // Update active profile details locally
      const updatedProfile = { ...activeProfile, subscribed: true } as any;
      await selectProfile(updatedProfile);

      setShowPremiumModal(false);
      Alert.alert('Payment Successful', 'Welcome to NEXUS Play Premium! You now have unlimited live streaming.');
      
      // Clear form
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardName('');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Payment Failed', err.message || 'Upgrade transaction failed.');
    } finally {
      setPaying(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isSessionActive = isStreaming || selectedStream != null;

  return (
    <View style={styles.container}>
      {!isSessionActive && <AppHeader onPressAvatar={() => navigation.navigate('Profile')} />}
      {/* 1. IMMERSIVE FULL SCREEN LIVE PLAYBACK MODE */}
      {isSessionActive ? (
        <View style={[styles.immersiveWrapper, isDesktop && styles.desktopImmersiveWrapper]}>
          {isDesktop ? (
            // Desktop Layout (side-by-side split screen Twitch layout)
            <>
              {/* Left Column: Player + Controls */}
              <View style={styles.desktopLeftColumn}>
                <View style={styles.desktopVideoContainer}>
                  <View style={[styles.videoContainerRelative, { transform: [{ rotate: `${rotation}deg` }] }]}>
                    {isFocused ? (
                      isStreaming ? (
                        Platform.OS === 'web' ? (
                          localStream ? (
                            <WebRTCVideo stream={localStream} muted={true} mirrored={facingMode === 'user' && !isDualCamera} />
                          ) : (
                            <View style={styles.noPlayer}>
                              <ActivityIndicator color={colors.primary} size="large" />
                              <Text style={styles.noPlayerText}>Connecting local camera feed...</Text>
                            </View>
                          )
                        ) : (
                          <FallbackPlayerView videoUrl={WEB_FALLBACK} />
                        )
                      ) : (
                        (selectedStream.isOfficial || !selectedStream.isLive || selectedStream.recorded_video_url) ? (
                          <TVChannelPlayer key={selectedStream.id} uri={selectedStream.videoUrl || selectedStream.recorded_video_url} />
                        ) : remoteStream ? (
                          <WebRTCVideo stream={remoteStream} muted={false} />
                        ) : (
                          <View style={styles.noPlayer}>
                            <ActivityIndicator color={colors.primary} size="large" />
                            <Text style={styles.noPlayerText}>Connecting to peer live feed...</Text>
                          </View>
                        )
                      )
                    ) : (
                      <View style={styles.noPlayer} />
                    )}
                  </View>

                  {/* Subtitles Overlay inside Left Column */}
                  {isAiSubtitlesEnabled && (
                    <View style={styles.desktopSubtitleOverlay}>
                      <Text style={styles.subtitleTextTitle}>🤖 AI Live Transcription ({subtitleLang.toUpperCase()})</Text>
                      <Text style={styles.subtitleTextMain}>
                        {currentSubtitle 
                          ? (currentSubtitle[subtitleLang] || currentSubtitle[spokenLang] || currentSubtitle.en || "Listening for speech...")
                          : (subtitleStatus === 'error' ? "Unable to generate subtitles." : "Listening for speech...")}
                      </Text>
                    </View>
                  )}

                  {/* Flying emojis overlay on video */}
                  <View style={styles.flyingEmojisWrapperRelative} pointerEvents="none">
                    {floatingEmojis.map((e) => (
                      <Animated.Text
                        key={e.id}
                        style={[
                          styles.flyingEmojiText,
                          {
                            transform: [
                              { translateY: e.yAnim },
                              { translateX: e.xAnim },
                              { scale: e.scaleAnim },
                              {
                                rotate: e.rotAnim.interpolate({
                                  inputRange: [-30, 30],
                                  outputRange: ['-30deg', '30deg'],
                                }),
                              },
                            ],
                            opacity: e.opacityAnim,
                          },
                        ]}
                      >
                        {e.emoji}
                      </Animated.Text>
                    ))}
                  </View>
                </View>

                {/* Bottom Stream Info & Control Bar */}
                <View style={styles.desktopControlsPanel}>
                  <View style={styles.desktopHeaderRow}>
                    <View style={styles.headerStreamDetails}>
                      <Text style={styles.desktopStreamTitle} numberOfLines={1}>
                        {isStreaming ? myStream?.title : (selectedStream.title || selectedStream.name)}
                      </Text>
                      <Text style={styles.desktopStreamMeta}>
                        {isStreaming ? myStream?.category : selectedStream.category || selectedStream.cat || 'Live'}
                        {((isStreaming ? myStream?.location : selectedStream.location) ? `  ·  📍 ${isStreaming ? myStream.location : selectedStream.location}` : '')}
                      </Text>
                    </View>

                    <View style={styles.headerStatsRow}>
                      {(!isStreaming && !selectedStream.isOfficial && !selectedStream.isLive) ? (
                        <View style={[styles.livePill, { backgroundColor: '#475569' }]}>
                          <Text style={styles.livePillText}>RECORDED</Text>
                        </View>
                      ) : (
                        <View style={styles.livePill}>
                          <View style={styles.liveDot} />
                          <Text style={styles.livePillText}>LIVE</Text>
                        </View>
                      )}
                      <View style={styles.viewerPill}>
                        <Text style={styles.viewerText}>
                          👁️ {isStreaming ? (myStream?.viewers || 0).toLocaleString() : (selectedStream.viewers?.toLocaleString() || 0)} {(!isStreaming && !selectedStream.isOfficial && !selectedStream.isLive) ? 'Views' : 'Watching Live'}
                        </Text>
                      </View>
                      {isStreaming && (
                        <View style={styles.durationPill}>
                          <Text style={styles.durationText}>{formatTime(streamDuration)}</Text>
                        </View>
                      )}
                      {!isStreaming && !activeProfile?.subscribed && (
                        <View style={styles.trialBadge}>
                          <Text style={styles.trialBadgeText}>
                            ⚡ Trial: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Action buttons row */}
                  <View style={styles.desktopActionRow}>
                    <HoverPressable
                      style={styles.desktopActionBtn}
                      onPress={isStreaming ? handleStopStream : () => setSelectedStream(null)}
                    >
                      <Text style={styles.desktopActionBtnText}>← {isStreaming ? 'End Live' : 'Exit'}</Text>
                    </HoverPressable>

                    <HoverPressable style={styles.desktopActionBtn} onPress={handleScreenRotate}>
                      <Text style={styles.desktopActionIcon}>🔄</Text>
                      <Text style={styles.desktopActionText}>Rotate Video</Text>
                    </HoverPressable>

                    <HoverPressable
                      style={[styles.desktopActionBtn, isAiSubtitlesEnabled && styles.desktopActionBtnActive]}
                      onPress={handleToggleSubtitles}
                    >
                      <Text style={styles.desktopActionIcon}>💬</Text>
                      <Text style={styles.desktopActionText}>AI Subtitles</Text>
                    </HoverPressable>

                    {isStreaming && (
                      <>
                        <HoverPressable style={styles.desktopActionBtn} onPress={handleSimulateSpeech}>
                          <Text style={styles.desktopActionIcon}>🎙️</Text>
                          <Text style={styles.desktopActionText}>Simulate Speech</Text>
                        </HoverPressable>

                        <HoverPressable style={styles.desktopActionBtn} onPress={handleRotateCamera}>
                          <Text style={styles.desktopActionIcon}>🔄</Text>
                          <Text style={styles.desktopActionText}>Flip Camera</Text>
                        </HoverPressable>

                        <HoverPressable
                          style={[styles.desktopActionBtn, isDualCamera && styles.desktopActionBtnActive]}
                          onPress={handleToggleDualCamera}
                        >
                          <Text style={styles.desktopActionIcon}>👥</Text>
                          <Text style={styles.desktopActionText}>Dual Cam</Text>
                        </HoverPressable>
                      </>
                    )}
                  </View>

                  {/* AI Translation Selectors when Subtitles enabled */}
                  {isAiSubtitlesEnabled && (
                    <View style={styles.desktopLangPanel}>
                      <View style={styles.languageSelectorRow}>
                        <Text style={styles.langSelectorLabel}>Subtitles:</Text>
                        {[
                          { id: 'en', label: 'English' },
                          { id: 'te', label: 'తెలుగు' },
                          { id: 'hi', label: 'हिंदी' },
                          { id: 'ta', label: 'தமிழ்' },
                          { id: 'ml', label: 'മലയാളം' },
                          { id: 'kn', label: 'ಕನ್ನಡ' },
                          { id: 'bn', label: 'বাংলা' },
                          { id: 'mr', label: 'मराठी' }
                        ].map((l) => (
                          <Pressable
                            key={l.id}
                            style={[styles.langSelectBtn, subtitleLang === l.id && styles.langSelectBtnActive]}
                            onPress={() => setSubtitleLang(l.id as any)}
                          >
                            <Text style={[styles.langSelectBtnText, subtitleLang === l.id && styles.langSelectBtnTextActive]}>
                              {l.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.languageSelectorRow}>
                        <Text style={styles.langSelectorLabel}>AI Voice Translator:</Text>
                        {[
                          { id: 'none', label: 'OFF' },
                          { id: 'en', label: 'English' },
                          { id: 'te', label: 'తెలుగు' },
                          { id: 'hi', label: 'हिंदी' },
                          { id: 'ta', label: 'தமிழ்' },
                          { id: 'ml', label: 'മലയാളം' },
                          { id: 'kn', label: 'ಕನ್ನಡ' },
                          { id: 'bn', label: 'বাংলা' },
                          { id: 'mr', label: 'मराठी' }
                        ].map((l) => (
                          <Pressable
                            key={l.id}
                            style={[styles.langSelectBtn, voiceLang === l.id && styles.langSelectBtnActive]}
                            onPress={() => setVoiceLang(l.id as any)}
                          >
                            <Text style={[styles.langSelectBtnText, voiceLang === l.id && styles.langSelectBtnTextActive]}>
                              {l.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Right Column: Chat panel */}
              <View style={styles.desktopRightColumn}>
                <View style={styles.desktopChatHeader}>
                  <Text style={styles.desktopChatTitle}>LIVE STREAM CHAT</Text>
                </View>

                <ScrollView
                  ref={chatEndRef}
                  style={styles.desktopChatScroll}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                >
                  {chatMessages.length === 0 ? (
                    <Text style={styles.halfNoComments}>No comments posted. Be the first to write!</Text>
                  ) : (
                    chatMessages.map((m, idx) => {
                      const isEmojiMsg = m.message.startsWith('[EMOJI]:');
                      const isAudioMsg = m.message.startsWith('[AUDIO]:');
                      const displayMessage = isEmojiMsg ? m.message.replace('[EMOJI]:', '') : m.message;
                      return (
                        <View key={m.id || idx} style={styles.desktopChatBubble}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{m.name.charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={styles.desktopChatAuthor}>{m.name}</Text>
                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                          </View>
                          {isAudioMsg ? (
                            <VoicePlayer url={m.message.replace('[AUDIO]:', '')} />
                          ) : (
                            <Text style={isEmojiMsg ? styles.desktopChatEmojiBody : styles.desktopChatBody}>
                              {displayMessage}
                            </Text>
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.desktopChatInputContainer}>
                  {isRecording ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 10, width: '100%' }}>
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12 }}>🔴 Recording {recordingDuration}s / 60s</Text>
                      <View style={{ flex: 1 }} />
                      <HoverPressable 
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}
                        onPress={isRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{isRecordingPaused ? '▶️ Resume' : '⏸️ Pause'}</Text>
                      </HoverPressable>
                      <HoverPressable 
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 8 }}
                        onPress={cancelVoiceRecording}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>✕ Cancel</Text>
                      </HoverPressable>
                      <HoverPressable 
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#3B82F6', borderRadius: 8 }}
                        onPress={handleSendVoiceMessage}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✔️ Send</Text>
                      </HoverPressable>
                    </View>
                  ) : (
                    <View style={styles.desktopInputRow}>
                      <TextInput
                        style={styles.desktopChatInput}
                        placeholder="Send a chat message..."
                        placeholderTextColor={colors.placeholder}
                        value={chatInput}
                        onChangeText={setChatInput}
                        onSubmitEditing={handleSendChat}
                      />
                      <HoverPressable 
                        style={{ padding: 10, marginRight: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 }}
                        onPress={startVoiceRecording}
                      >
                        <Text style={{ fontSize: 14 }}>🎙️</Text>
                      </HoverPressable>
                      <HoverPressable style={styles.desktopChatSendBtn} onPress={handleSendChat}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Chat</Text>
                      </HoverPressable>
                    </View>
                  )}

                  <View style={styles.desktopQuickEmojisRow}>
                    {['🔥', '❤️', '😄', '😢', '😭'].map((emo) => (
                      <HoverPressable
                        key={emo}
                        style={styles.desktopEmojiReactionBtn}
                        onPress={() => sendEmojiSignal(emo)}
                      >
                        <Text style={{ fontSize: 18 }}>{emo}</Text>
                      </HoverPressable>
                    ))}
                  </View>
                </View>
              </View>
            </>
          ) : (
            // Mobile Layout (immersive full screen overlay)
            <>
              {/* Full Screen Background Video component with smooth rotation. Checks isFocused to prevent background overlaps */}
              <View style={[styles.videoContainer, { transform: [{ rotate: `${rotation}deg` }] }]}>
                {isFocused ? (
                  isStreaming ? (
                    Platform.OS === 'web' ? (
                      localStream ? (
                        <WebRTCVideo stream={localStream} muted={true} mirrored={facingMode === 'user' && !isDualCamera} />
                      ) : (
                        <View style={styles.noPlayer}>
                          <ActivityIndicator color={colors.primary} size="large" />
                          <Text style={styles.noPlayerText}>Connecting local camera feed...</Text>
                        </View>
                      )
                    ) : (
                      <FallbackPlayerView videoUrl={WEB_FALLBACK} />
                    )
                  ) : (
                    (selectedStream.isOfficial || !selectedStream.isLive || selectedStream.recorded_video_url) ? (
                      <TVChannelPlayer key={selectedStream.id} uri={selectedStream.videoUrl || selectedStream.recorded_video_url} />
                    ) : remoteStream ? (
                      <WebRTCVideo stream={remoteStream} muted={false} />
                    ) : (
                      <View style={styles.noPlayer}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={styles.noPlayerText}>Connecting to peer live feed...</Text>
                      </View>
                    )
                  )
                ) : (
                  <View style={styles.noPlayer} />
                )}
              </View>

              {/* Aesthetic glass overlays for premium styling */}
              <LinearGradient
                colors={['rgba(15, 23, 42, 0.92)', 'rgba(15, 23, 42, 0.25)', 'transparent']}
                style={styles.topGradient}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['transparent', 'rgba(15, 23, 42, 0.45)', 'rgba(15, 23, 42, 0.95)']}
                style={styles.bottomGradient}
                pointerEvents="none"
              />

              {/* Translucent overlay UI content wrapper */}
              <View style={styles.overlayContainer} pointerEvents="box-none">
                
                {/* Top Header overlay */}
                <View style={styles.overlayHeader} pointerEvents="box-none">
                  <HoverPressable
                    style={styles.backButton}
                    onPress={isStreaming ? handleStopStream : () => setSelectedStream(null)}
                  >
                    <Text style={styles.backButtonText}>← {isStreaming ? 'End Live' : 'Exit'}</Text>
                  </HoverPressable>
                  
                  {!isStreaming && !activeProfile?.subscribed && (
                    <View style={styles.trialBadge}>
                      <Text style={styles.trialBadgeText}>
                        ⚡ Trial: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.headerStreamDetails}>
                    <Text style={styles.overlayStreamTitle} numberOfLines={1}>
                      {isStreaming ? myStream?.title : (selectedStream.title || selectedStream.name)}
                    </Text>
                    <Text style={styles.overlayStreamMeta}>
                      {isStreaming ? myStream?.category : selectedStream.category || selectedStream.cat || 'Live'}
                      {((isStreaming ? myStream?.location : selectedStream.location) ? `  ·  📍 ${isStreaming ? myStream.location : selectedStream.location}` : '')}
                    </Text>
                  </View>

                  <View style={styles.headerStatsRow}>
                    {(!isStreaming && !selectedStream.isOfficial && !selectedStream.isLive) ? (
                      <View style={[styles.livePill, { backgroundColor: '#475569' }]}>
                        <Text style={styles.livePillText}>RECORDED</Text>
                      </View>
                    ) : (
                      <View style={styles.livePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePillText}>LIVE</Text>
                      </View>
                    )}
                    <View style={styles.viewerPill}>
                      <Text style={styles.viewerText}>
                        👁️ {isStreaming ? (myStream?.viewers || 0).toLocaleString() : (selectedStream.viewers?.toLocaleString() || 0)} {(!isStreaming && !selectedStream.isOfficial && !selectedStream.isLive) ? 'Views' : 'Watching Live'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* AI Multi-lingual Preference Settings Selector Dropdowns */}
                {isAiSubtitlesEnabled && (
                  <View style={styles.languageSelectorsBar}>
                    {/* Subtitle language selectors */}
                    <View style={styles.languageSelectorRow}>
                      <Text style={styles.langSelectorLabel}>Subtitles:</Text>
                      {[
                        { id: 'en', label: 'English' },
                        { id: 'te', label: 'తెలుగు' },
                        { id: 'hi', label: 'हिंदी' },
                        { id: 'ta', label: 'தமிழ்' },
                        { id: 'ml', label: 'മലയാളം' },
                        { id: 'kn', label: 'ಕನ್ನಡ' },
                        { id: 'bn', label: 'বাংলা' },
                        { id: 'mr', label: 'मराठी' }
                      ].map((l) => (
                        <Pressable
                          key={l.id}
                          style={[styles.langSelectBtn, subtitleLang === l.id && styles.langSelectBtnActive]}
                          onPress={() => setSubtitleLang(l.id as any)}
                        >
                          <Text style={[styles.langSelectBtnText, subtitleLang === l.id && styles.langSelectBtnTextActive]}>
                            {l.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    
                    {/* Voice language selectors */}
                    <View style={styles.languageSelectorRow}>
                      <Text style={styles.langSelectorLabel}>AI Voice Translator:</Text>
                      {[
                        { id: 'none', label: 'OFF' },
                        { id: 'en', label: 'English' },
                        { id: 'te', label: 'తెలుగు' },
                        { id: 'hi', label: 'हिंदी' },
                        { id: 'ta', label: 'தமிழ்' },
                        { id: 'ml', label: 'മലയാളം' },
                        { id: 'kn', label: 'ಕನ್ನಡ' },
                        { id: 'bn', label: 'বাংলা' },
                        { id: 'mr', label: 'मराठी' }
                      ].map((l) => (
                        <Pressable
                          key={l.id}
                          style={[styles.langSelectBtn, voiceLang === l.id && styles.langSelectBtnActive]}
                          onPress={() => setVoiceLang(l.id as any)}
                        >
                          <Text style={[styles.langSelectBtnText, voiceLang === l.id && styles.langSelectBtnTextActive]}>
                            {l.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Subtitles caption box (AI real-time transcript mapped to language choice) */}
                {isAiSubtitlesEnabled && (
                  <View style={styles.subtitleOverlay}>
                    <Text style={styles.subtitleTextTitle}>🤖 AI Live Transcription ({subtitleLang.toUpperCase()})</Text>
                    <Text style={styles.subtitleTextMain}>
                      {currentSubtitle 
                        ? (currentSubtitle[subtitleLang] || currentSubtitle[spokenLang] || currentSubtitle.en || "Listening for speech...")
                        : (subtitleStatus === 'error' ? "Unable to generate subtitles." : "Listening for speech...")}
                    </Text>
                  </View>
                )}

                {/* Bottom Section Layout */}
                <View style={styles.overlayBottom} pointerEvents="box-none">
                  
                  {/* Left Column: Comments Feed & Floating Emojis */}
                  <View style={styles.overlayLeftCol} pointerEvents="box-none">
                    
                    {/* 3D-feeling Floating Emojis Container */}
                    <View style={styles.flyingEmojisWrapper} pointerEvents="none">
                      {floatingEmojis.map((e) => (
                        <Animated.Text
                          key={e.id}
                          style={[
                            styles.flyingEmojiText,
                            {
                              transform: [
                                { translateY: e.yAnim },
                                { translateX: e.xAnim },
                                { scale: e.scaleAnim },
                                {
                                  rotate: e.rotAnim.interpolate({
                                    inputRange: [-30, 30],
                                    outputRange: ['-30deg', '30deg'],
                                  }),
                                },
                              ],
                              opacity: e.opacityAnim,
                            },
                          ]}
                        >
                          {e.emoji}
                        </Animated.Text>
                      ))}
                    </View>

                    {/* Left corner tiny Instagram-style floating comments list (only rendered when half screen chat is closed) */}
                    {!showHalfScreenChat && (
                      <View style={styles.bottomLeftChatFlow}>
                        <ScrollView style={{ flex: 1 }} pointerEvents="none">
                          {chatMessages.slice(-4).map((m, idx) => {
                            const isEmojiMsg = m.message.startsWith('[EMOJI]:');
                            const displayMessage = isEmojiMsg ? m.message.replace('[EMOJI]:', '') : m.message;
                            return (
                              <View key={m.id || idx} style={styles.flowBubble}>
                                <Text style={styles.flowAuthor}>{m.name}: </Text>
                                <Text style={isEmojiMsg ? styles.flowEmojiBody : styles.flowBody} numberOfLines={2}>
                                  {displayMessage}
                                </Text>
                              </View>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Right Column: Interaction Action Buttons */}
                  <View style={styles.overlayRightCol}>
                    <HoverPressable style={styles.overlayControlBtn} onPress={handleScreenRotate}>
                      <Text style={styles.overlayControlIcon}>🔄</Text>
                      <Text style={styles.overlayControlLabel}>Rotate</Text>
                    </HoverPressable>

                    <HoverPressable
                      style={[styles.overlayControlBtn, isAiSubtitlesEnabled && styles.controlBtnActive]}
                      onPress={handleToggleSubtitles}
                    >
                      <Text style={styles.overlayControlIcon}>💬</Text>
                      <Text style={styles.overlayControlLabel}>AI Sub</Text>
                    </HoverPressable>

                    {isStreaming && (
                      <HoverPressable style={styles.overlayControlBtn} onPress={handleSimulateSpeech}>
                        <Text style={styles.overlayControlIcon}>🎙️</Text>
                        <Text style={styles.overlayControlLabel}>Speech</Text>
                      </HoverPressable>
                    )}

                    {isStreaming && (
                      <HoverPressable style={styles.overlayControlBtn} onPress={handleRotateCamera}>
                        <Text style={styles.overlayControlIcon}>🔄</Text>
                        <Text style={styles.overlayControlLabel}>Flip Cam</Text>
                      </HoverPressable>
                    )}

                    {isStreaming && (
                      <HoverPressable
                        style={[styles.overlayControlBtn, isDualCamera && styles.controlBtnActive]}
                        onPress={handleToggleDualCamera}
                      >
                        <Text style={styles.overlayControlIcon}>👥</Text>
                        <Text style={styles.overlayControlLabel}>Dual Cam</Text>
                      </HoverPressable>
                    )}

                    <HoverPressable
                      style={[styles.overlayControlBtn, showHalfScreenChat && styles.controlBtnActive]}
                      onPress={() => setShowHalfScreenChat(!showHalfScreenChat)}
                    >
                      <Text style={styles.overlayControlIcon}>💬</Text>
                      <Text style={styles.overlayControlLabel}>Chat</Text>
                    </HoverPressable>
                  </View>
                </View>

                {/* Sliding Half-Screen Chat / Comments Box Drawer */}
                {showHalfScreenChat && (
                  <View 
                    style={[
                      styles.halfScreenChatBox,
                      screenWidth < 480 && {
                        width: screenWidth - 32,
                        left: 16,
                        right: 16,
                      }
                    ]}
                  >
                    <View style={styles.halfChatHeader}>
                      <Text style={styles.halfChatTitle}>Live Chat Comments</Text>
                      <Pressable onPress={() => setShowHalfScreenChat(false)}>
                        <Text style={styles.closeHalfChatText}>✕ Close</Text>
                      </Pressable>
                    </View>
                    <ScrollView
                      ref={chatEndRef}
                      style={styles.halfChatScroll}
                      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
                    >
                      {chatMessages.length === 0 ? (
                        <Text style={styles.halfNoComments}>No comments posted. Be the first to write!</Text>
                      ) : (
                        chatMessages.map((m, idx) => {
                          const isEmojiMsg = m.message.startsWith('[EMOJI]:');
                          const isAudioMsg = m.message.startsWith('[AUDIO]:');
                          const displayMessage = isEmojiMsg ? m.message.replace('[EMOJI]:', '') : m.message;
                          return (
                            <View key={m.id || idx} style={styles.halfChatBubble}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>{m.name.charAt(0).toUpperCase()}</Text>
                                </View>
                                <Text style={styles.halfChatAuthor}>{m.name}</Text>
                                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                              </View>
                              {isAudioMsg ? (
                                <VoicePlayer url={m.message.replace('[AUDIO]:', '')} />
                              ) : (
                                <Text style={isEmojiMsg ? styles.halfChatEmojiBody : styles.halfChatBody}>
                                  {displayMessage}
                                </Text>
                              )}
                            </View>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Bottom Chat Inputs & Reaction quick-bar */}
                <View style={styles.overlayInputRow}>
                  {isRecording ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, gap: 8, flex: 1, marginRight: 8 }}>
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 11, flex: 1 }}>🔴 Rec {recordingDuration}s</Text>
                      <HoverPressable 
                        style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 }}
                        onPress={isRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording}
                      >
                        <Text style={{ color: '#fff', fontSize: 10 }}>{isRecordingPaused ? '▶️' : '⏸️'}</Text>
                      </HoverPressable>
                      <HoverPressable 
                        style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 6 }}
                        onPress={cancelVoiceRecording}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 10 }}>✕</Text>
                      </HoverPressable>
                      <HoverPressable 
                        style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#3B82F6', borderRadius: 6 }}
                        onPress={handleSendVoiceMessage}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Send</Text>
                      </HoverPressable>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={styles.overlayChatInput}
                        placeholder="Write comments..."
                        placeholderTextColor="rgba(255, 255, 255, 0.45)"
                        value={chatInput}
                        onChangeText={setChatInput}
                        onSubmitEditing={handleSendChat}
                      />
                      
                      <HoverPressable 
                        style={{ padding: 10, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, justifyContent: 'center' }}
                        onPress={startVoiceRecording}
                      >
                        <Text style={{ fontSize: 14 }}>🎙️</Text>
                      </HoverPressable>

                      <HoverPressable style={styles.sendIconBtn} onPress={handleSendChat}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Send</Text>
                      </HoverPressable>
                    </>
                  )}

                  <View style={styles.quickEmojisRow}>
                    {['🔥', '❤️', '😄', '😢', '😭'].map((emo) => (
                      <HoverPressable
                        key={emo}
                        style={styles.emojiReactionBtn}
                        onPress={() => sendEmojiSignal(emo)}
                      >
                        <Text style={styles.emojiReactionText}>{emo}</Text>
                      </HoverPressable>
                    ))}
                  </View>
                </View>

              </View>
            </>
          )}
        </View>
      ) : (
        /* 2. DISCOVERY EXPLORER VIEW (If no stream is actively playing) */
        <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? 120 : 96 }}>
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>NEXUS Live Explorer</Text>
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(user?.role === 'super_admin' || user?.role === 'news_reader') && (
                <HoverPressable
                  style={[styles.goLiveButton, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}
                  onPress={() => navigation.navigate('StudioDashboard')}
                >
                  <Text style={[styles.goLiveButtonText, { color: '#10B981' }]}>🎬 Studio Control</Text>
                </HoverPressable>
              )}

              <HoverPressable
                style={[styles.goLiveButton, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }]}
                onPress={() => navigation.navigate('ReporterBroadcast')}
              >
                <Text style={[styles.goLiveButtonText, { color: '#3B82F6' }]}>🛰️ Reporter Station</Text>
              </HoverPressable>

              <HoverPressable
                style={styles.goLiveButton}
                onPress={() => {
                  if (user?.role !== 'super_admin' && user?.role !== 'news_reader' && user?.role !== 'user' && user?.role !== 'reporter') {
                    Alert.alert(
                      'Access Denied',
                      'Only Authorized News Readers or Admins can go live. Contact administrator to request permission.',
                      [{ text: 'OK' }]
                    );
                    return;
                  }
                  setStreamTitle('');
                  setStreamLocation('');
                  setShowLocationSuggestions(false);
                  setShowGoLiveModal(true);
                }}
              >
                <View style={styles.pulseDot} />
                <Text style={styles.goLiveButtonText}>Go Live (P2P)</Text>
              </HoverPressable>
            </View>
          </View>

          <View style={styles.tabContainer}>
            <HoverPressable
              style={[styles.tabButton, activeTab === 'channels' && styles.tabButtonActive]}
              onPress={() => setActiveTab('channels')}
            >
              <Text style={[styles.tabText, activeTab === 'channels' && styles.tabTextActive]}>Official TV Channels</Text>
            </HoverPressable>
            <HoverPressable
              style={[styles.tabButton, activeTab === 'users' && styles.tabButtonActive]}
              onPress={() => setActiveTab('users')}
            >
              <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>User Streams</Text>
            </HoverPressable>
          </View>

          <ScrollView style={styles.epgScroll} contentContainerStyle={styles.epgContent}>
            {activeTab === 'channels' ? (
              officialChannels.map((c) => (
                <HoverPressable
                  key={c.id}
                  style={styles.epgRow}
                  onPress={() => navigation.navigate('Live', { streamId: c.id })}
                >
                  <View style={[styles.epgIcon, { backgroundColor: colors.primary }]}>
                    <Text style={styles.epgIconText}>{c.name.split(' ')[0]?.charAt(0) ?? 'N'}</Text>
                  </View>
                  <View style={styles.epgDetails}>
                    <Text style={styles.epgName}>{c.name}</Text>
                    <Text style={styles.epgShow}>Now: {c.now}  ·  Next: {c.next}</Text>
                  </View>
                  <Text style={styles.epgBadge}>{c.cat}</Text>
                </HoverPressable>
              ))
            ) : isLoadingStreams ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : userStreams.length === 0 ? (
              <View style={styles.emptyStreams}>
                <Text style={styles.emptyText}>No user live broadcasts or recordings right now.</Text>
                <Text style={styles.emptySub}>Tap "Go Live" at the top to start your live broadcast room!</Text>
              </View>
            ) : (
              userStreams.map((s) => (
                <HoverPressable
                  key={s.id}
                  style={styles.epgRow}
                  onPress={() => {
                    if (s.isLive) {
                      navigation.navigate('Live', { streamId: s.id });
                    } else {
                      navigation.navigate('RecordedLivePlayer', { stream: s });
                    }
                  }}
                >
                  <View style={[styles.epgIcon, { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={styles.epgIconText}>👤</Text>
                  </View>
                  <View style={styles.epgDetails}>
                    <Text style={styles.epgName}>
                      {s.profile_name} {s.isLive ? 'is Live' : '(Recorded)'}
                    </Text>
                    <Text style={styles.epgShow}>"{s.title}"{s.location ? `  ·  📍 ${s.location}` : ''}</Text>
                  </View>
                  <Text style={styles.epgBadge}>{s.category}</Text>
                </HoverPressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Start Live Stream Modal */}
      <Modal
        visible={showGoLiveModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGoLiveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', display: 'flex', flexDirection: 'column' }]}>
            <Text style={styles.modalTitle}>Go Live Room</Text>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={true}>
              <Text style={styles.inputLabel}>Stream Title <Text style={{ color: '#e50914' }}>*</Text></Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Q&A session or Devotional prayers"
                placeholderTextColor={colors.placeholder}
                value={streamTitle}
                onChangeText={setStreamTitle}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoriesContainer}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.catChip,
                      streamCategory === cat && styles.catChipActive,
                    ]}
                    onPress={() => setStreamCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        streamCategory === cat && styles.catChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
              
              <Text style={styles.inputLabel}>Camera Direction</Text>
              <View style={styles.categoriesContainer}>
                <HoverPressable
                  style={[styles.catChip, (facingMode === 'user' && !isDualCamera) && styles.catChipActive]}
                  onPress={() => {
                    setFacingMode('user');
                    setIsDualCamera(false);
                  }}
                >
                  <Text style={[styles.catChipText, (facingMode === 'user' && !isDualCamera) && styles.catChipTextActive]}>🤳 Front Camera</Text>
                </HoverPressable>
                <HoverPressable
                  style={[styles.catChip, (facingMode === 'environment' && !isDualCamera) && styles.catChipActive]}
                  onPress={() => {
                    setFacingMode('environment');
                    setIsDualCamera(false);
                  }}
                >
                  <Text style={[styles.catChipText, (facingMode === 'environment' && !isDualCamera) && styles.catChipTextActive]}>📷 Back Camera</Text>
                </HoverPressable>
                <HoverPressable
                  style={[styles.catChip, isDualCamera && styles.catChipActive]}
                  onPress={() => setIsDualCamera(true)}
                >
                  <Text style={[styles.catChipText, isDualCamera && styles.catChipTextActive]}>👥 Dual Camera</Text>
                </HoverPressable>
              </View>

              <Text style={styles.inputLabel}>AI Spoken Language</Text>
              <View style={styles.categoriesContainer}>
                {[
                  { id: 'en', label: 'English' },
                  { id: 'te', label: 'తెలుగు' },
                  { id: 'hi', label: 'हिंदी' },
                  { id: 'ta', label: 'தமிழ்' },
                  { id: 'ml', label: 'മലയാളം' },
                  { id: 'kn', label: 'ಕನ್ನಡ' },
                  { id: 'bn', label: 'বাংলা' },
                  { id: 'mr', label: 'मराठी' }
                ].map((l) => (
                  <Pressable
                    key={l.id}
                    style={[
                      styles.catChip,
                      spokenLang === l.id && styles.catChipActive,
                    ]}
                    onPress={() => setSpokenLang(l.id as any)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        spokenLang === l.id && styles.catChipTextActive,
                      ]}
                    >
                      {l.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Stream Location</Text>
              <View style={styles.locationInputContainer}>
                <View style={styles.locationRow}>
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Search or enter location (e.g. Guntur, AP)"
                    placeholderTextColor={colors.placeholder}
                    value={streamLocation}
                    onChangeText={(text) => {
                      setStreamLocation(text);
                      setShowLocationSuggestions(true);
                    }}
                    onFocus={() => setShowLocationSuggestions(true)}
                  />
                  <HoverPressable
                    style={[styles.gpsButton, isLocating && styles.gpsButtonDisabled]}
                    onPress={handleGetCurrentLocation}
                    disabled={isLocating}
                  >
                    <Text style={styles.gpsButtonText}>
                      {isLocating ? '⏳...' : '📍 GPS'}
                    </Text>
                  </HoverPressable>
                </View>

                {showLocationSuggestions && (
                  <View style={styles.suggestionsContainer}>
                    <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
                      {LOCATION_SUGGESTIONS.filter(item =>
                        item.toLowerCase().includes(streamLocation.toLowerCase())
                      ).map((item) => (
                        <Pressable
                          key={item}
                          style={({ hovered }: any) => [
                            styles.suggestionItem,
                            hovered && { backgroundColor: 'rgba(255, 255, 255, 0.08)' }
                          ]}
                          onPress={() => {
                            setStreamLocation(item);
                            setShowLocationSuggestions(false);
                          }}
                        >
                          <Text style={styles.suggestionItemText}>📍 {item}</Text>
                        </Pressable>
                      ))}
                      {LOCATION_SUGGESTIONS.filter(item =>
                        item.toLowerCase().includes(streamLocation.toLowerCase())
                      ).length === 0 && (
                        <View style={styles.suggestionItem}>
                          <Text style={[styles.suggestionItemText, { color: 'rgba(255, 255, 255, 0.4)' }]}>
                            No suggestions found. Press enter to use typed value.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <HoverPressable
                style={styles.cancelButton}
                onPress={() => setShowGoLiveModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </HoverPressable>

              <HoverPressable
                style={[styles.startModalButton, !streamTitle.trim() && { opacity: 0.5 }]}
                onPress={handleStartStream}
                disabled={!streamTitle.trim()}
              >
                <Text style={styles.startModalButtonText}>Start Broadcast</Text>
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Premium Upgrade Modal */}
      <Modal
        visible={showPremiumModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPremiumModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalBody, { maxHeight: '90%', display: 'flex', flexDirection: 'column' }]}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              style={styles.premiumHeader}
            >
              <Text style={styles.premiumTitle}>👑 Upgrade to Premium</Text>
              <Text style={styles.premiumSubtitle}>Unlock Unlimited Live Streaming & AI Features</Text>
            </LinearGradient>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={true}>
              <Text style={styles.warningMessage}>
                Your free live streaming trial has ended. Upgrade to Premium to continue watching uninterrupted live content.
              </Text>
              
              <Text style={styles.fieldLabel}>Cardholder Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={cardName}
                onChangeText={setCardName}
              />

              <Text style={styles.fieldLabel}>Card Number</Text>
              <TextInput
                style={styles.input}
                placeholder="1111-2222-3333-4444"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numeric"
                value={cardNumber}
                onChangeText={setCardNumber}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.fieldLabel}>Expiry Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="MM/YY"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={cardExpiry}
                    onChangeText={setCardExpiry}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>CVV</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry={true}
                    keyboardType="numeric"
                    value={cardCvv}
                    onChangeText={setCardCvv}
                  />
                </View>
              </View>

              <HoverPressable style={styles.modalUpgradeBtn} onPress={handleUpgradeLive} disabled={paying}>
                {paying ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalUpgradeBtnText}>Pay & Activate Premium - $9.99/mo</Text>
                )}
              </HoverPressable>

              <HoverPressable style={styles.closeBtn} onPress={() => setShowPremiumModal(false)}>
                <Text style={styles.closeBtnText}>Maybe Later</Text>
              </HoverPressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  goLiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 71, 161, 0.08)',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  goLiveButtonText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 6,
  },

  // Immersive layout modes
  immersiveWrapper: { flex: 1, position: 'relative', backgroundColor: '#000' },
  videoContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 0,
  },
  video: { width: '100%', height: '100%', position: 'absolute' },
  noPlayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  noPlayerText: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 14, marginTop: 10 },
  fullScreenVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  nativeFallbackContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  nativeFallbackText: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 12, marginTop: 10 },

  // Aesthetic overlay layers
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
    zIndex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    zIndex: 2,
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  backButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  backButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headerStreamDetails: {
    flex: 1,
    marginLeft: 12,
  },
  overlayStreamTitle: { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  overlayStreamMeta: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 11, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  
  headerStatsRow: { flexDirection: 'row', alignItems: 'center' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 5 },
  livePillText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  viewerPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewerText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  durationPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
  },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // AI Language Preferences selector bar
  languageSelectorsBar: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    zIndex: 30,
  },
  languageSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  langSelectorLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    width: 120,
  },
  langSelectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langSelectBtnActive: {
    backgroundColor: 'rgba(13, 71, 161, 0.12)',
    borderColor: colors.primary,
  },
  langSelectBtnText: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '800',
  },
  langSelectBtnTextActive: {
    color: colors.primary,
  },

  // AI Subtitles display box
  subtitleOverlay: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: '90%',
    maxWidth: 550,
    position: 'absolute',
    bottom: 180,
    zIndex: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  subtitleTextTitle: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitleTextMain: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Bottom elements layout
  overlayBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    zIndex: 10,
  },
  overlayLeftCol: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayRightCol: {
    alignItems: 'center',
    marginLeft: 12,
    gap: 12,
  },
  overlayControlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
  },
  overlayControlIcon: { fontSize: 18 },
  overlayControlLabel: { color: colors.text, fontSize: 9, fontWeight: '700', marginTop: 2 },

  // Bottom Left corner transparent Instagram/TikTok comments flow
  bottomLeftChatFlow: {
    width: 280,
    height: 150,
    justifyContent: 'flex-end',
  },
  flowBubble: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  flowAuthor: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  flowBody: { color: colors.text, fontSize: 12 },
  flowEmojiBody: { fontSize: 14 },

  // Sliding Half-Screen Comments Box
  halfScreenChatBox: {
    position: 'absolute',
    bottom: 75,
    right: 16,
    width: 320,
    height: 380,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    zIndex: 50,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }
    }) as any,
  },
  halfChatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  halfChatTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  closeHalfChatText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  halfChatScroll: { flex: 1 },
  halfNoComments: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 150 },
  halfChatBubble: {
    flexDirection: 'row',
    marginBottom: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '90%',
  },
  halfChatAuthor: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  halfChatBody: { color: colors.text, fontSize: 12 },
  halfChatEmojiBody: { fontSize: 15 },

  // Floating reactions emoji system
  flyingEmojisWrapper: {
    position: 'absolute',
    bottom: 200,
    left: 20,
    width: 150,
    height: 300,
    zIndex: 15,
  },
  flyingEmojiText: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    fontSize: 28,
  },

  // Overlay Input bar panel
  overlayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    zIndex: 10,
  },
  overlayChatInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 13,
  },
  sendIconBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginLeft: 8,
    justifyContent: 'center',
  },
  quickEmojisRow: {
    flexDirection: 'row',
    marginLeft: 8,
    gap: 4,
  },
  emojiReactionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiReactionText: { fontSize: 18 },

  // Discover EPG Layout Styles
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: colors.primary },
  epgScroll: { flex: 1 },
  epgContent: { padding: 12, paddingBottom: 90 },
  epgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  epgRowActive: { borderColor: colors.primary, backgroundColor: 'rgba(13, 71, 161, 0.08)' },
  epgIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  epgIconText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  epgDetails: { flex: 1 },
  epgName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  epgShow: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  epgBadge: {
    color: colors.textDim,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '800',
  },
  emptyStreams: { alignItems: 'center', padding: 30 },
  emptyText: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 4 },

  // Start Live Stream Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  inputLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  modalInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 14,
  },
  categoriesContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  catChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  catChipActive: {
    backgroundColor: 'rgba(13, 71, 161, 0.12)',
    borderColor: colors.primary,
  },
  catChipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: colors.primary },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 12 },
  cancelButtonText: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  startModalButton: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  startModalButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  locationInputContainer: {
    position: 'relative',
    marginBottom: 20,
    zIndex: 100,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  gpsButton: {
    backgroundColor: 'rgba(13, 71, 161, 0.08)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsButtonDisabled: {
    opacity: 0.5,
  },
  gpsButtonText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    maxHeight: 160,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    zIndex: 200,
  },
  suggestionsScroll: {
    flex: 1,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionItemText: {
    color: colors.text,
    fontSize: 13,
  },
  trialBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 10,
    alignSelf: 'center',
  },
  trialBadgeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBody: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: colors.bg,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  premiumHeader: {
    padding: 24,
    alignItems: 'center',
  },
  premiumTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  premiumSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  warningMessage: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalUpgradeBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  modalUpgradeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  closeBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 6,
  },
  closeBtnText: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  desktopImmersiveWrapper: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  desktopLeftColumn: {
    flex: 1,
    height: '100%',
    backgroundColor: '#000',
    justifyContent: 'space-between',
  },
  desktopVideoContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  videoContainerRelative: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flyingEmojisWrapperRelative: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    width: 150,
    height: 200,
    zIndex: 15,
  },
  desktopControlsPanel: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
  },
  desktopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  desktopStreamTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  desktopStreamMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  desktopActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  desktopActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  desktopActionBtnActive: {
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
    borderColor: colors.accent,
  },
  desktopActionBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  desktopActionIcon: {
    fontSize: 14,
  },
  desktopActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  desktopSubtitleOverlay: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '80%',
    maxWidth: 600,
    position: 'absolute',
    bottom: 24,
    zIndex: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  desktopLangPanel: {
    marginTop: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  desktopRightColumn: {
    width: 340,
    height: '100%',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    justifyContent: 'space-between',
  },
  desktopChatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  desktopChatTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  desktopChatScroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  desktopChatBubble: {
    flexDirection: 'row',
    marginBottom: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  desktopChatAuthor: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  desktopChatBody: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
  },
  desktopChatEmojiBody: {
    fontSize: 16,
  },
  desktopChatInputContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  desktopInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  desktopChatInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 13,
  },
  desktopChatSendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  desktopQuickEmojisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  desktopEmojiReactionBtn: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
