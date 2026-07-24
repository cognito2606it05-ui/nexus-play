import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import { HoverPressable } from './HoverPressable';
import { LinearGradient } from 'expo-linear-gradient';

type Message = {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
};

const getFormattedTime = () => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
};

const handleLinkPress = (url: string) => {
  Linking.openURL(url).catch((err) => console.error('Failed to open link:', err));
};

export function NexusAssistantModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const navigation = useNavigation<any>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  // Load assistant history from Neon PostgreSQL on visible trigger
  useEffect(() => {
    if (visible) {
      api.getAssistantHistory().then(res => {
        if (res.data && res.data.length > 0) {
          const formatted = res.data.map((h: any) => ({
            role: h.role,
            text: h.text,
            timestamp: h.created_at ? new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : getFormattedTime()
          }));
          setMessages(formatted);
        } else {
          // If no history, seed the default hello message
          setMessages([
            {
              role: 'model',
              text: 'Hello! I am your **Nexus AI Assistant**. 🚀\nI can recommend movies, summarize current news, guide you on subscription plans, or chat about anything. What are you looking to watch or read today?',
              timestamp: getFormattedTime(),
            },
          ]);
        }
      }).catch(err => {
        console.error('Failed to load assistant history:', err);
      });
    }
  }, [visible]);

  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse voice visualizer waves
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isVoiceMode) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.8,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [isVoiceMode]);

  const handleSend = async (text: string) => {
    if (loading || !text.trim()) return;
    const userMsg = text.trim();
    setInputText('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg, timestamp: getFormattedTime() }]);
    setLoading(true);

    try {
      // Keep only last 10 messages for context size
      const historyPayload = messages.map((m) => ({
        role: m.role,
        text: m.text,
      })).slice(-10);

      const res = await api.sendAssistantMessage(userMsg, historyPayload);
      setMessages((prev) => [...prev, { role: 'model', text: res.reply, timestamp: getFormattedTime() }]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `⚠️ **Connection Error**\n\n${err.message || 'Sorry, I encountered an issue connecting to my Gemini engine.'}\n\nPlease check your network and try again!`,
          timestamp: getFormattedTime(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const startVoiceCapture = () => {
    if (loading) return;
    setIsVoiceMode(true);
    // Simulate speech-to-text after 2.5 seconds
    setTimeout(() => {
      setIsVoiceMode(false);
      const voicePrompts = [
        'Recommend some movies to watch',
        'Summarize the latest breaking news stories',
        'Tell me about the benefits of Premium membership',
        'Are there any space exploration news available?',
      ];
      const randomPrompt = voicePrompts[Math.floor(Math.random() * voicePrompts.length)];
      handleSend(randomPrompt);
    }, 2500);
  };

  const renderInlineMarkdown = (text: string) => {
    const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\)|https?:\/\/[^\s]+)/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={index} style={{ fontWeight: '800', color: colors.primary }}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={index} style={markdownStyles.inlineCode}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      if (part.startsWith('[') && part.includes('](')) {
        const match = part.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
          const linkText = match[1];
          const linkUrl = match[2];
          return (
            <Text
              key={index}
              style={markdownStyles.link}
              onPress={() => handleLinkPress(linkUrl)}
            >
              {linkText}
            </Text>
          );
        }
      }
      if (part.startsWith('http://') || part.startsWith('https://')) {
        return (
          <Text
            key={index}
            style={markdownStyles.link}
            onPress={() => handleLinkPress(part)}
          >
            {part}
          </Text>
        );
      }
      return part;
    });
  };

  const parseMarkdown = (text: string) => {
    if (!text) return [];

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentCodeBlock: string[] = [];
    let isInsideCode = false;
    let codeLang = '';
    
    let currentTableRows: string[][] = [];
    let isInsideTable = false;

    const flushCodeBlock = (key: string) => {
      const codeText = currentCodeBlock.join('\n');
      elements.push(
        <View key={key} style={markdownStyles.codeBlockContainer}>
          {codeLang ? <Text style={markdownStyles.codeLang}>{codeLang.toUpperCase()}</Text> : null}
          <Text style={markdownStyles.codeBlockText}>{codeText}</Text>
        </View>
      );
      currentCodeBlock = [];
      isInsideCode = false;
      codeLang = '';
    };

    const flushTable = (key: string) => {
      elements.push(
        <View key={key} style={markdownStyles.tableContainer}>
          {currentTableRows.map((row, rIdx) => {
            const isSeparator = row.every(cell => cell.trim().match(/^-+$/));
            if (isSeparator) return null;

            return (
              <View key={rIdx} style={[markdownStyles.tableRow, rIdx === 0 && markdownStyles.tableHeaderRow]}>
                {row.map((cell, cIdx) => (
                  <View key={cIdx} style={[markdownStyles.tableCell, rIdx === 0 && markdownStyles.tableHeaderCell]}>
                    <Text style={[markdownStyles.tableCellText, rIdx === 0 && markdownStyles.tableHeaderCellText]}>
                      {renderInlineMarkdown(cell.trim())}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }).filter(Boolean)}
        </View>
      );
      currentTableRows = [];
      isInsideTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (isInsideCode) {
          flushCodeBlock(`code-${i}`);
        } else {
          isInsideCode = true;
          codeLang = trimmed.slice(3).trim();
        }
        continue;
      }

      if (isInsideCode) {
        currentCodeBlock.push(line);
        continue;
      }

      if (trimmed.startsWith('|')) {
        isInsideTable = true;
        const cells = line.split('|').slice(1, -1);
        currentTableRows.push(cells);
        continue;
      } else {
        if (isInsideTable) {
          flushTable(`table-${i}`);
        }
      }

      if (trimmed.startsWith('#')) {
        const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          const level = match[1].length;
          const headingText = match[2];
          const headingStyle = 
            level === 1 ? markdownStyles.h1 :
            level === 2 ? markdownStyles.h2 :
            markdownStyles.h3;
          elements.push(
            <Text key={`h-${i}`} style={headingStyle}>
              {renderInlineMarkdown(headingText)}
            </Text>
          );
          continue;
        }
      }

      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const bulletText = trimmed.slice(2);
        elements.push(
          <View key={`bullet-${i}`} style={markdownStyles.listItem}>
            <Text style={[markdownStyles.bulletPoint, { color: colors.primary }]}>• </Text>
            <Text style={markdownStyles.listText}>
              {renderInlineMarkdown(bulletText)}
            </Text>
          </View>
        );
        continue;
      }

      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        const num = numMatch[1];
        const listText = numMatch[2];
        elements.push(
          <View key={`numlist-${i}`} style={markdownStyles.listItem}>
            <Text style={[markdownStyles.bulletPoint, { color: colors.primary }]}>{num}. </Text>
            <Text style={markdownStyles.listText}>
              {renderInlineMarkdown(listText)}
            </Text>
          </View>
        );
        continue;
      }

      if (trimmed === '') {
        elements.push(<View key={`empty-${i}`} style={{ height: 6 }} />);
        continue;
      }

      elements.push(
        <Text key={`p-${i}`} style={markdownStyles.paragraph}>
          {renderInlineMarkdown(line)}
        </Text>
      );
    }

    if (isInsideCode) flushCodeBlock('code-end');
    if (isInsideTable) flushTable('table-end');

    return elements;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.modalBody}>
          {/* Header */}
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.header}
          >
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>Nexus Assistant 🤖</Text>
              <Text style={styles.headerSubtitle}>Gemini Intelligence Engine v2.5</Text>
            </View>
            <HoverPressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </HoverPressable>
          </LinearGradient>

          {/* Quick Shortcuts */}
          <View style={styles.shortcutsRow}>
            <HoverPressable
              style={styles.shortcutItem}
              disabled={loading}
              onPress={() => handleSend('Recommend some movies')}
            >
              <Text style={styles.shortcutText}>🎬 Suggest Movies</Text>
            </HoverPressable>
            <HoverPressable
              style={styles.shortcutItem}
              disabled={loading}
              onPress={() => handleSend('Summarize current news')}
            >
              <Text style={styles.shortcutText}>📰 Summarize News</Text>
            </HoverPressable>
            <HoverPressable
              style={styles.shortcutItem}
              disabled={loading}
              onPress={() => handleSend('How do I subscribe to Premium?')}
            >
              <Text style={styles.shortcutText}>👑 Upgrade Help</Text>
            </HoverPressable>
          </View>

          {/* Messages List */}
          <ScrollView
            ref={scrollRef}
            style={styles.messagesContainer}
            contentContainerStyle={{ padding: 16 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((m, idx) => (
              <View
                key={idx}
                style={[
                  styles.msgRow,
                  m.role === 'user' ? styles.userRow : styles.assistantRow,
                ]}
              >
                <View style={m.role === 'user' ? styles.userMsgContainer : styles.assistantMsgContainer}>
                  <View
                    style={[
                      styles.msgBubble,
                      m.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    <View style={{ flexDirection: 'column' }}>
                      {parseMarkdown(m.text)}
                    </View>
                  </View>
                  <Text style={[styles.timeText, m.role === 'user' ? styles.userTimeText : styles.assistantTimeText]}>
                    {m.timestamp}
                  </Text>
                </View>
              </View>
            ))}

            {loading && (
              <View style={styles.msgRow}>
                <View style={styles.assistantMsgContainer}>
                  <View style={[styles.msgBubble, styles.assistantBubble, { flexDirection: 'row', alignItems: 'center' }]}>
                    <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: 8 }} />
                    <Text style={[styles.msgText, { color: 'rgba(255, 255, 255, 0.7)' }]}>Thinking...</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Voice Interaction Overlay */}
          {isVoiceMode && (
            <View style={styles.voiceOverlay}>
              <Animated.View
                style={[
                  styles.voiceWave,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.8],
                      outputRange: [0.6, 0.1],
                    }),
                  },
                ]}
              />
              <View style={styles.voiceCenter}>
                <Text style={styles.voiceMic}>🎙️</Text>
              </View>
              <Text style={styles.voiceText}>Listening to voice prompt...</Text>
            </View>
          )}

          {/* Direct Navigation Panel */}
          <View style={styles.navigationPanel}>
            <HoverPressable
              style={[styles.navBtn, { borderColor: '#10B981' }]}
              onPress={() => {
                onClose();
                navigation.navigate('News');
              }}
            >
              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>Explore News</Text>
            </HoverPressable>
            <HoverPressable
              style={[styles.navBtn, { borderColor: '#8B5CF6' }]}
              onPress={() => {
                onClose();
                navigation.navigate('Movies');
              }}
            >
              <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>Browse Movies</Text>
            </HoverPressable>
            <HoverPressable
              style={[styles.navBtn, { borderColor: '#EF4444' }]}
              onPress={() => {
                onClose();
                navigation.navigate('TVChannel');
              }}
            >
              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>Watch Live</Text>
            </HoverPressable>
          </View>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={loading ? 'Waiting for response...' : 'Ask Nexus Assistant...'}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSend(inputText)}
              editable={!loading}
            />
            <HoverPressable
              style={[styles.micBtn, loading && { opacity: 0.4 }]}
              onPress={startVoiceCapture}
              disabled={loading}
            >
              <Text style={styles.micIcon}>🎙️</Text>
            </HoverPressable>
            <HoverPressable
              style={[styles.sendBtn, loading && { opacity: 0.5 }]}
              onPress={() => handleSend(inputText)}
              disabled={loading}
            >
              <Text style={styles.sendBtnText}>➔</Text>
            </HoverPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const markdownStyles = StyleSheet.create({
  h1: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
    marginBottom: 6,
    fontFamily: 'Outfit',
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
    marginBottom: 4,
    fontFamily: 'Outfit',
  },
  h3: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 6,
    marginBottom: 4,
    fontFamily: 'Outfit',
  },
  paragraph: {
    fontSize: 13.5,
    lineHeight: 19.5,
    color: '#E2E8F0',
    marginBottom: 6,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4,
  },
  bulletPoint: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  listText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 18,
    color: '#E2E8F0',
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#F43F5E',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 12,
  },
  codeBlockContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  codeLang: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  codeBlockText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#38BDF8',
    fontSize: 12,
    lineHeight: 17,
  },
  link: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  tableContainer: {
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tableHeaderRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  tableCell: {
    flex: 1,
    padding: 6,
    justifyContent: 'center',
  },
  tableHeaderCell: {},
  tableCellText: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  tableHeaderCellText: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBody: {
    width: '100%',
    maxWidth: 550,
    height: '80%',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: {},
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shortcutsRow: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#111827',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  shortcutItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  shortcutText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
  },
  msgRow: {
    width: '100%',
    marginVertical: 6,
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  userMsgContainer: {
    maxWidth: '85%',
    alignItems: 'flex-end',
  },
  assistantMsgContainer: {
    maxWidth: '85%',
    alignItems: 'flex-start',
  },
  msgBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 2,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  msgText: {
    color: '#F8FAFC',
    fontSize: 13.5,
    lineHeight: 19,
  },
  timeText: {
    fontSize: 9.5,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
    marginHorizontal: 4,
  },
  userTimeText: {
    alignSelf: 'flex-end',
  },
  assistantTimeText: {
    alignSelf: 'flex-start',
  },
  voiceOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  voiceWave: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    position: 'absolute',
  },
  voiceCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  voiceMic: {
    fontSize: 32,
  },
  voiceText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
  },
  navigationPanel: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  navBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13.5,
    marginRight: 8,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micIcon: {
    fontSize: 16,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
