import { describe, it, expect } from "vitest";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import {
  buildActionRow,
  JOIN_CUSTOM_ID,
  JOIN_PICK_CUSTOM_ID,
  PRESENT_EARLY_CUSTOM_ID,
} from "../src/components/joinButtonRow";

describe("buildActionRow", () => {
  it("returns a single ActionRow with join + early-present buttons", () => {
    const row = buildActionRow();
    expect(row.type).toBe(ComponentType.ActionRow);
    expect(row.components).toHaveLength(2);
  });

  it("first button is the join button (defaults to tyusen_join)", () => {
    const row = buildActionRow();
    const button = row.components[0];
    expect(button.type).toBe(ComponentType.Button);
    expect(button.style).toBe(ButtonStyle.Primary);
    expect(button.label).toBe("参加する");
    expect(button.custom_id).toBe(JOIN_CUSTOM_ID);
  });

  it("second button is the early-present button (tyusen_present_early)", () => {
    const row = buildActionRow();
    const button = row.components[1];
    expect(button.type).toBe(ComponentType.Button);
    expect(button.label).toBe("早めに発表する");
    expect(button.custom_id).toBe(PRESENT_EARLY_CUSTOM_ID);
    expect(button.custom_id).toBe("tyusen_present_early");
  });

  it("uses the provided join custom_id (pick-result variant)", () => {
    const row = buildActionRow(JOIN_PICK_CUSTOM_ID);
    expect(row.components[0].custom_id).toBe(JOIN_PICK_CUSTOM_ID);
    expect(row.components[0].custom_id).toBe("tyusen_join_pick");
    // early-present custom_id stays the same regardless of message type
    expect(row.components[1].custom_id).toBe(PRESENT_EARLY_CUSTOM_ID);
  });
});
