import { getSetting, setSetting } from "./db.ts";
import { DEFAULT_STORE_PROFILES, normalizeStoreProfiles, type StoreProfile } from "@shared/storeProfiles.ts";

/** The operator's saved store policies, or the built-in ones (read from their live stores) when nothing is saved. */
export function readStoreProfiles(): StoreProfile[] {
  const raw = getSetting("store_profiles");
  if (!raw) return DEFAULT_STORE_PROFILES;
  try {
    return normalizeStoreProfiles(JSON.parse(raw));
  } catch {
    return DEFAULT_STORE_PROFILES;
  }
}

export function saveStoreProfiles(list: unknown): StoreProfile[] {
  const clean = normalizeStoreProfiles(list);
  setSetting("store_profiles", JSON.stringify(clean));
  return clean;
}
