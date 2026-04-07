"use client";
import { useState } from "react";

interface ResultCardProps {
  comment: string;
  sentiment: string;
  reply: string;
  confidence: number;
  timestamp: string;
  onApprove?: (reply: string) => void;
  onReject?: () => void;
}

export default function ResultCard({
  comment,
  sentiment,
  reply,
  confidence,
  timestamp,
  onApprove,
  onReject,
}: ResultCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [editedReply, setEditedReply] = useState(reply);

  const sentimentColors = {
    Positive: "bg-green-100 text-green-800",
    Negative: "bg-red-100 text-red-800",
    Neutral: "bg-gray-100 text-gray-800",
  };

  const handleApprove = async () => {
    setIsApproving(true);
    if (onApprove) {
      await onApprove(editedReply);
    }
    setIsApproving(false);
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-md">
      <div className="mb-4">
        <p className="text-sm text-gray-500">{new Date(timestamp).toLocaleString()}</p>
        <p className="mt-2 p-3 bg-gray-50 rounded">
          <b>Comment:</b> {comment}
        </p>
      </div>

      <div className="flex gap-4 mb-4">
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
          sentimentColors[sentiment as keyof typeof sentimentColors] || sentimentColors.Neutral
        }`}>
          {sentiment}
        </span>
        <span className="text-sm text-gray-600">
          Confidence: {(confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">📝 Draft Reply:</label>
        <textarea
          value={editedReply}
          onChange={(e) => setEditedReply(e.target.value)}
          className="w-full p-3 border rounded-md font-thai text-sm"
          rows={3}
        />
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={onReject}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          💬 Edit
        </button>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {isApproving ? "Approving..." : "✓ Approve"}
        </button>
      </div>
    </div>
  );
}
