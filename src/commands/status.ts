import { getValidToken, readTokens } from "../auth/token-store.js";
import { getActiveEnv } from "../config.js";

export async function handleStatus(): Promise<void> {
  const { name, convexUrl } = getActiveEnv();
  console.log(`Environment: ${name}`);
  console.log(`  Convex: ${convexUrl}\n`);

  const tokens = readTokens();

  if (!tokens) {
    console.log("Not authenticated. Run `fml login` to sign in.");
    return;
  }

  const tokenValid = await getValidToken();

  console.log("Authentication:");
  console.log(`  User:  ${tokens.user.name} (${tokens.user.email})`);
  console.log(
    `  Token: ${tokenValid ? "valid" : "expired (needs refresh/re-login)"}`,
  );
  console.log(`  Org:   ${tokens.orgSlug ?? "(none — run `fml org <slug>`)"}`);
}
