import { NextResponse } from "next/server";
import sampleReviews from "@/data/sample_reviews.json";
import { getVenueById, rowIndexMatchesVenue } from "@/lib/venues";

type DatasetRow = {
  row?: {
    review_body?: string;
  };
};

function buildFallbackReviews(): { comment: string }[] {
  return [
    ...sampleReviews.positiveReviews,
    ...sampleReviews.neutralReviews,
    ...sampleReviews.negativeReviews,
  ].map((comment) => ({ comment }));
}

const ROWS_URL = (offset: number, length: number) =>
  `https://datasets-server.huggingface.co/rows?dataset=iamwarint%2Fwongnai-restaurant-review&config=default&split=train&offset=${offset}&length=${length}`;

const SIZE_URL =
  "https://datasets-server.huggingface.co/size?dataset=iamwarint%2Fwongnai-restaurant-review";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId") ?? "";
  const cursor = Math.max(0, Number(searchParams.get("cursor") ?? "0"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? "10")));
  const maxScan = Math.min(20000, Math.max(200, Number(searchParams.get("maxScan") ?? "8000")));

  const venue = getVenueById(venueId);
  if (!venue) {
    return NextResponse.json(
      {
        error: "ต้องเลือกร้าน (venueId) ที่ถูกต้อง",
        reviews: [],
        nextCursor: 0,
        done: true,
      },
      { status: 400 }
    );
  }

  const reviews: { comment: string }[] = [];
  let i = cursor;
  let scanned = 0;
  let totalTrain = 0;

  try {
    const sizeRes = await fetch(SIZE_URL);
    if (!sizeRes.ok) throw new Error("Failed to fetch dataset size");
    const sizeData = (await sizeRes.json()) as {
      size?: { splits?: Array<{ split?: string; num_rows?: number }> };
    };
    const trainSplit = sizeData.size?.splits?.find((s) => s.split === "train");
    totalTrain = trainSplit?.num_rows ?? 0;

    const chunk = 50;

    while (reviews.length < pageSize && i < totalTrain && scanned < maxScan) {
      const rowsRes = await fetch(ROWS_URL(i, chunk));
      if (!rowsRes.ok) throw new Error("Failed to fetch remote dataset rows");
      const rowsData = (await rowsRes.json()) as { rows?: DatasetRow[] };
      const rows = rowsData.rows ?? [];
      if (rows.length === 0) break;

      for (let j = 0; j < rows.length; j += 1) {
        if (reviews.length >= pageSize) break;
        const globalIndex = i + j;
        if (!rowIndexMatchesVenue(globalIndex, venue.id)) continue;
        const comment = rows[j]?.row?.review_body?.trim();
        if (comment) {
          reviews.push({ comment });
        }
      }

      scanned += rows.length;
      i += rows.length;
    }

    const done = i >= totalTrain;

    return NextResponse.json({
      reviews,
      nextCursor: i,
      done,
      pageSize,
      venueId: venue.id,
      venueName: venue.name,
      totalTrainRows: totalTrain,
      source: "huggingface",
      note:
        "ทุกข้อความดึงจาก review_body ของชุด iamwarint/wongnai-restaurant-review (split train) โดยตรง ชุดนี้ไม่มีรหัสร้าน — แบ่งแถวตามดัชนีใน train (index mod 3) ให้สอดคล้องกับ 3 โปรไฟล์ร้านในเดโม",
    });
  } catch (error) {
    console.error("[reviews] HF error, local fallback:", error);
    reviews.splice(0, reviews.length);
    const all = buildFallbackReviews();
    let idx = cursor;
    scanned = 0;
    while (reviews.length < pageSize && idx < all.length && scanned < maxScan) {
      if (rowIndexMatchesVenue(idx, venue.id)) {
        reviews.push({ comment: all[idx].comment });
      }
      idx += 1;
      scanned += 1;
    }
    totalTrain = all.length;

    return NextResponse.json({
      reviews,
      nextCursor: idx,
      done: idx >= all.length,
      pageSize,
      venueId: venue.id,
      venueName: venue.name,
      totalTrainRows: totalTrain,
      source: "local-fallback",
      note:
        "เชื่อม Hugging Face ไม่ได้ — ใช้รีวิวตัวอย่างในโปรเจกต์แทน โดยยังแบ่งตาม index mod 3 เหมือนโหมดปกติ",
    });
  }
}
