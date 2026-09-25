export interface SseStreamEvent {
  type: string;
  [key: string]: unknown;
}

function parseBlock(rawEvent: string): SseStreamEvent | null {
  // rawEvent is like "event: token\ndata: {"text":"..."}"
  const lines = rawEvent.split("\n");
  let eventType: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!eventType) return null;
  const dataRaw = dataLines.join("\n");
  let data: unknown = {};
  if (dataRaw) {
    try {
      data = JSON.parse(dataRaw);
    } catch {
      data = { text: dataRaw };
    }
  }
  // Normalize to a flat event shape ({type, ...data} e.g. {type:"token", text:"..."})
  return {
    type: eventType,
    ...(data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : { text: data }),
  };
}

export async function* parseSseStream(
  chunks: AsyncIterable<string | Uint8Array>,
): AsyncGenerator<SseStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let terminated = false;

  const drain = function* (): Generator<SseStreamEvent> {
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) {
        const event = parseBlock(block);
        if (event) {
          yield event;
          if (event.type === "error") return true;
        }
      }
      idx = buffer.indexOf("\n\n");
    }
    return false;
  };

  for await (const chunk of chunks) {
    if (terminated) return;
    buffer +=
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });
    for (const event of drain()) {
      yield event;
      if (event.type === "error") {
        terminated = true;
        return;
      }
    }
  }
  if (terminated) return;
  buffer += decoder.decode();
  // Flush any trailing block the BFF didn't terminate with a blank line.
  if (buffer.trim()) {
    const event = parseBlock(buffer);
    if (event) yield event;
  }
}
