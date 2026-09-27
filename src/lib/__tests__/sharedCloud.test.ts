import { describe, expect, it } from "vitest";
import { applyOperations, compactPendingOperations, PendingOperation } from "../sharedCloud";
import { seedData } from "../seed";

function op(overrides: Partial<PendingOperation>): PendingOperation { return { opId: crypto.randomUUID(), clientId: "test", module: "bucketItems", recordId: "item-1", operation: "upsert-record", payload: { id: "item-1", title: "A", note: "", completed: false }, createdAt: new Date().toISOString(), ...overrides }; }

describe("pending operation compaction", () => {
  it("keeps only the latest edit for one record", () => { const result=compactPendingOperations([op({payload:{id:"item-1",title:"A"}}),op({payload:{id:"item-1",title:"B"}})]); expect(result).toHaveLength(1); expect(result[0].payload).toMatchObject({title:"B"}); });
  it("cancels a local add followed by delete", () => { const result=compactPendingOperations([op({localOnly:true}),op({operation:"delete-record",payload:undefined})]); expect(result).toHaveLength(0); });
  it("cancels an unsaved reply followed by delete", () => { const reply={id:"reply-1",author:"me" as const,content:"hello",createdAt:"2026-09-27"}; const result=compactPendingOperations([op({module:"messages",recordId:"message-1",operation:"add-reply",payload:reply}),op({module:"messages",recordId:"message-1",operation:"delete-reply",payload:"reply-1"})]); expect(result).toHaveLength(0); });
});

describe("operation replay", () => {
  it("merges replies without losing the existing reply", () => { const source=structuredClone(seedData); const message=source.messages[0]; message.replies=[{id:"old",author:"baby",content:"old",createdAt:"2026-09-26"}]; const next=applyOperations(source,[op({module:"messages",recordId:message.id,operation:"add-reply",payload:{id:"new",author:"me",content:"new",createdAt:"2026-09-27"}})]); expect(next.messages[0].replies?.map((reply)=>reply.id)).toEqual(["old","new"]); });
});
