import { NextResponse } from "next/server";
import { listVenues } from "@/lib/brand-manager";

const DATASET_SIZE =
  "https://datasets-server.huggingface.co/size?dataset=iamwarint%2Fwongnai-restaurant-review";

export async function GET() {
  const venues = listVenues();
  try {
    const sizeRes = await fetch(DATASET_SIZE);
    if (!sizeRes.ok) throw new Error("size fetch failed");
    const sizeData = (await sizeRes.json()) as {
      size?: { splits?: Array<{ split?: string; num_rows?: number }> };
    };
    const trainSplit = sizeData.size?.splits?.find((s) => s.split === "train");
    const totalTrain = trainSplit?.num_rows ?? 0;

    const n = venues.length;
    const base = n > 0 ? Math.floor(totalTrain / n) : 0;
    const rem = n > 0 ? totalTrain % n : 0;

    const enriched = venues.map((v, index) => ({
      ...v,
      approxReviewCount: base + (index < rem ? 1 : 0),
    }));

    return NextResponse.json({
      venues: enriched,
      totalTrainRows: totalTrain,
      source: "huggingface",
      partitionNote:
        "ชุด Wongnai ไม่มีชื่อร้านในแถว — จำนวนต่อร้านคำนวณจากแบ่งแถวใน train เท่าๆ กัน (ประมาณ 1/3 ของทั้งหมด)",
    });
  } catch (e) {
    console.error("[venues]", e);
    const fallbackTotal = 19458;
    const n = venues.length;
    const base = Math.floor(fallbackTotal / n);
    const rem = fallbackTotal % n;
    const enriched = venues.map((v, index) => ({
      ...v,
      approxReviewCount: base + (index < rem ? 1 : 0),
    }));
    return NextResponse.json({
      venues: enriched,
      totalTrainRows: fallbackTotal,
      source: "fallback-estimate",
      partitionNote: "ประมาณการเมื่อดึงขนาดชุดจาก Hugging Face ไม่สำเร็จ",
    });
  }
}
