import { getAuthenticatedClient } from "../convex-client.js";

export async function handleSearchAnalysis(
  query: string,
  opts: { status?: string; limit?: string },
): Promise<void> {
  const api = await getAuthenticatedClient();
  if (!api) {
    console.error("Not authenticated. Run `fml login`.");
    process.exit(1);
  }
  const result = await api.callBackend("search-analysis", {
    query,
    status: opts.status,
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
  });
  if (!result.ok) {
    console.error(result.error || "Request failed");
    process.exit(1);
  }
  console.log(JSON.stringify(result.result, null, 2));
}

export async function handleRunAnalysis(opts: {
  prompts?: string;
  repoId?: string;
}): Promise<void> {
  const api = await getAuthenticatedClient();
  if (!api) {
    console.error("Not authenticated. Run `fml login`.");
    process.exit(1);
  }
  const result = await api.callBackend("run-analysis-workflow", {
    selectedPromptKeys: opts.prompts?.split(","),
    repositoryId: opts.repoId,
  });
  if (!result.ok) {
    console.error(result.error || "Request failed");
    process.exit(1);
  }
  console.log(JSON.stringify(result.result, null, 2));
}
