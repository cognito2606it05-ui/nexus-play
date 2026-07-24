import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../state/AuthContext';
import { api } from '../api/client';
import { colors } from '../theme';

const SWATCHES = ['#e50914', '#1f9cff', '#21c07a', '#f5a623', '#9b59b6', '#ff6b9d'];

export default function ProfileGate() {
  const { profiles, selectProfile, refreshProfiles, signOut, user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = profiles.length < 4;

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createProfile({ name: name.trim(), color });
      await refreshProfiles();
      setAdding(false); setName(''); setColor(SWATCHES[0]);
    } catch (e: any) {
      setError(e.message || 'Could not create profile');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Who’s watching?</Text>
        <Text style={styles.sub}>{user?.displayName}’s account</Text>

        <View style={styles.grid}>
          {profiles.map((p) => (
            <Pressable key={p.id} style={styles.tile} onPress={() => selectProfile(p)}>
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={[styles.avatar, { borderColor: p.color || colors.border }]} />
              ) : (
                <View style={[styles.avatar, styles.avatarColor, { backgroundColor: p.color || colors.primary }]}>
                  <Text style={styles.avatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.tileName} numberOfLines={1}>{p.name}</Text>
              {p.isKids && <Text style={styles.kids}>KIDS</Text>}
            </Pressable>
          ))}

          {canAdd && !adding && (
            <Pressable style={styles.tile} onPress={() => setAdding(true)}>
              <View style={[styles.avatar, styles.addAvatar]}><Text style={styles.addPlus}>＋</Text></View>
              <Text style={styles.tileName}>Add profile</Text>
            </Pressable>
          )}
        </View>

        {adding && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New profile</Text>
            <TextInput
              style={styles.input}
              placeholder="Profile name"
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={styles.swatches}>
              {SWATCHES.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
              ))}
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.formRow}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => { setAdding(false); setError(null); }}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={create} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        )}

        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  heading: { color: '#fff', fontSize: 30, fontWeight: '800' },
  sub: { color: colors.textDim, marginTop: 6, marginBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 520 },
  tile: { alignItems: 'center', margin: 14, width: 110 },
  avatar: { width: 92, height: 92, borderRadius: 12, borderWidth: 2, marginBottom: 10 },
  avatarColor: { alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  tileName: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  kids: { color: colors.accent, fontSize: 10, fontWeight: '800', marginTop: 2 },
  addAvatar: { borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPlus: { color: colors.textDim, fontSize: 44, fontWeight: '300' },
  form: { backgroundColor: colors.surface, borderRadius: 14, padding: 18, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  formTitle: { color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 12 },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', borderWidth: 1, borderColor: colors.border },
  swatches: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
  swatch: { width: 30, height: 30, borderRadius: 15, marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: '#fff' },
  error: { color: colors.error, marginTop: 10 },
  formRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', marginLeft: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.textDim, fontWeight: '600' },
  signOut: { marginTop: 36 },
  signOutText: { color: colors.textFaint, fontSize: 14 },
});
