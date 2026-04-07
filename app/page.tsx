"use client";
import { useEffect, useState } from "react";
import ResultCard from "./components/ResultCard";

interface Result {
  comment: string;
  sentiment: string;
  reply: string;
  confidence: number;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  id: string;
}

interface ReviewSample {
  comment: string;
}

export default function Home() {
  const [reviews, setReviews] = useState<ReviewSample[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [customComment, setCustomComment] = useState("");
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
  const [showWarning, setShowWarning] = useState(false);
  const [pendingComment, setPendingComment] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [totalPages, setTotalPages] = useState(1);
  const [totalReviews, setTotalReviews] = useState(0);
  const [reviewSource, setReviewSource] = useState("huggingface");

  useEffect(() => {
    fetch(`/api/reviews?page=${currentPage}&pageSize=${pageSize}`)
      .then((r) => r.json())
      .then(
        (data: {
          reviews: ReviewSample[];
          totalPages: number;
          total: number;
          source: string;
        }) => {
          setReviews(data.reviews ?? []);
          setTotalPages(data.totalPages ?? 1);
          setTotalReviews(data.total ?? 0);
          setReviewSource(data.source ?? "huggingface");
        }
      );
  }, [currentPage]);

  const hasPendingApprovals = results.some(r => r.status === "pending");

  async function analyze(text: string) {
    if (!text.trim()) return;

    // Check if already analyzed
    const existing = results.find(r => r.comment === text);
    if (existing) {
      // If already exists, just select it
      setSelectedComments(prev => new Set([...prev, existing.id]));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text }),
      });

      const data = await res.json();
      const newResult: Result = {
        comment: text,
        ...data,
        status: "pending",
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
      };

      setResults(prev => [newResult, ...prev]);
      setSelectedComments(prev => new Set([...prev, newResult.id]));
    } catch (error) {
      console.error("Error analyzing comment:", error);
    } finally {
      setLoading(false);
      setCustomComment("");
    }
  }

  const handleCommentSelect = (comment: string) => {
    // Check if already analyzed
    const existing = results.find(r => r.comment === comment);
    if (existing) {
      // If already exists, just select it
      if (hasPendingApprovals && !selectedComments.has(existing.id)) {
        setPendingComment(comment);
        setShowWarning(true);
        return;
      }
      setSelectedComments(prev => new Set([...prev, existing.id]));
      return;
    }

    // If no pending approvals or user confirmed, proceed with analysis
    if (hasPendingApprovals) {
      setPendingComment(comment);
      setShowWarning(true);
      return;
    }

    analyze(comment);
  };

  const confirmSelection = () => {
    if (pendingComment) {
      analyze(pendingComment);
      setPendingComment("");
    }
    setShowWarning(false);
  };

  const cancelSelection = () => {
    setPendingComment("");
    setShowWarning(false);
  };

  const handleApprove = (index: number, approvedReply: string) => {
    const updated = [...results];
    updated[index].status = "approved";
    updated[index].reply = approvedReply;
    setResults(updated);

    // Remove from selected if approved
    const approvedId = updated[index].id;
    setSelectedComments(prev => {
      const newSet = new Set(prev);
      newSet.delete(approvedId);
      return newSet;
    });

    // Optional: Save to database
    console.log("Approved:", { comment: updated[index].comment, reply: approvedReply });
  };

  const handleReject = (index: number) => {
    const updated = [...results];
    updated[index].status = "rejected";
    setResults(updated);

    // Remove from selected if rejected
    const rejectedId = updated[index].id;
    setSelectedComments(prev => {
      const newSet = new Set(prev);
      newSet.delete(rejectedId);
      return newSet;
    });
  };

  return (
    <main className="min-h-screen p-8 bg-[radial-gradient(circle_at_15%_20%,#dbeafe_0%,transparent_38%),radial-gradient(circle_at_85%_10%,#e0f2fe_0%,transparent_34%),radial-gradient(circle_at_50%_100%,#bfdbfe_0%,transparent_36%),linear-gradient(135deg,#ffffff_0%,#eff6ff_48%,#dbeafe_100%)]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            AI Customer Sentiment & Auto Reply
          </h1>
          <p className="text-slate-600">Smart moderation dashboard with human approval workflow</p>
        </div>

        {/* Warning Dialog */}
        {showWarning && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card rounded-2xl p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold mb-4">⚠️ มีการร่างคำตอบที่ยังไม่ได้อนุมัติ</h3>
              <p className="text-gray-600 mb-6">
                คุณมีคำตอบที่ร่างไว้ {results.filter(r => r.status === "pending").length} รายการที่ยังไม่ได้อนุมัติ
                ต้องการเลือกคอมเมนต์ใหม่หรือไม่?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelSelection}
                  className="px-4 py-2 border border-white/40 rounded-lg hover:bg-white/40"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmSelection}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  เลือกคอมเมนต์ใหม่
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Review List */}
          <div className="lg:col-span-1">
            <div className="glass-card rounded-2xl shadow-xl p-4">
              <h2 className="text-xl font-bold text-slate-900 mb-4">📋 Customer Reviews</h2>

              {/* Status Indicator */}
              {hasPendingApprovals && (
                <div className="mb-4 p-3 bg-blue-50/80 border border-blue-200/70 rounded-xl">
                  <p className="text-sm text-blue-800">
                    ⚠️ มี {results.filter(r => r.status === "pending").length} คำตอบที่รอการอนุมัติ
                  </p>
                </div>
              )}

              {/* Custom Input */}
              <div className="mb-4 p-3 bg-white/40 border border-white/50 rounded-xl">
                <textarea
                  placeholder="พิมพ์คอมเมนต์ที่ต้องการวิเคราะห์..."
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  className="w-full p-3 border border-slate-300 bg-white rounded-lg text-sm text-slate-900 placeholder:text-slate-500 mb-2 outline-none focus:ring-2 focus:ring-blue-300"
                  rows={4}
                />
                <button
                  onClick={() => handleCommentSelect(customComment)}
                  disabled={loading || !customComment.trim()}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์"}
                </button>
              </div>

              {/* Review Samples */}
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {reviews.map((r, i) => {
                  const isAnalyzed = results.some(result => result.comment === r.comment);
                  const isSelected = results.some(result =>
                    result.comment === r.comment && selectedComments.has(result.id)
                  );

                  return (
                    <button
                      key={`${currentPage}-${i}-${r.comment.slice(0, 12)}`}
                      onClick={() => handleCommentSelect(r.comment)}
                      disabled={loading}
                      className={`w-full text-left p-3 border rounded transition text-sm ${
                        isAnalyzed
                          ? isSelected
                            ? "bg-blue-100/80 border-blue-300"
                            : "bg-white/60 border-white/50"
                          : "bg-white/60 border-white/50 hover:bg-white/80"
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                          isAnalyzed
                            ? isSelected
                              ? "bg-blue-500"
                              : "bg-blue-400"
                            : "bg-gray-300"
                        }`} />
                        <div className="flex-1">
                          <p className="line-clamp-3 text-slate-700">{r.comment}</p>
                          {isAnalyzed && (
                            <p className="text-xs text-gray-500 mt-1">
                              {isSelected ? "กำลังดำเนินการ" : "วิเคราะห์แล้ว"}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                แหล่งข้อมูล: {reviewSource} • ทั้งหมดประมาณ {totalReviews.toLocaleString()} รีวิว
              </p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-white/50 bg-white/60 hover:bg-white/80 disabled:opacity-40"
                >
                  ← ก่อนหน้า
                </button>
                <span className="text-slate-600">
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-white/50 bg-white/60 hover:bg-white/80 disabled:opacity-40"
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          </div>

          {/* Right: Results & Approval */}
          <div className="lg:col-span-2">
            <div className="glass-card rounded-2xl shadow-xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900">✅ รอการอนุมัติ</h2>
                <div className="flex gap-2 text-sm">
                  <span className="text-blue-700">
                    {selectedComments.size} เลือก
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="text-blue-500">
                    {results.filter((r) => r.status === "pending").length} รอ
                  </span>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>📧 เลือกคอมเมนต์หรือพิมพ์คอมเมนต์ที่ต้องการวิเคราะห์</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[700px] overflow-y-auto">
                  {results.map((result, idx) => {
                    const isSelected = selectedComments.has(result.id);

                    return (
                      <div
                        key={result.id}
                        className={`border rounded-lg transition-all ${
                          isSelected
                            ? "border-blue-300 bg-blue-50/80 shadow-md"
                            : result.status === "approved"
                            ? "border-green-300 bg-green-50"
                            : result.status === "rejected"
                            ? "border-red-300 bg-red-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-3 h-3 rounded-full ${
                              result.status === "approved"
                                ? "bg-green-500"
                                : result.status === "rejected"
                                ? "bg-red-500"
                                : isSelected
                                ? "bg-blue-500"
                                : "bg-gray-400"
                            }`} />
                            <span className={`text-sm font-medium ${
                              result.status === "approved"
                                ? "text-green-700"
                                : result.status === "rejected"
                                ? "text-red-700"
                                : isSelected
                                ? "text-blue-700"
                                : "text-gray-600"
                            }`}>
                              {result.status === "approved"
                                ? "อนุมัติแล้ว"
                                : result.status === "rejected"
                                ? "ปฏิเสธแล้ว"
                                : isSelected
                                ? "กำลังดำเนินการ"
                                : "รอการอนุมัติ"}
                            </span>
                            <span className="text-xs text-gray-500 ml-auto">
                              {new Date(result.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          {result.status === "pending" && isSelected ? (
                            <ResultCard
                              comment={result.comment}
                              sentiment={result.sentiment}
                              reply={result.reply}
                              confidence={result.confidence}
                              timestamp={result.timestamp}
                              onApprove={(reply) => handleApprove(idx, reply)}
                              onReject={() => handleReject(idx)}
                            />
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 mb-1">คอมเมนต์:</p>
                              <p className="text-sm text-slate-800 bg-white p-2 rounded border border-slate-200">
                                  {result.comment}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-1">ความรู้สึก:</p>
                                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                    result.sentiment === "Positive"
                                      ? "bg-green-100 text-green-800"
                                      : result.sentiment === "Negative"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}>
                                    {result.sentiment}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-1">ความมั่นใจ:</p>
                                  <span className="text-sm text-gray-600">
                                    {(result.confidence * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                              {result.status !== "rejected" && (
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-1">คำตอบ:</p>
                                  <p className="text-sm text-slate-800 bg-white p-2 rounded border border-slate-200">
                                    {result.reply}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}