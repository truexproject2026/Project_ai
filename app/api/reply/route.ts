import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { analyzeWithTrainingData, buildReplyFromTrainingData } from "@/lib/trainingDataset";
import { getVenueById, type Venue } from "@/lib/venues";
import menuData from "@/data/menu.json";

function getVenueSpecificExamples(venueId: string): string {
  try {
    const brandPath = path.join(process.cwd(), "data/brand.json");
    if (!fs.existsSync(brandPath)) return "";
    const data = JSON.parse(fs.readFileSync(brandPath, "utf-8"));
    const examples = data.brands[venueId]?.examples || [];
    if (examples.length === 0) return "";
    
    return "\nนี่คือตัวอย่างการตอบที่ถูกต้องของร้านนี้ (RAG):\n" + 
      examples.slice(0, 5).map((ex: any) => `Review: ${ex.review}\nReply: ${ex.reply}`).join("\n\n");
  } catch (error) {
    console.error("Error loading RAG examples:", error);
    return "";
  }
}

type LlmResult = {
  sentiment?: "Positive" | "Neutral" | "Negative";
  aspect?: string;
  reply?: string;
  confidence?: number;
  reasoning?: string;
};

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function extractMentionedMenuItems(comment: string): string[] {
  const text = normalizeText(comment);
  const rules = menuData.items;

  const found: string[] = [];
  for (const rule of rules) {
    if (text.includes(rule.key) && !found.includes(rule.label)) {
      found.push(rule.label);
    }
  }
  return found;
}

function enforceReplyStyle(comment: string, reply: string): string {
  const cleaned = reply
    .replace(/ท่าน/g, "คุณลูกค้า")
    .replace(/ลูกค้าท่าน/g, "คุณลูกค้า")
    .trim();

  const mentionedInComment = extractMentionedMenuItems(comment);
  const mentionedInReply = extractMentionedMenuItems(cleaned);

  // If model invents specific menu not in comment, fallback to safer response.
  const inventedSpecificMenu = mentionedInReply.some(
    (item) => !mentionedInComment.includes(item)
  );

  if (inventedSpecificMenu) {
    if (normalizeText(comment).includes("ไม่อร่อย")) {
      return "ต้องขออภัยคุณลูกค้าด้วยนะคะที่รสชาติยังไม่ถูกใจ ทางร้านจะนำคำแนะนำไปปรับปรุงทันทีค่ะ";
    }
    return "ขอบคุณคุณลูกค้าสำหรับความคิดเห็นนะคะ ทางร้านรับฟังและจะนำไปปรับปรุงให้ดีขึ้นค่ะ";
  }

  if (mentionedInComment.length === 0 && normalizeText(comment).includes("ไม่อร่อย")) {
    return "ต้องขออภัยคุณลูกค้าด้วยนะคะที่รสชาติยังไม่ถูกใจ ทางร้านจะนำคำแนะนำไปปรับปรุงทันทีค่ะ";
  }

  return cleaned;
}

function safeJsonParse(text: string): LlmResult | null {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned) as LlmResult;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as LlmResult;
    } catch {
      return null;
    }
  }
}

function buildVenueBlock(venue: Venue): string {
  return `ร้านที่กำลังตอบ: ${venue.name} (${venue.area})
แนวร้าน: ${venue.tagline}
บุคลิกแบรนด์: ${venue.personality}
โทนการตอบ: ${venue.tone}
ให้ร่างคำตอบให้สอดคล้องบุคลิกและโทนนี้ แต่ยังตรงประเด็นในคอมเมนต์จริง`;
}

async function generateReplyWithLlm(comment: string, venue?: Venue): Promise<LlmResult | null> {
  const ragExamples = venue ? getVenueSpecificExamples(venue.id) : "";
  const venueBlock = venue
    ? `${buildVenueBlock(venue)}\n${ragExamples}\n`
    : `บทบาท: คุณคือ "แอดมินร้านอาหาร/คาเฟ่" ที่ต้องตอบลูกค้าเพื่อดูแลประสบการณ์\n`;

  const prompt = `${venueBlock}
  ---
  หน้าที่ของคุณ: ในฐานะเจ้าของร้าน/แบรนด์ระดับมืออาชีพ จงวิเคราะห์และตอบกลับรีวิวลูกค้าด้วย "ความเข้าใจอย่างลึกซึ้ง (Empathy)"
  
  ขั้นตอนการวิเคราะห์ (Internal Logic):
  1. แยกแยะประเด็น: ลูกค้าพูดถึงเรื่องอะไรบ้าง? (รสชาติ, บริการ, บรรยากาศ, ราคา, ความเร็ว)
  2. วิเคราะห์อารมณ์: ลูกค้ากำลังรู้สึกอย่างไร? (ประทับใจ, ผิดหวัง, เฉยๆ, หรือตำหนิอย่างรุนแรง)
  3. ตรวจสอบบริบท: มีการเปรียบเทียบหรือความคาดหวังอะไรที่ซ่อนอยู่ไหม?
  
  โครงสร้าง JSON ที่ต้องตอบ (ห้ามมีข้อความอื่นปนเด็ดขาด):
  {
    "sentiment": "Positive|Neutral|Negative",
    "aspect": "taste|price|service|atmosphere|speed|cleanliness|menu|packaging|general",
    "confidence": 0.0-1.0,
    "reply": "ข้อความตอบลูกค้า",
    "reasoning": "อธิบายสั้นๆ ว่าทำไมถึงตอบแบบนี้ วิเคราะห์อารมณ์ลูกค้าอย่างไร และเลือกใช้คำไหนเป็นพิเศษ (ภาษาไทย)"
  }

  กฎเหล็กในการร่างคำตอบ (Brand Consistency):
  - "จริงใจและตรงประเด็น": ถ้าลูกค้าชม ต้องขอบคุณให้ดูอบอุ่น ถ้าลูกค้าติ ต้องขออภัยและแสดงความรับผิดชอบอย่างเป็นรูปธรรม
  - "ภาษาสละสลวย": ใช้ภาษาไทยที่เป็นธรรมชาติเหมือนคนคุยกัน (Conversational Thai) ไม่ใช้ภาษาทางการจนเกินไป หรือภาษาหุ่นยนต์
  - "Addressing Specifics": ห้ามตอบกว้างๆ (Generic) ถ้าลูกค้าชมกุ้งเผา ให้พูดถึงกุ้งเผา ถ้าลูกค้าติเรื่องที่จอดรถ ให้พูดถึงที่จอดรถ
  - "ห้ามมโน": ห้ามเดาเมนูหรือข้อมูลที่ไม่มีในคอมเมนต์
  - "ระดับความมั่นใจ": หากคอมเมนต์สั้นหรือกำกวม ให้ลดค่า confidence ลง

  คอมเมนต์จากลูกค้า:
  "${comment}"`;

  const fetchGemini = async () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("No Gemini key");
    // อัปเกรดเป็น Gemini 2.0 Flash
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const res = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.25, 
          topP: 0.95, 
          maxOutputTokens: 500, 
          responseMimeType: "application/json" 
        },
      }),
    });
    if (!res.ok) throw new Error("Gemini error");
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return safeJsonParse(text);
  };

  const fetchOpenAI = async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI key");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("OpenAI error");
    const data = await res.json();
    return safeJsonParse(data.choices?.[0]?.message?.content ?? "");
  };

  const fetchHF = async () => {
    const token = process.env.HF_TOKEN;
    if (!token) throw new Error("No HF token");
    const model = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("HF error");
    const data = await res.json();
    return safeJsonParse(data.choices?.[0]?.message?.content ?? "");
  };

  // Run all available models in parallel and pick the FIRST successful one
  const providers = [];
  if (process.env.GEMINI_API_KEY) providers.push(fetchGemini());
  if (process.env.OPENAI_API_KEY) providers.push(fetchOpenAI());
  if (process.env.HF_TOKEN) providers.push(fetchHF());

  if (providers.length === 0) return null;

  try {
    // Return the first one that resolves successfully
    return await Promise.any(providers);
  } catch (error) {
    console.error("All AI providers failed or timed out");
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const venueId = typeof body.venueId === "string" ? body.venueId : undefined;

    if (!comment) {
      return NextResponse.json(
        { error: "Invalid comment" },
        { status: 400 }
      );
    }

    if (comment.length > 5000) {
      return NextResponse.json(
        { error: "Comment must be less than 5000 characters" },
        { status: 400 }
      );
    }

    const venue =
      typeof venueId === "string" && venueId.length > 0 ? getVenueById(venueId) : undefined;
    if (typeof venueId === "string" && venueId.length > 0 && !venue) {
      return NextResponse.json({ error: "venueId ไม่ถูกต้อง" }, { status: 400 });
    }

    const analysis = analyzeWithTrainingData(comment);
    const llm = await generateReplyWithLlm(comment, venue).catch((err) => {
      console.warn("[LLM generation error]", err);
      return null;
    });
    const reply =
      llm?.reply?.trim() ||
      buildReplyFromTrainingData(comment, analysis.sentiment, analysis.aspect);
    const normalizedReply = enforceReplyStyle(comment, reply);
    const sentiment = llm?.sentiment ?? analysis.sentiment;
    const aspect = llm?.aspect ?? analysis.aspect;
    const confidence =
      typeof llm?.confidence === "number"
        ? Math.max(0, Math.min(1, llm.confidence))
        : analysis.confidence;

    return NextResponse.json({
      sentiment,
      reply: normalizedReply,
      confidence,
      aspect,
      reasoning: llm?.reasoning ?? "วิเคราะห์จากฐานข้อมูลตัวอย่างเดิม",
      matchedExamples: analysis.matchedExamples.map((item) => item.id),
      llmUsed: Boolean(llm?.reply),
      status: "pending",
      timestamp: new Date().toISOString(),
      venueId: venue?.id ?? null,
      venueName: venue?.name ?? null,
    });
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      {
        sentiment: "Neutral",
        reply: "ขอบคุณมากนะคะ ☕",
        confidence: 0.5,
        status: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}