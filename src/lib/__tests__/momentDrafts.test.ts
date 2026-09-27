import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMomentImage } = vi.hoisted(() => ({ uploadMomentImage: vi.fn() }));
vi.mock("../supabase", () => ({ uploadMomentImage }));
import { deleteMomentDraft, listMomentDrafts, saveMomentDraft, updateMomentDraft, uploadMomentDraft } from "../momentDrafts";

beforeEach(async () => { for (const draft of await listMomentDrafts()) await deleteMomentDraft(draft.id); });
describe("moment draft storage", () => {
  it("survives a new read and preserves blobs", async () => { await saveMomentDraft({ id:"draft-1", text:"test", place:"东莞", author:"me", createdAt:"2026-09-27", images:[new Blob(["photo"],{type:"image/jpeg"})], filenames:["photo.jpg"], contentTypes:["image/jpeg"], status:"pending", attempts:0, lastError:"" }); const drafts=await listMomentDrafts(); expect(drafts).toHaveLength(1); expect(drafts[0].images[0].size).toBe(5); });
  it("updates retry state and deletes completed drafts", async () => { await saveMomentDraft({ id:"draft-2", text:"retry", place:"", author:"baby", createdAt:"2026-09-27", images:[], filenames:[], contentTypes:[], status:"pending", attempts:0, lastError:"" }); await updateMomentDraft("draft-2",{status:"failed",attempts:1,lastError:"network"}); expect((await listMomentDrafts())[0]).toMatchObject({status:"failed",attempts:1,lastError:"network"}); await deleteMomentDraft("draft-2"); expect(await listMomentDrafts()).toEqual([]); });
  it("resumes after a partial multi-photo upload without uploading completed files again", async () => {
    const draft = { id:"draft-3", text:"partial", place:"东莞", author:"me" as const, createdAt:"2026-09-27", images:[new Blob(["one"],{type:"image/jpeg"}),new Blob(["two"],{type:"image/jpeg"})], filenames:["one.jpg","two.jpg"], contentTypes:["image/jpeg","image/jpeg"], status:"pending" as const, attempts:0, lastError:"" };
    await saveMomentDraft(draft);
    uploadMomentImage.mockResolvedValueOnce("/api/moment-image/one.jpg").mockRejectedValueOnce(new Error("network"));
    await expect(uploadMomentDraft(draft)).rejects.toThrow("network");
    const recovered = (await listMomentDrafts())[0];
    expect(recovered.uploadedPaths).toEqual(["/api/moment-image/one.jpg"]);
    uploadMomentImage.mockResolvedValueOnce("/api/moment-image/two.jpg");
    const moment = await uploadMomentDraft(recovered);
    expect(uploadMomentImage).toHaveBeenCalledTimes(3);
    expect(moment).toMatchObject({ id:"moment-draft-3", images:["/api/moment-image/one.jpg","/api/moment-image/two.jpg"] });
    expect(await listMomentDrafts()).toHaveLength(1);
  });
});
