import { env } from "../config/env.js";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 64;

interface EmbeddingsResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

export const embeddingDimensions = 1536;

export function getEmbeddingModel() {
  return env.openAiEmbeddingModel || DEFAULT_EMBEDDING_MODEL;
}

async function createEmbeddingBatch(input: string[], model: string) {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embeddings request failed with ${response.status}: ${message}`);
  }

  const payload = (await response.json()) as EmbeddingsResponse;
  const embeddings = [...payload.data].sort((left, right) => left.index - right.index).map((item) => item.embedding);

  for (const embedding of embeddings) {
    if (embedding.length !== embeddingDimensions) {
      throw new Error(`Expected ${embeddingDimensions} embedding dimensions but received ${embedding.length}.`);
    }
  }

  return embeddings;
}

export async function createEmbeddings(input: string[], model = getEmbeddingModel()) {
  const embeddings: number[][] = [];

  for (let index = 0; index < input.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = input.slice(index, index + EMBEDDING_BATCH_SIZE);
    embeddings.push(...(await createEmbeddingBatch(batch, model)));
  }

  return embeddings;
}
