import { NextResponse } from "next/server";
import { analyzeWithTrainingData, buildReplyFromTrainingData } from "@/lib/trainingDataset";
import { getVenueById, type Venue } from "@/lib/venues";

type LlmResult = {
  sentiment?: "Positive" | "Neutral" | "Negative";
  aspect?: string;
  reply?: string;
  confidence?: number;
};

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function extractMentionedMenuItems(comment: string): string[] {
  const text = normalizeText(comment);
  const rules: Array<{ key: string; label: string }> = [
    { key: "กาแฟ", label: "กาแฟ" },
    { key: "ลาเต้", label: "ลาเต้" },
    { key: "ชามะนาว", label: "ชามะนาว" },
    { key: "ชาเขียว", label: "ชาเขียว" },
    { key: "ชามะลิ", label: "ชามะลิ" },
    { key: "สปาเกตตี้หอยเชลล์", label: "สปาเกตตี้หอยเชลล์" },
    { key: "สปาเกตตี้", label: "สปาเกตตี้" },
    { key: "ซุปเห็ด", label: "ซุปเห็ด" },
    { key: "แพนเค้ก", label: "แพนเค้ก" },
    { key: "โทสต์", label: "โทสต์" },
    { key: "ขนม", label: "ขนม" },
    { key: "อาหาร", label: "อาหาร" },
    { key: "เครื่องดื่ม", label: "เครื่องดื่ม" },
  ];

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

  const mentioned = extractMentionedMenuItems(comment);
  const hasMentionedMenu = mentioned.some((item) => normalizeText(cleaned).includes(item));

  // If model invents specific menu not in comment, fallback to safer response.
  const knownMenus = ["ชามะนาว", "ชาเขียว", "ชามะลิ", "สปาเกตตี้หอยเชลล์", "สปาเกตตี้", "ซุปเห็ด", "แพนเค้ก", "โทสต์", "ลาเต้", "กาแฟ"];
  const inventedSpecificMenu = knownMenus.some(
    (menu) => normalizeText(cleaned).includes(menu) && !normalizeText(comment).includes(menu)
  );
  if (inventedSpecificMenu) {
    if (normalizeText(comment).includes("ไม่อร่อย")) {
      return "ต้องขออภัยคุณลูกค้าด้วยนะคะที่รสชาติยังไม่ถูกใจ ทางร้านจะนำคำแนะนำไปปรับปรุงทันทีค่ะ";
    }
    return "ขอบคุณคุณลูกค้าสำหรับความคิดเห็นนะคะ ทางร้านรับฟังและจะนำไปปรับปรุงให้ดีขึ้นค่ะ";
  }

  if (!hasMentionedMenu && normalizeText(comment).includes("ไม่อร่อย")) {
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
  const venueBlock = venue
    ? `${buildVenueBlock(venue)}\n\n`
    : `บทบาท: คุณคือ "แอดมินร้านอาหาร/คาเฟ่" ที่ต้องตอบลูกค้าเพื่อดูแลประสบการณ์\n`;

  const prompt = `${venueBlock}เป้าหมาย: ตอบลูกค้าอย่างมืออาชีพตามบริบทจริงของคอมเมนต์ทั้งก้อน
อ่านคอมเมนต์ทั้งข้อความ ห้ามสรุปจากคำเดี่ยว ห้ามเดาเมนูที่ไม่ได้ถูกพูดถึง

ตอบเป็น JSON เท่านั้น ในรูปแบบ:
{"sentiment":"Positive|Neutral|Negative","aspect":"taste|price|service|atmosphere|speed|cleanliness|menu|packaging|general","confidence":0.0-1.0,"reply":"ข้อความตอบลูกค้า"}

กติกา:
- reply ต้องอยู่ในมุม "ร้านตอบลูกค้า" เท่านั้น
- ถ้าลูกค้าชมหลายจุดและติบางจุด ให้ตอบแบบผสม: ขอบคุณ + ขอโทษเฉพาะจุดที่ติ + บอกว่าจะปรับปรุง
- ถ้าติเรื่องราคา/ปริมาณ ให้ mention เรื่องราคา/ปริมาณให้ตรง
- ถ้าติเรื่องรสชาติ ให้ mention เมนูนั้นตรงๆ เช่น ชามะนาวจืด, ไก่ชีสเลี่ยน
- ใช้ภาษาไทยสุภาพ กระชับ 1-2 ประโยค ไม่ต้องยาว
- ห้ามเขียนเหมือนสรุปรีวิว ห้ามใช้คำว่า "ลูกค้าบอกว่า..."
- ห้ามตอบแบบทั่วไปที่ไม่อ้างอิงประเด็นจริงของคอมเมนต์
- ห้ามออกความเห็นแทนลูกค้าแบบฟันธง เช่น "เมนูนี้อร่อยมากค่ะ" ให้ใช้สำนวน "ขอบคุณที่ชื่นชอบ..."
- ห้ามใช้คำว่า "ท่าน" ให้ใช้ "คุณลูกค้า" หรือไม่ใช้สรรพนามแทน
- ถ้า comment สั้นมาก เช่น "ไม่อร่อย" ห้ามเดาเมนู ให้ขอโทษแบบทั่วไปเรื่องรสชาติ

ตัวอย่างสไตล์ที่ถูก:
Input: "ขนมดีมาก แต่ชาเขียวหวานเกินไป"
Output reply: "ขอบคุณมากนะคะที่ชอบขนมของร้านเรา และต้องขออภัยเรื่องชาเขียวหวานเกินไป ทางร้านจะปรับรสชาติให้ดีขึ้นค่ะ"

Comment:
${comment}`;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    const res = await fetch(`${url}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 300, responseMimeType: "application/json" },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = safeJsonParse(text);
      if (parsed?.reply) return parsed;
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON only. Analyze full Thai comment context." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = safeJsonParse(text);
      if (parsed?.reply) return parsed;
    }
  }

  const hfToken = process.env.HF_TOKEN;
  if (hfToken) {
    const hfModel = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        model: hfModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return valid JSON only. Analyze full Thai comment context." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = safeJsonParse(text);
      if (parsed?.reply) return parsed;
      if (text.trim().length > 0) {
        return { reply: text.replace(/```json|```/gi, "").trim() };
      }
    } else {
      const errText = await res.text();
      console.warn("[HF] API error:", errText);
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { comment, venueId } = await req.json();

    if (!comment || typeof comment !== "string") {
      return NextResponse.json(
        { error: "Invalid comment" },
        { status: 400 }
      );
    }

    const venue =
      typeof venueId === "string" && venueId.length > 0 ? getVenueById(venueId) : undefined;
    if (typeof venueId === "string" && venueId.length > 0 && !venue) {
      return NextResponse.json({ error: "venueId ไม่ถูกต้อง" }, { status: 400 });
    }

    const analysis = analyzeWithTrainingData(comment);
    const llm = await generateReplyWithLlm(comment, venue);
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