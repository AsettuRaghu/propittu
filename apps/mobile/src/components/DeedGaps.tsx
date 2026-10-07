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
      title:
        g.yours === null
          ? `Add the ${g.label.toLowerCase()} from your deed?`
          : `Use the deed’s ${g.label.toLowerCase()}?`,
      message:
        g.yours === null
          ? `${g.deed}, as your sale deed says.`
          : `Change it from ${g.yours} to ${g.deed}, as your sale deed says.`,
      confirmLabel: g.yours === null ? 'Add' : 'Use the deed’s',
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

  // Details the deed has and the property doesn't yet — all added in one go.
  const empty = p.deed_gaps.filter((g) => g.yours === null);
  const fillEmpty = () =>
    update.mutate(Object.fromEntries(empty.map((g) => [g.field, g.value])) as never, {
      onSuccess: () => toast(`${empty.length} details added from your deed`),
      onError: (err) =>
        void dialog.alert({
          title: 'Couldn’t fill them in',
          message: errorMessage(err),
          tone: 'danger',
        }),
    });

  const differs = p.deed_gaps.filter((g) => g.yours !== null);
  const row = (g: DeedGap) => (
    <ListRow
      key={g.field}
      icon="deed"
      accent={g.yours === null ? 'teal' : 'amber'}
      title={g.label}
      subtitle={g.yours === null ? `Deed: ${g.deed}` : `Deed: ${g.deed} · Yours: ${g.yours}`}
      subtitleLines={2}
      showChevron={false}
      right={
        <LinkButton
          title={g.yours === null ? 'Add' : 'Use deed’s'}
          onPress={() => void takeDeedValue(g)}
        />
      }
    />
  );

  return (
    <>
      {differs.length > 0 || pin ? (
        <ListGroup title={`Differs from your deed · ${differs.length + (pin ? 1 : 0)}`} plain>
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
          {differs.map(row)}
        </ListGroup>
      ) : null}
      {empty.length > 0 ? (
        <ListGroup
          title={`Add from your deed · ${empty.length}`}
          plain
          action={empty.length > 1 ? <LinkButton title="Add all" onPress={fillEmpty} /> : undefined}
        >
          {empty.map(row)}
        </ListGroup>
      ) : null}
    </>
  );
}
