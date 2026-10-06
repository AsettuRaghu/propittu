/**
 * AI layer contracts (docs/AI_DOCUMENT_INTELLIGENCE.md).
 *
 *   Task      WHAT we ask: instructions, output schema, validation, version.
 *   Provider  WHO answers: Anthropic today; any other model tomorrow.
 *
 * Business code depends only on these types — never on a provider SDK —
 * so changing model or provider is a configuration change, and every
 * stored result records the task version and model that produced it.
 */

export interface PdfDocument {
  kind: 'pdf';
  bytes: Uint8Array;
}

export interface ProviderRequest {
  model: string;
  system: string;
  documents: PdfDocument[];
  text: string;
  /** JSON schema the answer must follow (structured output). */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface ProviderResponse {
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface AiProvider {
  readonly name: string;
  run(req: ProviderRequest): Promise<ProviderResponse>;
}

/** A provider-side failure. `retryable` decides whether the job tries again. */
export class AiProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
    readonly usage?: { inputTokens: number; outputTokens: number; durationMs: number },
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** The model's answer failed our validation (never shown to anyone). */
export class AiOutputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}

export type FactValue = string | number | string[];

export interface ExtractedFact {
  key: string;
  value: FactValue;
  pages: number[];
  confidence: 'high' | 'medium' | 'low' | null;
}

/** One versioned AI task. Bump `version` whenever instructions or schema change. */
export interface AiTask<Result> {
  readonly name: string; // e.g. "sale_deed.extract"
  readonly version: string; // e.g. "sale-deed-v2"
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly system: string;
  readonly userText: string;
  readonly schema: Record<string, unknown>;
  /** Validate + normalise + privacy-filter the raw answer. Throws AiOutputError. */
  parse(raw: unknown): Result;
  /** The facts the customer reviews. */
  facts(result: Result): ExtractedFact[];
  /** Canned answer for the fake provider (tests). */
  readonly fixture: unknown;
}
