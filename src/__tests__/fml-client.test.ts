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
const mockGetSelectedOrg = vi.fn<() => string | undefined>(() => undefined);
vi.mock("../auth/token-store.js", () => ({
  readTokens: () => mockReadTokens(),
  getValidToken: vi.fn(),
  getSelectedOrg: () => mockGetSelectedOrg(),
}));

const mockConvexQuery = vi.fn();
const mockConvexAction = vi.fn();
const mockResolveRepoFromCwd = vi.fn<() => { repo: string } | null>(() => null);
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query(...args: unknown[]) { return mockConvexQuery(...args); }
    action(...args: unknown[]) { return mockConvexAction(...args); }
  },
}));

vi.mock("@fml-inc/panopticon/repo", () => ({
  resolveRepoFromCwd: () => mockResolveRepoFromCwd(),
}));

import { createFmlClient, type PublicToolDescriptor } from "../fml-client.js";

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

describe("createFmlClient.listTools — service token path", () => {
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

    const api = createFmlClient(SERVICE_TOKEN);
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

    const api = createFmlClient(SERVICE_TOKEN);
    await api.listTools();

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/list`);
  });

  it("throws when response has ok: false", async () => {
    fetchSpy.mockResolvedValue({
      text: async () => JSON.stringify({ ok: false, error: "fml login required" }),
    } as Response);

    const api = createFmlClient(SERVICE_TOKEN);
    await expect(api.listTools()).rejects.toThrow("fml login required");
  });

  it("throws when response body is non-JSON", async () => {
    fetchSpy.mockResolvedValue({
      status: 502,
      text: async () => "Bad Gateway",
    } as Response);

    const api = createFmlClient(SERVICE_TOKEN);
    await expect(api.listTools()).rejects.toThrow("HTTP 502");
  });
});

describe("createFmlClient.listTools — JWT path (also routes through HTTP)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("calls GET /api/tools/list with the JWT bearer (not client.query)", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({ ok: true, descriptors: DESCRIPTORS }),
    } as Response);

    const api = createFmlClient(JWT_TOKEN);
    const result = await api.listTools("2.0.0");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/list?pluginVersion=2.0.0`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${JWT_TOKEN}`,
    );
    expect(result).toEqual(DESCRIPTORS);
    expect(mockConvexQuery).not.toHaveBeenCalled();
  });

  it("omits pluginVersion param when not provided", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({ ok: true, descriptors: DESCRIPTORS }),
    } as Response);

    const api = createFmlClient(JWT_TOKEN);
    await api.listTools();

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/list`);
  });

  it("throws auth error translated to login message on Unauthorized", async () => {
    fetchSpy.mockResolvedValue({
      text: async () => JSON.stringify({ ok: false, error: "Unauthorized" }),
    } as Response);

    const api = createFmlClient(JWT_TOKEN);
    await expect(api.listTools()).rejects.toThrow("fml login");
  });
});

describe("createFmlClient.callBackend — unified HTTP path", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSelectedOrg.mockReturnValue(undefined);
    mockReadTokens.mockReturnValue(null);
    mockResolveRepoFromCwd.mockReturnValue(null);
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("calls POST /api/tools/execute for JWT callers instead of Convex action", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { done: true } }),
    } as Response);
    mockGetSelectedOrg.mockReturnValue("acme");
    mockResolveRepoFromCwd.mockReturnValue({ repo: "acme/repo" });

    const api = createFmlClient(JWT_TOKEN);
    const result = await api.callBackend("list-engineering-sessions", {
      limit: 5,
    });

    expect(result).toEqual({ ok: true, result: { done: true } });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SITE_URL}/api/tools/execute`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${JWT_TOKEN}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      toolName: "list-engineering-sessions",
      args: { limit: 5 },
      org: "acme",
      repo: "acme/repo",
    });
    expect(mockConvexAction).not.toHaveBeenCalled();
  });

  it("lets explicit org override selected org", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: null }),
    } as Response);
    mockGetSelectedOrg.mockReturnValue("stored-org");

    const api = createFmlClient(JWT_TOKEN);
    await api.callBackend("ping", {}, { org: "explicit-org" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      org: "explicit-org",
    });
  });

  it("forwards service-token userExternalId only for service-token callers", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: "ok" }),
    } as Response);
    mockReadTokens.mockReturnValue({ user: { id: "stored-user" } });
    vi.stubEnv("FML_USER_EXTERNAL_ID", "env-user");

    const api = createFmlClient(SERVICE_TOKEN);
    await api.callBackend("get-engineering-activity", {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      userExternalId: "env-user",
    });
  });

  it("maps non-JSON HTTP response to ToolResult error", async () => {
    fetchSpy.mockResolvedValue({
      status: 502,
      text: async () => "Bad Gateway",
    } as Response);

    const api = createFmlClient(JWT_TOKEN);
    await expect(api.callBackend("ping", {})).resolves.toEqual({
      ok: false,
      error: "HTTP 502: Bad Gateway",
    });
  });

  it("translates unauthenticated HTTP envelope to login guidance", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ ok: false, error: "Unauthorized" }),
    } as Response);

    const api = createFmlClient(JWT_TOKEN);
    const result = await api.callBackend("ping", {});

    expect(result.ok).toBe(false);
    expect(result.error).toContain("fml login");
  });
});
