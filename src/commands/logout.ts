import fs from "node:fs";
import { AUTH_STORE_PATH } from "../config.js";

export function handleLogout(): void {
  try {
    fs.unlinkSync(AUTH_STORE_PATH);
  } catch {
    // File doesn't exist, that's fine
  }
  console.log("Logged out. Stored credentials cleared.");
}
