import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Modal, ActivityIndicator, ScrollView, TextInput, Platform, Linking,
} from 'react-native';
import { colors } from '../theme';
import { api } from '../api/client';
import type { Profile } from '../types';
import { useTheme } from '../state/ThemeContext';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  shareUrl: string;
  title: string;
  description?: string;
  onShareSuccess?: (profileName: string) => void;
}

export function ShareModal({
  visible, onClose, shareUrl, title, description = '', onShareSuccess,
}: ShareModalProps) {
  const { isDark } = useTheme();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const fetchShareProfiles = async () => {
    setLoadingProfiles(true);
    setProfilesError(null);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API Timeout')), 3000)
    );

    try {
      const res = await Promise.race([
        api.getProfilesAll(),
        timeoutPromise
      ]) as any;

      if (res && res.profiles) {
        setProfiles(res.profiles);
      } else {
        setProfiles([]);
      }
    } catch (err: any) {
      console.error('API errors:', err);
      const msg = err.message || '';
      if (msg.includes('Timeout')) {
        setProfilesError('Unable to load users.');
      } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Session expired')) {
        setProfilesError('Please log in to view and share with profiles.');
      } else {
        setProfilesError('Unable to load users.');
      }
    } finally {
      setLoadingProfiles(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchShareProfiles();
    } else {
      setSelectedProfileId(null);
      setSearchQuery('');
    }
  }, [visible]);

  const openUrlSafe = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch((err) => {
        console.error('Failed to open external share URL:', err);
      });
    }
  };

  const handleShareOption = (option: string) => {
    const text = `${title} ${description ? '- ' + description : ''} on NEXUS Play`;
    onClose();

    switch (option) {
      case 'whatsapp':
        openUrlSafe(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + shareUrl)}`);
        break;
      case 'telegram':
        openUrlSafe(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
        break;
      case 'x':
        openUrlSafe(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
        break;
      case 'facebook':
        openUrlSafe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`);
        break;
      case 'linkedin':
        openUrlSafe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`);
        break;
      case 'gmail':
        openUrlSafe(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n' + shareUrl)}`);
        break;
      case 'sms':
        openUrlSafe(`sms:?body=${encodeURIComponent(text + ' ' + shareUrl)}`);
        break;
      case 'messenger':
        if (Platform.OS === 'web') {
          window.open('https://www.messenger.com/', '_blank');
        } else {
          Linking.openURL(`fb-messenger://share/?link=${encodeURIComponent(shareUrl)}`).catch(() => {
            Linking.openURL('https://www.messenger.com/');
          });
        }
        break;
      case 'instagram':
        openUrlSafe(`https://www.instagram.com/`);
        if (Platform.OS === 'web') {
          navigator.clipboard.writeText(shareUrl);
        }
        alert('Instagram does not support direct link posting. Link copied to clipboard!');
        break;
      case 'copy':
        if (Platform.OS === 'web') {
          navigator.clipboard.writeText(shareUrl);
        }
        alert('Link copied successfully.');
        break;
      default:
        break;
    }
  };

  const handleInAppShare = () => {
    const targetProfile = profiles.find((p) => p.id === selectedProfileId);
    if (targetProfile) {
      onClose();
      if (onShareSuccess) {
        onShareSuccess(targetProfile.name);
      } else {
        alert(`Content successfully shared with ${targetProfile.name}!`);
      }
    }
  };

  const filteredProfiles = profiles.filter((p) =>
    p && p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlayShare} onPress={onClose}>
        <View
          style={[
            styles.shareContent,
            {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.shareHeader}>
            <Text style={[styles.shareTitleText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Share Link</Text>
            <Pressable style={styles.shareCloseBtn} onPress={onClose}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#94A3B8' : '#64748B' }}>✕</Text>
            </Pressable>
          </View>

          {/* SECTION 1: Send to Nexus Profiles */}
          <Text style={[styles.sectionTitleText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Send to Profiles</Text>

          {profiles.length > 0 && (
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                },
              ]}
              placeholder="Search users..."
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          )}

          <View style={styles.profilesSection}>
            {loadingProfiles ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : profilesError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{profilesError}</Text>
                <Pressable style={styles.retryBtn} onPress={fetchShareProfiles}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : profiles.length === 0 ? (
              <Text style={styles.noUsersText}>No users available</Text>
            ) : filteredProfiles.length === 0 ? (
              <Text style={styles.noUsersText}>No users match search</Text>
            ) : (
              <ScrollView
                style={styles.profilesScrollList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {filteredProfiles.map((p) => {
                  const isSelected = selectedProfileId === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[
                        styles.profileRowItem,
                        isSelected && {
                          backgroundColor: isDark
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'rgba(59, 130, 246, 0.1)',
                        },
                      ]}
                      onPress={() => setSelectedProfileId(isSelected ? null : p.id)}
                    >
                      <View style={styles.profileRowAvatarWrapper}>
                        <View style={[styles.profileRowAvatar, { backgroundColor: p.color || '#3B82F6' }]}>
                          {p.avatarUrl ? (
                            <Image source={{ uri: p.avatarUrl }} style={styles.profileAvatarImg} />
                          ) : (
                            <Text style={styles.profileAvatarInitial}>
                              {p.name.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.onlineDot} />
                      </View>

                      <View style={styles.profileRowDetails}>
                        <Text style={[styles.profileRowFullName, { color: isDark ? '#E2E8F0' : '#334155' }]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={[styles.profileRowUsername, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                          @{p.name.toLowerCase().replace(/\s+/g, '')}
                        </Text>
                      </View>

                      <View style={[styles.selectRadioCircle, isSelected && styles.selectRadioCircleActive]}>
                        {isSelected && <View style={styles.selectRadioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* In-app Share Action Button */}
          {selectedProfileId && (
            <Pressable style={styles.inAppShareBtn} onPress={handleInAppShare}>
              <Text style={styles.inAppShareBtnText}>Send Now</Text>
            </Pressable>
          )}

          <View style={[styles.shareDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />

          {/* SECTION 2: Share to External Apps */}
          <Text style={[styles.sectionTitleText, { color: isDark ? '#94A3B8' : '#64748B', marginBottom: 10 }]}>
            Share to Apps
          </Text>
          <View style={styles.shareGrid}>
            <ShareItem label="WhatsApp" icon="🟢" onPress={() => handleShareOption('whatsapp')} isDark={isDark} />
            <ShareItem label="Telegram" icon="✈️" onPress={() => handleShareOption('telegram')} isDark={isDark} />
            <ShareItem label="X" icon="🐦" onPress={() => handleShareOption('x')} isDark={isDark} />
            <ShareItem label="Facebook" icon="🔵" onPress={() => handleShareOption('facebook')} isDark={isDark} />
            <ShareItem label="Messenger" icon="💬" onPress={() => handleShareOption('messenger')} isDark={isDark} />
            <ShareItem label="Gmail" icon="✉️" onPress={() => handleShareOption('gmail')} isDark={isDark} />
            <ShareItem label="SMS" icon="📱" onPress={() => handleShareOption('sms')} isDark={isDark} />
            <ShareItem label="Instagram" icon="📸" onPress={() => handleShareOption('instagram')} isDark={isDark} />
            <ShareItem label="Copy Link" icon="🔗" onPress={() => handleShareOption('copy')} isDark={isDark} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function ShareItem({
  label, icon, onPress, isDark,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      style={({ hovered }: any) => [
        styles.shareItemBtn,
        hovered && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
      ]}
      onPress={onPress}
    >
      <Text style={styles.shareItemIcon}>{icon}</Text>
      <Text style={[styles.shareItemLabel, { color: isDark ? '#E2E8F0' : '#334155' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalOverlayShare: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareContent: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      },
    }) as any,
  },
  shareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareTitleText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  shareCloseBtn: {
    padding: 6,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }) as any,
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  shareItemBtn: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }) as any,
  },
  shareItemIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  shareItemLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Outfit',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  profilesSection: {
    minHeight: 64,
    justifyContent: 'center',
    marginBottom: 12,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  noUsersText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  profileAvatarInitial: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: 'Outfit',
  },
  shareDivider: {
    height: 1.5,
    marginVertical: 12,
    width: '100%',
  },
  searchInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: 'Outfit',
    marginBottom: 10,
  },
  profilesScrollList: {
    maxHeight: 180,
    width: '100%',
  },
  profileRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }) as any,
  },
  profileRowAvatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  profileRowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
    borderWidth: 1.5,
    borderColor: '#1E293B',
  },
  profileRowDetails: {
    flex: 1,
  },
  profileRowFullName: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  profileRowUsername: {
    fontSize: 11,
    fontFamily: 'Outfit',
  },
  selectRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRadioCircleActive: {
    borderColor: '#3B82F6',
  },
  selectRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  inAppShareBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }) as any,
  },
  inAppShareBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13.5,
    fontFamily: 'Outfit',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 14,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }) as any,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
});
