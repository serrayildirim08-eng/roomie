// Roomie UI kit — the shared pieces of "Direction D": a forest-green editorial
// header (Hero) over big tactile cards, with chunky drop-edge buttons and
// identity-colored avatars. Screens compose these instead of re-styling rows.

import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { personColor, Radius, Roomie, RoomieFonts } from '@/constants/theme';

// ---- Avatar -----------------------------------------------------------------

export function Avatar({
  name,
  seed,
  size = 34,
  square = false,
  ring,
  color,
}: {
  name: string;
  seed?: string;
  size?: number;
  square?: boolean;
  ring?: boolean;
  color?: string;
}) {
  const bg = color ?? personColor(seed ?? name);
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: square ? size * 0.34 : size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ring && { borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
      ]}
    >
      <Text style={{ fontFamily: RoomieFonts.display, color: '#fff', fontSize: size * 0.42 }}>
        {letter}
      </Text>
    </View>
  );
}

// ---- Hero (green editorial header) -----------------------------------------

export function Hero({
  children,
  topInset = 12,
  style,
}: {
  children: ReactNode;
  topInset?: number;
  style?: ViewStyle;
}) {
  return <View style={[styles.hero, { paddingTop: topInset + 14 }, style]}>{children}</View>;
}

export function HeroEyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.heroEyebrow}>{children}</Text>;
}

export function HeroTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.heroTitle}>{children}</Text>;
}

// top app bar: house name + your avatar (hamburger/profile menu comes later)
export function HeroBar({
  houseName,
  sub,
  you,
  youSeed,
}: {
  houseName: string;
  sub?: string;
  you: string;
  youSeed?: string;
}) {
  return (
    <View style={styles.heroBar}>
      <View style={styles.houseSwitch}>
        <View style={styles.crest}>
          <Text style={{ fontSize: 16 }}>🏡</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.houseName} numberOfLines={1}>
            {houseName}
          </Text>
          {sub ? <Text style={styles.houseSub}>{sub}</Text> : null}
        </View>
      </View>
      <Avatar name={you} seed={youSeed} size={42} square ring />
    </View>
  );
}

// row of overlapping member faces
export function MemberStack({
  members,
  label,
}: {
  members: { name: string; seed?: string }[];
  label?: string;
}) {
  return (
    <View style={styles.memberRow}>
      <View style={{ flexDirection: 'row' }}>
        {members.map((m, i) => (
          <View key={i} style={{ marginLeft: i === 0 ? 0 : -9 }}>
            <Avatar name={m.name} seed={m.seed} size={33} ring />
          </View>
        ))}
      </View>
      {label ? <Text style={styles.memberLabel}>{label}</Text> : null}
    </View>
  );
}

// compact 3-up stat strip living inside the hero
export function StatStrip({
  stats,
}: {
  stats: { k: string; v: string }[];
}) {
  return (
    <View style={styles.statStrip}>
      {stats.map((s, i) => (
        <View key={i} style={styles.stat}>
          <Text style={styles.statK}>{s.k}</Text>
          <Text style={styles.statV}>{s.v}</Text>
        </View>
      ))}
    </View>
  );
}

// ---- Cards ------------------------------------------------------------------

export function Card({
  children,
  pad,
  onPress,
  style,
}: {
  children: ReactNode;
  pad?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const inner = <View style={[styles.card, pad && styles.cardPad, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function SectionHead({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.secHead}>
      <Text style={styles.secTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Count({ children }: { children: ReactNode }) {
  return <Text style={styles.count}>{children}</Text>;
}

// ---- Chunky drop-edge button ------------------------------------------------

type ChunkyTone = 'green' | 'gold' | 'coral' | 'pink';
const TONES: Record<ChunkyTone, { top: string; drop: string; ink: string }> = {
  green: { top: Roomie.forest, drop: Roomie.dropGreen, ink: '#fff' },
  gold: { top: Roomie.gold, drop: Roomie.dropGold, ink: '#3a2a00' },
  coral: { top: Roomie.coral, drop: Roomie.dropCoral, ink: '#fff' },
  pink: { top: Roomie.pink, drop: Roomie.dropPink, ink: '#fff' },
};

export function ChunkyButton({
  label,
  onPress,
  tone = 'green',
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  tone?: ChunkyTone;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = TONES[tone];
  return (
    <View style={[{ borderRadius: Radius.button, backgroundColor: t.drop }, disabled && { opacity: 0.55 }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.chunky,
          { backgroundColor: t.top, marginBottom: pressed ? 0 : 5, marginTop: pressed ? 5 : 0 },
        ]}
      >
        <Text style={[styles.chunkyLabel, { color: t.ink }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: Roomie.forest,
    paddingHorizontal: 22,
    paddingBottom: 24,
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
  },
  heroBar: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 },
  houseSwitch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: 6,
    paddingLeft: 7,
    paddingRight: 12,
  },
  crest: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: Roomie.forest2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  houseName: { fontFamily: RoomieFonts.display, fontSize: 15.5, color: '#fff' },
  houseSub: { fontFamily: RoomieFonts.bodyBold, fontSize: 10.5, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  heroEyebrow: {
    fontFamily: RoomieFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.82)',
  },
  heroTitle: {
    fontFamily: RoomieFonts.displayBold,
    fontSize: 32,
    lineHeight: 42, // generous — Baloo's rounded glyphs clip at a tight line height
    color: '#fff',
    marginTop: 4,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  memberLabel: { fontFamily: RoomieFonts.bodyBold, fontSize: 12.5, color: 'rgba(255,255,255,0.92)' },
  statStrip: { flexDirection: 'row', gap: 9, marginTop: 18 },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  statK: {
    fontFamily: RoomieFonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.82)',
  },
  statV: { fontFamily: RoomieFonts.displayBold, fontSize: 22, color: '#fff', marginTop: 3 },
  card: {
    backgroundColor: Roomie.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#EFEBE1',
    overflow: 'hidden',
    shadowColor: Roomie.forestInk,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardPad: { padding: 16 },
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
  },
  secTitle: { fontFamily: RoomieFonts.display, fontSize: 17, color: Roomie.ink },
  count: {
    fontFamily: RoomieFonts.bodyBold,
    fontSize: 11,
    color: Roomie.ink3,
    backgroundColor: '#EFEBE1',
    paddingVertical: 2,
    paddingHorizontal: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
  chunky: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: Radius.button,
  },
  chunkyLabel: { fontFamily: RoomieFonts.display, fontSize: 16 },
});
