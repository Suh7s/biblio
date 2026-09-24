import { z } from "zod";
import { aiError } from "./config.js";

export const bookId = z.string().regex(/^[a-f\d]{24}$/i, "Expected a Book ID.");
const query = z.string().trim().min(3, "Use at least 3 characters.").max(2000);
const limit = z.coerce.number().int().min(1).max(20).default(8);
export const searchInput = z
  .object({
    q: query,
    limit,
    availableOnly: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .strict();
export const askInput = z
  .object({ query, contextBookIds: z.array(bookId).max(6).default([]) })
  .strict();
export const pathInput = z
  .object({
    goal: query,
    durationWeeks: z.number().int().min(1).max(52),
    background: z.string().trim().max(1000).default(""),
  })
  .strict();
export const recommendationInput = z.object({ limit }).strict();
export const sourceId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine(
    (v) => v !== "catalogue",
    "The catalogue source is managed by the index endpoint.",
  );
export const chunksInput = z
  .object({
    sourceId,
    sections: z
      .array(
        z
          .object({
            chapter: z.string().trim().max(200).default(""),
            section: z.string().trim().max(200).default(""),
            content: z.string().trim().min(20).max(20000),
            pageStart: z.number().int().min(1).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(
    (v) => v.sections.reduce((n, s) => n + s.content.length, 0) <= 100000,
    "A source may contain at most 100,000 characters.",
  );
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw aiError(400, "Validation failed.", result.error.flatten());
  return result.data;
}
