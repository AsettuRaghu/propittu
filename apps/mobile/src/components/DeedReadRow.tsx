import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { ANALYSIS_ERROR_LABELS, type PropertyDetail } from '@propittu/shared';
import { startAnalysis, useAnalysis } from '@/api/ai';
import { keys, useMe } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { colors } from '@/theme';
import { dialog, toast } from './Dialog';
import { ListRow } from './ui';

/**
 * A sale deed stored as a plain document has never been read, so nothing
 * can be checked against it. One tap and Pittu reads it: the details then
 * show under "Differs from your deed" (empty fields included, each with
 * "Use deed's"), and the pin is checked against the deed's place.
 */
export function DeedReadRow({ property: p }: { property: PropertyDetail }) {
  const me = useMe();
  const qc = useQueryClient();
  const reading = p.deed_reading;
  const [started, setStarted] = useState(false);
  const watching =
    !!reading && (started || reading.status === 'queued' || reading.status === 'reading');
  const analysis = useAnalysis(watching ? reading?.document_id : undefined);
  const status = analysis.data?.status ?? reading?.status ?? null;

  // Once read, refresh the property: its gaps and location check now use the deed.
  useEffect(() => {
    if (!watching || (status !== 'ready' && status !== 'failed')) return;
    void qc.invalidateQueries({ queryKey: keys.property(p.id) });
    if (status === 'ready' && started) toast('Pittu has read your deed');
  }, [watching, status, started, qc, p.id]);

  if (!reading || !me.data?.features.document_reading) return null;
  if (status === 'ready' && !started) return null;

  const start = async () => {
    try {
      setStarted(true);
      // Once started, useAnalysis (now watching) follows it to the end.
      await startAnalysis(reading.document_id);
    } catch (err) {
      setStarted(false);
      void dialog.alert({
        title: 'Pittu couldn’t start',
        message: errorMessage(err),
        tone: 'danger',
      });
    }
  };

  if (status === 'queued' || status === 'reading' || (started && !status)) {
    return (
      <ListRow
        icon="sparkles"
        accent="violet"
        title="Pittu is reading your sale deed…"
        subtitle="About a minute — you can carry on meanwhile"
        showChevron={false}
        right={<ActivityIndicator color={colors.primary} />}
      />
    );
  }
  if (status === 'failed') {
    return (
      <ListRow
        icon="deed"
        accent="amber"
        title="Pittu couldn’t read your sale deed"
        subtitle={
          ANALYSIS_ERROR_LABELS[analysis.data?.error_code ?? 'failed'] ??
          ANALYSIS_ERROR_LABELS.failed
        }
        subtitleLines={2}
        showChevron={false}
      />
    );
  }
  if (status === 'ready') return null;
  return (
    <ListRow
      icon="sparkles"
      accent="violet"
      title="Let Pittu read your sale deed"
      subtitle="Checks your details against it and fills in what’s missing — you choose what to keep"
      subtitleLines={2}
      onPress={() => void start()}
    />
  );
}
