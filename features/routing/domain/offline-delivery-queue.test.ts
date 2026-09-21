import { describe, expect, it } from "vitest";

import {
  enqueueOperation,
  parseQueue,
  queuedDeliveredIds,
  queuedRevertedIds,
  removeOperation,
  serializeQueue,
  type QueuedOperation,
} from "@/features/routing/domain/offline-delivery-queue";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const op = (kind: QueuedOperation["kind"], orderId: string): QueuedOperation => ({
  kind,
  orderId,
  queuedAt: "2026-09-22T10:00:00.000Z",
});

describe("enqueueOperation", () => {
  it("appends operations for different orders in tap order", () => {
    const q = enqueueOperation(enqueueOperation([], op("deliver", A)), op("deliver", B));
    expect(q.map((x) => x.orderId)).toEqual([A, B]);
  });

  it("does not queue the same operation twice", () => {
    const q = enqueueOperation(enqueueOperation([], op("deliver", A)), op("deliver", A));
    expect(q).toHaveLength(1);
  });

  it("cancels a deliver followed by a revert (net nothing to send)", () => {
    const q = enqueueOperation(enqueueOperation([], op("deliver", A)), op("revert", A));
    expect(q).toEqual([]);
  });

  it("cancels a revert followed by a deliver", () => {
    const q = enqueueOperation(enqueueOperation([], op("revert", A)), op("deliver", A));
    expect(q).toEqual([]);
  });

  it("leaves other orders alone when one cancels", () => {
    const start = [op("deliver", A), op("deliver", B)];
    const q = enqueueOperation(start, op("revert", A));
    expect(q.map((x) => x.orderId)).toEqual([B]);
  });
});

describe("queue views", () => {
  it("splits delivered and reverted ids", () => {
    const q = [op("deliver", A), op("revert", B)];
    expect([...queuedDeliveredIds(q)]).toEqual([A]);
    expect([...queuedRevertedIds(q)]).toEqual([B]);
  });

  it("removeOperation drops one order", () => {
    expect(removeOperation([op("deliver", A), op("deliver", B)], A).map((x) => x.orderId)).toEqual([B]);
  });
});

describe("serialize / parse", () => {
  it("round-trips", () => {
    const q = [op("deliver", A), op("revert", B)];
    expect(parseQueue(serializeQueue(q))).toEqual(q);
  });

  it("treats null, garbage and wrong shapes as an empty queue", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue('[{"kind":"deliver","orderId":"nope","queuedAt":"x"}]')).toEqual([]);
  });
});
