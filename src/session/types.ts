/**
 * A participant in a pick session.
 */
export interface Participant {
  userId: string;
  displayName: string;
  /** ISO 8601 timestamp of when the user joined the session. */
  joinedAt: string;
}

/**
 * Represents a single pick session bound to a guild channel.
 */
export interface Session {
  guildId: string;
  channelId: string;
  creatorId: string;
  /** ISO 8601 timestamp of session creation. */
  createdAt: string;
  /** userId → Participant mapping. */
  participants: Record<string, Participant>;
  /** Picked user IDs in order of selection. */
  pickedUserIds: string[];
  /** Discord message ID of the session embed (set by command handler). */
  messageId: string;
  /** Default presentation time in minutes for this session (optional). */
  defaultTimeMinutes?: number;
  /** Voice channel ID where the session was started. */
  voiceChannelId?: string;
}
