/**
 * Device Authorization Flow
 *
 * RFC 8628-like flow for headless environments (sandboxes, containers, SSH).
 * The user gets a URL + code, enters it in any browser, and the CLI polls
 * until the code is confirmed.
 */

import { getSiteUrl } from "../config.js";
import { writeTokens } from "./token-store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
}

interface PollResponse {
  status: "pending" | "authorized" | "expired" | "rate_limited";
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  user?: { id: string; email: string; name: string };
  orgSlug?: string;
  interval?: number;
}

/**
 * Run the device authorization flow.
 * Returns user info on success, throws on failure/timeout.
 */
export async function deviceLogin(): Promise<{
  email: string;
  name: string;
}> {
  const siteUrl = getSiteUrl();

  // 1. Request device code
  const codeRes = await fetch(`${siteUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!codeRes.ok) {
    const body = await codeRes.text();
    throw new Error(`Failed to start device flow: ${body}`);
  }

  const codeData = (await codeRes.json()) as DeviceCodeResponse;

  // 2. Display instructions
  console.log("");
  console.log(`  To sign in, visit: ${codeData.verificationUri}`);
  console.log(`  And enter code:    ${codeData.userCode}`);
  console.log("");
  console.log("  Waiting for authorization...");

  // 3. Poll for completion
  let pollInterval = codeData.interval * 1000;

  while (Date.now() < codeData.expiresAt) {
    await sleep(pollInterval);

    const pollRes = await fetch(`${siteUrl}/api/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: codeData.deviceCode }),
    });

    if (pollRes.status === 429) {
      const data = (await pollRes.json()) as PollResponse;
      pollInterval = (data.interval ?? codeData.interval * 2) * 1000;
      continue;
    }

    const data = (await pollRes.json()) as PollResponse;

    if (data.status === "pending") continue;

    if (data.status === "authorized") {
      writeTokens({
        accessToken: data.accessToken!,
        refreshToken: data.refreshToken!,
        expiresAt: data.expiresAt!,
        user: data.user!,
        orgSlug: data.orgSlug ?? undefined,
        tokenType: "service",
      });

      return { email: data.user!.email, name: data.user!.name };
    }

    if (data.status === "expired") {
      throw new Error("Device authorization expired. Run `fml login` again.");
    }

    throw new Error(`Device authorization failed: ${data.status}`);
  }

  throw new Error(
    "Device authorization timed out (15 minutes). Run `fml login` again.",
  );
}
