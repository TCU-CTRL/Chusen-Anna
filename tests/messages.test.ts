import { describe, it, expect } from "vitest";
import {
  successMessageSingle,
  successMessageMultiple,
  errorNotInVoiceChannel,
  errorNoEligibleMembers,
  errorCountTooLarge,
  errorAllPicked,
  errorNoSession,
  errorNoSessionEnd,
  errorUnexpected,
  sessionStartMessage,
} from "../src/messages/annaMessages";

describe("annaMessages", () => {
  describe("successMessageSingle", () => {
    it("contains Discord mention format for the selected user", () => {
      const msg = successMessageSingle("123456");
      expect(msg).toContain("<@123456>");
    });

    it("contains character tone elements", () => {
      const msg = successMessageSingle("123456");
      expect(msg).toContain("抽選アンナちゃん");
      expect(msg).toContain("どきどき");
    });

    it("contains lottery emoji", () => {
      const msg = successMessageSingle("u1");
      expect(msg).toContain("🎲");
    });
  });

  describe("successMessageMultiple", () => {
    it("contains Discord mention format for all selected users", () => {
      const msg = successMessageMultiple(["aaa", "bbb", "ccc"]);
      expect(msg).toContain("<@aaa>");
      expect(msg).toContain("<@bbb>");
      expect(msg).toContain("<@ccc>");
    });

    it("contains character tone elements", () => {
      const msg = successMessageMultiple(["a", "b"]);
      expect(msg).toContain("抽選アンナちゃん");
    });

    it("uses sequential phrasing for multiple people", () => {
      const msg = successMessageMultiple(["a", "b"]);
      expect(msg).toContain("順番に");
    });

    it("contains lottery emoji", () => {
      const msg = successMessageMultiple(["a", "b"]);
      expect(msg).toContain("🎲");
    });
  });

  describe("errorNotInVoiceChannel", () => {
    it("guides user to join VC first", () => {
      const msg = errorNotInVoiceChannel();
      expect(msg).toContain("VC");
    });

    it("contains character tone", () => {
      const msg = errorNotInVoiceChannel();
      expect(msg).toContain("あれれ");
    });
  });

  describe("errorNoEligibleMembers", () => {
    it("informs no eligible members", () => {
      const msg = errorNoEligibleMembers();
      expect(msg).toContain("メンバー");
    });

    it("mentions Bot exclusion", () => {
      const msg = errorNoEligibleMembers();
      expect(msg).toContain("Bot");
    });
  });

  describe("errorCountTooLarge", () => {
    it("shows available count", () => {
      const msg = errorCountTooLarge(5);
      expect(msg).toContain("5");
    });

    it("contains character tone", () => {
      const msg = errorCountTooLarge(3);
      expect(msg).toContain("多い");
    });
  });

  describe("errorAllPicked", () => {
    it("informs all members have been picked", () => {
      const msg = errorAllPicked();
      expect(msg).toContain("全員");
      expect(msg).toContain("選出");
    });
  });

  describe("errorNoSession", () => {
    it("guides user to start a session with /tyusen_start", () => {
      const msg = errorNoSession();
      expect(msg).toContain("/tyusen_start");
    });
  });

  describe("errorNoSessionEnd", () => {
    it("informs no active session exists", () => {
      const msg = errorNoSessionEnd();
      expect(msg).toContain("セッション");
    });
  });

  describe("errorUnexpected", () => {
    it("asks user to retry later", () => {
      const msg = errorUnexpected();
      expect(msg).toContain("もう一度");
    });

    it("contains apologetic tone", () => {
      const msg = errorUnexpected();
      expect(msg).toContain("ごめんなさい");
    });
  });

  describe("sessionStartMessage", () => {
    it("contains character name", () => {
      const msg = sessionStartMessage();
      expect(msg).toContain("アンナちゃん");
    });

    it("invites participation", () => {
      const msg = sessionStartMessage();
      expect(msg).toContain("ボタン");
    });
  });
});
