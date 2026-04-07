import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const datasetPath = path.join(rootDir, "data", "training_reviews_v1.json");
const outputDir = path.join(rootDir, "reports");
const outputJsonPath = path.join(outputDir, "metrics_round3.json");
const outputMdPath = path.join(outputDir, "metrics_round3.md");

/** @type {{items: Array<{id:string,text:string,label:"positive"|"neutral"|"negative",aspect:string,gold_reply:string}>}} */
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const items = dataset.items ?? [];

const aspectKeywords = {
  taste: ["อร่อย", "รสชาติ", "หอม", "หวาน", "เค็ม", "จืด", "กาแฟ", "ชา", "ขนม"],
  price: ["ราคา", "คุ้ม", "แพง", "ประหยัด", "ปริมาณ"],
  service: ["พนักงาน", "บริการ", "รับออเดอร์", "สุภาพ", "ดูแล"],
  atmosphere: ["บรรยากาศ", "เสียง", "แอร์", "ที่นั่ง", "ร้าน"],
  speed: ["รอ", "ช้า", "เร็ว", "คิว", "เสิร์ฟ"],
  cleanliness: ["สะอาด", "คราบ", "พื้น", "โต๊ะ"],
  menu: ["เมนู", "ตัวเลือก", "หลากหลาย"],
  packaging: ["แพ็กเกจ", "บรรจุภัณฑ์", "ฝา", "แก้ว", "หก"],
  general: [],
};

const positiveHints = ["ดี", "ประทับใจ", "ชอบ", "อร่อย", "คุ้ม", "สะอาด", "สะดวก", "รวดเร็ว"];
const negativeHints = ["แย่", "ผิดหวัง", "แพง", "ช้า", "ไม่", "หก", "คราบ", "อึดอัด"];

function normalizeText(text) {
  return String(text ?? "").toLowerCase().trim();
}

function tokenOverlapScore(input, sample) {
  const inputTokens = normalizeText(input).split(/\s+/).filter(Boolean);
  const sampleTokens = normalizeText(sample).split(/\s+/).filter(Boolean);
  if (!inputTokens.length || !sampleTokens.length) return 0;

  let score = 0;
  for (const token of inputTokens) {
    if (sampleTokens.includes(token)) score += 1;
  }
  return score / Math.max(inputTokens.length, sampleTokens.length);
}

function charNgramSet(text, n = 3) {
  const input = normalizeText(text).replace(/\s+/g, "");
  const grams = new Set();
  if (input.length < n) {
    grams.add(input);
    return grams;
  }
  for (let i = 0; i <= input.length - n; i += 1) {
    grams.add(input.slice(i, i + n));
  }
  return grams;
}

function jaccardNgramScore(input, sample) {
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

function detectAspect(text) {
  const input = normalizeText(text);
  let bestAspect = "general";
  let bestScore = 0;

  for (const [aspect, keywords] of Object.entries(aspectKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (input.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAspect = aspect;
    }
  }

  return bestAspect;
}

function sentimentHintScore(text) {
  const input = normalizeText(text);
  let pos = 0;
  let neg = 0;
  for (const token of positiveHints) {
    if (input.includes(token)) pos += 1;
  }
  for (const token of negativeHints) {
    if (input.includes(token)) neg += 1;
  }
  return { pos, neg };
}

function predictSentiment(text, trainItems, predictedAspect) {
  const ranked = trainItems
    .map((item) => ({
      item,
      score:
        tokenOverlapScore(text, item.text) * 0.45 +
        jaccardNgramScore(text, item.text) * 0.35 +
        (item.aspect === predictedAspect ? 0.2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const vote = { positive: 0, neutral: 0, negative: 0 };
  for (const row of ranked) {
    vote[row.item.label] += row.score;
  }

  const hint = sentimentHintScore(text);
  vote.positive += hint.pos * 0.12;
  vote.negative += hint.neg * 0.12;
  if (Math.abs(vote.positive - vote.negative) < 0.12) {
    vote.neutral += 0.08;
  }

  if (vote.positive > vote.negative && vote.positive > vote.neutral) return "positive";
  if (vote.negative > vote.positive && vote.negative > vote.neutral) return "negative";
  return "neutral";
}

function replyQualityScore(reply) {
  const text = normalizeText(reply);
  let score = 0;
  if (text.length >= 20 && text.length <= 180) score += 1;
  if (text.includes("ขอบคุณ") || text.includes("ขออภัย")) score += 1;
  if (text.includes("ค่ะ")) score += 1;
  return score;
}

let sentimentCorrect = 0;
let aspectCorrect = 0;
let replyScoreTotal = 0;
const confusion = {
  positive: { positive: 0, neutral: 0, negative: 0 },
  neutral: { positive: 0, neutral: 0, negative: 0 },
  negative: { positive: 0, neutral: 0, negative: 0 },
};

function stratifiedSplit(allItems, testRatio = 0.2) {
  const byLabel = { positive: [], neutral: [], negative: [] };
  for (const item of allItems) {
    byLabel[item.label].push(item);
  }

  const train = [];
  const test = [];

  for (const label of ["positive", "neutral", "negative"]) {
    const bucket = byLabel[label];
    const testCount = Math.max(1, Math.round(bucket.length * testRatio));
    test.push(...bucket.slice(0, testCount));
    train.push(...bucket.slice(testCount));
  }

  return { train, test };
}

const split = stratifiedSplit(items, 0.2);
const trainItems = split.train;
const testItems = split.test;
const evalItems = testItems.length > 0 ? testItems : items;
const fallbackTrain = trainItems.length > 0 ? trainItems : items;

for (const item of evalItems) {
  const predictedAspect = detectAspect(item.text);
  const predictedSentiment = predictSentiment(item.text, fallbackTrain, predictedAspect);

  if (predictedSentiment === item.label) sentimentCorrect += 1;
  if (predictedAspect === item.aspect) aspectCorrect += 1;

  confusion[item.label][predictedSentiment] += 1;
  replyScoreTotal += replyQualityScore(item.gold_reply);
}

const labels = ["positive", "neutral", "negative"];
function prf(label) {
  const tp = confusion[label][label];
  let fp = 0;
  let fn = 0;
  for (const other of labels) {
    if (other !== label) {
      fp += confusion[other][label];
      fn += confusion[label][other];
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
  };
}

const perLabel = {
  positive: prf("positive"),
  neutral: prf("neutral"),
  negative: prf("negative"),
};
const macroF1 = Number(
  ((perLabel.positive.f1 + perLabel.neutral.f1 + perLabel.negative.f1) / 3).toFixed(4)
);

const total = evalItems.length || 1;
const metrics = {
  total_samples: evalItems.length,
  train_samples: fallbackTrain.length,
  test_samples: evalItems.length,
  sentiment_accuracy: Number((sentimentCorrect / total).toFixed(4)),
  aspect_accuracy: Number((aspectCorrect / total).toFixed(4)),
  per_label: perLabel,
  macro_f1: macroF1,
  avg_reply_quality_score_0_to_3: Number((replyScoreTotal / total).toFixed(4)),
  confusion_matrix: confusion,
  generated_at: new Date().toISOString(),
};

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputJsonPath, JSON.stringify(metrics, null, 2), "utf8");

const md = `# Metrics Report (Round 3.1)

- Train/Test split: ${metrics.train_samples}/${metrics.test_samples}
- Sentiment accuracy: ${(metrics.sentiment_accuracy * 100).toFixed(2)}%
- Aspect accuracy: ${(metrics.aspect_accuracy * 100).toFixed(2)}%
- Macro F1: ${(metrics.macro_f1 * 100).toFixed(2)}%
- Avg reply quality (0-3): ${metrics.avg_reply_quality_score_0_to_3.toFixed(2)}

## Per-label (Precision/Recall/F1)

\`\`\`json
${JSON.stringify(metrics.per_label, null, 2)}
\`\`\`

## Confusion Matrix (label -> predicted)

\`\`\`json
${JSON.stringify(metrics.confusion_matrix, null, 2)}
\`\`\`
`;

fs.writeFileSync(outputMdPath, md, "utf8");

console.log("Evaluation complete");
console.log(JSON.stringify(metrics, null, 2));
