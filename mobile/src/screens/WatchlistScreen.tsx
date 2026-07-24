import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Image, RefreshControl, ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import type { WatchlistItem } from '../types';

const FILTERS = ['All', 'favorites', 'later', 'completed'];
const LABEL: Record<string, string> = { All: 'All', favorites: 'Favorites', later: 'Watch later', completed: 'Completed' };

export default function WatchlistScreen() {
  const { activeProfile, switchProfile } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const [lastSync, setLastSync] = useState<number>(0);
  const [syncMsg, setSyncMsg] = useState<string>('');

  const fetchList = useCallback(async () => {
    try {
      const res = await api.getWatchlist();
      setItems(res.data);
      setLastSync(res.serverTime);
    } catch { /* ignore */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); fetchList(); }, [fetchList, activeProfile?.id]);

  const sync = async () => {
    setSyncMsg('Syncing…');
    try {
      const res = await api.syncWatchlist(lastSync, []);
      setLastSync(res.serverTime);
      await fetchList();
      setSyncMsg(`Synced · ${res.changes.length} change${res.changes.length === 1 ? '' : 's'} from other devices`);
    } catch {
      setSyncMsg('Sync failed');
    }
  };

  const remove = (it: WatchlistItem) => {
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    api.removeFromWatchlist(it.contentType, it.contentId).catch(() => {});
  };

  const data = filter === 'All' ? items : items.filter((i) => i.category === filter);

  return (
    <View style={styles.fill}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Watchlist</Text>
        {activeProfile && (
          <Pressable onPress={switchProfile} style={[styles.profilePill, { borderColor: activeProfile.color || colors.border }]}>
            <Text style={styles.profilePillText}>{activeProfile.name} ⇄</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.syncBar}>
        <Pressable style={styles.syncBtn} onPress={sync}>
          <Text style={styles.syncBtnText}>⟳ Sync now</Text>
        </Pressable>
        <Text style={styles.syncMsg} numberOfLines={1}>{syncMsg || 'Local-first · syncs across devices'}</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{LABEL[f]}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyMsg}>Tap “Save” on a reel or “＋ Watchlist” on a movie.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 95 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchList(); }} tintColor="#fff" />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}><Text style={styles.thumbGlyph}>🎬</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title || item.contentId}</Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.typeBadge}>{item.contentType.toUpperCase()}</Text>
                  <Text style={styles.category}>{LABEL[item.category] || item.category}</Text>
                </View>
                {item.progressSec > 0 && <Text style={styles.progress}>Resume at {Math.round(item.progressSec)}s</Text>}
              </View>
              <Pressable onPress={() => remove(item)} hitSlop={8} style={styles.removeBtn}>
                <Text style={styles.removeGlyph}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  header: { color: '#fff', fontSize: 26, fontWeight: '800' },
  profilePill: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  profilePillText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  syncBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  syncBtn: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, marginRight: 12 },
  syncBtnText: { color: '#fff', fontWeight: '700' },
  syncMsg: { color: colors.textFaint, fontSize: 12, flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: colors.surfaceAlt, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textDim, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyMsg: { color: colors.textDim, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 64, height: 64, borderRadius: 8, marginRight: 12, backgroundColor: colors.surfaceAlt },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 26 },
  rowTitle: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center' },
  typeBadge: { color: colors.accent, fontSize: 10, fontWeight: '800', marginRight: 8 },
  category: { color: colors.textDim, fontSize: 12 },
  progress: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
  removeBtn: { padding: 8 },
  removeGlyph: { color: colors.textFaint, fontSize: 16 },
});
