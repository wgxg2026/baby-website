import { Moment, Person } from "../types";
import { uploadMomentImage } from "./supabase";

export type MomentDraftStatus = "pending" | "uploading" | "failed";
export type MomentDraft = { id: string; text: string; place: string; author: Person; createdAt: string; images: Blob[]; filenames: string[]; contentTypes: string[]; uploadedPaths?: string[]; status: MomentDraftStatus; attempts: number; lastError: string };
const databaseName = "couple-time-capsule-v1";
const storeName = "moment-drafts";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开照片草稿箱"));
  });
}

export async function saveMomentDraft(draft: MomentDraft) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).put(draft); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
export async function listMomentDrafts() {
  const db = await openDatabase();
  const drafts = await new Promise<MomentDraft[]>((resolve, reject) => { const tx = db.transaction(storeName, "readonly"); const request = tx.objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result as MomentDraft[]); request.onerror = () => reject(request.error); });
  db.close(); return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function deleteMomentDraft(id: string) {
  const db = await openDatabase(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
}
export async function updateMomentDraft(id: string, update: Partial<MomentDraft>) { const drafts = await listMomentDrafts(); const draft = drafts.find((item) => item.id === id); if (!draft) return; await saveMomentDraft({ ...draft, ...update }); }

export async function uploadMomentDraft(draft: MomentDraft): Promise<Moment> {
  await updateMomentDraft(draft.id, { status: "uploading", attempts: draft.attempts + 1, lastError: "" });
  try {
    const images = [...(draft.uploadedPaths ?? [])];
    for (let index = 0; index < draft.images.length; index += 1) {
      if (images[index]) continue;
      const blob = draft.images[index];
      const file = new File([blob], draft.filenames[index] || "moment.jpg", { type: draft.contentTypes[index] || blob.type || "image/jpeg" });
      images[index] = await uploadMomentImage(file);
      await updateMomentDraft(draft.id, { uploadedPaths: [...images] });
    }
    const moment: Moment = { id: `moment-${draft.id}`, text: draft.text, place: draft.place, author: draft.author, createdAt: draft.createdAt, imageUrl: images[0] || "", images };
    return moment;
  } catch (error) {
    await updateMomentDraft(draft.id, { status: "failed", lastError: error instanceof Error ? error.message : "照片上传失败，请稍后重试" });
    throw error;
  }
}
