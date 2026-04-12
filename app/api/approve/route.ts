import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type ApprovedReply = {
  comment: string;
  reply: string;
  sentiment: string;
  approvedAt: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { comment, reply, sentiment } = body;

    // Validate input
    if (
      typeof comment !== "string" ||
      typeof reply !== "string" ||
      typeof sentiment !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid input: comment, reply, and sentiment are required" },
        { status: 400 }
      );
    }

    // Save to approved replies file with atomic write
    const filePath = path.join(process.cwd(), "data", "approved_replies.json");
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let approved: ApprovedReply[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(data)) {
          approved = data;
        }
      } catch (parseError) {
        console.warn("Warning: Could not parse existing approvals file:", parseError);
      }
    }

    const newApproval: ApprovedReply = {
      comment,
      reply,
      sentiment,
      approvedAt: new Date().toISOString(),
    };

    approved.push(newApproval);

    // Write to temp file first, then rename (atomic)
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(approved, null, 2));
    fs.renameSync(tempPath, filePath);

    return NextResponse.json({
      success: true,
      message: "Reply approved and saved",
    });
  } catch (error) {
    console.error("Error saving approval:", error);
    return NextResponse.json(
      {
        error: "Failed to save approval",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
