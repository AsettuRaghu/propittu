import { router } from 'expo-router';
import type { DeedGap, PropertyDetail } from '@propittu/shared';
import { useUpdateProperty } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { dialog, toast } from './Dialog';
import { LinkButton, ListGroup, ListRow } from './ui';

/**
 * Where the property differs from its sale deed — the most reliable source
 * we have. Pittu fills things in from the deed; if the customer changes
 * them (or says the pin is right although the deed names another place),
 * we don't stop them, but the gap stays visible here until it's closed,
 * with one tap to take the deed's value.
 */
export function DeedGaps({ property: p }: { property: PropertyDetail }) {
  const update = useUpdateProperty(p.id);
  const pin =
    p.location_issue?.kind === 'deed' && p.location_issue.confirmed ? p.location_issue : null;
  if (p.deed_gaps.length === 0 && !pin) return null;

  const takeDeedValue = async (g: DeedGap) => {
    const ok = await dialog.confirm({
      title: `Use the deed’s ${g.label.toLowerCase()}?`,
      message: `Change it from ${g.yours ?? 'empty'} to ${g.deed}, as your sale deed says.`,
      confirmLabel: 'Use the deed’s',
    });
    if (!ok) return;
    update.mutate({ [g.field]: g.value } as never, {
      onSuccess: () => toast('Updated from your deed'),
      onError: (err) =>
        void dialog.alert({
          title: 'Couldn’t update it',
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
  };

  const count = p.deed_gaps.length + (pin ? 1 : 0);
  return (
    <ListGroup title={`Differs from your deed · ${count}`} plain>
      {pin ? (
        <ListRow
          icon="pin"
          accent="amber"
          title="Map pin"
          subtitle={`Deed: ${pin.other_place} · Pin: ${pin.pin_place}, ${pin.distance_km} km away (you confirmed it)`}
          subtitleLines={3}
          showChevron={false}
          right={
            <LinkButton
              title="Move pin"
              onPress={() =>
                router.push({
                  pathname: '/properties/[id]/location',
                  params: {
                    id: p.id,
                    ...(pin.near
                      ? {
                          at: `${pin.near.latitude},${pin.near.longitude}`,
                          atLabel: pin.other_place,
                        }
                      : {}),
                  },
                })
              }
            />
          }
        />
      ) : null}
      {p.deed_gaps.map((g) => (
        <ListRow
          key={g.field}
          icon="deed"
          accent="amber"
          title={g.label}
          subtitle={`Deed: ${g.deed} · Yours: ${g.yours ?? 'not filled in'}`}
          subtitleLines={2}
          showChevron={false}
          right={<LinkButton title="Use deed’s" onPress={() => void takeDeedValue(g)} />}
        />
      ))}
    </ListGroup>
  );
}
