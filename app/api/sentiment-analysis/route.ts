import { NextResponse } from "next/server";
import { analyzeWithTrainingData } from "@/lib/trainingDataset";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
    }

    const analysis = analyzeWithTrainingData(text);

    return NextResponse.json({
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
      aspect: analysis.aspect,
      matchedExamples: analysis.matchedExamples.map((item) => item.id),
    });
  } catch (error) {
    console.error("[API sentiment] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}