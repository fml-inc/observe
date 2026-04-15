import { getValidToken } from "../auth/token-store.js";

/**
 * Print the current FML access token to stdout.
 *
 * Wired into panopticon sync targets as `tokenCommand: "fml sync-token"`.
 * Resolves and refreshes the stored FML session token, the same credential
 * `fml login` produces. Used on sandboxes / CI / containers where there's
 * no `gh auth token` to attribute sync telemetry to a GitHub identity.
 *
 * Output: token on stdout, nothing else. Non-zero exit on any failure so
 * panopticon's token helper treats it as a missed refresh rather than
 * caching an empty string as the bearer.
 */
export async function handleSyncToken(): Promise<void> {
  const token = await getValidToken();
  if (!token) {
    console.error("fml: not logged in. Run `fml login` to enable sync.");
    process.exit(1);
  }
  process.stdout.write(token);
  process.exit(0);
}
