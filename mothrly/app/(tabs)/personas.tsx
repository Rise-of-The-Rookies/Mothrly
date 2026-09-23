import { StyleSheet, Text, View } from 'react-native';

export default function PersonasScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Personas</Text>
      <Text style={styles.subtitle}>Placeholder screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
});
