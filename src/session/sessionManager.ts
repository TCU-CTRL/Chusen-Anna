import type { Session, Participant } from "./types";

const TTL = 14400; // 4 hours

function kvKey(guildId: string, channelId: string): string {
  return `session:${guildId}:${channelId}`;
}

async function putSession(kv: KVNamespace, session: Session): Promise<void> {
  await kv.put(kvKey(session.guildId, session.channelId), JSON.stringify(session), {
    expirationTtl: TTL,
  });
}

async function requireSession(kv: KVNamespace, guildId: string, channelId: string): Promise<Session> {
  const session = await getSession(kv, guildId, channelId);
  if (session === null) {
    throw new Error(`Session not found: ${kvKey(guildId, channelId)}`);
  }
  return session;
}

export async function createSession(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
  creatorId: string,
  defaultTimeMinutes?: number,
  voiceChannelId?: string,
): Promise<Session> {
  const session: Session = {
    guildId,
    channelId,
    creatorId,
    createdAt: new Date().toISOString(),
    participants: {},
    pickedUserIds: [],
    messageId: "",
    defaultTimeMinutes,
    voiceChannelId,
  };
  await putSession(kv, session);
  return session;
}

export async function getSession(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
): Promise<Session | null> {
  return await kv.get(kvKey(guildId, channelId), { type: "json" }) as Session | null;
}

export async function addParticipant(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
  userId: string,
  displayName: string,
): Promise<Session> {
  const session = await requireSession(kv, guildId, channelId);
  const participant: Participant = {
    userId,
    displayName,
    joinedAt: new Date().toISOString(),
  };
  session.participants[userId] = participant;
  await putSession(kv, session);
  return session;
}

export async function removeParticipant(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
  userId: string,
): Promise<Session> {
  const session = await requireSession(kv, guildId, channelId);
  delete session.participants[userId];
  await putSession(kv, session);
  return session;
}

export async function markPicked(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
  userIds: string[],
): Promise<Session> {
  const session = await requireSession(kv, guildId, channelId);
  session.pickedUserIds.push(...userIds);
  await putSession(kv, session);
  return session;
}

export async function deleteSession(
  kv: KVNamespace,
  guildId: string,
  channelId: string,
): Promise<void> {
  await kv.delete(kvKey(guildId, channelId));
}
