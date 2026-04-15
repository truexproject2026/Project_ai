import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sampleReviews from "@/data/sample_reviews.json";
import { getVenueById, rowMatchesVenue, rowIndexMatchesVenue } from "@/lib/brand-manager";

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
  const source = searchParams.get("source") ?? "huggingface";
  const cursor = Math.max(0, Number(searchParams.get("cursor") ?? "0"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? "10")));
  const maxScan = 30000; // Increased even further for strict filtering

  const reviews: { comment: string }[] = [];

  // Handle Custom Dataset Source
  if (source === "custom") {
    try {
      const customPath = path.join(process.cwd(), "data/custom_reviews.json");
      if (fs.existsSync(customPath)) {
        const content = fs.readFileSync(customPath, "utf-8");
        const all = JSON.parse(content) as { comment: string }[];
        const chunk = all.slice(cursor, cursor + pageSize);
        
        return NextResponse.json({
          reviews: chunk,
          nextCursor: cursor + chunk.length,
          done: cursor + chunk.length >= all.length,
          pageSize,
          venueId: "custom",
          venueName: "Custom Dataset",
          totalTrainRows: all.length,
          source: "custom-file",
          note: "ข้อมูลจากไฟล์ที่คุณอัปโหลด",
        });
      } else {
        return NextResponse.json({
          error: "ยังไม่มีไฟล์ข้อมูลที่อัปโหลด",
          reviews: [],
          nextCursor: 0,
          done: true,
        }, { status: 404 });
      }
    } catch (error) {
      console.error("[custom reviews] error:", error);
      return NextResponse.json({ error: "Failed to read custom dataset" }, { status: 500 });
    }
  }

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

  let i = cursor;
  let scanned = 0;
  let totalTrain = 0;
  let hasMetadata = false;

  try {
    const sizeRes = await fetch(SIZE_URL);
    if (!sizeRes.ok) throw new Error("Failed to fetch dataset size");
    const sizeData = await sizeRes.json();
    const trainSplit = sizeData.size?.splits?.find((s: any) => s.split === "train");
    totalTrain = trainSplit?.num_rows ?? 0;

    const step = 100; // Fetch 100 rows at a time
    let currentOffset = i;

    while (reviews.length < pageSize && currentOffset < totalTrain && scanned < maxScan) {
      const res = await fetch(ROWS_URL(currentOffset, step));
      if (!res.ok) {
        console.warn(`[HF API] Failed at offset ${currentOffset}`);
        break; 
      }
      
      const data = await res.json();
      const rows = data.rows ?? [];
      
      if (rows.length === 0) break;

      for (let j = 0; j < rows.length; j++) {
        const rowData = rows[j].row;
        const globalIndex = currentOffset + j;
        
        hasMetadata ||= !!(rowData?.restaurant_id || rowData?.restaurant_name);

        if (rowMatchesVenue(rowData, venue, globalIndex)) {
          const comment = rowData?.review_body?.trim();
          if (comment) {
            reviews.push({ comment });
          }
        }
        
        scanned++;
        if (reviews.length >= pageSize) {
          i = globalIndex + 1;
          break;
        }
      }

      if (reviews.length < pageSize) {
        currentOffset += rows.length;
        i = currentOffset;
      } else {
        break;
      }
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
      totalTrainRows: all.length,
      source: "local-fallback",
      note:
        "⚠️ เชื่อมต่อ Wongnai Dataset (Hugging Face) ไม่ได้ — กำลังแสดง 'ข้อความตัวอย่าง' ในโปรเจกต์แทน เพื่อการทดสอบออฟไลน์",
    });
  }
}
