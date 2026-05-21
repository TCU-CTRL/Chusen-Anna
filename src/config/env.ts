/**
 * Cloudflare Workers environment bindings.
 *
 * Secrets (DISCORD_PUBLIC_KEY, DISCORD_TOKEN) are managed via
 * `wrangler secret` and never committed to the repository.
 */
export interface Env {
  /** Ed25519 public key for Discord interaction signature verification. */
  DISCORD_PUBLIC_KEY: string;

  /** Bot token used for Discord REST API calls. */
  DISCORD_TOKEN: string;

  /** Discord application (client) ID. */
  DISCORD_APPLICATION_ID: string;

  /** Target guild (server) ID for guild-scoped commands. */
  DISCORD_GUILD_ID: string;

  /** KV namespace binding for session state storage. */
  SESSIONS: KVNamespace;
}
