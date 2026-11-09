import { describe, expect, it } from 'vitest';
import { SseParser, type SseEvent } from './sse';

function parse(chunks: string[]) {
  const out: SseEvent[] = [];
  const p = new SseParser((e) => out.push(e));
  for (const c of chunks) p.feed(c);
  return out;
}

describe('SseParser', () => {
  it('lit des événements nommés, ignore les commentaires et retry', () => {
    const out = parse(['retry: 5000\n\n: ping\n\nevent: purchase\nid: d1\ndata: {"a":1}\n\n']);
    expect(out).toEqual([{ event: 'purchase', id: 'd1', data: '{"a":1}' }]);
  });

  it('reconstitue un événement coupé en plusieurs morceaux (y compris CRLF)', () => {
    const out = parse(['event: purc', 'hase\r', '\ndata: {"a"', ':1}\r\n', '\r\n', 'data: x\n', 'data: y\n\n']);
    expect(out).toEqual([
      { event: 'purchase', data: '{"a":1}', id: undefined },
      { event: 'message', data: 'x\ny', id: undefined },
    ]);
  });
});
