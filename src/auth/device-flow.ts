/**
 * Device Authorization Flow — Double Handshake
 *
 * 1. CLI gets a unique URL + deviceCode from backend
 * 2. User pastes URL in browser → page shows confirmation code
 * 3. User types confirmation code back into CLI
 * 4. CLI polls with deviceCode + confirmationCode → gets tokens
 */

import { createInterface } from "node:readline";
import { getSiteUrl } from "../config.js";
import { writeTokens } from "./token-store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so stdout stays clean for MCP
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

interface DeviceCodeResponse {
  deviceCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
}

interface PollResponse {
  status:
    | "pending"
    | "authorized"
    | "expired"
    | "rate_limited"
    | "invalid_code";
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  user?: { id: string; email: string; name: string };
  orgSlug?: string;
  interval?: number;
}

/**
 * Run the double-handshake device authorization flow.
 */
export async function deviceLogin(): Promise<{
  email: string;
  name: string;
}> {
  const siteUrl = getSiteUrl();

  // 1. Request device code + session URL
  const codeRes = await fetch(`${siteUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!codeRes.ok) {
    const body = await codeRes.text();
    throw new Error(`Failed to start device flow: ${body}`);
  }

  const codeData = (await codeRes.json()) as DeviceCodeResponse;

  // 2. Show URL for user to paste in browser
  console.log("");
  console.log("  Paste this URL in your browser to sign in:");
  console.log("");
  console.log(`  ${codeData.verificationUri}`);
  console.log("");

  // 3. Wait for user to enter the confirmation code from the browser
  const confirmationCode = await prompt("  Enter the code from your browser: ");

  if (!confirmationCode) {
    throw new Error("No confirmation code entered.");
  }

  // Normalize: uppercase, strip dashes/spaces
  const normalizedCode = confirmationCode
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/^(.{4})/, "$1-");

  console.log("  Verifying...");

  // 4. Poll with deviceCode + confirmationCode
  let pollInterval = codeData.interval * 1000;

  while (Date.now() < codeData.expiresAt) {
    const pollRes = await fetch(`${siteUrl}/api/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceCode: codeData.deviceCode,
        confirmationCode: normalizedCode,
      }),
    });

    if (pollRes.status === 429) {
      const data = (await pollRes.json()) as PollResponse;
      pollInterval = (data.interval ?? codeData.interval * 2) * 1000;
      await sleep(pollInterval);
      continue;
    }

    const data = (await pollRes.json()) as PollResponse;

    if (data.status === "pending") {
      // User hasn't clicked Authorize yet — wait and retry
      await sleep(pollInterval);
      continue;
    }

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

    if (data.status === "invalid_code") {
      throw new Error(
        "Invalid confirmation code. Make sure you copied the code from the browser correctly.",
      );
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
