import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from './PressableScale';
import { colors, fonts, radius, spacing } from '@/lib/theme';

type GifPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
};

// Valid Giphy public test key
const GIPHY_API_KEY = 'GlVGYHqc3SyCE3sgSmPBQCZHLPwiWz3v';

export default function GifPickerModal({ visible, onClose, onSelect }: GifPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

const FALLBACK_GIFS = [
  { url: 'https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif', keywords: ['happy', 'smile', 'good'] },
  { url: 'https://media.giphy.com/media/3o7aD2saalEvTe87d6/giphy.gif', keywords: ['sad', 'crying', 'bad'] },
  { url: 'https://media.giphy.com/media/l41YkxvU8c7J7Bba0/giphy.gif', keywords: ['tired', 'exhausted', 'sleepy'] },
  { url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif', keywords: ['excited', 'yay', 'great'] },
  { url: 'https://media.giphy.com/media/xT0xeQ1ZUQ0lvz2HX2/giphy.gif', keywords: ['angry', 'mad', 'terrible'] },
  { url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', keywords: ['okay', 'meh', 'whatever', 'fine'] },
  { url: 'https://media.giphy.com/media/jUwpNzg9IcyrK/giphy.gif', keywords: ['awkward', 'umm', 'nervous'] },
  { url: 'https://media.giphy.com/media/3o7WTqVPJ6M37L1hXq/giphy.gif', keywords: ['love', 'hug', 'sweet'] }
];

  useEffect(() => {
    let active = true;
    const fetchGifs = async () => {
      setLoading(true);
      try {
        const endpoint = query.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
              query,
            )}&limit=20`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`;

        const response = await fetch(endpoint);
        const json = await response.json();

        if (active && json.data && json.data.length > 0) {
          const urls = json.data.map((item: any) => item.images.fixed_height.url);
          setGifs(urls);
        } else if (active) {
          throw new Error('Empty or blocked API response');
        }
      } catch (error) {
        console.warn('Failed to fetch GIFs, using fallback', error);
        if (active) {
          const searchLower = query.toLowerCase().trim();
          const filtered = searchLower
            ? FALLBACK_GIFS.filter(gif => 
                gif.keywords.some(kw => kw.includes(searchLower) || searchLower.includes(kw))
              )
            : FALLBACK_GIFS;
          
          setGifs((filtered.length > 0 ? filtered : FALLBACK_GIFS).map(g => g.url));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchGifs, 500); // debounce

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query, visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Pick a GIF</Text>
            <PressableScale onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </PressableScale>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search GIFs..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(item) => item}
              numColumns={2}
              columnWrapperStyle={styles.row}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <PressableScale
                  style={styles.gifContainer}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Image source={{ uri: item }} style={styles.gifImage} />
                </PressableScale>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '80%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  row: {
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  listContent: {
    gap: spacing.sm,
  },
  gifContainer: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
});
