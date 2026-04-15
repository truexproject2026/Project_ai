import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { analyzeWithTrainingData, buildReplyFromTrainingData } from "@/lib/trainingDataset";
import { getVenueById, type Venue } from "@/lib/brand-manager";
import menuData from "@/data/menu.json";

function getVenueSpecificExamples(venueId: string): string {
  try {
    const brandPath = path.join(process.cwd(), "data/brand-config.json");
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
  error?: string;
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
      // Try to heuristically extract a reply or fields from non-JSON LLM output
      try {
        // Look for explicit Reply: blocks or PLAIN_REPLY markers
        const replyMatch = cleaned.match(/PLAIN_REPLY:\s*([\s\S]*)$/i) || cleaned.match(/Reply:\s*([\s\S]*)$/i);
        if (replyMatch && replyMatch[1]) {
          const extracted = replyMatch[1].trim();
          // Stop at next JSON block or delimiter if present
          const stop = extracted.search(/\n\s*\n/);
          const replyText = stop > 0 ? extracted.slice(0, stop).trim() : extracted;
          return { reply: replyText, reasoning: "Extracted reply from non-JSON LLM output", confidence: 0.6 };
        }

        // Fallback: find a quoted reply value
        const jsonReplyMatch = cleaned.match(/"reply"\s*:\s*"([^"]{10,})"/i);
        if (jsonReplyMatch && jsonReplyMatch[1]) {
          return { reply: jsonReplyMatch[1].trim(), reasoning: "Extracted quoted reply from LLM text", confidence: 0.6 };
        }

        // As a last resort, return the last paragraph as a reply
        const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length) {
          const last = paragraphs[paragraphs.length - 1];
          if (last.length > 20) {
            return { reply: last, reasoning: "Used last paragraph of LLM output as reply", confidence: 0.5 };
          }
        }
      } catch (e) {
        // ignore heuristic failures
      }
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
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return { error: "ไม่พบ GROQ_API_KEY ในระบบ (ตรวจสอบไฟล์ .env)" };
  }

  const ragExamples = venue ? getVenueSpecificExamples(venue.id) : "";
  const venueBlock = venue ? buildVenueBlock(venue) : "บทบาท: แอดมินร้านอาหาร/คาเฟ่มืออาชีพ";

  const systemInstruction = `คุณคือเจ้าของร้านผู้เชี่ยวชาญ 
หน้าที่: วิเคราะห์รีวิวลูกค้าและร่างคำตอบที่แสดงถึงความใส่ใจ (Empathy) 
กฎเหล็ก:
1. ตอบกลับด้วยความจริงใจ: หากชมให้ขอบคุณ หากติให้ขอโทษและระบุแนวทางแก้ไข
2. โฟกัสที่ธุรกิจ: แม้ลูกค้าจะคุยเล่นหรือพูดนอกเรื่อง (เช่น ชมพนักงานว่าสวย, พูดเรื่องดินฟ้าอากาศ) ให้เพิกเฉยต่อส่วนที่วอกแวกนั้น 
   แต่จงตอบในประเด็นหลักของร้าน (บรรยากาศ, กาแฟ, กิจกรรม)
3. ภาษาสละสลวย: ใช้ภาษาไทยที่เป็นธรรมชาติ (Conversational) ไม่เป็นหุ่นยนต์
4. JSON เท่านั้น: ตอบในรูปแบบ {"sentiment": "Positive|Neutral|Negative", "aspect": "taste|price|service|atmosphere|speed|cleanliness|menu|packaging|general", "confidence": 0.0-1.0, "reply": "ข้อความตอบ", "reasoning": "วิธีคิด"}
5. ห้ามมโนเมนูที่ลูกค้าไม่ได้พูดถึง`;

  const userPrompt = `${venueBlock}
${ragExamples}

คอมเมนต์ลูกค้า: "${comment}"`;

  try {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: systemInstruction,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.3,
        top_p: 0.95, // ใช้ค่าต่ำเพื่อให้คำตอบนิ่งและอยู่ในร่องในรอย
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Groq API Error: ${res.status} - ${JSON.stringify(errData)}`);
    }

    const data = await res.json();
    
    // Groq returns choices array (OpenAI format)
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error("Groq API returned empty content");
    }

    const result = safeJsonParse(text);
    if (!result) {
      return { error: "AI ตอบกลับมาในรูปแบบที่ระบบไม่อ่านไม่ได้ (Invalid JSON from Groq)" };
    }
    
    return result;
  } catch (error: any) {
    console.error("Groq LLM Error:", error);
    return { error: `เกิดข้อผิดพลาดในการเชื่อมต่อ Groq API: ${error.message}` };
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
    
    // Determine final reply
    let finalReply = "";
    let reasoning = "";
    let llmUsed = false;

    if (llm && llm.reply) {
      finalReply = enforceReplyStyle(comment, llm.reply);
      reasoning = llm.reasoning || "AI วิเคราะห์บริบทสำเร็จ";
      llmUsed = true;
    } else {
      // Logic for fallback reasoning
      if (llm?.error) {
        reasoning = `[AI Error] ${llm.error} -> กำลังใช้ระบบสำรอง...`;
      } else {
        reasoning = "ระบบวิเคราะห์จากฐานข้อมูลตัวอย่างเดิม (AI ไม่ทำงาน)";
      }

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
