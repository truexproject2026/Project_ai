import { pipeline } from "@xenova/transformers";
import fs from "fs";
import path from "path";

let embedder: any;
let generator: any;

// ---------- LOAD EMBEDDING MODEL ----------
export async function loadEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
  return embedder;
}

// ---------- LOAD TEXT GENERATION MODEL ----------
export async function loadGenerator() {
  if (!generator) {
    generator = await pipeline(
      "text-generation",
      "Xenova/gpt2"
    );
  }
  return generator;
}

// ---------- LOAD BRAND DATA ----------
export async function loadBrandContext() {
  const brandPath = path.join(process.cwd(), "data/brand.json");
  const data = JSON.parse(
    fs.readFileSync(brandPath, "utf-8")
  );

  const model = await loadEmbedder();
  const examples = data.brand.examples;

  const vectors: {
    review: string;
    reply: string;
    embedding: number[];
  }[] = [];

  for (const item of examples) {
    const embedding: any = await model(item.review, {
      pooling: "mean",
      normalize: true,
    });

    vectors.push({
      review: item.review,
      reply: item.reply,
      embedding: Array.from(embedding.data as Float32Array),
    });
  }

  return vectors;
}

// ---------- GET BRAND INFO ----------
export async function getBrandInfo() {
  try {
    const brandPath = path.join(process.cwd(), "data/brand.json");
    const data = JSON.parse(
      fs.readFileSync(brandPath, "utf-8")
    );
    return data.brand;
  } catch (error) {
    console.error("Error loading brand info:", error);
    return null;
  }
}

// ---------- COSINE ----------
function cosine(a: number[], b: number[]) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

// ---------- ⭐ RAG FUNCTION ----------
export async function retrieveContext(query: string) {
  const model = await loadEmbedder();
  const db = await loadBrandContext();

  const q: any = await model(query, {
    pooling: "mean",
    normalize: true,
  });

  const qVec = Array.from(q.data as Float32Array);

  db.sort(
    (a, b) =>
      cosine(b.embedding, qVec) -
      cosine(a.embedding, qVec)
  );

  return db
    .slice(0, 3)
    .map(
      (x) =>
        `Customer: ${x.review}\nAdmin: ${x.reply}`
    )
    .join("\n\n");
}

// ---------- TEXT GENERATION ----------
export async function generateText(prompt: string): Promise<string> {
  try {
    const model = await loadGenerator();
    const result = await model(prompt, {
      max_length: prompt.length + 100,
      temperature: 0.8,
      do_sample: true,
      top_p: 0.9,
      num_return_sequences: 1,
      pad_token_id: model.tokenizer.eos_token_id || 50256
    });

    // Extract only the generated part (remove the prompt)
    const generated = result[0].generated_text;
    const reply = generated.replace(prompt, '').trim();

    // Clean up the reply (remove any unwanted text)
    return reply.split('\n')[0].trim() || "ขอบคุณค่ะ";
  } catch (error) {
    console.error("Error generating text:", error);
    return "ขอบคุณค่ะ";
  }
}