import { beforeEach, describe, expect, it } from "vitest";
import { readConfig } from "./config.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  // Restore original env before each test
  process.env = { ...originalEnv };
});

describe("readConfig", () => {
  it("parses a valid config", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const config = readConfig();
    expect(config.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => readConfig()).toThrow();
  });

  it("throws when ANTHROPIC_API_KEY is empty", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(() => readConfig()).toThrow();
  });
});
