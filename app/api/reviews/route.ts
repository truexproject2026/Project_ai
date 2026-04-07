import { NextResponse } from "next/server";
import sampleReviews from "@/data/sample_reviews.json";

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? "10")));
  const offset = (page - 1) * pageSize;

  try {
    const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=iamwarint%2Fwongnai-restaurant-review&config=default&split=train&offset=${offset}&length=${pageSize}`;
    const sizeUrl =
      "https://datasets-server.huggingface.co/size?dataset=iamwarint%2Fwongnai-restaurant-review";

    const [rowsRes, sizeRes] = await Promise.all([fetch(rowsUrl), fetch(sizeUrl)]);

    if (!rowsRes.ok || !sizeRes.ok) {
      throw new Error("Failed to fetch remote dataset");
    }

    const rowsData = (await rowsRes.json()) as { rows?: DatasetRow[] };
    const sizeData = (await sizeRes.json()) as {
      size?: {
        splits?: Array<{ split?: string; num_rows?: number }>;
      };
    };

    const trainSplit = sizeData.size?.splits?.find((s) => s.split === "train");
    const total = trainSplit?.num_rows ?? 0;
    const reviews = (rowsData.rows ?? [])
      .map((r) => r.row?.review_body?.trim())
      .filter((comment): comment is string => Boolean(comment))
      .map((comment) => ({ comment }));

    return NextResponse.json({
      reviews,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      source: "huggingface",
    });
  } catch (error) {
    console.error("[reviews] fallback to local sample:", error);
    const fallback = buildFallbackReviews();
    const paged = fallback.slice(offset, offset + pageSize);
    return NextResponse.json({
      reviews: paged,
      page,
      pageSize,
      total: fallback.length,
      totalPages: Math.max(1, Math.ceil(fallback.length / pageSize)),
      source: "local-fallback",
    });
  }
}