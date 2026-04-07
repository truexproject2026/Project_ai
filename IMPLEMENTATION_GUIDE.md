# 🤖 AI Customer Sentiment & Auto Reply System

ระบบวิเคราะห์ความรู้สึกของลูกค้าและร่างคำตอบอัตโนมัติ ตามบุคลิกของแบรนด์

## 🎯 Workflow

```
Customer Comment 
    ↓
AI Sentiment Analysis + RAG (Retrieval-Augmented Generation)
    ↓
Generate Draft Reply (with Brand Personality)
    ↓
Staff Review & Approval
    ↓
Save to Database
```

## 📁 Project Structure

```
data/
├── brand.json           # Brand personality & examples
├── sample_reviews.json  # Sample dataset for testing
└── approved_replies.json # Saved approved replies

app/
├── api/
│   ├── reply/route.ts     # AI generate reply
│   ├── reviews/route.ts   # Fetch reviews from Wongnai
│   ├── sentiment/route.ts # Sentiment analysis
│   └── approve/route.ts   # Save approved replies
├── components/
│   └── ResultCard.tsx   # Approval UI component
└── page.tsx             # Main dashboard

lib/
└── vectorStore.ts       # Vector embedding & RAG
```

## 🚀 Setup & Run

```bash
# Install dependencies
npm install

# Add environment variables (.env.local)
HF_TOKEN=your_huggingface_token

# Run development server
npm run dev

# Open http://localhost:3000
```

## ⚙️ Configuration

### 1. **Customize Brand Personality**

Edit `data/brand.json`:

```json
{
  "brand": {
    "name": "Your Brand Name",
    "personality": "Your brand personality description",
    "tone": "Speech style and tone",
    "values": ["core values"],
    "examples": [
      {
        "review": "Customer review",
        "reply": "Ideal admin reply"
      }
    ]
  }
}
```

### 2. **Add More Training Examples**

- Add more review-reply pairs in `brand.json` → `examples`
- The system uses vector embeddings (all-MiniLM-L6-v2) to find similar examples
- More diverse examples = Better responses

## 📊 Data Sources

### Option 1: Wongnai Dataset (Built-in)

```typescript
// Fetch from Wongnai via Hugging Face
GET /api/reviews
```

### Option 2: Custom Dataset

**From CSV/JSON:**
```typescript
// Add to sample_reviews.json
// Then import programmatically in /api/reviews
```

**From Social Media:**
1. Copy comments from Facebook/Instagram
2. Paste into the custom input field in UI
3. AI analyzes and suggests reply

**From Kaggle:**
- Search "Thai Sentiment" or "Restaurant Reviews"
- Convert to format: `{ review: "", reply: "" }`
- Add to `brand.json`

## 💾 Approval Workflow

1. **AI Drafts** → `sentiment`, `reply`, `confidence`
2. **Staff Edits** → Can modify reply if needed
3. **Staff Approves** → Saved to `approved_replies.json`
4. **Database Sync** → (Optional) Send to backend

## 🔧 Key Features

### ✅ Sentiment Analysis
- AI-powered using Qwen2-1.5B model
- Returns: Positive, Neutral, Negative
- Includes confidence score

### ✅ Brand-Consistent Replies
- RAG retrieves similar examples
- Uses brand personality in prompt
- Maintains consistent tone

### ✅ Staff Approval System
- Edit draft replies before posting
- Track approval status
- Save audit trail

### ✅ Multi-language Support
- Thai comments ✓
- English comments ✓
- Thai responses ✓

## 🔌 API Endpoints

### POST `/api/reply`
Analyze comment and generate reply

```bash
curl -X POST http://localhost:3000/api/reply \
  -H "Content-Type: application/json" \
  -d '{"comment":"กาแฟอร่อยมากค่ะ"}'
```

Response:
```json
{
  "sentiment": "Positive",
  "reply": "ดีใจมากค่ะที่ชอบกาแฟ...",
  "confidence": 0.95,
  "status": "pending",
  "timestamp": "2024-04-07T10:30:00Z"
}
```

### GET `/api/reviews`
Fetch sample reviews from Wongnai

### POST `/api/approve`
Save approved reply

```bash
curl -X POST http://localhost:3000/api/approve \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "Original comment",
    "reply": "Approved reply",
    "sentiment": "Positive"
  }'
```

## 🧠 How RAG Works

1. **Embedding** 
   - Convert user comment to vector (384-d)
   - Use `Xenova/all-MiniLM-L6-v2` model

2. **Similarity Search**
   - Calculate cosine similarity with training examples
   - Retrieve top 3 most similar comments

3. **Context Injection**
   - Include similar examples in AI prompt
   - AI learns the brand's reply style

4. **Response Generation**
   - Qwen2 generates reply based on learned style
   - Output formatted as JSON

## 📈 Next Steps

### To Improve Results:

1. **Add More Examples** (20-50 per brand)
   - Diverse sentiments
   - Different comment types
   - Various reply scenarios

2. **Collect Real Data**
   ```bash
   # Extract from Wongnai (API endpoint)
   # Extract from Facebook/Instagram scraper
   # Manually curate best examples
   ```

3. **Fine-tune Model** (Optional)
   - Advanced: Train custom sentiment classifier
   - Or use larger model: Qwen2-7B

4. **Database Integration**
   - Replace `approved_replies.json` with PostgreSQL
   - Track metrics: approval rate, response time, etc.

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| AI always returns default reply | Check HF_TOKEN, check model response in console logs |
| Replies don't match brand tone | Add more diverse examples to `brand.json` |
| Slow responses | Model loading takes time on first run; caching improves subsequent runs |
| Thai characters garbled | Ensure UTF-8 encoding in JSON files |

## 📝 Example Usage

```bash
# 1. Start server
npm run dev

# 2. Test with custom comment
# UI: Type "เครื่องดื่มเย็นๆ ทำให้สดชื่น" → Analyze

# 3. Review AI response
# Sentiment: Positive
# Reply: [AI-generated Thai reply]

# 4. Staff approves/edits
# Click "Approve" or edit & then approve

# 5. Saved to approved_replies.json
```

## 📚 Resources

- [all-MiniLM-L6-v2 Embeddings](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [Qwen2 Model](https://huggingface.co/Qwen/Qwen2-1.5B-Instruct)
- [Wongnai Dataset](https://huggingface.co/datasets/iamwarint/wongnai-restaurant-review)
- [Building RAG Systems](https://huggingface.co/docs/transformers/tasks/text_generation)

---

**Questions?** Check console logs for debugging info
