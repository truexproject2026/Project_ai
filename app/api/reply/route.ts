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

function enforceReplyStyle(comment: string, reply: string): string {
  return reply
    .replace(/ท่าน/g, "คุณลูกค้า")
    .replace(/ลูกค้าท่าน/g, "คุณลูกค้า")
    .replace(/\[เมนู\]/g, "")
    .trim();
}

function safeJsonParse(text: string): LlmResult | null {
  if (!text) return null;
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
โทนการตอบ: ${venue.tone}`;
}

async function generateReplyWithLlm(comment: string, venue?: Venue): Promise<LlmResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const ragExamples = venue ? getVenueSpecificExamples(venue.id) : "";
  const venueBlock = venue ? buildVenueBlock(venue) : "บทบาท: แอดมินร้านอาหาร/คาเฟ่มืออาชีพ";

  const systemInstruction = `คุณคือเจ้าของร้านผู้เชี่ยวชาญ 
หน้าที่: วิเคราะห์รีวิวลูกค้าและร่างคำตอบที่แสดงถึงความใส่ใจ (Empathy) 
กฎเหล็ก:
1. ตอบกลับด้วยความจริงใจ: หากชมให้ขอบคุณ หากติให้ขอโทษและระบุแนวทางแก้ไข
2. โฟกัสที่ธุรกิจ: แม้ลูกค้าจะคุยเล่นหรือพูดนอกเรื่อง (เช่น ชมพนักงานว่าสวย, พูดเรื่องดินฟ้าอากาศ) ให้เพิกเฉยต่อส่วนที่วอกแวกนั้น แต่จงตอบในประเด็นหลักของร้าน (บรรยากาศ, กาแฟ, กิจกรรม)
3. ภาษาสละสลวย: ใช้ภาษาไทยที่เป็นธรรมชาติ (Conversational) ไม่เป็นหุ่นยนต์
4. JSON เท่านั้น: ตอบในรูปแบบ {"sentiment": "Positive|Neutral|Negative", "aspect": "taste|price|service|atmosphere|speed|cleanliness|menu|packaging|general", "confidence": 0.0-1.0, "reply": "ข้อความตอบ", "reasoning": "วิธีคิด"}
5. ห้ามมโนเมนูที่ลูกค้าไม่ได้พูดถึง`;

  const userPrompt = `${venueBlock}\n${ragExamples}\n\nคอมเมนต์ลูกค้า: "${comment}"`;

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const res = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { 
          temperature: 0.3, 
          topP: 0.95, 
          maxOutputTokens: 800, 
          responseMimeType: "application/json" 
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      }),
    });

    if (!res.ok) throw new Error(`Gemini API Error: ${res.status}`);
    const data = await res.json();
    
    // Check if blocked by safety
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      return {
        reply: null, // Force fallback but with reasoning
        reasoning: "AI ปฏิเสธการตอบเนื่องจากตรวจพบคำศัพท์ที่สุ่มเสี่ยง (Safety Block) ระบบกำลังใช้ฐานข้อมูลสำรอง..."
      };
    }

    const text = candidate?.content?.parts?.[0]?.text ?? "";
    const result = safeJsonParse(text);
    return result;
  } catch (error) {
    console.error("LLM Fetch Error:", error);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const venueId = typeof body.venueId === "string" ? body.venueId : undefined;

    if (!comment) return NextResponse.json({ error: "Invalid comment" }, { status: 400 });

    const venue = typeof venueId === "string" && venueId.length > 0 ? getVenueById(venueId) : undefined;
    
    // Try AI First
    const llm = await generateReplyWithLlm(comment, venue);
    
    // Analyze locally as backup
    const analysis = analyzeWithTrainingData(comment);
    
    // Determine final reply: Use AI if available and NOT blocked, otherwise use enhanced fallback
    let finalReply = "";
    let reasoning = llm?.reasoning ?? "วิเคราะห์จากฐานข้อมูลตัวอย่างเดิม";
    let llmUsed = false;

    if (llm && llm.reply) {
      finalReply = enforceReplyStyle(comment, llm.reply);
      llmUsed = true;
    } else {
      // Enhanced Fallback Logic for complex reviews
      const text = comment.toLowerCase();
      if (text.includes("บรรยากาศ") || text.includes("สงบ") || text.includes("น่านั่ง")) {
         finalReply = "ขอบคุณมากนะคะที่คุณลูกค้าประทับใจในบรรยากาศที่เงียบสงบของเรา ทางร้านตั้งใจสร้างพื้นที่ให้เป็นที่พักผ่อนที่แท้จริง ดีใจที่ชอบทั้งเพลงและกาแฟนะคะ ไว้แวะมาเล่นบอร์ดเกมหรือพักผ่อนอีกได้เสมอค่ะ";
      } else {
         finalReply = buildReplyFromTrainingData(comment, analysis.sentiment, analysis.aspect);
      }
    }

    return NextResponse.json({
      sentiment: llm?.sentiment ?? analysis.sentiment,
      reply: finalReply,
      confidence: llm?.confidence ?? analysis.confidence,
      aspect: llm?.aspect ?? analysis.aspect,
      reasoning,
      llmUsed,
      status: "pending",
      timestamp: new Date().toISOString(),
      venueId: venue?.id ?? null,
      venueName: venue?.name ?? null,
    });
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json({
      sentiment: "Neutral",
      reply: "ขอบคุณมากนะคะสำหรับรีวิว ทางร้านจะนำไปปรับปรุงให้ดียิ่งขึ้นค่ะ",
      confidence: 0.5,
      status: "error",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
