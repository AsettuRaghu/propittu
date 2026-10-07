import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import type { Reminder } from '@propittu/shared';
import { useMe, useServices } from '@/api/queries';
import { useReminders } from '@/api/reminders';
import { formatDate } from '@/lib/format';
import { phoneRemindersOn, syncPhoneReminders, turnOnPhoneReminders } from '@/lib/phoneReminders';
import type { IconName } from './Icon';
import { toast } from './Dialog';
import { Badge, LinkButton, ListGroup, ListRow } from './ui';

const ICONS: Record<Reminder['kind'], IconName> = {
  tax: 'receipt',
  visit: 'camera',
  khata: 'deed',
  due: 'calendar',
  location: 'pin',
  deed: 'deed',
  plan: 'plan',
};

/** The service that settles each kind of reminder (booked straight away). */
const SERVICE: Partial<Record<Reminder['kind'], string>> = {
  tax: 'property_tax_assistance',
  visit: 'property_visit',
  khata: 'khata_mutation_assistance',
};

const SHOWN = 4;

/**
 * Home: "Coming up" — what needs doing across the properties, most urgent
 * first, each one tap from being sorted (booking the service, or the right
 * page). "Remind me" schedules the dated ones on this phone.
 */
export function ComingUp() {
  const me = useMe();
  const services = useServices();
  const { data } = useReminders();
  const [on, setOn] = useState<boolean | null>(null);
  const [all, setAll] = useState(false);

  // The plan, from what the app already has.
  const plan = me.data?.plan;
  const planDays = plan?.days_left ?? null;
  const planItem: Reminder | null =
    plan?.ends_at && planDays !== null && planDays <= 30
      ? {
          id: `plan:${plan.ends_at}`,
          kind: 'plan',
          property_id: null,
          property_name: null,
          title: `${plan.plan_name ?? 'Your plan'} ends ${formatDate(plan.ends_at)}`,
          detail: 'Renew to keep visits and Pittu going',
          due_date: plan.ends_at.slice(0, 10),
          urgency: planDays <= 7 ? 'overdue' : 'soon',
        }
      : null;
  const list = [...(planItem ? [planItem] : []), ...(data ?? [])];

  useEffect(() => {
    void phoneRemindersOn().then(setOn);
  }, []);
  useEffect(() => {
    if (on && data) void syncPhoneReminders(list);
    // list derives from data and the plan; sync when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, data, planItem?.id]);

  if (list.length === 0) return null;

  const open = (r: Reminder) => {
    const code = SERVICE[r.kind];
    if (r.kind === 'plan') return router.push('/plan');
    if (code && r.property_id) {
      const service = (services.data ?? []).find((s) => s.code === code);
      return router.push({
        pathname: '/services/request',
        params: { propertyId: r.property_id, ...(service ? { serviceId: service.id } : {}) },
      });
    }
    if (r.kind === 'location' && r.property_id) {
      return router.push(`/properties/${r.property_id}/location`);
    }
    if (r.property_id) router.push(`/properties/${r.property_id}`);
  };

  const remindMe = async () => {
    const granted = await turnOnPhoneReminders();
    setOn(granted);
    toast(
      granted ? 'We’ll remind you on this phone' : 'Notifications are off for Propittu',
      granted ? 'success' : 'info',
    );
  };

  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <ListGroup
      title={`Coming up · ${list.length}`}
      plain
      action={
        on === false ? (
          <LinkButton title="Remind me" icon="bell" onPress={() => void remindMe()} />
        ) : undefined
      }
    >
      {shown.map((r) => (
        <ListRow
          key={r.id}
          icon={ICONS[r.kind]}
          accent={r.urgency === 'overdue' ? 'coral' : r.urgency === 'soon' ? 'amber' : 'slate'}
          title={r.title}
          subtitle={[r.property_name, r.detail].filter(Boolean).join(' · ')}
          subtitleLines={2}
          right={
            r.due_date ? (
              <Badge
                label={formatDate(r.due_date)}
                tone={r.urgency === 'overdue' ? 'danger' : 'neutral'}
              />
            ) : undefined
          }
          onPress={() => open(r)}
        />
      ))}
      {list.length > SHOWN ? (
        <ListRow
          icon={all ? 'collapse' : 'expand'}
          title={all ? 'Show fewer' : `Show all ${list.length}`}
          showChevron={false}
          onPress={() => setAll((v) => !v)}
        />
      ) : null}
    </ListGroup>
  );
}
