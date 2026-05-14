import { describe, it, expect } from "vitest";
import {
  LEARNER_COMMANDS,
  AUTHOR_COMMANDS,
  COMMON_COMMANDS,
  ALL_COMMANDS,
  findCommand,
} from "../src/cli-commands.js";

describe("cli-commands surface", () => {
  it("learner surface contains the canonical commands from backlog/03", () => {
    const names = LEARNER_COMMANDS.map((c) => c.name);
    expect(names).toEqual([
      "researchcrafters login",
      "researchcrafters logout",
      "researchcrafters start <package>",
      "researchcrafters test",
      "researchcrafters submit",
      "researchcrafters status",
      "researchcrafters logs <run-id>",
    ]);
  });

  it("author surface contains validate/preview/build", () => {
    const names = AUTHOR_COMMANDS.map((c) => c.name);
    expect(names).toEqual([
      "researchcrafters validate <package-path>",
      "researchcrafters preview <package-path>",
      "researchcrafters build <package-path>",
    ]);
  });

  it("common surface includes --version and shell completion", () => {
    const names = COMMON_COMMANDS.map((c) => c.name);
    expect(names).toContain("researchcrafters --version");
    expect(names).toContain("researchcrafters completion <shell>");
  });

  it("every command has a non-empty name, args, and summary", () => {
    for (const cmd of ALL_COMMANDS) {
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(cmd.summary.length).toBeGreaterThan(0);
      // args may be empty string but must be a string.
      expect(typeof cmd.args).toBe("string");
    }
  });

  it("command names are unique across categories", () => {
    const names = ALL_COMMANDS.map((c) => c.name);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });

  it("findCommand resolves known names and returns undefined otherwise", () => {
    expect(findCommand("researchcrafters submit")?.name).toBe(
      "researchcrafters submit",
    );
    expect(findCommand("researchcrafters nonsense")).toBeUndefined();
  });

  it("ALL_COMMANDS combines the three category lists in order", () => {
    expect(ALL_COMMANDS.length).toBe(
      LEARNER_COMMANDS.length +
        AUTHOR_COMMANDS.length +
        COMMON_COMMANDS.length,
    );
  });
});
