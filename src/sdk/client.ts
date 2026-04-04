import { MemoliteApiError, MemoliteClientError } from "./errors.js";
import { MemoliteConfigApi } from "./config.js";
import { MemoliteMemoryApi } from "./memory.js";
import { MemoliteProjectApi } from "./projects.js";
import type { MemoliteClientOptions } from "./types.js";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const decodeResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export class MemoliteClient {
  readonly baseUrl: string;
  readonly projects: MemoliteProjectApi;
  readonly memory: MemoliteMemoryApi;
  readonly config: MemoliteConfigApi;
  private readonly retries: number;
  private readonly retryBackoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(options: MemoliteClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.retries = options.retries ?? 2;
    this.retryBackoffMs = options.retryBackoffMs ?? 50;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.headers = options.headers ?? {};
    this.projects = new MemoliteProjectApi(this);
    this.memory = new MemoliteMemoryApi(this);
    this.config = new MemoliteConfigApi(this);
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string | number | null | undefined>;
      body?: unknown;
    } = {}
  ): Promise<T> {
    let lastError: Error | null = null;
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            "content-type": "application/json",
            ...this.headers
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
        const payload = await decodeResponse(response);
        if (response.status >= 500 && attempt < this.retries) {
          await sleep(this.retryBackoffMs * (attempt + 1));
          continue;
        }
        if (!response.ok) {
          throw new MemoliteApiError(
            `${method.toUpperCase()} ${path} failed`,
            response.status,
            payload
          );
        }
        return payload as T;
      } catch (error) {
        lastError = error as Error;
        if (error instanceof MemoliteApiError) {
          if (error.statusCode >= 500 && attempt < this.retries) {
            await sleep(this.retryBackoffMs * (attempt + 1));
            continue;
          }
          throw error;
        }
        if (attempt >= this.retries) {
          throw new MemoliteClientError(lastError.message);
        }
        await sleep(this.retryBackoffMs * (attempt + 1));
      }
    }

    throw new MemoliteClientError(lastError?.message ?? "request failed");
  }

  async close(): Promise<void> {}
}
