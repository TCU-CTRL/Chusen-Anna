import type {
  APIVoiceState,
  RESTPostAPIInteractionFollowupJSONBody,
} from "discord-api-types/v10";

const DISCORD_BASE = "https://discord.com/api/v10";

/**
 * GET /guilds/{guildId}/voice-states/{userId}
 * Returns the voice state or null if the user is not in a voice channel (404).
 */
export async function getVoiceState(
  botToken: string,
  guildId: string,
  userId: string,
): Promise<APIVoiceState | null> {
  const res = await fetch(
    `${DISCORD_BASE}/guilds/${guildId}/voice-states/${userId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    },
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(
      `Discord API error: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as APIVoiceState;
}

/**
 * GET /channels/{channelId}
 * Returns the channel name, or the channelId as fallback.
 */
export async function getChannelName(
  botToken: string,
  channelId: string,
): Promise<string> {
  const res = await fetch(
    `${DISCORD_BASE}/channels/${channelId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    },
  );

  if (!res.ok) {
    return channelId;
  }

  const data = (await res.json()) as { name?: string };
  return data.name ?? channelId;
}

/**
 * PATCH /webhooks/{appId}/{token}/messages/@original
 * Edits the original interaction response.
 */
export async function editOriginalResponse(
  botToken: string,
  applicationId: string,
  interactionToken: string,
  body: RESTPostAPIInteractionFollowupJSONBody,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Discord API error: ${res.status} ${res.statusText}`,
    );
  }
}

/**
 * POST /webhooks/{appId}/{token}
 * Creates a follow-up message for an interaction.
 */
export async function createFollowup(
  botToken: string,
  applicationId: string,
  interactionToken: string,
  body: RESTPostAPIInteractionFollowupJSONBody,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_BASE}/webhooks/${applicationId}/${interactionToken}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Discord API error: ${res.status} ${res.statusText}`,
    );
  }
}
