import { AwsClient } from "aws4fetch";

import type { Env } from "./kv";

/**
 * Cloudflare R2, where the factory keeps pictures (ported from DnD-Max,
 * 2026-10-16).
 *
 * Why R2 and not Vercel Blob: DnD-Max's Hobby Blob store was **blocked after
 * one day** of factory writes. R2 has no such wall at this size, and one
 * private bucket serves everything through the app itself.
 *
 * R2 speaks the S3 API; `aws4fetch` signs plain `fetch` requests, so there is
 * no SDK. Switched on only when all four `R2_*` variables are set.
 *
 * The lesson that cost a day: **an upload must send its length**. Handing the
 * signed `Request` to fetch turned the body into a stream with no length, and
 * R2 refused every save with HTTP 411. So the request is signed, then sent as
 * plain url + init with the raw bytes.
 */
export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const r2VariableNames = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;

export function r2Config(env: Env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  return accountId && bucket && accessKeyId && secretAccessKey ? { accountId, bucket, accessKeyId, secretAccessKey } : null;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: string;
}

export interface R2Read {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
}

/** Thrown when R2 answers something other than success or "not there". */
export class R2Error extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`R2 answered HTTP ${status}${detail ? `: ${detail}` : ""}`);
  }
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

function decodeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export class R2Client {
  readonly #aws: AwsClient;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(config: R2Config, fetcher: typeof fetch = (input, init) => fetch(input, init)) {
    this.#aws = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" });
    this.#fetch = fetcher;
    this.#base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  }

  /** Signs, then sends url + init with the raw bytes; one retry on a network blip or a 5xx. */
  async #send(url: string, init: RequestInit): Promise<Response> {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const signed = await this.#aws.sign(url, init);
        const response = await this.#fetch(signed.url, { method: signed.method, headers: signed.headers, ...(init.body !== undefined ? { body: init.body } : {}), cache: "no-store" });
        if (response.status < 500 || attempt === 1) return response;
      } catch (error) {
        last = error;
        if (attempt === 1) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw last;
  }

  async put(key: string, body: ArrayBuffer | Uint8Array, contentType: string, cacheControl?: string): Promise<void> {
    const response = await this.#send(`${this.#base}/${encodeKey(key)}`, {
      method: "PUT",
      body: body instanceof Uint8Array ? (body.slice().buffer as ArrayBuffer) : body,
      headers: { "content-type": contentType, ...(cacheControl ? { "cache-control": cacheControl } : {}) },
    });
    if (!response.ok) throw new R2Error(response.status, (await response.text().catch(() => "")).slice(0, 200));
  }

  /** The file, or `null` when there is nothing at that key. */
  async get(key: string): Promise<R2Read | null> {
    const response = await this.#send(`${this.#base}/${encodeKey(key)}`, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new R2Error(response.status, (await response.text().catch(() => "")).slice(0, 200));
    // No length header, or a compressed answer, is "unknown", never 0 (a 0 once served an empty file in DnD-Max).
    const length = response.headers.get("content-length");
    const size = length !== null && !response.headers.get("content-encoding") ? Number(length) : NaN;
    return { body: response.body, contentType: response.headers.get("content-type") ?? "application/octet-stream", size: Number.isFinite(size) ? size : null };
  }

  async getBytes(key: string): Promise<ArrayBuffer | null> {
    const read = await this.get(key);
    return read ? new Response(read.body).arrayBuffer() : null;
  }

  /** True when something was there to delete. R2 answers 204 either way, so it asks first. */
  async remove(key: string): Promise<boolean> {
    const head = await this.#send(`${this.#base}/${encodeKey(key)}`, { method: "HEAD" });
    if (head.status === 404) return false;
    const response = await this.#send(`${this.#base}/${encodeKey(key)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new R2Error(response.status, (await response.text().catch(() => "")).slice(0, 200));
    return head.ok;
  }

  /** Everything under a prefix, following the continuation token to the end. */
  async list(prefix: string): Promise<R2Object[]> {
    const found: R2Object[] = [];
    let token: string | null = null;
    do {
      const query = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
      if (token) query.set("continuation-token", token);
      const response = await this.#send(`${this.#base}?${query.toString()}`, { method: "GET" });
      const text = await response.text();
      if (!response.ok) throw new R2Error(response.status, text.slice(0, 200));
      for (const match of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const part = match[1] ?? "";
        const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(part)?.[1] ?? "");
        if (!key) continue;
        found.push({ key, size: Number(/<Size>(\d+)<\/Size>/.exec(part)?.[1] ?? 0), uploaded: /<LastModified>([^<]+)<\/LastModified>/.exec(part)?.[1] ?? "" });
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(text) ? decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(text)?.[1] ?? "") || null : null;
    } while (token);
    return found;
  }
}
