"use client";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Store, 
  MessageSquare, 
  CheckCircle2, 
  Search, 
  Upload, 
  Cpu, 
  RefreshCw, 
  ChevronRight,
  Coffee,
  Soup,
  Fish,
  AlertTriangle,
  History,
  X
} from "lucide-react";
import ResultCard from "./components/ResultCard";

interface Result {
  comment: string;
  sentiment: string;
  reply: string;
  reasoning?: string;
  confidence: number;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  id: string;
  venueId?: string | null;
  venueName?: string | null;
}

interface ReviewSample {
  comment: string;
}

interface VenueOption {
  id: string;
  name: string;
  area: string;
  tagline: string;
  personality: string;
  tone: string;
  approxReviewCount: number;
}

export default function Home() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venuesMeta, setVenuesMeta] = useState<{
    totalTrainRows: number | null;
    source: string;
    partitionNote: string;
  }>({
    totalTrainRows: null,
    source: "",
    partitionNote: "",
  });
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const selectedVenue = venues.find((v) => v.id === selectedVenueId) ?? null;

  const [reviews, setReviews] = useState<ReviewSample[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [customComment, setCustomComment] = useState("");
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
  const [showWarning, setShowWarning] = useState(false);
  const [pendingComment, setPendingComment] = useState<string>("");
  const [processingComment, setProcessingComment] = useState<string | null>(null);
  const pageSize = 10;
  const [reviewCursor, setReviewCursor] = useState(0);
  const [nextReviewCursor, setNextReviewCursor] = useState(0);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewSource, setReviewSource] = useState<"huggingface" | "custom">("huggingface");
  const [reviewNote, setReviewNote] = useState("");

  // Training Data States
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [trainingExamples, setTrainingExamples] = useState<{ review: string; reply: string }[]>([]);
  const [newTrainingReview, setNewTrainingReview] = useState("");
  const [newTrainingReply, setNewTrainingReply] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetch("/api/brand-profiles")
      .then((r) => r.json())
      .then(
        (data: {
          venues?: VenueOption[];
          totalTrainRows?: number | null;
          partitionNote?: string;
          source?: string;
        }) => {
          setVenues(data.venues ?? []);
          setVenuesMeta({
            totalTrainRows: data.totalTrainRows ?? null,
            partitionNote: data.partitionNote ?? "",
            source: data.source ?? "",
          });
        }
      )
      .catch((error) => {
        console.error("Error fetching venues:", error);
      });
  }, []);

  useEffect(() => {
    if (!selectedVenueId && reviewSource === "huggingface") return;
    setReviewsLoading(true);
    const url = reviewSource === "custom" 
      ? `/api/dataset-manager?source=custom&cursor=${reviewCursor}&pageSize=${pageSize}`
      : `/api/dataset-manager?venueId=${selectedVenueId}&cursor=${reviewCursor}&pageSize=${pageSize}`;
      
    fetch(url)
      .then((r) => r.json())
      .then(
        (data: {
          reviews: ReviewSample[];
          nextCursor: number;
          done: boolean;
          source: string;
          note?: string;
          error?: string;
        }) => {
          if (data.error) {
            setReviews([]);
            setReviewNote(data.error);
            setReviewDone(true);
            return;
          }
          setReviews(data.reviews ?? []);
          setReviewDone(Boolean(data.done));
          setNextReviewCursor(typeof data.nextCursor === "number" ? data.nextCursor : 0);
          setReviewSource(data.source === "custom-file" ? "custom" : "huggingface");
          setReviewNote(typeof data.note === "string" ? data.note : "");
        }
      )
      .catch((error) => {
        console.error("Error fetching reviews:", error);
        setReviews([]);
        setReviewDone(false);
      })
      .finally(() => setReviewsLoading(false));
  }, [selectedVenueId, reviewCursor, reviewSource]);

  useEffect(() => {
    if (showTrainingModal) {
      fetchTrainingData();
    }
  }, [showTrainingModal]);

  const fetchTrainingData = async () => {
    if (!selectedVenueId) return;
    try {
      const res = await fetch(`/api/knowledge-base?venueId=${selectedVenueId}`);
      const data = await res.json();
      setTrainingExamples(data);
    } catch (error) {
      console.error("Error fetching training data:", error);
    }
  };

  const addTrainingExample = async () => {
    if (!newTrainingReview.trim() || !newTrainingReply.trim() || !selectedVenueId) return;
    try {
      const res = await fetch("/api/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          venueId: selectedVenueId,
          review: newTrainingReview, 
          reply: newTrainingReply 
        }),
      });
      if (res.ok) {
        setNewTrainingReview("");
        setNewTrainingReply("");
        fetchTrainingData();
      }
    } catch (error) {
      console.error("Error adding training data:", error);
    }
  };

  const deleteTrainingExample = async (index: number) => {
    if (!selectedVenueId) return;
    try {
      const res = await fetch("/api/knowledge-base", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: selectedVenueId, index }),
      });
      if (res.ok) {
        fetchTrainingData();
      }
    } catch (error) {
      console.error("Error deleting training data:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/dataset-manager/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setReviewSource("custom");
        setReviewCursor(0);
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("ไม่สามารถอัปโหลดไฟล์ได้");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const hasPendingApprovals = results.some(r => r.status === "pending");

  function selectVenue(id: string) {
    setSelectedVenueId(id);
    setReviewCursor(0);
    setNextReviewCursor(0);
    setReviewNote("");
    setResults([]);
    setSelectedComments(new Set());
  }

  function changeVenue() {
    setSelectedVenueId(null);
    setReviewCursor(0);
    setNextReviewCursor(0);
    setReviewNote("");
    setReviews([]);
    setResults([]);
    setSelectedComments(new Set());
  }

  async function analyze(text: string) {
    if (!text.trim() || !selectedVenueId) return;

    const existing = results.find(r => r.comment === text);
    if (existing) {
      setSelectedComments(prev => new Set([...prev, existing.id]));
      return;
    }

    setLoading(true);
    setProcessingComment(text);
    try {
      const res = await fetch("/api/auto-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text, venueId: selectedVenueId }),
      });

      const data = await res.json();
      const newResult: Result = {
        comment: text,
        ...data,
        reasoning: data.reasoning,
        status: "pending",
        id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
        venueId: data.venueId ?? selectedVenueId,
        venueName: (data.venueName as string | null | undefined) ?? selectedVenue?.name ?? null,
      };

      setResults(prev => [newResult, ...prev]);
      setSelectedComments(prev => new Set([...prev, newResult.id]));
    } catch (error) {
      console.error("Error analyzing comment:", error);
    } finally {
      setLoading(false);
      setProcessingComment(null);
      setCustomComment("");
    }
  }

  const handleCommentSelect = (comment: string) => {
    const existing = results.find(r => r.comment === comment);
    if (existing) {
      if (hasPendingApprovals && !selectedComments.has(existing.id)) {
        setPendingComment(comment);
        setShowWarning(true);
        return;
      }
      setSelectedComments(prev => new Set([...prev, existing.id]));
      return;
    }

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

    const approvedId = updated[index].id;
    setSelectedComments(prev => {
      const newSet = new Set(prev);
      newSet.delete(approvedId);
      return newSet;
    });
  };

  const handleReject = (index: number) => {
    const updated = [...results];
    updated[index].status = "rejected";
    setResults(updated);

    const rejectedId = updated[index].id;
    setSelectedComments(prev => {
      const newSet = new Set(prev);
      newSet.delete(rejectedId);
      return newSet;
    });
  };

  if (!selectedVenueId || !selectedVenue) {
    return (
      <main className="min-h-screen p-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <h1 className="text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              AI Customer Sentiment & Auto-Reply
            </h1>
            <p className="text-slate-500 max-w-2xl mx-auto text-lg">
              เลือกแบรนด์ที่คุณต้องการจัดการเพื่อเริ่มต้นวิเคราะห์ความรู้สึกและร่างคำตอบอัตโนมัติ
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {venues.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVenue(v.id)}
                className="group relative bg-white rounded-[2.5rem] p-2 overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-slate-100"
              >
                <div className="aspect-[4/3] rounded-[2rem] overflow-hidden mb-6 relative">
                  <img 
                    src={
                      v.id === 'common-room' ? 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=800' : 
                      v.id === 'hom-duan' ? 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=800' : 
                      'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=800'
                    } 
                    alt={v.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                  <div className="absolute bottom-4 left-6">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white border border-white/30">
                      {v.id === "common-room" ? <Coffee size={12}/> : v.id === "hom-duan" ? <Soup size={12}/> : <Fish size={12}/>}
                      {v.id === "common-room" ? "คาเฟ่" : v.id === "hom-duan" ? "อาหารเหนือ" : "อาหารทะเล"}
                    </span>
                  </div>
                </div>
                
                <div className="px-6 pb-6 text-left">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{v.name}</h2>
                  <p className="text-sm text-slate-500 mb-4 font-medium">{v.area}</p>
                  <p className="text-sm text-slate-700 leading-relaxed mb-6 line-clamp-2">{v.tagline}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex -space-x-2">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-400">
                          {i}
                        </div>
                      ))}
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 group-hover:gap-4 transition-all">
                      จัดการแบรนด์นี้ <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {venues.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="animate-spin text-blue-500 mb-4" size={40} />
              <p className="text-slate-500 font-medium">กำลังเตรียมข้อมูลระบบ...</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-[60] bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2 rounded-xl">
              <LayoutDashboard className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 leading-none mb-1">Response Intel</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">แดชบอร์ดจัดการ {selectedVenue.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTrainingModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
            >
              <Cpu size={16} />
              สอนงาน AI
            </button>
            <button
              onClick={changeVenue}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-white transition-colors"
            >
              เปลี่ยนแบรนด์
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Venue Info Header */}
          <div className="bg-white rounded-[2rem] p-8 mb-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-3xl overflow-hidden bg-slate-100 shrink-0">
                <img 
                  src={
                    selectedVenue.id === 'common-room' ? 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=200' : 
                    selectedVenue.id === 'hom-duan' ? 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=200' : 
                    'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=200'
                  } 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                  <Store size={10} /> แบรนด์ที่กำลังใช้งาน
                </span>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-1">{selectedVenue.name}</h2>
                <p className="text-slate-500 font-medium text-sm">{selectedVenue.area} • {selectedVenue.tagline}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">บุคลิกแบรนด์</p>
                <p className="text-sm text-slate-900 font-bold">{selectedVenue.personality}</p>
              </div>
              <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">โทนการตอบ</p>
                <p className="text-sm text-slate-900 font-bold">{selectedVenue.tone}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Review Explorer */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-slate-400" />
                    <h2 className="font-extrabold text-slate-900">สำรวจรีวิว</h2>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setReviewSource("huggingface")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${reviewSource === "huggingface" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}
                    >
                      ทั่วไป
                    </button>
                    <button
                      onClick={() => setReviewSource("custom")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${reviewSource === "custom" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}
                    >
                      ไฟล์นำเข้า
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {/* Upload Section */}
                  {reviewSource === "custom" && (
                    <div className="mb-6">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload size={24} className="text-slate-400 group-hover:text-blue-500 mb-2 transition-colors" />
                          <p className="text-xs font-bold text-slate-500 group-hover:text-blue-600">
                            {isUploading ? "กำลังนำเข้าข้อมูล..." : "นำเข้า CSV / JSON"}
                          </p>
                        </div>
                        <input type="file" accept=".csv,.json" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                      </label>
                    </div>
                  )}

                  {/* Manual Analysis */}
                  <div className="mb-6">
                    <div className="relative group">
                      <textarea
                        placeholder="พิมพ์หรือวางรีวิวเพื่อวิเคราะห์..."
                        value={customComment}
                        onChange={(e) => setCustomComment(e.target.value)}
                        className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 transition-all resize-none h-24"
                      />
                      <button
                        onClick={() => handleCommentSelect(customComment)}
                        disabled={loading || !customComment.trim()}
                        className="absolute bottom-3 right-3 p-2 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-30"
                      >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Review List */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {reviewsLoading ? (
                      <div className="py-10 text-center"><RefreshCw className="animate-spin mx-auto text-slate-300" /></div>
                    ) : reviews.length === 0 ? (
                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                        <AlertTriangle size={20} className="mx-auto text-amber-500 mb-2" />
                        <p className="text-[10px] font-bold text-amber-700 uppercase">ไม่มีข้อมูลรีวิว</p>
                      </div>
                    ) : reviews.map((r, i) => {
                      const isAnalyzed = results.some(res => res.comment === r.comment);
                      const isSelected = results.some(res => res.comment === r.comment && selectedComments.has(res.id));
                      const isProcessing = processingComment === r.comment;

                      return (
                        <button
                          key={i}
                          onClick={() => handleCommentSelect(r.comment)}
                          disabled={loading && !isProcessing}
                          className={`w-full text-left p-4 rounded-2xl transition-all border group relative ${
                            isSelected 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100" 
                              : isAnalyzed 
                                ? "bg-slate-50 border-slate-100 text-slate-400" 
                                : isProcessing
                                  ? "bg-blue-50 border-blue-200 text-blue-700"
                                  : "bg-white border-slate-100 text-slate-700 hover:border-blue-300 hover:shadow-sm"
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs leading-relaxed line-clamp-2 flex-1 ${isSelected ? "font-bold" : "font-medium"}`}>
                              {r.comment}
                            </p>
                            {isProcessing && (
                              <RefreshCw size={14} className="animate-spin shrink-0 text-blue-600 mt-0.5" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setReviewCursor(nextReviewCursor)}
                    disabled={reviewDone || reviewsLoading}
                    className="flex items-center gap-2 text-[10px] font-extrabold text-blue-600 uppercase tracking-widest hover:gap-3 transition-all disabled:opacity-30"
                  >
                    โหลดเพิ่มเติม <ChevronRight size={14} />
                  </button>
                  <span className="text-[9px] font-bold text-slate-400">ลำดับ: {reviewCursor}</span>
                </div>
              </div>
            </div>

            {/* Right: Work Area */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm min-h-[600px] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-green-500" />
                    <h2 className="font-extrabold text-slate-900">รายการรอตอบ</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      รอนุมัติ: {results.filter(r => r.status === "pending").length}
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6">
                  {results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-100 flex items-center justify-center">
                        <MessageSquare size={32} />
                      </div>
                      <p className="font-bold uppercase text-xs tracking-widest text-center">เลือกคอมเมนต์ฝั่งซ้าย<br/>เพื่อเริ่มวิเคราะห์</p>
                    </div>
                  ) : (
                    <div className="space-y-6 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                      {results.map((result, idx) => {
                        const isSelected = selectedComments.has(result.id);
                        if (!isSelected && result.status === "pending") return null;

                        return (
                          <div key={result.id} className="relative">
                            {result.status !== "pending" && (
                              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-slate-200" />
                            )}
                            {result.status === "pending" ? (
                              <ResultCard
                                comment={result.comment}
                                sentiment={result.sentiment}
                                reply={result.reply}
                                reasoning={result.reasoning}
                                confidence={result.confidence}
                                timestamp={result.timestamp}
                                onApprove={(reply) => handleApprove(idx, reply)}
                                onReject={() => handleReject(idx)}
                              />
                            ) : (
                              <div className={`p-6 rounded-[2rem] border border-slate-100 ${result.status === 'approved' ? 'bg-green-50/30' : 'bg-slate-50/50 opacity-60'}`}>
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <History size={14} className="text-slate-400" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      {result.status === 'approved' ? 'อนุมัติและส่งแล้ว' : 'ปฏิเสธแล้ว'}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400">{new Date(result.timestamp).toLocaleTimeString('th-TH')}</span>
                                </div>
                                <p className="text-sm text-slate-900 font-bold mb-2 leading-relaxed whitespace-pre-wrap">{result.comment}</p>
                                {result.status === 'approved' && (
                                  <div className="pl-4 border-l-2 border-green-200">
                                    <p className="text-sm text-slate-600 italic">"{result.reply}"</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Dialog */}
      {showWarning && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} className="text-amber-500" />
            </div>
            <h3 className="text-2xl font-extrabold text-slate-900 text-center mb-2">คำเตือน</h3>
            <p className="text-slate-500 text-center mb-8 leading-relaxed">
              คุณมีคำตอบที่ร่างไว้และยังไม่ได้บันทึก การวิเคราะห์ข้อความใหม่จะทำให้คำตอบเดิมถูกจัดเก็บไว้ด้านล่าง ต้องการดำเนินการต่อหรือไม่?
            </p>
            <div className="flex gap-4">
              <button onClick={cancelSelection} className="flex-1 px-6 py-3 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all">
                ยกเลิก
              </button>
              <button onClick={confirmSelection} className="flex-1 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-slate-200">
                ดำเนินการต่อ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Training Data Modal */}
      {showTrainingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-3 rounded-2xl text-white">
                  <Cpu size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">คลังความรู้: {selectedVenue.name}</h2>
                  <p className="text-sm text-slate-500 font-medium">สอน AI ให้เรียนรู้โทนเสียงและรูปแบบการตอบของแบรนด์คุณ</p>
                </div>
              </div>
              <button onClick={() => setShowTrainingModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Form Side */}
              <div className="lg:w-1/2 p-8 border-r border-slate-50 overflow-y-auto">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">เพิ่มตัวอย่างใหม่</h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">คอมเมนต์ตัวอย่าง</label>
                    <textarea 
                      value={newTrainingReview}
                      onChange={(e) => setNewTrainingReview(e.target.value)}
                      placeholder="เช่น: อาหารอร่อยมากครับ"
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm text-slate-900 outline-none ring-1 ring-slate-100 focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">คำตอบที่ต้องการ</label>
                    <textarea 
                      value={newTrainingReply}
                      onChange={(e) => setNewTrainingReply(e.target.value)}
                      placeholder="เช่น: ขอบคุณมากนะคะคุณลูกค้า ✨"
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm text-slate-900 outline-none ring-1 ring-slate-100 focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
                    />
                  </div>
                  <button 
                    onClick={addTrainingExample}
                    disabled={!newTrainingReview.trim() || !newTrainingReply.trim()}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-blue-600 disabled:opacity-30 transition-all shadow-xl shadow-slate-200"
                  >
                    บันทึกตัวอย่าง
                  </button>
                </div>
              </div>

              {/* List Side */}
              <div className="lg:w-1/2 p-8 bg-slate-50/50 overflow-y-auto">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                  ความรู้ปัจจุบัน <span>{trainingExamples.length} คู่ตัวอย่าง</span>
                </h3>
                <div className="space-y-4">
                  {trainingExamples.map((ex, idx) => (
                    <div key={idx} className="group bg-white p-5 rounded-3xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all relative">
                      <div className="pr-10">
                        <p className="text-[10px] font-bold text-blue-500 uppercase mb-2">รีวิว</p>
                        <p className="text-sm text-slate-800 font-bold mb-4 whitespace-pre-wrap">{ex.review}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">คำตอบแอดมิน</p>
                        <p className="text-sm text-slate-600 italic">"{ex.reply}"</p>
                      </div>
                      <button 
                        onClick={() => deleteTrainingExample(idx)}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-50 flex justify-end">
              <button onClick={() => setShowTrainingModal(false)} className="px-8 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-slate-50 transition-all">
                ปิดคลังความรู้
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </main>
  );
}
