import { z } from "zod";

export function getAiConfig(env = process.env) {
  const schema = z.object({
    OPENAI_API_KEY: z.string().default(""),
    AI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    AI_EMBEDDING_DIMENSIONS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3072)
      .default(1536),
    AI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
    AI_VECTOR_MODE: z.enum(["atlas", "exact"]).default("atlas"),
    AI_VECTOR_INDEX: z.string().default("book_chunks_vector"),
    AI_MIN_RELEVANCE: z.coerce.number().min(0).max(1).default(0.65),
    AI_EXACT_MAX_CHUNKS: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(5000),
    AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(25000),
  });
  const result = schema.safeParse(env);
  if (!result.success)
    throw aiError(
      503,
      "AI configuration is invalid. Contact the library administrator.",
    );
  return result.data;
}

export function aiError(status, message, errors) {
  return Object.assign(new Error(message), {
    status,
    ...(errors ? { errors } : {}),
  });
}
