# ML Models Specification for ClaimPilot AI

## Overview
This document specifies the 3 ML models needed to complete the ClaimPilot AI fraud detection system.

---

## Model 1: Fraud Detection Engine
**Purpose:** Detect inconsistencies between drivers' statements, photos, and reported impact zones

### Input Schema
```json
{
  "session_id": "CASE-ABC123",
  "driver_a": {
    "statement": "J'ai freiné mais الطريق كانت مبللة...",
    "statement_slots": {
      "impact_direction": "front",
      "movement": "braking",
      "fault_claim": "self"
    },
    "impact_zone": "front",
    "photos": [
      {
        "side": "front",
        "severity": "moderate",
        "damage_ratio": 0.15
      }
    ],
    "circumstances": ["7", "16"]
  },
  "driver_b": {
    "statement": "He hit me from behind",
    "statement_slots": {
      "impact_direction": "rear",
      "movement": "stopped",
      "fault_claim": "other"
    },
    "impact_zone": "rear",
    "photos": [
      {
        "side": "rear",
        "severity": "minor",
        "damage_ratio": 0.08
      }
    ],
    "circumstances": ["1"]
  }
}
```

### Output Schema
```json
{
  "fraud_score": 0.73,
  "confidence": 0.89,
  "verdict": "review_required",
  "flags": [
    {
      "type": "impact_mismatch",
      "severity": "high",
      "detail": "Driver A says 'front' but photos show rear damage",
      "confidence": 0.91
    },
    {
      "type": "statement_conflict",
      "severity": "medium",
      "detail": "Both drivers claim the other was at fault",
      "confidence": 0.78
    }
  ],
  "recommendations": [
    "Request additional photos from Driver A",
    "Schedule adjuster inspection"
  ]
}
```

### Fraud Patterns to Detect
1. **Impact Direction Mismatch**
   - Statement says "rear" but photos show front damage
   - Impact zone marked doesn't match photo damage location

2. **Severity Mismatch**
   - Statement describes "minor scratch" but photos show severe damage
   - Or vice versa (exaggerating damage)

3. **Story Contradictions**
   - Both drivers say they were stationary
   - Both claim right-of-way
   - Timelines don't align

4. **Photo Inconsistencies**
   - Old damage mixed with new (different lighting, rust, dirt)
   - Stock photos (reverse image search)
   - Edited/manipulated images

5. **Circumstance Conflicts**
   - Driver A checks "parking" but Driver B checks "highway speed"
   - Geographic impossibilities

### Recommended Approach
```python
# Hybrid Model Architecture

class FraudDetectionEngine:
    def __init__(self):
        # 1. NLP model for statement analysis
        self.nlp_model = load_bert_multilingual()
        
        # 2. Vision model for photo verification
        self.vision_model = load_resnet50()
        
        # 3. Rule-based logic checker
        self.rule_engine = RuleEngine()
        
    def detect(self, session_data):
        # Extract features
        statement_features = self.analyze_statements(
            session_data['driver_a']['statement'],
            session_data['driver_b']['statement']
        )
        
        photo_features = self.analyze_photos(
            session_data['driver_a']['photos'],
            session_data['driver_b']['photos']
        )
        
        # Apply rules
        rule_flags = self.rule_engine.check(session_data)
        
        # Combine scores
        fraud_score = self.combine_scores(
            statement_features,
            photo_features,
            rule_flags
        )
        
        return fraud_score, rule_flags
```

### Training Data Needed
- **Real fraud cases:** 5000+ labeled examples
- **Genuine claims:** 20000+ examples
- **Synthetic fraud:** Generate mismatched data programmatically

**Synthetic Data Generation:**
```python
# Example: Generate mismatch scenarios
for real_case in genuine_claims:
    # Fraud variant 1: Swap impact zones
    fraud_case_1 = real_case.copy()
    fraud_case_1['driver_a']['impact_zone'] = swap_direction(real_case['driver_a']['impact_zone'])
    fraud_case_1['label'] = 'fraud'
    
    # Fraud variant 2: Exaggerate severity
    fraud_case_2 = real_case.copy()
    fraud_case_2['driver_a']['statement'] = exaggerate_damage(real_case['driver_a']['statement'])
    fraud_case_2['label'] = 'fraud'
```

### Evaluation Metrics
- **Precision:** 85%+ (minimize false positives)
- **Recall:** 90%+ (catch most fraud)
- **F1-Score:** 87%+
- **False Positive Rate:** <10% (important - don't flag genuine claims)

---

## Model 2: Car Damage Recognition
**Purpose:** Identify damaged parts and classify severity from photos

### Input
- Single photo (JPG/PNG)
- Max size: 5MB
- Recommended resolution: 1024x1024

### Output Schema
```json
{
  "parts_damaged": [
    {
      "part": "front_bumper",
      "confidence": 0.94,
      "bounding_box": [120, 300, 450, 500]
    },
    {
      "part": "hood",
      "confidence": 0.87,
      "bounding_box": [200, 150, 600, 350]
    }
  ],
  "severity": "moderate",
  "severity_confidence": 0.91,
  "damage_ratio": 0.18,
  "estimated_parts_count": 2
}
```

### Part Categories
```python
PARTS = [
    'front_bumper', 'rear_bumper',
    'hood', 'trunk',
    'front_left_door', 'front_right_door',
    'rear_left_door', 'rear_right_door',
    'front_left_fender', 'front_right_fender',
    'rear_left_fender', 'rear_right_fender',
    'headlight_left', 'headlight_right',
    'taillight_left', 'taillight_right',
    'side_mirror_left', 'side_mirror_right',
    'windshield', 'rear_window',
    'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
    'roof', 'pillar'
]

SEVERITY_LEVELS = ['minor', 'moderate', 'severe']
```

### Recommended Architecture
```python
# YOLOv8 or Faster R-CNN for object detection

from ultralytics import YOLO

model = YOLO('yolov8n.pt')  # Start with pretrained COCO weights

# Fine-tune on car damage dataset
model.train(
    data='car_damage.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0
)

# Inference
results = model.predict('damage_photo.jpg')
for result in results:
    boxes = result.boxes
    for box in boxes:
        cls = box.cls  # class ID
        conf = box.conf  # confidence
        xyxy = box.xyxy  # bounding box
```

### Datasets to Use
1. **CarDD (Primary):** https://www.kaggle.com/datasets/anujms/car-damage-detection
   - 1000+ images
   - Annotated for damage/no damage
   
2. **Car Damage Classification:** https://www.kaggle.com/datasets/lplenka/car-damage-det-part-segmentation
   - 900+ images
   - Part segmentation labels

3. **Augment with:**
   - ImageNet pretrained weights
   - COCO car images
   - Synthetic damage (overlay scratches, dents)

### Data Augmentation
```python
import albumentations as A

transform = A.Compose([
    A.HorizontalFlip(p=0.5),
    A.RandomBrightnessContrast(p=0.3),
    A.GaussianBlur(p=0.2),
    A.HueSaturationValue(p=0.3),
    A.Rotate(limit=15, p=0.3),
    A.Perspective(p=0.2)
], bbox_params=A.BboxParams(format='pascal_voc'))
```

### Performance Targets
- **mAP@0.5:** 80%+
- **Inference Time:** <500ms per image
- **Accuracy (severity):** 85%+

---

## Model 3: Repair Cost Estimation
**Purpose:** Estimate repair cost based on damaged parts and vehicle info

### Input Schema
```json
{
  "parts_damaged": [
    {
      "part": "front_bumper",
      "severity": "moderate"
    },
    {
      "part": "headlight_right",
      "severity": "severe"
    }
  ],
  "vehicle": {
    "make": "Renault",
    "model": "Clio",
    "year": 2019
  },
  "location": "Tunis"
}
```

### Output Schema
```json
{
  "estimated_cost": 1850,
  "currency": "TND",
  "confidence": 0.83,
  "cost_breakdown": [
    {
      "item": "Front bumper replacement",
      "parts_cost": 450,
      "labor_cost": 200,
      "total": 650
    },
    {
      "item": "Headlight replacement (LED)",
      "parts_cost": 800,
      "labor_cost": 150,
      "total": 950
    },
    {
      "item": "Paint & finishing",
      "parts_cost": 100,
      "labor_cost": 150,
      "total": 250
    }
  ],
  "range_min": 1600,
  "range_max": 2100
}
```

### Recommended Approach
```python
# Regression Model (XGBoost or Neural Network)

import xgboost as xgb
import pandas as pd

# Feature engineering
def extract_features(data):
    features = []
    
    # Part features
    for part in ALL_PARTS:
        features.append(1 if part in data['parts_damaged'] else 0)
    
    # Severity encoding
    severity_scores = {'minor': 1, 'moderate': 2, 'severe': 3}
    avg_severity = np.mean([severity_scores[p['severity']] for p in data['parts_damaged']])
    features.append(avg_severity)
    
    # Vehicle features (one-hot encoding)
    features += encode_vehicle(data['vehicle'])
    
    # Location multiplier
    location_multipliers = {'Tunis': 1.0, 'Sfax': 0.9, 'Sousse': 0.95}
    features.append(location_multipliers.get(data['location'], 1.0))
    
    return features

# Train model
model = xgb.XGBRegressor(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05
)

X_train = np.array([extract_features(d) for d in training_data])
y_train = np.array([d['actual_cost'] for d in training_data])

model.fit(X_train, y_train)

# Predict
X_test = extract_features(new_case)
estimated_cost = model.predict([X_test])[0]
```

### Data Collection Strategy
Since repair cost data is scarce, you need to:

1. **Scrape insurance company websites**
   ```python
   # Example: Scrape MAE, STAR, AMI repair estimates
   import requests
   from bs4 import BeautifulSoup
   
   # Collect data like:
   # - Part name → typical cost
   # - Labor rates per hour
   # - Regional variations
   ```

2. **Create pricing database**
   ```python
   PARTS_PRICES_TND = {
       'front_bumper': {
           'budget': 300,  # Aftermarket
           'oem': 500,     # Original parts
           'premium': 800  # Luxury brands
       },
       'headlight_right': {
           'halogen': 150,
           'xenon': 400,
           'led': 800
       },
       # ... etc
   }
   
   LABOR_RATES_TND = {
       'Tunis': 30,  # per hour
       'Sfax': 25,
       'Sousse': 27
   }
   ```

3. **Synthetic data generation**
   ```python
   # Generate training examples
   for _ in range(10000):
       parts = random.sample(ALL_PARTS, k=random.randint(1, 5))
       severities = [random.choice(['minor', 'moderate', 'severe']) for _ in parts]
       vehicle = random.choice(VEHICLE_DATABASE)
       
       # Calculate cost
       cost = sum(calculate_part_cost(p, s, vehicle) for p, s in zip(parts, severities))
       
       training_data.append({
           'parts': parts,
           'severities': severities,
           'vehicle': vehicle,
           'cost': cost
       })
   ```

### Performance Targets
- **MAE (Mean Absolute Error):** <200 TND
- **MAPE (Mean Absolute Percentage Error):** <15%
- **R² Score:** >0.85

---

## API Deployment

### FastAPI Server Template
```python
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import torch
import numpy as np
from PIL import Image
import io

app = FastAPI(title="ClaimPilot ML Services")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8787"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models on startup
@app.on_event("startup")
async def load_models():
    global fraud_model, damage_model, cost_model
    
    fraud_model = torch.load('models/fraud_detection.pt')
    damage_model = torch.load('models/damage_recognition.pt')
    cost_model = torch.load('models/repair_cost.pt')
    
    print("✅ All models loaded successfully")

@app.post("/api/ml/detect-fraud")
async def detect_fraud(data: dict):
    try:
        result = fraud_model.predict(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/analyze-damage")
async def analyze_damage(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        result = damage_model.predict(image)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/estimate-repair")
async def estimate_repair(data: dict):
    try:
        result = cost_model.predict(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/health")
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": 3,
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

### Run ML Server
```bash
# Install dependencies
pip install fastapi uvicorn torch torchvision xgboost pillow numpy

# Start server
python ml_services/main.py

# Test
curl http://localhost:8080/api/ml/health
```

---

## Integration with Main App

### Update Node.js Backend
```javascript
// In server/index.mjs, add ML proxy endpoints:

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8080';

app.post('/api/ml/detect-fraud', async (req, res) => {
  try {
    const response = await fetch(`${ML_API_URL}/api/ml/detect-fraud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Similar for analyze-damage and estimate-repair
```

### Update Frontend
```typescript
// In src/evidence/vision.ts, replace mock:

export async function analyzeDamage(imageDataUrl: string): Promise<DamageAnalysis> {
  // Convert data URL to blob
  const blob = await (await fetch(imageDataUrl)).blob();
  
  // Send to backend
  const formData = new FormData();
  formData.append('file', blob);
  
  const response = await fetch('/api/ml/analyze-damage', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  
  return {
    severity: result.severity,
    damageRatio: result.damage_ratio,
    regionCount: result.parts_damaged.length,
    confidence: result.severity_confidence,
    heatmapDataUrl: imageDataUrl // Keep original for now
  };
}
```

---

## Timeline Estimate

- **Fraud Detection Model:** 2-3 weeks
  - Data collection: 3 days
  - Model training: 1 week
  - Testing & tuning: 1 week

- **Damage Recognition Model:** 2-3 weeks
  - Dataset preparation: 3 days
  - YOLOv8 fine-tuning: 1 week
  - Evaluation & optimization: 1 week

- **Repair Cost Model:** 1-2 weeks
  - Data scraping/generation: 4 days
  - Model training: 3 days
  - Validation: 3 days

**Total:** 5-8 weeks for all 3 models

---

## Resources

### Tutorials
- YOLOv8: https://docs.ultralytics.com/
- XGBoost: https://xgboost.readthedocs.io/
- FastAPI: https://fastapi.tiangolo.com/

### Pre-trained Models
- YOLO: https://github.com/ultralytics/ultralytics
- ResNet: https://pytorch.org/vision/stable/models.html
- BERT Multilingual: https://huggingface.co/bert-base-multilingual-cased

**Good luck building the models!** 🚀
