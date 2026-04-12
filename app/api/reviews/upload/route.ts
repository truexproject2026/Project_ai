import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const content = buffer.toString("utf-8");
    const fileName = file.name.toLowerCase();

    let reviews: { comment: string }[] = [];

    if (fileName.endsWith(".json")) {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        reviews = data.map((item: any) => ({
          comment: typeof item === "string" ? item : item.comment || item.review || item.text || "",
        }));
      } else if (data.items && Array.isArray(data.items)) {
        reviews = data.items.map((item: any) => ({
          comment: item.comment || item.review || item.text || "",
        }));
      }
    } else if (fileName.endsWith(".csv")) {
      const lines = content.split(/\r?\n/);
      const headers = lines[0].split(",");
      const commentIndex = headers.findIndex(h => 
        ["comment", "review", "text", "body"].includes(h.trim().toLowerCase())
      );

      // Simple fallback if no clear header matches: use the first column or entire line
      const targetIdx = commentIndex >= 0 ? commentIndex : 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(",");
        const comment = cols[targetIdx]?.replace(/^"|"$/g, "").trim();
        if (comment) {
          reviews.push({ comment });
        }
      }
    } else {
      return NextResponse.json({ error: "Unsupported file format. Use .json or .csv" }, { status: 400 });
    }

    // Filter out empty comments
    reviews = reviews.filter(r => r.comment.length > 0);

    if (reviews.length === 0) {
      return NextResponse.json({ error: "No valid reviews found in file" }, { status: 400 });
    }

    // Save to data/custom_reviews.json
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    const outputPath = path.join(dataDir, "custom_reviews.json");
    fs.writeFileSync(outputPath, JSON.stringify(reviews, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      count: reviews.length,
      message: `Successfully imported ${reviews.length} reviews`,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Internal server error during upload" }, { status: 500 });
  }
}
