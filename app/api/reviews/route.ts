import { NextResponse } from "next/server";
import sampleReviews from "@/data/sample_reviews.json";
import { getVenueById, rowMatchesVenue, rowIndexMatchesVenue } from "@/lib/venues";

type DatasetRow = {
  row?: {
    review_body?: string;
    restaurant_id?: string;
    restaurant_name?: string;
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
  let hasMetadata = false;

  try {
    const sizeRes = await fetch(SIZE_URL);
    if (!sizeRes.ok) throw new Error("Failed to fetch dataset size");
    const sizeData = (await sizeRes.json()) as {
      size?: { splits?: Array<{ split?: string; num_rows?: number }> };
    };
    const trainSplit = sizeData.size?.splits?.find((s) => s.split === "train");
    totalTrain = trainSplit?.num_rows ?? 0;

    const chunk = 100;
    const concurrency = 4; // Fetch 400 rows in parallel per step

    while (reviews.length < pageSize && i < totalTrain && scanned < maxScan) {
      const remainingToScan = maxScan - scanned;
      const currentBatchSize = Math.min(concurrency, Math.ceil(remainingToScan / chunk));
      
      const fetchPromises = [];
      for (let b = 0; b < currentBatchSize; b++) {
        const offset = i + (b * chunk);
        if (offset < totalTrain) {
          fetchPromises.push(fetch(ROWS_URL(offset, chunk)).then(res => res.ok ? res.json() : { rows: [] }));
        }
      }

      const results = await Promise.all(fetchPromises);
      
      for (const data of results) {
        const rows = (data as any).rows ?? [];
        if (rows.length === 0) continue;

        for (let j = 0; j < rows.length; j += 1) {
          if (reviews.length >= pageSize) break;
          const globalIndex = i + j;
          const row = rows[j]?.row;
          
          hasMetadata ||= !!(row?.restaurant_id || row?.restaurant_name);

          if (rowMatchesVenue(row, venue, globalIndex)) {
            const comment = row?.review_body?.trim();
            if (comment) {
              reviews.push({ comment });
            }
          }
        }
        
        scanned += rows.length;
        i += rows.length;
        if (reviews.length >= pageSize) break;
      }
      
      if (results.every(d => ((d as any).rows ?? []).length === 0)) break;
    }

    const done = i >= totalTrain;

    const sourceNote = hasMetadata
      ? "Dataset มี metadata ร้าน จึงแมปรีวิวกับร้านได้จากฟิลด์จริง"
      : "รีวิวเป็นของจริงจากชุด iamwarint/wongnai-restaurant-review แต่การเลือกเสนอร้านเป็นการจัดตาม persona/brand profile โดยใช้ keyword ประเภทร้าน ไม่ใช่ matching ร้านจริงจาก metadata";

    return NextResponse.json({
      reviews,
      nextCursor: i,
      done,
      pageSize,
      venueId: venue.id,
      venueName: venue.name,
      totalTrainRows: totalTrain,
      source: "huggingface",
      note: sourceNote,
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
