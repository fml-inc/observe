import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SyncTarget } from "@fml-inc/panopticon/sync";

const mockAddTarget = vi.fn();
const mockLoadSyncConfig = vi.fn();
const mockSaveSyncConfig = vi.fn();

vi.mock("@fml-inc/panopticon/sync", () => ({
  addTarget: (...args: unknown[]) => mockAddTarget(...args),
  loadSyncConfig: (...args: unknown[]) => mockLoadSyncConfig(...args),
  saveSyncConfig: (...args: unknown[]) => mockSaveSyncConfig(...args),
}));

// Stub out modules handleLogin pulls in — we only test the helper.
vi.mock("../../auth/oauth.js", () => ({
  login: vi.fn(),
  canOpenBrowser: vi.fn(),
}));
vi.mock("../../auth/device-flow.js", () => ({ deviceLogin: vi.fn() }));
vi.mock("../../auth/token-store.js", () => ({
  getValidToken: vi.fn(),
  setSelectedOrg: vi.fn(),
}));
vi.mock("../../convex-client.js", () => ({ createApiClient: vi.fn() }));
vi.mock("../../sync/client.js", () => ({ resolveGitHubToken: vi.fn() }));
vi.mock("../../sentry.js", () => ({ Sentry: { captureException: vi.fn() } }));
const mockGetActiveEnv = vi.fn(() => ({
  name: "fml" as string,
  convexUrl: null as string | null,
}));
vi.mock("../../config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config.js")>("../../config.js");
  return {
    ...actual,
    getActiveEnv: () => mockGetActiveEnv(),
  };
});

import { upgradeSyncTargetAfterLogin } from "../../commands/login.js";

describe("upgradeSyncTargetAfterLogin", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveEnv.mockReturnValue({ name: "fml", convexUrl: null });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("adds the active env's target when none exists", () => {
    mockLoadSyncConfig.mockReturnValue({ targets: [] });

    upgradeSyncTargetAfterLogin();

    expect(mockAddTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "fml",
        tokenCommand: "fml sync-token --env fml",
      }),
    );
    expect(mockSaveSyncConfig).not.toHaveBeenCalled();
  });

  it("pins tokenCommand when the active env's target is URL-only", () => {
    const target: SyncTarget = { name: "fml", url: "https://x.convex.site" };
    mockLoadSyncConfig.mockReturnValue({ targets: [target] });

    upgradeSyncTargetAfterLogin();

    expect(target.tokenCommand).toBe("fml sync-token --env fml");
    expect(mockSaveSyncConfig).toHaveBeenCalledWith({ targets: [target] });
    expect(mockAddTarget).not.toHaveBeenCalled();
  });

  it("upgrades legacy `fml sync-token` (no --env) to the pinned form", () => {
    const target: SyncTarget = {
      name: "fml",
      url: "https://x.convex.site",
      tokenCommand: "fml sync-token",
    };
    mockLoadSyncConfig.mockReturnValue({ targets: [target] });

    upgradeSyncTargetAfterLogin();

    expect(target.tokenCommand).toBe("fml sync-token --env fml");
    expect(mockSaveSyncConfig).toHaveBeenCalled();
  });

  it("does not touch other envs' targets", () => {
    const devTarget: SyncTarget = {
      name: "dev",
      url: "https://y.convex.site",
    };
    const fmlTarget: SyncTarget = {
      name: "fml",
      url: "https://x.convex.site",
    };
    mockLoadSyncConfig.mockReturnValue({ targets: [devTarget, fmlTarget] });

    upgradeSyncTargetAfterLogin();

    expect(devTarget.tokenCommand).toBeUndefined();
    expect(fmlTarget.tokenCommand).toBe("fml sync-token --env fml");
  });

  it("leaves an unrelated tokenCommand untouched (preserves gh attribution)", () => {
    const target: SyncTarget = {
      name: "fml",
      url: "https://x.convex.site",
      tokenCommand: "gh auth token",
    };
    mockLoadSyncConfig.mockReturnValue({ targets: [target] });

    upgradeSyncTargetAfterLogin();

    expect(target.tokenCommand).toBe("gh auth token");
    expect(mockSaveSyncConfig).not.toHaveBeenCalled();
    expect(mockAddTarget).not.toHaveBeenCalled();
  });

  it("leaves an existing static token untouched", () => {
    const target: SyncTarget = {
      name: "fml",
      url: "https://x.convex.site",
      token: "static_xyz",
    };
    mockLoadSyncConfig.mockReturnValue({ targets: [target] });

    upgradeSyncTargetAfterLogin();

    expect(target.token).toBe("static_xyz");
    expect(target.tokenCommand).toBeUndefined();
    expect(mockSaveSyncConfig).not.toHaveBeenCalled();
  });

  it("refuses to write a tokenCommand when the env name is unsafe", () => {
    mockGetActiveEnv.mockReturnValue({ name: "x; rm -rf /", convexUrl: null });
    mockLoadSyncConfig.mockReturnValue({ targets: [] });

    upgradeSyncTargetAfterLogin();

    expect(mockAddTarget).not.toHaveBeenCalled();
    expect(mockSaveSyncConfig).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unsafe characters"),
    );
  });

  it("swallows errors from loadSyncConfig and warns instead", () => {
    mockLoadSyncConfig.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => upgradeSyncTargetAfterLogin()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not update sync target: boom"),
    );
  });
});
