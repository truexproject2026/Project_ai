import trainingData from "@/data/training_reviews_v1.json";

export type SentimentLabel = "positive" | "neutral" | "negative";
export type AspectLabel =
  | "taste"
  | "price"
  | "service"
  | "atmosphere"
  | "speed"
  | "cleanliness"
  | "menu"
  | "packaging"
  | "general";

export type TrainingItem = {
  id: string;
  text: string;
  label: SentimentLabel;
  aspect: AspectLabel;
  gold_reply: string;
};

type AnalysisResult = {
  sentiment: "Positive" | "Neutral" | "Negative";
  confidence: number;
  aspect: AspectLabel;
  matchedExamples: TrainingItem[];
};

const items = trainingData.items as TrainingItem[];

const aspectKeywords: Record<AspectLabel, string[]> = {
  taste: ["อร่อย", "รสชาติ", "หอม", "หวาน", "เค็ม", "จืด", "เปรี้ยว", "กาแฟ", "ชา", "ขนม", "อาหาร"],
  price: ["ราคา", "คุ้ม", "แพง", "ประหยัด", "ปริมาณ"],
  service: ["พนักงาน", "บริการ", "รับออเดอร์", "สุภาพ", "ดูแล"],
  atmosphere: ["บรรยากาศ", "เสียง", "แอร์", "ที่นั่ง", "ร้าน"],
  speed: ["รอ", "ช้า", "เร็ว", "คิว", "เสิร์ฟ"],
  cleanliness: ["สะอาด", "คราบ", "พื้น", "โต๊ะ"],
  menu: ["เมนู", "ตัวเลือก", "หลากหลาย"],
  packaging: ["แพ็กเกจ", "บรรจุภัณฑ์", "ฝา", "แก้ว", "หก"],
  general: [],
};

const positiveHints = [
  "ดี",
  "ประทับใจ",
  "ชอบ",
  "อร่อย",
  "คุ้ม",
  "สะอาด",
  "สะดวก",
  "รวดเร็ว",
  "หอม",
  "อบอุ่น",
];

const negativeHints = [
  "แย่",
  "ผิดหวัง",
  "แพง",
  "ช้า",
  "หก",
  "คราบ",
  "อึดอัด",
  "เลี่ยน",
  "จืด",
  "เปรี้ยว",
  "เค็ม",
  "หวานเกิน",
];

const complaintPhrases = [
  "เกินไป",
  "มากไป",
  "ไม่โอเค",
  "ไม่ประทับใจ",
  "ไม่ตรงใจ",
  "ไม่ตรงที่สั่ง",
  "ต้องปรับปรุง",
  "ให้น้อย",
  "น้อยไป",
];

const contrastWords = ["แต่", "แต่ว่า", "however"];
const menuMentionRules: Array<{ key: string; label: string }> = [
  { key: "เครื่องดื่ม", label: "เครื่องดื่ม" },
  { key: "กาแฟ", label: "กาแฟ" },
  { key: "ชานม", label: "ชานม" },
  { key: "โทส", label: "โทสต์" },
  { key: "กล้วย", label: "กล้วย" },
  { key: "เค้ก", label: "เค้ก" },
  { key: "ชีสเค้ก", label: "ชีสเค้ก" },
  { key: "อาหาร", label: "อาหาร" },
];

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function tokenOverlapScore(input: string, sample: string): number {
  const inputTokens = normalizeText(input).split(/\s+/).filter(Boolean);
  const sampleTokens = normalizeText(sample).split(/\s+/).filter(Boolean);
  if (!inputTokens.length || !sampleTokens.length) return 0;

  let score = 0;
  for (const token of inputTokens) {
    if (sampleTokens.includes(token)) score += 1;
  }
  return score / Math.max(inputTokens.length, sampleTokens.length);
}

function charNgramSet(text: string, n = 3): Set<string> {
  const input = normalizeText(text).replace(/\s+/g, "");
  const grams = new Set<string>();
  if (input.length < n) {
    grams.add(input);
    return grams;
  }
  for (let i = 0; i <= input.length - n; i += 1) {
    grams.add(input.slice(i, i + n));
  }
  return grams;
}

function jaccardNgramScore(input: string, sample: string): number {
  const a = charNgramSet(input);
  const b = charNgramSet(sample);
  if (a.size === 0 || b.size === 0) return 0;

  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function sentimentHintScore(comment: string): { pos: number; neg: number } {
  const text = normalizeText(comment);
  let pos = 0;
  let neg = 0;

  for (const token of positiveHints) {
    if (text.includes(token)) pos += 1;
  }
  for (const token of negativeHints) {
    if (!text.includes(token)) continue;
    const negatedPattern = `ไม่${token}`;
    if (text.includes(negatedPattern)) {
      // Example: "ไม่ผิดหวัง" should be treated as positive signal
      pos += 1;
      continue;
    }
    neg += 1;
  }

  return { pos, neg };
}

function hasComplaintSignal(comment: string): boolean {
  const text = normalizeText(comment);
  const hasNegative = negativeHints.some(
    (token) => text.includes(token) && !text.includes(`ไม่${token}`)
  );
  const hasComplaintPhrase = complaintPhrases.some((token) => text.includes(token));
  return hasNegative || hasComplaintPhrase;
}

function hasContrastiveNegative(comment: string): boolean {
  const text = normalizeText(comment);
  const contrastIndex = contrastWords
    .map((word) => text.indexOf(word))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];

  if (contrastIndex === undefined) return false;
  const tail = text.slice(contrastIndex);
  return (
    negativeHints.some((token) => tail.includes(token) && !tail.includes(`ไม่${token}`)) ||
    complaintPhrases.some((token) => tail.includes(token))
  );
}

function extractMentionedItems(comment: string): string[] {
  const text = normalizeText(comment);
  const found: string[] = [];
  for (const rule of menuMentionRules) {
    if (text.includes(rule.key) && !found.includes(rule.label)) {
      found.push(rule.label);
    }
  }
  return found;
}

function detectAspect(comment: string): AspectLabel {
  const text = normalizeText(comment);

  let bestAspect: AspectLabel = "general";
  let bestScore = 0;

  for (const [aspect, keywords] of Object.entries(aspectKeywords) as [
    AspectLabel,
    string[],
  ][]) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAspect = aspect;
    }
  }

  return bestAspect;
}

function chooseExamples(
  comment: string,
  aspect: AspectLabel,
  label?: SentimentLabel
): TrainingItem[] {
  const filtered = label ? items.filter((item) => item.label === label) : items;
  const source = filtered.length > 0 ? filtered : items;

  const pool = filtered.length > 0 ? filtered : source;

  const ranked = pool
    .map((item) => ({
      item,
      score:
        tokenOverlapScore(comment, item.text) * 0.45 +
        jaccardNgramScore(comment, item.text) * 0.35 +
        (item.aspect === aspect ? 0.2 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3).map((row) => row.item);
}

export function analyzeWithTrainingData(comment: string): AnalysisResult {
  const aspect = detectAspect(comment);
  const examples = chooseExamples(comment, aspect);
  const hint = sentimentHintScore(comment);

  const vote = { positive: 0, neutral: 0, negative: 0 } as Record<SentimentLabel, number>;
  for (const item of examples) {
    const base =
      tokenOverlapScore(comment, item.text) * 0.5 +
      jaccardNgramScore(comment, item.text) * 0.35 +
      (item.aspect === aspect ? 0.15 : 0);
    vote[item.label] += base;
  }

  vote.positive += hint.pos * 0.12;
  vote.negative += hint.neg * 0.12;
  if (hint.pos >= 2 && hint.neg === 0) {
    vote.positive += 0.2;
  }
  if (hasComplaintSignal(comment)) vote.negative += 0.2;
  if (hasContrastiveNegative(comment)) vote.negative += 0.28;
  if (Math.abs(vote.positive - vote.negative) < 0.12) {
    vote.neutral += 0.08;
  }

  let label: SentimentLabel = "neutral";
  if (vote.positive > vote.negative && vote.positive > vote.neutral) label = "positive";
  if (vote.negative > vote.positive && vote.negative > vote.neutral) label = "negative";

  const rankedVotes = [vote.positive, vote.neutral, vote.negative].sort((a, b) => b - a);
  const margin = Math.max(0, rankedVotes[0] - rankedVotes[1]);
  const confidence = Number(Math.min(0.95, 0.5 + margin * 0.45).toFixed(2));

  const sentiment =
    label === "positive" ? "Positive" : label === "negative" ? "Negative" : "Neutral";

  return {
    sentiment,
    confidence,
    aspect,
    matchedExamples: examples,
  };
}

export function buildReplyFromTrainingData(
  comment: string,
  sentiment: "Positive" | "Neutral" | "Negative",
  aspect: AspectLabel
): string {
  const mentionedItems = extractMentionedItems(comment);
  const complaint = hasComplaintSignal(comment) || hasContrastiveNegative(comment);
  const effectiveSentiment =
    sentiment === "Neutral" && complaint ? "Negative" : sentiment;

  const targetLabel: SentimentLabel =
    effectiveSentiment === "Positive"
      ? "positive"
      : effectiveSentiment === "Negative"
      ? "negative"
      : "neutral";
  const best = chooseExamples(comment, aspect, targetLabel)[0];
  const text = normalizeText(comment);

  if (effectiveSentiment === "Negative" && aspect === "taste") {
    if (text.includes("เปรี้ยว")) {
      return "ต้องขออภัยค่ะที่รสชาติเปรี้ยวเกินไป ทางร้านจะรีบแจ้งครัวเพื่อปรับรสชาติให้สมดุลขึ้นทันทีค่ะ";
    }
    if (text.includes("เค็ม")) {
      return "ต้องขออภัยค่ะที่รสชาติเค็มเกินไป ทางร้านจะนำไปปรับสูตรและตรวจสอบก่อนเสิร์ฟให้มากขึ้นค่ะ";
    }
    if (text.includes("หวาน")) {
      return "ต้องขออภัยค่ะที่รสชาติหวานเกินไป ทางร้านจะปรับระดับความหวานให้เหมาะสมมากขึ้นค่ะ";
    }
  }
  if (effectiveSentiment === "Negative" && (aspect === "price" || text.includes("ราคา") || text.includes("แพง") || text.includes("ให้น้อย") || text.includes("น้อยไป"))) {
    return "ต้องขออภัยค่ะที่รู้สึกว่าปริมาณยังไม่คุ้มกับราคา ทางร้านรับไว้ปรับปรุงทั้งเรื่องปริมาณและความคุ้มค่าให้ดีขึ้นค่ะ";
  }

  if (effectiveSentiment === "Positive") {
    if (mentionedItems.length > 0) {
      const itemText = mentionedItems.slice(0, 3).join(" และ");
      return `ขอบคุณมากนะคะที่ชื่นชอบ${itemText}ของร้านเรา ดีใจมากที่ถูกใจค่ะ ไว้แวะมาอีกนะคะ`;
    }
    return "ขอบคุณมากนะคะ ดีใจที่คุณลูกค้าประทับใจค่ะ";
  }

  if (effectiveSentiment === "Neutral") {
    if (mentionedItems.length > 0) {
      const itemText = mentionedItems.slice(0, 2).join(" และ");
      return `ขอบคุณสำหรับความคิดเห็นนะคะ เรื่อง${itemText}ทางร้านรับฟังไว้และจะพัฒนาให้ดียิ่งขึ้นค่ะ`;
    }
    return "ขอบคุณสำหรับความคิดเห็นนะคะ ทางร้านรับฟังทุกข้อเสนอแนะและจะพัฒนาการบริการให้ดีขึ้นค่ะ";
  }

  if (best?.gold_reply) return best.gold_reply;

  if (effectiveSentiment === "Negative") {
    return "ต้องขออภัยสำหรับประสบการณ์ที่ไม่ดีนะคะ ทางร้านจะนำไปปรับปรุงทันทีค่ะ";
  }
  return "ขอบคุณสำหรับความคิดเห็นนะคะ ทางร้านจะนำข้อเสนอแนะไปพัฒนาต่อค่ะ";
}

