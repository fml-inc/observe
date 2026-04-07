import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadTokens = vi.fn();
const mockGetValidToken = vi.fn();

vi.mock("../../auth/token-store.js", () => ({
  readTokens: (...args: unknown[]) => mockReadTokens(...args),
  getValidToken: (...args: unknown[]) => mockGetValidToken(...args),
}));

import { handleStatus } from "../../commands/status.js";

describe("status command", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("shows not authenticated when no tokens", async () => {
    mockReadTokens.mockReturnValue(null);

    await handleStatus();

    expect(consoleSpy).toHaveBeenCalledWith(
      "Not authenticated. Run `fml login` to sign in.",
    );
  });

  it("shows user info and valid token", async () => {
    mockReadTokens.mockReturnValue({
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() + 3_600_000,
      user: { id: "u1", email: "test@example.com", name: "Test User" },
    });
    mockGetValidToken.mockResolvedValue("tok");

    await handleStatus();

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("Test User");
    expect(output).toContain("test@example.com");
    expect(output).toContain("valid");
  });

  it("shows expired token status", async () => {
    mockReadTokens.mockReturnValue({
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() - 1000,
      user: { id: "u1", email: "test@example.com", name: "Test User" },
    });
    mockGetValidToken.mockResolvedValue(null);

    await handleStatus();

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("expired");
  });
});
