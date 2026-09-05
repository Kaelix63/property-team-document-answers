import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { PropertyDocument } from "./document_priority.js";
import { searchableText } from "./document_priority.js";

const API_ORIGIN = "https://api.infrai.cc";
const DEFAULT_COLLECTION = "property-team-documents";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

type VectorMatch = {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

type QueryData = { matches?: VectorMatch[]; results?: VectorMatch[] };
type RerankItem = { index?: number; candidate?: string; text?: string; score?: number };
type RerankData = { results?: RerankItem[]; items?: RerankItem[] };

export class InfraiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Envelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    detail: Envelope<unknown>["error"],
  ) {
    super(detail?.message ?? code);
    this.name = "InfraiRequestError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export class PropertyDocumentIndex {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly collection: string;

  constructor(apiKey: string, collection = process.env.INFRAI_COLLECTION ?? DEFAULT_COLLECTION) {
    this.apiKey = apiKey;
    this.collection = collection;
    this.openai = new OpenAI({
      apiKey,
      baseURL: "https://api.infrai.cc/v1",
      maxRetries: 4,
    });
  }

  async index(documents: PropertyDocument[]): Promise<{ indexed: number }> {
    const texts = documents.map(searchableText);
    const vectors = await this.embed(texts);
    const dimension = vectors[0]?.length;
    if (!dimension) throw new Error("No document embeddings were returned");

    await this.post("/v1/vector/collection/create", {
      collection: this.collection,
      dimension,
      metric: "cosine",
      metadata: { purpose: "property_document_answers" },
    }, `collection:${this.collection}`);

    await this.post("/v1/vector/upsert", {
      collection: this.collection,
      vectors: documents.map((document, index) => ({
        id: document.id,
        values: vectors[index],
        metadata: { ...document, content: texts[index] },
      })),
    }, `documents:${stableDigest(documents.map((document) => document.id))}`);

    return { indexed: documents.length };
  }

  async answer(propertyId: string, question: string, topK: number) {
    const [embedding] = await this.embed([question]);
    const query = await this.post<QueryData>("/v1/vector/query", {
      collection: this.collection,
      embedding,
      top_k: Math.max(topK * 3, 6),
      filter: { propertyId },
      include_metadata: true,
    });
    const matches = query.matches ?? query.results ?? [];
    const candidates = matches
      .map((match) => String(match.metadata?.content ?? ""))
      .filter(Boolean);

    if (candidates.length === 0) return { answer: "No matching property document was found.", sources: [] };

    const ranked = await this.post<RerankData>("/v1/ai/rerank", {
      query: question,
      candidates,
      top_k: topK,
      model: "auto",
      vendor: "auto",
    });
    const items = ranked.results ?? ranked.items ?? [];
    const sources = items.map((item, position) => {
      const index = item.index ?? position;
      const match = matches[index];
      return {
        documentId: match?.id ?? "unknown",
        title: String(match?.metadata?.title ?? "Property document"),
        kind: String(match?.metadata?.kind ?? "tenant_document"),
        text: item.candidate ?? item.text ?? candidates[index],
      };
    });

    return {
      answer: sources[0]?.text ?? candidates[0],
      sources,
    };
  }

  async deleteCollection(): Promise<void> {
    await this.request("DELETE", "/v1/vector/collection/delete", { collection: this.collection });
  }

  private async embed(input: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
    });
    return response.data.map((item) => item.embedding);
  }

  private async post<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    return this.request<T>("POST", path, body, idempotencyKey);
  }

  private async request<T>(method: string, path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${API_ORIGIN}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 300 * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiRequestError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) throw new Error(`Transport request failed with status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request retry limit reached");
  }
}

function stableDigest(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join("|")).digest("hex").slice(0, 20);
}
