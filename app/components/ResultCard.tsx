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
            <span>Confidence:</span>
            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden inline-block align-middle mx-1 border border-slate-50">
              <div 
                className={`h-full transition-all duration-1000 ${
                  confidence > 0.8 ? "bg-green-500" : confidence > 0.5 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                  showReasoning ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-white text-slate-500 border border-slate-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                <TrendingUp size={12} />
                {showReasoning ? "ซ่อนการวัดผล" : "ดูผลการวิเคราะห์ AI"}
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
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Sentiment Analysis</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${sentiment === "Positive" ? "bg-green-500" : sentiment === "Negative" ? "bg-red-500" : "bg-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-700">{sentiment}</span>
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">AI Confidence</span>
                  <span className={`text-xs font-bold ${confidence > 0.8 ? "text-green-600" : "text-amber-600"}`}>
                    {(confidence * 100).toFixed(1)}% Accuracy
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <Lightbulb size={14} className="text-amber-500 fill-amber-100" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">เหตุผลในการร่างคำตอบ</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium pl-5 border-l-2 border-slate-200 ml-1.5">
                  {reasoning}
                </p>
              </div>
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
