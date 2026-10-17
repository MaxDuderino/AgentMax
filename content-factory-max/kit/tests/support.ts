import { R2Client, type R2Config } from "../lib/art-factory/server/r2-client";
import type { ImageProvider, ImageRequest, ImageResult } from "../lib/art-factory/server/image-provider";
import type { ImageConverter } from "../lib/art-factory/server/webp";

/**
 * Stand-ins so no test touches a real bucket, a real picture API or sharp.
 */

/** Cloudflare R2's S3 API against a Map. Insists on signed requests and, like the real thing, refuses a PUT with no known length (HTTP 411). */
export const fakeR2Config: R2Config = { accountId: "acct123", bucket: "kit-images", accessKeyId: "AKIDFAKE", secretAccessKey: "fake-secret-never-used" }; // keykeeper:ignore (fake value)

export class FakeR2 {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string; at: string }>();
  readonly requests: { method: string; key: string }[] = [];
  failWith: number | null = null;

  readonly fetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const [, bucket, ...rest] = url.pathname.split("/");
    const key = rest.map(decodeURIComponent).join("/");
    this.requests.push({ method: request.method, key });
    if (!request.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256")) return new Response("unsigned", { status: 403 });
    if (bucket !== fakeR2Config.bucket || url.hostname !== `${fakeR2Config.accountId}.r2.cloudflarestorage.com`) return new Response("no such bucket", { status: 404 });
    if (this.failWith) return new Response("refused", { status: this.failWith });
    if (request.method === "PUT" && (input instanceof Request || !(init?.body instanceof ArrayBuffer || ArrayBuffer.isView(init?.body)))) {
      return new Response("<Error><Code>MissingContentLength</Code></Error>", { status: 411 });
    }
    if (request.method === "PUT") {
      this.files.set(key, { bytes: new Uint8Array(await request.arrayBuffer()), contentType: request.headers.get("content-type") ?? "application/octet-stream", at: new Date().toISOString() });
      return new Response(null, { status: 200 });
    }
    if (request.method === "DELETE") {
      this.files.delete(key);
      return new Response(null, { status: 204 });
    }
    if (!key && request.method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const keys = [...this.files.keys()].filter((one) => one.startsWith(prefix)).sort();
      const contents = keys.map((one) => `<Contents><Key>${one}</Key><LastModified>${this.files.get(one)!.at}</LastModified><Size>${this.files.get(one)!.bytes.byteLength}</Size></Contents>`).join("");
      return new Response(`<?xml version="1.0"?><ListBucketResult>${contents}<IsTruncated>false</IsTruncated></ListBucketResult>`, { status: 200 });
    }
    const file = this.files.get(key);
    if (!file) return new Response(request.method === "HEAD" ? null : "NoSuchKey", { status: 404 });
    return new Response(request.method === "HEAD" ? null : file.bytes.slice().buffer, { status: 200, headers: { "content-type": file.contentType, "content-length": String(file.bytes.byteLength) } });
  };

  client(): R2Client {
    return new R2Client(fakeR2Config, this.fetch);
  }
}

export const bytesOf = (text: string) => new TextEncoder().encode(text).buffer.slice(0) as ArrayBuffer;
export const textOf = (bytes: ArrayBuffer | null) => (bytes ? new TextDecoder().decode(bytes) : null);

/** Draws "a picture" (some bytes), refuses anything saying "refuse", fails on "please fail", and can be told to answer a set result next. */
export class FakeImageProvider implements ImageProvider {
  readonly name: string;
  readonly model: string;
  readonly requests: ImageRequest[] = [];
  next: ImageResult[] = [];
  constructor(name = "openai", model = "gpt-image-1.5") {
    this.name = name;
    this.model = model;
  }
  async generate(input: ImageRequest): Promise<ImageResult> {
    this.requests.push(input);
    const queued = this.next.shift();
    if (queued) return queued;
    if (/refuse/i.test(input.prompt)) return { ok: false, code: "art-refused", detail: "fake refusal" };
    if (/please fail/i.test(input.prompt)) return { ok: false, code: "art-failed", detail: "fake failure" };
    return { ok: true, bytes: bytesOf("png"), contentType: "image/png", usage: { model: this.model, inputTokens: 300, outputTokens: 1056 } };
  }
}

/** Records what it was asked to cut and hands back tagged bytes instead of running sharp. */
export function fakeConverter() {
  const cuts: ({ width: number; height: number; fit: string } | "preview")[] = [];
  const convert: ImageConverter = async (_input, target) => {
    cuts.push(target ? { ...target } : "preview");
    return { bytes: bytesOf(target ? `webp ${target.width}x${target.height}` : "webp preview"), contentType: "image/webp", width: target?.width ?? 1, height: target?.height ?? 1 };
  };
  return { convert, cuts };
}
