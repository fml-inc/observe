import { execSync } from "node:child_process";

const TOKEN_TTL_MS = 5 * 60 * 1000;

let cachedGitHubToken: { value: string; expiresAt: number } | null = null;

export function resolveGitHubToken(): string | null {
  if (cachedGitHubToken && Date.now() < cachedGitHubToken.expiresAt) {
    return cachedGitHubToken.value;
  }

  const envToken = process.env.PANOPTICON_GITHUB_TOKEN;
  if (envToken) {
    cachedGitHubToken = {
      value: envToken,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    return envToken;
  }

  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (token) {
      cachedGitHubToken = {
        value: token,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      };
    }
    return token || null;
  } catch {
    return null;
  }
}
