# Metrics Report (Round 3.1)

- Train/Test split: 36/9
- Sentiment accuracy: 66.67%
- Aspect accuracy: 100.00%
- Macro F1: 65.00%
- Avg reply quality (0-3): 2.89

## Per-label (Precision/Recall/F1)

```json
{
  "positive": {
    "precision": 0.6,
    "recall": 1,
    "f1": 0.75
  },
  "neutral": {
    "precision": 0.5,
    "recall": 0.3333,
    "f1": 0.4
  },
  "negative": {
    "precision": 1,
    "recall": 0.6667,
    "f1": 0.8
  }
}
```

## Confusion Matrix (label -> predicted)

```json
{
  "positive": {
    "positive": 3,
    "neutral": 0,
    "negative": 0
  },
  "neutral": {
    "positive": 2,
    "neutral": 1,
    "negative": 0
  },
  "negative": {
    "positive": 0,
    "neutral": 1,
    "negative": 2
  }
}
```
