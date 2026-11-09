/** Parseur Server-Sent Events incrémental (spécification WHATWG, sous-ensemble utile). */

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = '';
  private eventType = '';
  private data: string[] = [];
  private id: string | undefined;

  constructor(private readonly onEvent: (e: SseEvent) => void) {}

  feed(chunk: string): void {
    this.buffer += chunk;
    // Un « \r » final peut être suivi d'un « \n » dans le prochain morceau : on le garde de côté.
    const keepCr = this.buffer.endsWith('\r');
    const text = keepCr ? this.buffer.slice(0, -1) : this.buffer;
    const lines = text.split(/\r\n|\r|\n/);
    const rest = lines.pop() ?? '';
    this.buffer = rest + (keepCr ? '\r' : '');
    for (const line of lines) this.line(line);
  }

  private line(line: string): void {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return; // commentaire (ping)
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.eventType = value;
    else if (field === 'data') this.data.push(value);
    else if (field === 'id' && !value.includes('\0')) this.id = value;
    // « retry » ignoré : le SDK gère sa propre reconnexion exponentielle.
  }

  private dispatch(): void {
    if (this.data.length) this.onEvent({ event: this.eventType || 'message', data: this.data.join('\n'), id: this.id });
    this.eventType = '';
    this.data = [];
  }
}
