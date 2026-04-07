# 🔄 AI Sentiment Demo - Complete Workflow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER COMMENT INPUT                         │
│  (From Wongnai API / Custom Text / Social Media)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              1. SENTIMENT ANALYSIS (Offline)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Keyword Matching: "อร่อย", "ดี", "ชอบ" → POSITIVE      │    │
│  │ Keyword Matching: "แย่", "ไม่ดี" → NEGATIVE            │    │
│  │ Default → NEUTRAL                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Output: sentiment="Positive", confidence=0.95                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         2. RETRIEVE CONTEXT (RAG - Similarity Search)            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Embed Comment → 384D Vector                             │    │
│  │ Search Similar Examples in brand.json                   │    │
│  │ Returns: Top 3 similar review-reply pairs               │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Used to teach AI the brand's reply style                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         3. GENERATE DRAFT REPLY (With Brand Personality)         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Brand Name: "Brew Coffee Co."                           │    │
│  │ Personality: "Warm, friendly, caring"                   │    │
│  │ Tone: "Casual, uses emojis ☕"                          │    │
│  │ Similar Examples: [...]                                 │    │
│  │                                                          │    │
│  │ Generate contextual reply matching brand voice          │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Output: reply="ดีใจมากที่ได้รับคำชมจากคุณนะคะ ☕"            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              4. STAFF APPROVAL DASHBOARD                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Original Comment                                       │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │ เครื่องดื่มเย็นๆ ทำให้สดชื่นมากกก            │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │                                                          │    │
│  │  AI Generated Reply (Editable)                         │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │ ดีใจมากที่ได้รับคำชมจากคุณนะคะ ☕              │  │    │
│  │  │ ไว้แวะมานั่งเล่นอีกนะ                          │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │                                                          │    │
│  │  Status: Positive | Confidence: 95%                    │    │
│  │                                                          │    │
│  │  [💬 Edit Button] [✓ Approve Button]                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Staff can edit before approving                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │          │
                    ▼          ▼
            [✓ APPROVE]  [✗ REJECT]
                    │          │
                    ▼          ▼
    ┌─────────────────────┐  │
    │ 5. SAVE TO DATABASE │  │
    │ approved_replies.json
    │ - comment           │  │
    │ - reply             │  │
    │ - sentiment         │  │
    │ - timestamp         │  │
    │ - status: approved  │  │
    └─────────────────────┘  │
            │                │
            ▼                ▼
    ┌──────────────────────────────┐
    │  6. READY FOR POSTING        │
    │  To: Facebook, Instagram     │
    │       Customer Email         │
    │       Internal Dashboard     │
    └──────────────────────────────┘
```

---

## Data Flow

```
Input Data Sources
├── Wongnai API (/api/reviews)
│   └── 20 restaurant reviews
├── Custom Text Input
│   └── Staff can paste comments
└── Social Media (Future)
    └── Auto-scrape comments

        ▼

Core Processing Pipeline
├── Sentiment Analysis
│   └── Keyword detection (380+ Thai words)
├── RAG (Similarity Matching)
│   └── Vector embeddings (all-MiniLM-L6-v2)
├── Brand Context Injection
│   └── Personality + Tone + Examples
└── Reply Generation
    └── Contextual responses

        ▼

Staff Workflow
├── View Dashboard
├── Review AI Draft
├── Edit if needed ✏️
├── Approve/Reject
└── Save to approved_replies.json

        ▼

Output
├── Approved Replies Archive
├── Post to Social Media
└── Analytics Database
```

---

## Technology Stack

```
Frontend (UI for Staff)
├── Next.js 16 + React 19
├── Tailwind CSS (styling)
└── TypeScript (type safety)

Backend (APIs)
├── Next.js API Routes
├── Node.js runtime
└── Express-like routing

AI/ML
├── Xenova/transformers (embeddings)
│   └── all-MiniLM-L6-v2 (384D vectors)
├── Keyword-based sentiment
└── RAG (Retrieval-Augmented Generation)

Data
├── Local JSON files
│   ├── brand.json (configs)
│   ├── sample_reviews.json (test data)
│   └── approved_replies.json (archive)
└── Wongnai API (external reviews)
```

---

## User Journey

### Scenario: Manage Coffee Shop Reviews

```
1️⃣ Manager opens dashboard
   → http://localhost:3000

2️⃣ System loads reviews from Wongnai
   → "กาแฟหอมมาก บรรยากาศดี ☕"

3️⃣ Manager clicks a review
   → System analyzes sentiment
   → System generates reply with brand personality

4️⃣ Results show up instantly
   Sentiment: ✅ Positive (95%)
   Reply: "ดีใจมากที่ชอบบรรยากาศร้านนะคะ ☕"

5️⃣ Manager reviews draft
   → Can edit if needed
   
6️⃣ Manager clicks "Approve"
   → Saved to database
   
7️⃣ Reply ready to post
   → Copy to Facebook
   → Or auto-post via API (future)

8️⃣ Track metrics
   → Approval rate
   → Response time
   → Sentiment distribution
```

---

## File Organization

```
d:\ai-sentiment-demo\
├── app/
│   ├── api/
│   │   ├── reply/route.ts          ← Sentiment + Reply Generation
│   │   ├── reviews/route.ts        ← Fetch Wongnai dataset
│   │   ├── sentiment/route.ts      ← Quick sentiment check
│   │   └── approve/route.ts        ← Save approved replies
│   ├── components/
│   │   └── ResultCard.tsx          ← Staff approval UI
│   ├── page.tsx                    ← Main dashboard
│   ├── layout.tsx                  ← App shell
│   └── globals.css                 ← Styling
│
├── lib/
│   └── vectorStore.ts              ← RAG + embeddings
│
├── data/
│   ├── brand.json                  ← Brand personality config
│   ├── sample_reviews.json         ← Local test data
│   └── approved_replies.json       ← Saved responses (auto-generated)
│
├── public/                          ← Static assets
│
├── test-api.mjs                    ← API testing script
├── IMPLEMENTATION_GUIDE.md         ← Setup & customization
├── IMPLEMENTATION_SUMMARY.md       ← Quick overview
└── next.config.ts                  ← Next.js config
```

---

## API Endpoints

```
GET /api/reviews
  └── Returns array of reviews from Wongnai
      Status: 200

POST /api/sentiment
  Body: { comment: "string" }
  └── Returns: { sentiment: "Positive|Negative|Neutral" }
      Status: 200

POST /api/reply
  Body: { comment: "string" }
  └── Returns: {
        sentiment: "Positive|Negative|Neutral",
        reply: "string",
        confidence: 0-1,
        status: "pending",
        timestamp: "ISO-8601"
      }
      Status: 200/500

POST /api/approve
  Body: { comment, reply, sentiment }
  └── Returns: { success: true, message: "..." }
      Saves to: data/approved_replies.json
      Status: 200/500
```

---

## Performance Metrics

```
Sentiment Analysis:    ~5ms (keyword matching)
RAG Retrieval:         ~200-500ms (embedding + search)
Reply Generation:      ~50-100ms (template matching)
Total Response Time:   ~300-700ms

Memory Usage:
├── Embedding Model:   ~50MB (all-MiniLM-L6-v2)
├── Brand Data:        <1MB
└── Runtime:           ~100MB (Node.js)

First Load:
├── Model Loading:     ~2-3 seconds
├── Brand Cache:       Cached after first use
└── Subsequent Calls:  ~300-700ms
```

---

## Security Considerations

```
Input Validation:
├── Check comment is string
├── Check length limits
└── Sanitize for SQL injection (if DB added)

Data Privacy:
├── No API keys in frontend
├── Sensitive data in .env.local
└── Approved replies stored locally

Rate Limiting:
└── Add per-user rate limits (future)
```

---

## Future Enhancements

```
Phase 2: Scaling
├── Multi-brand support
├── Database integration (PostgreSQL)
└── User authentication

Phase 3: Better AI
├── Fine-tune sentiment model
├── Upgrade to larger LLM
└── Custom reply templates

Phase 4: Social Integration
├── Auto-post to Facebook
├── Instagram comment replies
└── Email notifications
```

---

**Ready to deploy!** 🚀
