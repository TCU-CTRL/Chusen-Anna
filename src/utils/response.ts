import {
  InteractionResponseType,
} from "discord-api-types/v10";
import type { APIInteractionResponse } from "discord-api-types/v10";

/**
 * Create a JSON Response with the correct Content-Type header.
 */
export function createJsonResponse(
  body: APIInteractionResponse,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (type 5) response.
 * Used when the bot needs time to process before sending the actual reply.
 */
export function createDeferredResponse(): Response {
  return createJsonResponse({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
  });
}

/**
 * Create an ephemeral error response visible only to the invoking user.
 */
export function createEphemeralErrorResponse(message: string): Response {
  return createEphemeralResponse(message);
}

/**
 * Create an ephemeral message response visible only to the invoking user.
 * 抽選結果メッセージの参加ボタン等、メッセージ本体を上書きせずに
 * 本人だけへフィードバックを返したい場合に使う。
 */
export function createEphemeralResponse(message: string): Response {
  return createJsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: message,
      flags: 64, // EPHEMERAL
    },
  });
}

/**
 * Create a public message response (visible to everyone) as a NEW message.
 * ボタン押下時に既存メッセージを上書きせず、チャンネルへ公開告知したい
 * 場合（早め発表の告知など）に使う。
 */
export function createPublicResponse(message: string): Response {
  return createJsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: message,
    },
  });
}
