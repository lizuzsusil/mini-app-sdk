import type { StreamChunk } from "@lizuz/mini-app-types";
import { describe, expect, it } from "vitest";
import { StreamBuilder } from "./stream-builder";

function chunk(data: string, index: number, last = false): StreamChunk {
  return { data, index, last };
}

async function collect(builder: StreamBuilder): Promise<string[]> {
  const out: string[] = [];
  for await (const part of builder.iterate()) {
    out.push(String(part));
  }
  return out;
}

describe("StreamBuilder", () => {
  it("resolves waitUntilDone() once the final chunk arrives", async () => {
    const builder = new StreamBuilder();
    const done = builder.waitUntilDone();

    builder.addChunk(chunk("Hello", 0));
    builder.addChunk(chunk(" world", 1, true));

    await expect(done).resolves.toBeUndefined();
    expect(builder.isDone).toBe(true);
  });

  it("yields every received chunk in order via iterate()", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("Hello", 0));
    builder.addChunk(chunk(" world", 1));
    builder.addChunk(chunk("!", 2, true));

    await expect(collect(builder)).resolves.toEqual(["Hello", " world", "!"]);
  });

  it("supports consuming chunks after iterate() was started but before completion", async () => {
    const builder = new StreamBuilder();
    const collected = collect(builder);

    builder.addChunk(chunk("alpha", 0));
    builder.addChunk(chunk("beta", 1, true));

    await expect(collected).resolves.toEqual(["alpha", "beta"]);
  });

  it("deduplicates a retransmitted chunk by index", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("first", 0));
    builder.addChunk(chunk("retransmit", 0));
    builder.addChunk(chunk("last", 1, true));

    await expect(collect(builder)).resolves.toEqual(["retransmit", "last"]);
  });

  it("ignores chunks received after completion", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("done", 0, true));

    const done = builder.waitUntilDone();
    builder.addChunk(chunk("too-late", 1, true));

    await done;
    expect(builder.isDone).toBe(true);
    await expect(collect(builder)).resolves.toEqual(["done"]);
  });

  it("rejects waitUntilDone() when the stream fails", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("partial", 0));

    const done = builder.waitUntilDone();
    builder.rejectChunk(new Error("model exploded"));

    await expect(done).rejects.toThrow("model exploded");
    expect(builder.isRejected).toBe(true);
  });

  it("yields nothing after a failure, even if chunks were buffered", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("partial", 0));
    builder.rejectChunk(new Error("boom"));

    await expect(collect(builder)).resolves.toEqual([]);
  });

  it("is a no-op to reject an already-completed stream", async () => {
    const builder = new StreamBuilder();
    builder.addChunk(chunk("done", 0, true));

    builder.rejectChunk(new Error("late failure"));

    expect(builder.isDone).toBe(true);
    expect(builder.isRejected).toBe(false);
    await expect(collect(builder)).resolves.toEqual(["done"]);
  });
});
