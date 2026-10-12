import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useProperty, useServices } from '@/api/queries';
import { PropertyContext } from '@/components/PropertyContext';
import { Button, ListGroup } from '@/components/ui';
import { space, typography } from '@/theme';

const STEPS = [
  {
    title: 'Report the loss to the police',
    text: 'A lost-document report (online in most cities). Keep the acknowledgement.',
  },
  {
    title: 'Publish a notice in two newspapers',
    text: 'One English and one local-language paper, describing the document and asking anyone who finds it to return it.',
  },
  {
    title: 'Get a certified copy',
    text: 'From the Sub-Registrar office where the deed was registered — it carries the same weight for most purposes.',
  },
  {
    title: 'An affidavit or indemnity, if asked',
    text: 'Banks and buyers sometimes ask for one, sworn before a notary.',
  },
];

/**
 * Lost or damaged an original deed (or Khata)? The usual steps in India —
 * general guidance — and our Lost Document Help, which does them for you.
 */
export default function LostDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const property = useProperty(id).data;
  const services = useServices();
  const book = (code: string) => {
    const s = (services.data ?? []).find((x) => x.code === code);
    router.push({
      pathname: '/services/request',
      params: { propertyId: id, ...(s ? { serviceId: s.id } : {}) },
    });
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.body}>
        {`It happens more often than you’d think — and it can be put right. Here’s what’s usually done${
          property?.state ? ` in ${property.state}` : ''
        }.`}
      </Text>
      <ListGroup title="The steps" plain>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <Text style={typography.bodyStrong}>{`${i + 1}. ${s.title}`}</Text>
            <Text style={typography.small}>{s.text}</Text>
          </View>
        ))}
      </ListGroup>
      <Button
        title="We’ll do it for you"
        icon="services"
        onPress={() => book('lost_document_recovery')}
      />
      <Button
        title="Just a certified copy"
        variant="secondary"
        onPress={() => book('certified_copy')}
      />
      <Text style={typography.caption}>General guidance, not legal advice.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  step: { gap: 2, paddingHorizontal: 14, paddingVertical: space.xs },
});
