import { aiError } from "../../ai/config.js";

export function validVector(vector, dimensions) {
  return (
    Array.isArray(vector) &&
    vector.length === dimensions &&
    vector.every(Number.isFinite) &&
    vector.some((n) => n !== 0)
  );
}

export function createProvider(config, fetchImpl = globalThis.fetch) {
  async function request(path, body) {
    if (!config.OPENAI_API_KEY)
      throw aiError(
        503,
        "AI is not configured yet. Contact the library administrator.",
      );
    try {
      const response = await fetchImpl(`https://api.openai.com/v1/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.AI_TIMEOUT_MS),
      });
      if (!response.ok)
        throw aiError(
          response.status === 429 ? 503 : 502,
          "The AI provider is temporarily unavailable. Please try again.",
        );
      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      throw aiError(
        503,
        "The AI provider did not respond in time. Please try again.",
      );
    }
  }
  return {
    async embed(inputs) {
      if (
        !Array.isArray(inputs) ||
        !inputs.length ||
        inputs.length > 32 ||
        inputs.some(
          (s) => typeof s !== "string" || !s.trim() || s.length > 6000,
        )
      ) {
        throw aiError(400, "Invalid embedding input.");
      }
      const data = await request("embeddings", {
        model: config.AI_EMBEDDING_MODEL,
        dimensions: config.AI_EMBEDDING_DIMENSIONS,
        encoding_format: "float",
        input: inputs,
      });
      if (!Array.isArray(data?.data))
        throw aiError(502, "The AI provider returned invalid embeddings.");
      const vectors = Array(inputs.length);
      for (const item of data.data || []) {
        if (
          !Number.isInteger(item.index) ||
          item.index < 0 ||
          item.index >= inputs.length ||
          vectors[item.index] ||
          !validVector(item.embedding, config.AI_EMBEDDING_DIMENSIONS)
        ) {
          throw aiError(502, "The AI provider returned an invalid embedding.");
        }
        vectors[item.index] = item.embedding;
      }
      if (vectors.filter(Boolean).length !== inputs.length)
        throw aiError(502, "The AI provider returned incomplete embeddings.");
      return vectors;
    },
    async select({ system, input, schema }) {
      const data = await request("responses", {
        model: config.AI_CHAT_MODEL,
        store: false,
        max_output_tokens: 2500,
        input: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "library_selection",
            strict: true,
            schema,
          },
        },
      });
      if (data?.status !== "completed" || !Array.isArray(data.output))
        throw aiError(
          502,
          "LibraAI could not complete a grounded answer. Please try again.",
        );
      const parts = (data.output || [])
        .filter((v) => v.type === "message")
        .flatMap((v) => v.content || []);
      if (parts.some((v) => v.type === "refusal"))
        throw aiError(
          422,
          "LibraAI could not answer that request. Try a library reading question.",
        );
      try {
        return JSON.parse(
          parts
            .filter((v) => v.type === "output_text")
            .map((v) => v.text)
            .join(""),
        );
      } catch {
        throw aiError(
          502,
          "LibraAI returned an invalid answer. Please try again.",
        );
      }
    },
  };
}
