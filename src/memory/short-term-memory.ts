import { SessionStore } from "../storage/session-store.js";

export type ShortTermMessage = {
  uid: string;
  content: string;
  producer_id: string;
  producer_role: string;
  created_at?: string | null;
};

const MAX_SUMMARY_LENGTH = 4096;

export class ShortTermMemory {
  private readonly messages: ShortTermMessage[];
  private readonly messageCapacity: number;
  private summary: string;
  private currentMessageLength: number;

  constructor(input: {
    summary?: string;
    messages?: ShortTermMessage[];
    messageCapacity?: number;
  } = {}) {
    this.summary = input.summary ?? "";
    this.messages = [...(input.messages ?? [])];
    this.messageCapacity = input.messageCapacity ?? 4096;
    this.currentMessageLength = this.messages.reduce(
      (total, message) => total + message.content.length,
      0
    );
  }

  static create(input: {
    sessionKey: string;
    sessionStore: SessionStore;
    messageCapacity?: number;
  }): ShortTermMemory {
    const session = input.sessionStore.getSession(input.sessionKey);
    return new ShortTermMemory({
      summary: session?.summary ?? "",
      messageCapacity: input.messageCapacity
    });
  }

  addMessages(messages: ShortTermMessage[]): boolean {
    for (const message of messages) {
      this.messages.push(message);
      this.currentMessageLength += message.content.length;
    }
    if (this.currentMessageLength <= this.messageCapacity) {
      return false;
    }

    const evicted: ShortTermMessage[] = [];
    while (this.messages.length > 0 && this.currentMessageLength > this.messageCapacity) {
      const removed = this.messages.shift();
      if (removed === undefined) {
        break;
      }
      this.currentMessageLength -= removed.content.length;
      evicted.push(removed);
    }

    if (evicted.length > 0) {
      const chunk = evicted
        .map((message) => `${message.producer_role}: ${message.content}`)
        .join(" | ");
      const merged = this.summary.length === 0 ? chunk : `${this.summary} || ${chunk}`;
      this.summary = truncateSummary(merged);
    }
    return evicted.length > 0;
  }

  persistSummary(sessionKey: string, sessionStore: SessionStore): void {
    sessionStore.updateSummary(sessionKey, this.summary);
  }

  getContext(): string {
    const parts: string[] = [];
    if (this.summary.length > 0) {
      parts.push(`Summary: ${this.summary}`);
    }
    for (const message of this.messages) {
      parts.push(`${message.producer_role}: ${message.content}`);
    }
    return parts.join("\n");
  }
}

const truncateSummary = (summary: string): string => {
  if (summary.length <= MAX_SUMMARY_LENGTH) {
    return summary;
  }
  const trimmed = summary.slice(-MAX_SUMMARY_LENGTH).replace(/^[ |]+/u, "");
  return trimmed.length > 0 ? `... ${trimmed}` : "...";
};
