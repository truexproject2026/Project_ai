import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const brandPath = path.join(process.cwd(), "data/brand-config.json");

function readBrand() {
  const content = fs.readFileSync(brandPath, "utf-8");
  return JSON.parse(content);
}

function writeBrand(data: any) {
  fs.writeFileSync(brandPath, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");

    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 });
    }

    const data = readBrand();
    const venueData = data.brands[venueId] || { examples: [] };
    
    return NextResponse.json(venueData.examples || []);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load training data" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { venueId, review, reply } = await req.json();
    if (!venueId || !review || !reply) {
      return NextResponse.json({ error: "venueId, review, and reply are required" }, { status: 400 });
    }

    const data = readBrand();
    if (!data.brands[venueId]) {
      data.brands[venueId] = { examples: [] };
    }
    
    data.brands[venueId].examples.unshift({ review, reply });
    writeBrand(data);

    return NextResponse.json({ success: true, examples: data.brands[venueId].examples });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add training data" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { venueId, index } = await req.json();
    if (!venueId || typeof index !== "number") {
      return NextResponse.json({ error: "venueId and index are required" }, { status: 400 });
    }

    const data = readBrand();
    
    if (data.brands[venueId] && data.brands[venueId].examples && data.brands[venueId].examples[index]) {
      data.brands[venueId].examples.splice(index, 1);
      writeBrand(data);
      return NextResponse.json({ success: true, examples: data.brands[venueId].examples });
    }
    
    return NextResponse.json({ error: "Example not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete training data" }, { status: 500 });
  }
}
