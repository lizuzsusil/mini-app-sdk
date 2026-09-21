import { describe, expect, it } from "vitest";
import { type SseStreamEvent, parseSseStream } from "./sse-parser";

async function* chunksOf(parts: Array<string | Uint8Array>): AsyncGenerator<string | Uint8Array> {
  for (const part of parts) yield part;
}

async function collect(parts: Array<string | Uint8Array>): Promise<SseStreamEvent[]> {
  const out: SseStreamEvent[] = [];
  for await (const event of parseSseStream(chunksOf(parts))) out.push(event);
  return out;
}

const enc = new TextEncoder();

describe("parseSseStream", () => {
  it("parses one event per SSE block", async () => {
    await expect(
      collect(['event: token\ndata: {"text":"hello"}\n\n']),
    ).resolves.toEqual([{ type: "token", text: "hello" }]);
  });

  it("reassembles events split across chunk boundaries", async () => {
    await expect(
      collect(['event: tok', 'en\ndata: {"text":"hel', 'lo"}\n\n']),
    ).resolves.toEqual([{ type: "token", text: "hello" }]);
  });

  it("parses multiple events from a single chunk", async () => {
    await expect(
      collect(['event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\n']),
    ).resolves.toEqual([
      { type: "a", n: 1 },
      { type: "b", n: 2 },
    ]);
  });

  it("accepts Uint8Array chunks, including split multi-byte characters", async () => {
    const bytes = enc.encode('event: token\ndata: {"text":"héllo"}\n\n');
    const split = Math.floor(bytes.length / 2);
    await expect(
      collect([bytes.slice(0, split), bytes.slice(split)]),
    ).resolves.toEqual([{ type: "token", text: "héllo" }]);
  });

  it("wraps non-JSON data as text and skips blocks without an event line", async () => {
    await expect(
      collect(['data: {"orphan":true}\n\nevent: ping\ndata: hello\n\n']),
    ).resolves.toEqual([{ type: "ping", text: "hello" }]);
  });

  it("flushes a trailing block missing its blank-line terminator", async () => {
    await expect(
      collect(['event: done\ndata: {}']),
    ).resolves.toEqual([{ type: "done" }]);
  });

  it("yields an error event last and then completes without throwing", async () => {
    await expect(
      collect([
        'event: token\ndata: {"text":"hi"}\n\nevent: error\ndata: {"detail":"boom"}\n\nevent: token\ndata: {"text":"late"}\n\n',
      ]),
    ).resolves.toEqual([
      { type: "token", text: "hi" },
      { type: "error", detail: "boom" },
    ]);
  });

  it("yields nothing for an empty stream", async () => {
    await expect(collect([])).resolves.toEqual([]);
    await expect(collect([""])).resolves.toEqual([]);
  });
});
