import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock config to use temp directory
let tmpDir: string;

vi.mock("../../config.js", () => ({
  authStorePath: () => path.join(tmpDir, "auth.json"),
  authStorePathFor: (envName: string) =>
    path.join(tmpDir, `auth.${envName}.json`),
  resolveEnvConvexUrl: () => null,
  CONVEX_URL: "https://test.convex.cloud",
  WORKOS_API_URL: "https://api.workos.com",
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
}));

import {
  readTokens,
  writeTokens,
  getValidToken,
} from "../../auth/token-store.js";

function makeAuth(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "test_access_token",
    refreshToken: "test_refresh_token",
    expiresAt: Date.now() + 3_600_000,
    user: { id: "u1", email: "test@example.com", name: "Test User" },
    ...overrides,
  };
}

describe("token-store", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fml-test-"));
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readTokens / writeTokens", () => {
    it("returns null when no auth file exists", () => {
      expect(readTokens()).toBeNull();
    });

    it("round-trips tokens through write and read", () => {
      const auth = makeAuth();
      writeTokens(auth);
      const read = readTokens();
      expect(read).toEqual(auth);
    });
  });

  describe("getValidToken", () => {
    it("returns FML_TOKEN env var when set", async () => {
      vi.stubEnv("FML_TOKEN", "pat_from_env");
      // Even with stored tokens, env var takes precedence
      writeTokens(makeAuth());
      const token = await getValidToken();
      expect(token).toBe("pat_from_env");
    });

    it("returns null when no auth and no env var", async () => {
      const token = await getValidToken();
      expect(token).toBeNull();
    });

    it("returns stored token when valid and no env var", async () => {
      writeTokens(makeAuth({ accessToken: "stored_tok" }));
      const token = await getValidToken();
      expect(token).toBe("stored_tok");
    });

    it("skips empty FML_TOKEN", async () => {
      vi.stubEnv("FML_TOKEN", "");
      writeTokens(makeAuth({ accessToken: "stored_tok" }));
      const token = await getValidToken();
      expect(token).toBe("stored_tok");
    });

    it("reads the env-specific store when env is provided", async () => {
      writeTokens(makeAuth({ accessToken: "default_tok" }));
      writeTokens(makeAuth({ accessToken: "dev_tok" }), "dev");
      writeTokens(makeAuth({ accessToken: "prod_tok" }), "prod");

      expect(await getValidToken({ env: "dev" })).toBe("dev_tok");
      expect(await getValidToken({ env: "prod" })).toBe("prod_tok");
      expect(await getValidToken()).toBe("default_tok");
    });
  });
});
