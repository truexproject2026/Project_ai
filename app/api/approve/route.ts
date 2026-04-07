import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { comment, reply, sentiment } = await req.json();

    // Save to approved replies file
    const filePath = path.join(process.cwd(), "data", "approved_replies.json");

    let approved = [];
    if (fs.existsSync(filePath)) {
      approved = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    approved.push({
      comment,
      reply,
      sentiment,
      approvedAt: new Date().toISOString(),
    });

    fs.writeFileSync(filePath, JSON.stringify(approved, null, 2));

    return NextResponse.json({
      success: true,
      message: "Reply approved and saved",
    });
  } catch (error) {
    console.error("Error saving approval:", error);
    return NextResponse.json(
      { error: "Failed to save approval" },
      { status: 500 }
    );
  }
}
