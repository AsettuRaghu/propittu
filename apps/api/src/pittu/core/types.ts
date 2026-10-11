/**
 * Pittu core contracts (docs/PITTU.md, docs/AI_DOCUMENT_INTELLIGENCE.md).
 *
 *   Task      WHAT we ask: instructions, output schema, validation, version.
 *   Provider  WHO answers: Anthropic today; any other model tomorrow.
 *
 * Business code depends only on these types — never on a provider SDK —
 * so changing model or provider is a configuration change, and every
 * stored result records the task version and model that produced it.
 */

interface PdfDocument {
  kind: 'pdf';
  bytes: Uint8Array;
}

/** A photo or scan of one page (JPG / PNG). */
interface ImageDocument {
  kind: 'image';
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png';
}

export type InputDocument = PdfDocument | ImageDocument;

export interface ProviderRequest {
  model: string;
  system: string;
  documents: InputDocument[];
  text: string;
  /** JSON schema the answer must follow (structured output). */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  /** Let the model search the web (server-side) before answering. */
  webSearch?: { maxUses: number };
}

export interface ProviderResponse {
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Web searches made, and every page URL they returned (webSearch tasks only). */
  searches?: number;
  sources?: string[];
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
  /** Searches the web before answering (e.g. current prices). */
  readonly webSearch?: { maxUses: number };
  /** Page URLs the fake provider pretends its searches returned. */
  readonly fixtureSources?: string[];
}

/**
 * Pittu's capabilities. Each has its own folder under src/pittu and its own
 * line in the cost log; all of them run on this core.
 *   read   documents (sale deed today; EC, tax receipt, Khata next)
 *   ask    questions and the care plan
 *   watch  news and government alerts around properties
 *   value  what a property is worth, and how ready it is to sell
 *   legal  legal health checks and protection
 */
export type Capability = 'read' | 'ask' | 'watch' | 'value' | 'legal';
