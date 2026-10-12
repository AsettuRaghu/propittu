import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { formatIndianMobile } from '@propittu/shared';
import {
  useAddNominee,
  useInvite,
  useLeaveAccount,
  usePeople,
  useRemoveMember,
  useRemoveNominee,
  useRevokeInvite,
} from '@/api/family';
import { useMe } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, radius, space, typography } from '@/theme';

/**
 * Family & access. The owner invites family by phone (they sign in to
 * Propittu with that number and accept) and records nominees — who our team
 * should give access to if something happens to them. A family member sees
 * whose properties these are, and can leave.
 */
export default function FamilyScreen() {
  const me = useMe();
  const owner = me.data?.account.role === 'owner';
  const people = usePeople(owner);
  const leave = useLeaveAccount();
  if (me.isPending || (owner && people.isPending)) return <LoadingState />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;

  if (!owner) {
    const label = me.data.accounts.find((a) => a.current)?.label ?? 'these properties';
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.body}>
          {`You’re seeing ${label} as family. You can view everything, add documents and book services; only the owner can remove properties or change who has access.`}
        </Text>
        <Button
          title="Leave these properties"
          variant="outline"
          loading={leave.isPending}
          onPress={() =>
            void dialog
              .confirm({
                title: 'Leave these properties?',
                message: 'You won’t see them any more unless the owner invites you again.',
                confirmLabel: 'Leave',
                tone: 'danger',
              })
              .then((ok) => (ok ? leave.mutate(me.data.account.id) : undefined))
          }
        />
      </ScrollView>
    );
  }
  if (people.error)
    return <ErrorState error={people.error} onRetry={() => void people.refetch()} />;
  const p = people.data!;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={typography.small}>
        Family you add can see your properties, add documents and book services. Only you can remove
        properties or change who has access.
      </Text>
      <ListGroup title="People who can see your properties" plain>
        {p.members.map((m) => (
          <MemberRow
            key={m.user_id}
            name={m.role === 'owner' ? `${m.name ?? 'You'} (you)` : (m.name ?? 'Family member')}
            detail={m.role === 'owner' ? 'Owner' : `Family · since ${formatDate(m.since)}`}
            userId={m.role === 'owner' ? null : m.user_id}
          />
        ))}
        {p.invites.map((i) => (
          <InviteRow key={i.id} id={i.id} name={i.name} phone={i.phone} relation={i.relation} />
        ))}
      </ListGroup>
      {me.data.plan.features.includes('family_access') ? (
        <InviteForm />
      ) : (
        <View style={styles.upsell}>
          <Text style={typography.bodyStrong}>Family access is part of Plus</Text>
          <Text style={typography.small}>
            Let family see your properties, add documents and book services for you.
          </Text>
          <Button title="See plans" size="sm" onPress={() => router.push('/plan')} />
        </View>
      )}
      <ListGroup title="Nominees" plain>
        <Text style={[typography.small, styles.inner]}>
          If something happens to you, our team gives your nominee access once they show us the
          papers (a death certificate, and a Will or legal heir certificate).
        </Text>
        {p.nominees.map((n) => (
          <NomineeRow key={n.id} id={n.id} name={n.name} relation={n.relation} phone={n.phone} />
        ))}
      </ListGroup>
      <NomineeForm />
    </ScrollView>
  );
}

function MemberRow({
  name,
  detail,
  userId,
}: {
  name: string;
  detail: string;
  userId: string | null;
}) {
  const remove = useRemoveMember();
  return (
    <ListRow
      icon="user"
      accent={userId ? 'sky' : 'indigo'}
      title={name}
      subtitle={detail}
      right={
        userId ? (
          <Button
            title="Remove"
            size="sm"
            variant="ghost"
            onPress={() =>
              void dialog
                .confirm({
                  title: `Remove ${name}?`,
                  message: 'They won’t see your properties any more.',
                  confirmLabel: 'Remove',
                  tone: 'danger',
                })
                .then((ok) => (ok ? remove.mutate(userId) : undefined))
            }
          />
        ) : undefined
      }
    />
  );
}

function InviteRow({
  id,
  name,
  phone,
  relation,
}: {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
}) {
  const revoke = useRevokeInvite();
  return (
    <ListRow
      icon="mail"
      accent="amber"
      title={`${name}${relation ? ` · ${relation}` : ''}`}
      subtitle={`Invited · ${formatIndianMobile(phone)} · waiting for them to sign in`}
      subtitleLines={2}
      right={<Button title="Cancel" size="sm" variant="ghost" onPress={() => revoke.mutate(id)} />}
    />
  );
}

function InviteForm() {
  const invite = useInvite();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const send = () => {
    setProblem(null);
    invite.mutate(
      { name: name.trim(), phone: phone.trim(), relation: relation.trim() || null },
      {
        onSuccess: () => {
          const who = name.trim();
          setName('');
          setPhone('');
          setRelation('');
          toast(`Invited ${who}`);
          void Share.share({
            message: `Hi ${who}, I’ve added you to my properties on Propittu. Install Propittu and sign in with this mobile number (${phone.trim()}) — you’ll see an invitation to accept.`,
          });
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };
  return (
    <ListGroup title="Invite family" plain>
      <View style={[styles.inner, styles.form]}>
        <TextField
          variant="flat"
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amma"
        />
        <TextField
          variant="flat"
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="10-digit number"
        />
        <TextField
          variant="flat"
          label="Relation (optional)"
          value={relation}
          onChangeText={setRelation}
          placeholder="e.g. Mother, Brother"
        />
        {problem ? <Banner message={problem} /> : null}
        <Button
          title="Send invitation"
          icon="users"
          onPress={send}
          loading={invite.isPending}
          disabled={!name.trim() || phone.replace(/\D/g, '').length < 10}
        />
      </View>
    </ListGroup>
  );
}

function NomineeRow({
  id,
  name,
  relation,
  phone,
}: {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
}) {
  const remove = useRemoveNominee();
  return (
    <ListRow
      icon="shield"
      accent="violet"
      title={`${name}${relation ? ` · ${relation}` : ''}`}
      subtitle={phone ? formatIndianMobile(phone) : 'No number saved'}
      right={<Button title="Remove" size="sm" variant="ghost" onPress={() => remove.mutate(id)} />}
    />
  );
}

function NomineeForm() {
  const add = useAddNominee();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <ListGroup title="Add a nominee" plain>
      <View style={[styles.inner, styles.form]}>
        <TextField variant="flat" label="Name" value={name} onChangeText={setName} />
        <TextField
          variant="flat"
          label="Relation"
          value={relation}
          onChangeText={setRelation}
          placeholder="e.g. Wife, Son"
        />
        <TextField
          variant="flat"
          label="Mobile number (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        {problem ? <Banner message={problem} /> : null}
        <Button
          title="Save nominee"
          icon="shield"
          variant="secondary"
          loading={add.isPending}
          disabled={!name.trim()}
          onPress={() => {
            setProblem(null);
            add.mutate(
              {
                name: name.trim(),
                relation: relation.trim() || null,
                phone: phone.trim() || null,
                note: null,
              },
              {
                onSuccess: () => {
                  setName('');
                  setRelation('');
                  setPhone('');
                  toast('Nominee saved');
                },
                onError: (err) => setProblem(errorMessage(err)),
              },
            );
          }}
        />
      </View>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  form: { gap: space.md },
  upsell: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'flex-start',
  },
});
