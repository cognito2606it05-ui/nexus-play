import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Image, useWindowDimensions,
  ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import { colors } from '../theme';
import type { Movie } from '../types';
import { LazyImage } from '../components/LazyImage';
import { HoverPressable } from '../components/HoverPressable';

function MoviePlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.muted = false; p.play(); });
  return <VideoView player={player} style={styles.modalVideo} contentFit="contain" />;
}

export default function MoviesScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [genre, setGenre] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isFocused) {
      setPlaying(false);
    }
  }, [isFocused]);

  const columns = Math.max(2, Math.min(6, Math.floor(width / 180)));
  const gap = 12;
  const cardW = (Math.min(width, 1100) - gap * (columns + 1)) / columns;

  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [recLoading, setRecLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getMovies(genre === 'All' ? undefined : genre)
      .then((res) => { setMovies(res.data); setGenres(['All', ...res.genres]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [genre]);

  useEffect(() => {
    setRecLoading(true);
    api.getRecommendations()
      .then((res) => {
        setRecommendations(res.movies);
      })
      .catch((err) => console.error('Failed to load movie recommendations:', err))
      .finally(() => setRecLoading(false));
  }, []);

  const data = useMemo(() => movies, [movies]);

  const toggleSave = (m: Movie) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) { next.delete(m.id); api.removeFromWatchlist('movie', m.id).catch(() => {}); }
      else { next.add(m.id); api.addToWatchlist({ contentType: 'movie', contentId: m.id, title: m.title, thumbnailUrl: m.posterUrl, category: 'later' }).catch(() => {}); }
      return next;
    });
  };

  const renderHeader = () => {
    if (recommendations.length === 0 || genre !== 'All') return null;

    return (
      <View style={styles.recSection}>
        <Text style={styles.recTitle}>Recommended For You</Text>
        <FlatList
          horizontal
          data={recommendations}
          keyExtractor={(item) => `rec-${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recScrollContent}
          renderItem={({ item }) => (
            <HoverPressable
              style={styles.recCard}
              onPress={() => { setSelected(item); setPlaying(false); }}
            >
              <LazyImage source={{ uri: item.backdropUrl }} style={styles.recBackdrop} />
              <LinearGradient
                colors={['transparent', 'rgba(10, 11, 16, 0.95)']}
                style={styles.recGradient}
              />
              <View style={styles.recTextOverlay}>
                <Text style={styles.recMovieTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.recMovieMeta}>{item.genre} · ★ {item.rating}</Text>
              </View>
            </HoverPressable>
          )}
        />
      </View>
    );
  };

  return (
    <View style={styles.fill}>
      <Text style={styles.header}>Movies</Text>

      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={genres.length ? genres : ['All']}
          keyExtractor={(g) => g}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => setGenre(item)} style={[styles.chip, genre === item && styles.chipActive]}>
              <Text style={[styles.chipText, genre === item && styles.chipTextActive]}>{item}</Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 95 }}>
          {renderHeader()}
          <FlatList
            key={columns}
            data={data}
            keyExtractor={(m) => m.id}
            numColumns={columns}
            scrollEnabled={false}
            contentContainerStyle={{ padding: gap, alignSelf: 'center' }}
            columnWrapperStyle={columns > 1 ? { gap } : undefined}
            ItemSeparatorComponent={() => <View style={{ height: gap }} />}
            renderItem={({ item }) => (
              <HoverPressable style={[styles.card, { width: cardW }]} onPress={() => { setSelected(item); setPlaying(false); }}>
                <LazyImage source={{ uri: item.posterUrl }} style={[styles.poster, { width: cardW, height: cardW * 1.5 }]} />
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>★ {item.rating}</Text></View>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardMeta}>{item.year} · {item.genre}</Text>
              </HoverPressable>
            )}
          />
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView>
              <View style={styles.modalHero}>
                {playing && selected?.videoUrl && isFocused ? (
                  <MoviePlayer uri={selected.videoUrl} />
                ) : (
                  <>
                    <LazyImage source={{ uri: selected?.backdropUrl || '' }} style={styles.modalVideo} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
                    <Pressable style={styles.playFab} onPress={() => selected?.videoUrl && setPlaying(true)}>
                      <Text style={styles.playFabGlyph}>▶</Text>
                    </Pressable>
                  </>
                )}
              </View>
              <View style={{ padding: 18 }}>
                <Text style={styles.modalTitle}>{selected?.title}</Text>
                <Text style={styles.modalMeta}>{selected?.year} · {selected?.genre} · {selected?.duration}m · ★ {selected?.rating}</Text>
                <Text style={styles.modalDesc}>{selected?.description}</Text>

                <View style={styles.modalActions}>
                  <Pressable style={styles.modalBtn} onPress={() => selected?.videoUrl && setPlaying((p) => !p)}>
                    <Text style={styles.modalBtnText}>{playing ? '❚❚ Pause' : '▶ Play'}</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => selected && toggleSave(selected)}>
                    <Text style={styles.modalBtnGhostText}>{selected && saved.has(selected.id) ? '✓ In watchlist' : '＋ Watchlist'}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => { setSelected(null); setPlaying(false); }}>
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: { color: '#fff', fontSize: 26, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  chipsWrap: { paddingVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: colors.surfaceAlt, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textDim, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: 4 },
  poster: { borderRadius: 10, backgroundColor: colors.surfaceAlt },
  ratingBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { color: '#ffd24a', fontSize: 11, fontWeight: '700' },
  cardTitle: { color: '#fff', fontWeight: '600', marginTop: 6 },
  cardMeta: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  modalHero: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  modalVideo: { width: '100%', height: '100%', backgroundColor: '#000' },
  playFab: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(229,9,20,0.92)', alignItems: 'center', justifyContent: 'center' },
  playFabGlyph: { color: '#fff', fontSize: 26, marginLeft: 4 },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  modalMeta: { color: colors.textDim, marginTop: 4, marginBottom: 12 },
  modalDesc: { color: colors.textDim, lineHeight: 20 },
  modalActions: { flexDirection: 'row', marginTop: 18 },
  modalBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10, marginRight: 12 },
  modalBtnText: { color: '#fff', fontWeight: '700' },
  modalBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  modalBtnGhostText: { color: '#fff', fontWeight: '600' },
  closeBtn: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: '#fff', fontSize: 16 },
  
  // Recommendations shelf styles
  recSection: { marginVertical: 14, width: '100%' },
  recTitle: { color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginBottom: 10 },
  recScrollContent: { paddingHorizontal: 16, gap: 12 },
  recCard: { width: 260, height: 146, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceAlt, position: 'relative' },
  recBackdrop: { width: '100%', height: '100%' },
  recGradient: { ...StyleSheet.absoluteFill },
  recTextOverlay: { position: 'absolute', bottom: 10, left: 12, right: 12 },
  recMovieTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  recMovieMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
});

