// Copied from https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers?hl=pt-br#keep_a_service_worker_alive_continuously

import log from "loglevel";
import { storage } from "webextension-polyfill";

/**
 * Starts the heartbeat interval which keeps the service worker alive. Call
 * this sparingly when you are doing work which requires persistence, and call
 * stopHeartbeat once that work is complete.
 */
export async function startHeartbeat() {
  // Run the heartbeat once at service worker startup.
  runHeartbeat().then(() => {
    // Then again every 20 seconds.
    setInterval(runHeartbeat, 20000);
  });
}

async function runHeartbeat() {
  log.debug("Heartbeat", getLastHeartbeat());
  try {
    await storage.local.set({
      "last-heartbeat": Date.now().toString(),
    });
  } catch (err: any) {
    log.error("Heartbeat error", err);
  }
}

/**
 * Returns the last heartbeat stored in extension storage, or undefined if
 * the heartbeat has never run before.
 */
async function getLastHeartbeat() {
  return (await storage.local.get("last-heartbeat"))["last-heartbeat"];
}
