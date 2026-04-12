"use client";
import { useState } from "react";
import { Check, X, MessageSquare, Clock, ShieldCheck, TrendingUp, Lightbulb } from "lucide-react";

interface ResultCardProps {
  comment: string;
  sentiment: string;
  reply: string;
  reasoning?: string;
  confidence: number;
  timestamp: string;
  onApprove?: (reply: string) => void;
  onReject?: () => void;
}

export default function ResultCard({
  comment,
  sentiment,
  reply,
  reasoning,
  confidence,
  timestamp,
  onApprove,
  onReject,
}: ResultCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [editedReply, setEditedReply] = useState(reply);
  const [showReasoning, setShowReasoning] = useState(false);

  const sentimentColors = {
    Positive: "bg-green-100 text-green-700 border-green-200",
    Negative: "bg-red-100 text-red-700 border-red-200",
    Neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const handleApprove = async () => {
    setIsApproving(true);
    if (onApprove) {
      onApprove(editedReply);
    }
    setIsApproving(false);
  };

  return (
    <div className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
          <Clock size={14} />
          <span>{new Date(timestamp).toLocaleString('th-TH')}</span>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
          sentimentColors[sentiment as keyof typeof sentimentColors] || sentimentColors.Neutral
        }`}>
          {sentiment}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            <MessageSquare size={14} />
            Customer Review
          </label>
          <div className="p-4 bg-slate-50 rounded-xl text-slate-800 text-sm leading-relaxed whitespace-pre-wrap border border-slate-100 max-h-60 overflow-y-auto">
            {comment}
          </div>
        </div>

        <div className="flex items-center gap-4 py-2 border-y border-slate-50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <TrendingUp size={14} className="text-blue-500" />
            <span>Confidence Score:</span>
            <span className="text-slate-900 font-bold">{(confidence * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <ShieldCheck size={14} className="text-green-500" />
              Draft Response
            </label>
            {reasoning && (
              <button 
                onClick={() => setShowReasoning(!showReasoning)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  showReasoning ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                }`}
              >
                <Lightbulb size={12} />
                {showReasoning ? "ซ่อนวิธีคิด" : "ดูวิธีคิด AI"}
              </button>
            )}
          </div>
          <textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            className="w-full p-4 border border-slate-200 bg-white rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[120px] resize-y"
            placeholder="พิมพ์คำตอบที่ต้องการแก้ไข..."
          />
          
          {showReasoning && reasoning && (
            <div className="mt-3 p-4 bg-amber-50 border border-amber-100 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 mb-2 text-amber-700">
                <Lightbulb size={14} className="fill-amber-200" />
                <span className="text-[10px] font-bold uppercase tracking-wider">กระบวนการคิดของ AI</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                {reasoning}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onReject}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={16} />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-blue-600 disabled:opacity-50 transition-all shadow-lg shadow-slate-200"
          >
            {isApproving ? "Processing..." : (
              <>
                <Check size={16} />
                Approve & Post
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
