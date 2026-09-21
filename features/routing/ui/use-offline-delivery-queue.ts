"use client";

/**
 * Persistent queue of deliveries (and undos) made without a connection, plus
 * the replay that sends them once the signal is back.
 *
 * Storage is localStorage behind useSyncExternalStore: the queue survives a
 * reload / the browser being killed mid-route, is hydration-safe (server
 * snapshot is empty), and stays in step across tabs via the `storage` event.
 *
 * Replay is one-at-a-time in tap order, stops at the first unreachable-network
 * failure (keeps the rest for the next attempt), and DROPS an operation the
 * server actively rejected (reporting it) so one bad order can never wedge the
 * queue forever. The server actions are idempotent for a repeat "deliver" (an
 * already-delivered order is a success), which is what makes a retry after an
 * ambiguous timeout safe.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { completeDeliveryAction } from "@/features/orders/application/complete-delivery";
import { revertDeliveryAction } from "@/features/orders/application/revert-delivery";
import {
  enqueueOperation,
  OFFLINE_QUEUE_STORAGE_KEY,
  parseQueue,
  removeOperation,
  serializeQueue,
  type OfflineDeliveryQueue,
  type QueuedOperation,
  type QueuedOperationKind,
} from "@/features/routing/domain/offline-delivery-queue";

const EMPTY: OfflineDeliveryQueue = [];
const RETRY_INTERVAL_MS = 15_000;
const SEND_TIMEOUT_MS = 10_000;
const TIMED_OUT = Symbol("timed-out");

// ---- external store ---------------------------------------------------------

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedQueue: OfflineDeliveryQueue = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
  } catch {
    return null; // storage blocked (private mode) — behave as an empty queue
  }
}

function getSnapshot(): OfflineDeliveryQueue {
  const raw = readRaw();
  // Same raw text → same array instance, as useSyncExternalStore requires.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedQueue = parseQueue(raw);
  }
  return cachedQueue;
}

function getServerSnapshot(): OfflineDeliveryQueue {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === OFFLINE_QUEUE_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeQueue(next: OfflineDeliveryQueue): void {
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, serializeQueue(next));
  } catch {
    /* storage full/blocked — the on-screen optimistic state still holds for this session */
  }
  for (const listener of listeners) listener();
}

// ---- hook -------------------------------------------------------------------

export interface UseOfflineDeliveryQueueOptions {
  /** One queued operation reached the server. */
  onOperationSynced: (op: QueuedOperation) => void;
  /** The server refused a queued operation (it is dropped from the queue). */
  onOperationRejected: (op: QueuedOperation, message: string) => void;
  /** A replay pass finished with at least one operation sent. */
  onFlushed: (sentCount: number) => void;
}

export interface OfflineDeliveryQueueApi {
  queue: OfflineDeliveryQueue;
  syncing: boolean;
  enqueue: (kind: QueuedOperationKind, orderId: string) => void;
  flush: () => Promise<void>;
}

export function useOfflineDeliveryQueue(
  options: UseOfflineDeliveryQueueOptions,
): OfflineDeliveryQueueApi {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [syncing, setSyncing] = useState(false);
  const flushing = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const enqueue = useCallback((kind: QueuedOperationKind, orderId: string) => {
    writeQueue(
      enqueueOperation(getSnapshot(), { kind, orderId, queuedAt: new Date().toISOString() }),
    );
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (getSnapshot().length === 0) return;

    flushing.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      // Re-read each round: the driver may keep tapping while this runs.
      for (let op = getSnapshot()[0]; op; op = getSnapshot()[0]) {
        let result;
        try {
          const call =
            op.kind === "deliver"
              ? completeDeliveryAction({ order_id: op.orderId })
              : revertDeliveryAction({ order_id: op.orderId });
          // A stalled connection can leave the request hanging for minutes and
          // would pin `flushing` on; give up on this attempt after a while. If
          // the request does land later, the retry is harmless (idempotent).
          const raced = await Promise.race([
            call,
            new Promise<typeof TIMED_OUT>((resolve) =>
              setTimeout(() => resolve(TIMED_OUT), SEND_TIMEOUT_MS),
            ),
          ]);
          if (raced === TIMED_OUT) break;
          result = raced;
        } catch {
          break; // network still down — keep this and everything after it
        }
        writeQueue(removeOperation(getSnapshot(), op.orderId));
        if (result.status === "error") {
          optionsRef.current.onOperationRejected(op, result.message);
        } else {
          sent += 1;
          optionsRef.current.onOperationSynced(op);
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
    if (sent > 0) optionsRef.current.onFlushed(sent);
  }, []);

  // Try on mount (a reload with leftovers), whenever the connection returns and
  // when the tab comes back to the foreground …
  useEffect(() => {
    // Deferred a tick so the first attempt is not a synchronous setState in the
    // effect body.
    const kick = setTimeout(() => void flush(), 0);
    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(kick);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  // … and periodically while anything is waiting: `online` alone misses a
  // "connected but no data" stretch, where the browser never fires an event.
  const pending = queue.length > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush, pending]);

  return { queue, syncing, enqueue, flush };
}
