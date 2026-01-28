import log from "loglevel";
import { storage } from "webextension-polyfill";

export interface Settings extends Record<string, unknown> {
  logLevel: "info" | "debug" | "warn" | "error";
  devMode: boolean;
}

export const defaultSettings: Settings = {
  logLevel: "info",
  devMode: false,
};

const ENDPOINT_PROD = "ws://localhost:9002";
const ENDPOINT_DEV = "ws://localhost:9102";

export function getEndpoint(settings: Settings): string {
  return settings.devMode ? ENDPOINT_DEV : ENDPOINT_PROD;
}

export async function loadSettings(): Promise<Settings> {
  const settings = (await storage.sync.get(defaultSettings)) as Settings;
  log.setLevel(settings.logLevel);
  return settings;
}
