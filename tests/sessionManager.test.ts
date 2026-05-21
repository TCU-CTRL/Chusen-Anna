import { describe, it, expect, beforeEach } from "vitest";
import type { Session } from "../src/session/types";
import {
  createSession,
  getSession,
  addParticipant,
  removeParticipant,
  markPicked,
  deleteSession,
} from "../src/session/sessionManager";

/**
 * Minimal in-memory KVNamespace mock.
 * Tracks the last expirationTtl passed to put().
 */
function createKVMock(): KVNamespace & { _store: Map<string, string>; _lastTtl: number | undefined } {
  const store = new Map<string, string>();
  let lastTtl: number | undefined;

  return {
    _store: store,
    get _lastTtl() { return lastTtl; },

    async get(key: string, options?: any): Promise<any> {
      const val = store.get(key);
      if (val === undefined) return null;
      if (typeof options === "string" && options === "json") return JSON.parse(val);
      if (typeof options === "object" && options?.type === "json") return JSON.parse(val);
      return val;
    },

    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      store.set(key, value);
      lastTtl = options?.expirationTtl;
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    // Unused methods required by KVNamespace interface
    async list(): Promise<any> { return { keys: [], list_complete: true, cacheStatus: null }; },
    async getWithMetadata(): Promise<any> { return { value: null, metadata: null, cacheStatus: null }; },
  } as any;
}

describe("SessionManager", () => {
  let kv: ReturnType<typeof createKVMock>;
  const guildId = "guild-1";
  const channelId = "channel-1";
  const creatorId = "user-creator";

  beforeEach(() => {
    kv = createKVMock();
  });

  describe("createSession", () => {
    it("creates a new session with correct fields", async () => {
      const session = await createSession(kv, guildId, channelId, creatorId);

      expect(session.guildId).toBe(guildId);
      expect(session.channelId).toBe(channelId);
      expect(session.creatorId).toBe(creatorId);
      expect(session.participants).toEqual({});
      expect(session.pickedUserIds).toEqual([]);
      expect(session.messageId).toBe("");
      expect(session.createdAt).toBeTruthy();
      // Verify ISO 8601 format
      expect(new Date(session.createdAt).toISOString()).toBe(session.createdAt);
    });

    it("persists the session to KV with TTL 3600", async () => {
      await createSession(kv, guildId, channelId, creatorId);

      const stored = await kv.get(`session:${guildId}:${channelId}`, "json");
      expect(stored).not.toBeNull();
      expect(stored.guildId).toBe(guildId);
      expect(kv._lastTtl).toBe(3600);
    });
  });

  describe("getSession", () => {
    it("returns null when no session exists", async () => {
      const result = await getSession(kv, guildId, channelId);
      expect(result).toBeNull();
    });

    it("returns the session when it exists", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      const result = await getSession(kv, guildId, channelId);

      expect(result).not.toBeNull();
      expect(result!.guildId).toBe(guildId);
      expect(result!.creatorId).toBe(creatorId);
    });
  });

  describe("addParticipant", () => {
    it("adds a participant to an existing session", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      const session = await addParticipant(kv, guildId, channelId, "user-1", "Alice");

      expect(session.participants["user-1"]).toBeDefined();
      expect(session.participants["user-1"].userId).toBe("user-1");
      expect(session.participants["user-1"].displayName).toBe("Alice");
      expect(session.participants["user-1"].joinedAt).toBeTruthy();
    });

    it("is idempotent — re-adding overwrites the existing participant", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await addParticipant(kv, guildId, channelId, "user-1", "Alice");
      const session = await addParticipant(kv, guildId, channelId, "user-1", "Alice (updated)");

      expect(Object.keys(session.participants)).toHaveLength(1);
      expect(session.participants["user-1"].displayName).toBe("Alice (updated)");
    });

    it("resets TTL on put", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await addParticipant(kv, guildId, channelId, "user-1", "Alice");

      expect(kv._lastTtl).toBe(3600);
    });

    it("throws when session does not exist", async () => {
      await expect(
        addParticipant(kv, guildId, channelId, "user-1", "Alice"),
      ).rejects.toThrow();
    });
  });

  describe("removeParticipant", () => {
    it("removes a participant from the session", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await addParticipant(kv, guildId, channelId, "user-1", "Alice");
      const session = await removeParticipant(kv, guildId, channelId, "user-1");

      expect(session.participants["user-1"]).toBeUndefined();
    });

    it("is a no-op when participant does not exist", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      const session = await removeParticipant(kv, guildId, channelId, "nonexistent");

      expect(Object.keys(session.participants)).toHaveLength(0);
    });

    it("resets TTL on put", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await removeParticipant(kv, guildId, channelId, "user-1");

      expect(kv._lastTtl).toBe(3600);
    });

    it("throws when session does not exist", async () => {
      await expect(
        removeParticipant(kv, guildId, channelId, "user-1"),
      ).rejects.toThrow();
    });
  });

  describe("markPicked", () => {
    it("adds picked user IDs to pickedUserIds", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await addParticipant(kv, guildId, channelId, "user-1", "Alice");
      await addParticipant(kv, guildId, channelId, "user-2", "Bob");

      const session = await markPicked(kv, guildId, channelId, ["user-1", "user-2"]);
      expect(session.pickedUserIds).toEqual(["user-1", "user-2"]);
    });

    it("appends to existing pickedUserIds (preserves order)", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await addParticipant(kv, guildId, channelId, "user-1", "Alice");
      await addParticipant(kv, guildId, channelId, "user-2", "Bob");
      await addParticipant(kv, guildId, channelId, "user-3", "Charlie");

      await markPicked(kv, guildId, channelId, ["user-1"]);
      const session = await markPicked(kv, guildId, channelId, ["user-2", "user-3"]);
      expect(session.pickedUserIds).toEqual(["user-1", "user-2", "user-3"]);
    });

    it("resets TTL on put", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await markPicked(kv, guildId, channelId, ["user-1"]);

      expect(kv._lastTtl).toBe(3600);
    });

    it("throws when session does not exist", async () => {
      await expect(
        markPicked(kv, guildId, channelId, ["user-1"]),
      ).rejects.toThrow();
    });
  });

  describe("deleteSession", () => {
    it("deletes an existing session", async () => {
      await createSession(kv, guildId, channelId, creatorId);
      await deleteSession(kv, guildId, channelId);

      const result = await getSession(kv, guildId, channelId);
      expect(result).toBeNull();
    });

    it("does not throw when session does not exist", async () => {
      await expect(
        deleteSession(kv, guildId, channelId),
      ).resolves.toBeUndefined();
    });
  });
});
