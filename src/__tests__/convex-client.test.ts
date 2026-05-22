import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config.js", () => ({
  CONVEX_URL: "https://test.convex.cloud",
  authStorePath: () => "/tmp/auth.json",
  authStorePathFor: () => "/tmp/auth.json",
  resolveEnvConvexUrl: () => null,
  WORKOS_API_URL: "https://api.workos.com",
}));

vi.mock("../sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
}));

const mockReadTokens = vi.fn();
const mockGetSelectedOrg = vi.fn(() => undefined);
vi.mock("../auth/token-store.js", () => ({
  readTokens: () => mockReadTokens(),
  getValidToken: vi.fn(),
  getSelectedOrg: () => mockGetSelectedOrg(),
}));

const mockConvexQuery = vi.fn();
const mockConvexAction = vi.fn();
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query(...args: unknown[]) { return mockConvexQuery(...args); }
    action(...args: unknown[]) { return mockConvexAction(...args); }
  },
}));

vi.mock("@fml-inc/panopticon/repo", () => ({
  resolveRepoFromCwd: vi.fn(() => null),
}));

import { createApiClient, type PublicToolDescriptor } from "../convex-client.js";

const DESCRIPTORS: PublicToolDescriptor[] = [
  {
    name: "integration-github",
    description: "GitHub integration",
    inputSchema: { type: "object" },
    category: "integrations",
  },
];

const SERVICE_TOKEN = "fml_st_testtoken";
const JWT_TOKEN = "eyJhbGciOiJSUzI1NiJ9.test.signature";

// The site URL is derived from CONVEX_URL by replacing .convex.cloud -> .convex.site
const SITE_URL = "https://test.convex.site";

describe("createApiClient.listTools — service token path", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("calls GET /api/tools/list with pluginVersion query param", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({ ok: true, descriptors: DESCRIPTORS }),
    } as Response);

    const api = createApiClient(SERVICE_TOKEN);
    const result = await api.listTools("1.2.3");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/list?pluginVersion=1.2.3`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${SERVICE_TOKEN}`,
    );
    expect(result).toEqual(DESCRIPTORS);
  });

  it("omits pluginVersion param when not provided", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({ ok: true, descriptors: DESCRIPTORS }),
    } as Response);

    const api = createApiClient(SERVICE_TOKEN);
    await api.listTools();

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/list`);
  });

  it("throws when response has ok: false", async () => {
    fetchSpy.mockResolvedValue({
      text: async () => JSON.stringify({ ok: false, error: "fml login required" }),
    } as Response);

    const api = createApiClient(SERVICE_TOKEN);
    await expect(api.listTools()).rejects.toThrow("fml login required");
  });

  it("throws when response body is non-JSON", async () => {
    fetchSpy.mockResolvedValue({
      status: 502,
      text: async () => "Bad Gateway",
    } as Response);

    const api = createApiClient(SERVICE_TOKEN);
    await expect(api.listTools()).rejects.toThrow("HTTP 502");
  });
});

describe("createApiClient.listTools — JWT path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Convex query with pluginVersion when supplied", async () => {
    mockConvexQuery.mockResolvedValue(DESCRIPTORS);

    const api = createApiClient(JWT_TOKEN);
    const result = await api.listTools("2.0.0");

    expect(mockConvexQuery).toHaveBeenCalledWith(
      expect.anything(),
      { pluginVersion: "2.0.0" },
    );
    expect(result).toEqual(DESCRIPTORS);
  });

  it("calls Convex query with empty args when pluginVersion omitted", async () => {
    mockConvexQuery.mockResolvedValue(DESCRIPTORS);

    const api = createApiClient(JWT_TOKEN);
    await api.listTools();

    expect(mockConvexQuery).toHaveBeenCalledWith(expect.anything(), {});
  });

  it("throws auth error translated to login message on Unauthorized", async () => {
    mockConvexQuery.mockRejectedValue(new Error("Unauthorized"));

    const api = createApiClient(JWT_TOKEN);
    await expect(api.listTools()).rejects.toThrow("fml login");
  });
});
