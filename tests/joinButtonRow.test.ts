import { describe, it, expect } from "vitest";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { buildJoinButtonRow } from "../src/components/joinButtonRow";

describe("buildJoinButtonRow", () => {
  it("returns a single ActionRow", () => {
    const row = buildJoinButtonRow();
    expect(row.type).toBe(ComponentType.ActionRow);
    expect(row.components).toHaveLength(1);
  });

  it("contains a primary join button with custom_id tyusen_join", () => {
    const row = buildJoinButtonRow();
    const button = row.components[0];
    expect(button.type).toBe(ComponentType.Button);
    expect(button.style).toBe(ButtonStyle.Primary);
    expect(button.label).toBe("参加する");
    expect(button.custom_id).toBe("tyusen_join");
  });
});
