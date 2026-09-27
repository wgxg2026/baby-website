import { AppData, SavingGoal } from "../types";
import { seedData } from "./seed";

const key = "couple-time-capsule-data-v2";
const legacyKey = "couple-time-capsule-data";

function listOrSeed<T>(value: unknown, seed: T[]): T[] {
  return Array.isArray(value) ? value as T[] : seed;
}

export function normalizeAppData(value: unknown): AppData {
  const parsed = { ...seedData, ...(value && typeof value === "object" ? value : {}) } as AppData;
  return {
    ...parsed,
    bucketItems: listOrSeed(parsed.bucketItems, seedData.bucketItems),
    periodRecords: listOrSeed(parsed.periodRecords, seedData.periodRecords),
    messages: listOrSeed(parsed.messages, seedData.messages),
    locations: listOrSeed(parsed.locations, seedData.locations),
    travelCheckins: listOrSeed(parsed.travelCheckins, seedData.travelCheckins),
    musicItems: listOrSeed(parsed.musicItems, seedData.musicItems),
    mediaItems: listOrSeed(parsed.mediaItems, seedData.mediaItems),
    foodPlaces: listOrSeed(parsed.foodPlaces, seedData.foodPlaces),
    savingGoals: listOrSeed(parsed.savingGoals, seedData.savingGoals)
      .filter((goal) => {
        const legacy = goal as SavingGoal & { target?: unknown; current?: unknown };
        return legacy.target === undefined && legacy.current === undefined;
      })
      .map((goal) => ({
        ...goal,
        horizon: goal.horizon ?? "short",
        dueDate: goal.dueDate ?? "",
        completed: goal.completed ?? false
      })),
    achievements: listOrSeed(parsed.achievements, seedData.achievements),
    moments: listOrSeed(parsed.moments, seedData.moments).map(normalizeMoment),
    comments: listOrSeed(parsed.comments, seedData.comments),
    anniversaries: listOrSeed(parsed.anniversaries, seedData.anniversaries)
  };
}

function toProxyImageUrl(value: string) {
  const match = value.match(/\/storage\/v1\/object\/public\/moments\/(.+)$/);
  return match ? `/api/moment-image/${match[1]}` : value;
}

function normalizeMoment(moment: AppData["moments"][number]) {
  const images = Array.isArray(moment.images) && moment.images.length > 0
    ? moment.images
    : moment.imageUrl
      ? [moment.imageUrl]
      : [];
  return {
    ...moment,
    imageUrl: toProxyImageUrl(images[0] ?? ""),
    images: images.map(toProxyImageUrl)
  };
}

export function loadLocalData(): AppData {
  const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  if (!raw) return seedData;
  try {
    return normalizeAppData(JSON.parse(raw));
  } catch {
    return seedData;
  }
}

export function saveLocalData(data: AppData) {
  const localData = {
    ...data,
    moments: data.moments.map((moment) => {
      const images = (moment.images?.length ? moment.images : [moment.imageUrl])
        .filter((image) => image && !image.startsWith("data:image/"));
      return {
        ...moment,
        imageUrl: images[0] ?? "",
        images
      };
    })
  };

  try {
    localStorage.setItem(key, JSON.stringify(localData));
    localStorage.removeItem(legacyKey);
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      localStorage.removeItem(key);
      localStorage.removeItem(legacyKey);
      try {
        localStorage.setItem(key, JSON.stringify(localData));
      } catch {
        // Local cache is optional; cloud data remains the source of truth.
      }
      return;
    }
    throw error;
  }
}

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
