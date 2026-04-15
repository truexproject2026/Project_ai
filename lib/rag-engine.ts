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
  const brandPath = path.join(process.cwd(), "data/brand-config.json");
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
    const brandPath = path.join(process.cwd(), "data/brand-config.json");
    const data = JSON.parse(
      fs.readFileSync(brandPath, "utf-8")
    );
    return data.brand;
  } catch (error) {
    console.error("Error loading brand info:", error);
    return null;
  }
}

// ---------- COSINE ----------   ว่าเราไม่ได้ค้นหาแค่ Keyword แต่เราใช้ Vector Mathematics:
function cosine(a: number[], b: number[]) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

// ---------- ⭐ RAG FUNCTION ----------
export async function retrieveContext(query: string) {
  const model = await loadEmbedder(); // 1. แปลงคำถามลูกค้าเป็น Vector
  const db = await loadBrandContext(); // 2. โหลดฐานข้อมูลตัวอย่างการตอบของแบรนด์

  const q: any = await model(query, {
    pooling: "mean",
    normalize: true,
  });

  const qVec = Array.from(q.data as Float32Array);

  db.sort(   // 3. ค้นหาข้อความที่ใกล้เคียงที่สุดโดยใช้ Cosine Similarity
    (a, b) =>
      cosine(b.embedding, qVec) -
      cosine(a.embedding, qVec)
  );

  return db
    .slice(0, 3)   // 4. คืนค่า 3 ตัวอย่างที่ใกล้เคียงที่สุดเพื่อส่งให้ AI
    .map(
      (x) =>
        `Customer: ${x.review}\nAdmin: ${x.reply}`   
    )
    .join("\n\n");
}

export async function generateText(prompt: string): Promise<string> {
  try {
    const model = await loadGenerator();

    // 2. สั่งให้โมเดลสร้างข้อความตาม Prompt ที่ใส่เข้าไป
    const result = await model(prompt, {
      max_length: prompt.length + 100, // กำหนดความยาวสูงสุดของข้อความ (เอาความยาว Prompt + 100 ตัวอักษร)
      temperature: 0.8,               // ควบคุมความสร้างสรรค์ (ค่าน้อยจะตอบนิ่งๆ ค่ามากจะตอบหลากหลาย)
      do_sample: true,                // เปิดใช้งานการสุ่มเลือกคำ เพื่อให้คำตอบไม่ซ้ำซาก
      top_p: 0.9,                     // เทคนิค Nucleus Sampling ช่วยให้เลือกคำที่ดูสมเหตุสมผลที่สุด
      num_return_sequences: 1,        // ให้สร้างคำตอบออกมาเพียงรูปแบบเดียว
      pad_token_id: model.tokenizer.eos_token_id || 50256 // กำหนดจุดสิ้นสุดของประโยค
    });

    // 3. ดึงข้อความที่สร้างเสร็จแล้วออกมา (ปกติโมเดลจะให้ข้อความเดิมติดมาด้วย)
    const generated = result[0].generated_text;

    // 4. ตัดส่วนที่เป็น Prompt ออก ให้เหลือเฉพาะส่วนที่ AI ตอบใหม่จริงๆ
    const reply = generated.replace(prompt, '').trim();

    // 5. Clean ข้อมูล: เลือกเฉพาะบรรทัดแรก และตัดช่องว่างส่วนเกินออก
    // หาก AI ตอบมาเป็นค่าว่าง ให้ใช้ Default เป็น "ขอบคุณค่ะ"
    return reply.split('\n')[0].trim() || "ขอบคุณค่ะ";

  } catch (error) {
    // กรณีเกิดข้อผิดพลาด (เช่น RAM เต็ม หรือหา Model ไม่เจอ) ให้ส่งค่า Default กลับไป
    console.error("Error generating text:", error);
    return "ขอบคุณค่ะ";
  }
}