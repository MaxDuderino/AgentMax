import type { UsageProvider } from "./price-table";

/**
 * One call to an AI provider, as the usage tracker records it (ported from
 * DnD-Max, Issue 401).
 *
 * Record it **where the outcome is known**: once per HTTP call, so a retry is
 * two calls and a fallback model is its own row. The art factory and Make art
 * do this for you; any other AI call in the project can call
 * `usageLedger.record(...)` the same way and show up on the same panel.
 *
 * **Who pays** is part of the event: calls on a user's own pasted key are
 * their bill, counted but never added to the site's cost.
 */
export type BilledTo = "site" | "own-key";

export type FailureKind = "no-credit" | "busy" | "timeout" | "bad-key" | "model-missing" | "cut-off" | "declined" | "empty" | "network" | "other";

export const failureLabels: Readonly<Record<FailureKind, string>> = {
  "no-credit": "out of credit",
  busy: "busy / high demand",
  timeout: "timed out",
  "bad-key": "key refused",
  "model-missing": "model not found",
  "cut-off": "answer cut off",
  declined: "declined to answer",
  empty: "empty answer",
  network: "could not connect",
  other: "other error",
};

export interface UsageEvent {
  provider: UsageProvider;
  /** The model asked for, as configured. */
  model: string;
  /** The model the provider says answered, when it says. Used for pricing. */
  resolvedModel?: string;
  billedTo: BilledTo;
  ok: boolean;
  failure?: FailureKind;
  /** The provider's short explanation, kept only for the problem banner. */
  detail?: string;
  inputTokens: number;
  outputTokens: number;
  /** What the call was for: `art-factory`, `make-art`, `chat`, `narration`… Shown beside the model. */
  purpose?: string;
  /** A finer label to break today down by: a game id, a user, a feature. */
  tag?: string;
}

/**
 * An HTTP status and the provider's own words, as a failure kind. Credit
 * problems are read from the words, because the status alone does not tell
 * them apart from ordinary mistakes (Anthropic says "credit balance is too
 * low" with a 400; OpenAI says `insufficient_quota` with a 429).
 */
export function classifyFailure(status: number | undefined, detail: string): FailureKind {
  const text = detail.toLowerCase();
  if (status === 402 || /credit balance|prepayment|credits are depleted|insufficient credit|insufficient_quota|exceeded your current quota|billing/.test(text)) return "no-credit";
  if (/took too long|timed out|timeout/.test(text)) return "timeout";
  if (status === 429 || status === 503 || status === 529 || /high demand|overloaded|rate limit/.test(text)) return "busy";
  if (status === 401 || status === 403 || text.includes("api key")) return "bad-key";
  if (status === 404) return "model-missing";
  if (/cut off|ran out of room/.test(text)) return "cut-off";
  if (text.includes("declined")) return "declined";
  if (text.includes("returned nothing")) return "empty";
  if (text.includes("could not reach")) return "network";
  return "other";
}

/** Where a provider sends what it did. Recording must never break the feature: implementations swallow their own errors. */
export interface UsageMeter {
  record(event: UsageEvent): Promise<void>;
  /** Whether the site's wallet for this provider is on "stop at zero" and estimated empty. */
  shouldSkip?(provider: UsageProvider): Promise<boolean>;
}
