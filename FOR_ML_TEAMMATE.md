# Pour le Coéquipier ML 🤖

Salut ! Ce document explique ce qui a été fait et ce que tu dois construire.

---

## 🎯 Ton Rôle

Tu dois créer **3 modèles ML** pour l'application ClaimPilot AI :

1. **Détection de fraude** (analyse cohérence déclarations vs preuves)
2. **Reconnaissance des dégâts** (identifier les parties endommagées sur photos)
3. **Estimation du coût de réparation** (prédire le prix en TND)

---

## 📦 Ce qui est Déjà Fait (Frontend + Backend)

### ✅ Application React Complète
- Interface utilisateur eKYC (vérification identité)
- Session accident partagée entre 2 conducteurs
- Formulaire constat officiel tunisien (FTUSA)
- Upload de photos de dégâts
- Enregistrement des déclarations vocales
- Sync temps réel via WebSocket

### ✅ Backend (Node.js)
- Serveur WebSocket pour sync en temps réel
- Sessions en mémoire (à migrer vers DB plus tard)
- Endpoints API prêts pour tes modèles ML

### ✅ Points d'Intégration Préparés
Tous les endroits où tes modèles doivent être appelés sont **déjà identifiés** avec des fonctions mock. Tu dois juste remplacer les mocks par de vrais appels API.

---

## 🔧 Architecture Recommandée

### Option 1 : Services Python Séparés (Recommandé)
Créer 3 services FastAPI indépendants :

```
ml_services/
├── fraud_detection/
│   ├── app.py              # FastAPI service
│   ├── model.py            # Load + inference
│   ├── trained_model.pkl   # Ton modèle entraîné
│   └── requirements.txt
│
├── damage_recognition/
│   ├── app.py
│   ├── model.py
│   ├── trained_model.h5
│   └── requirements.txt
│
└── repair_estimation/
    ├── app.py
    ├── model.py
    ├── trained_model.pkl
    └── requirements.txt
```

### Option 2 : Service Unifié
Un seul service FastAPI avec tous les modèles :

```
ml_service/
├── app.py                  # Main FastAPI app
├── models/
│   ├── fraud.py
│   ├── damage.py
│   └── repair.py
├── trained_models/
│   ├── fraud_model.pkl
│   ├── damage_model.h5
│   └── repair_model.pkl
└── requirements.txt
```

---

## 🤖 Modèle 1 : Détection de Fraude

### Objectif
Détecter les incohérences entre :
- Les déclarations des 2 conducteurs
- Les photos de dégâts
- Les zones d'impact marquées

### Exemples de Fraude à Détecter
1. **Déclarations contradictoires**
   - A dit : "Il m'a percuté à l'arrière"
   - B dit : "Je roulais devant lui"
   
2. **Photos vs déclaration**
   - Déclaration : "Choc à l'arrière"
   - Photos : Dégâts à l'avant
   
3. **Gravité exagérée**
   - Déclaration : "Choc violent, voiture détruite"
   - Photos : Petite rayure

### Input Format
```json
{
  "driverA": {
    "statement": "Il a grillé le feu rouge et m'a percuté...",
    "impactZone": "front-left",
    "photos": ["base64_image1", "base64_image2"]
  },
  "driverB": {
    "statement": "Je roulais normalement quand il...",
    "impactZone": "rear-right",
    "photos": ["base64_image3", "base64_image4"]
  },
  "metadata": {
    "location": [36.8065, 10.1815],
    "timestamp": "2026-01-20T14:30:00Z"
  }
}
```

### Output Format
```json
{
  "fraudScore": 0.73,
  "confidence": 0.89,
  "flags": [
    {
      "type": "story_contradiction",
      "severity": "high",
      "description": "Driver A claims rear impact but photos show front damage",
      "evidence": ["photo_1", "statement_a"]
    },
    {
      "type": "impact_zone_mismatch",
      "severity": "medium",
      "description": "Declared impact zones don't align with typical collision physics"
    }
  ],
  "recommendation": "manual_review"
}
```

### FastAPI Endpoint
```python
# fraud_detection/app.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib

app = FastAPI()

# Load ton modèle
model = joblib.load('trained_model.pkl')

class FraudRequest(BaseModel):
    driverA: dict
    driverB: dict
    metadata: dict

@app.post("/detect-fraud")
async def detect_fraud(data: FraudRequest):
    # 1. Extraire features
    features = extract_features(data)
    
    # 2. Prédiction
    fraud_score = model.predict_proba(features)[0][1]
    
    # 3. Identifier les flags
    flags = identify_inconsistencies(data, fraud_score)
    
    return {
        "fraudScore": float(fraud_score),
        "confidence": 0.89,
        "flags": flags,
        "recommendation": "manual_review" if fraud_score > 0.7 else "approve"
    }
```

### Datasets Recommandés
1. **Insurance Fraud Dataset** (Kaggle)
   - https://www.kaggle.com/datasets/buntyshah/auto-insurance-claims-data
   
2. **Créer des Données Synthétiques**
   ```python
   # Générer des cas frauduleux
   # - Mismatch déclaration vs photos
   # - Contradictions entre conducteurs
   # - Exagération de gravité
   ```

### Approche ML
**Option A : Classification Classique**
```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

# Features:
# - TF-IDF des déclarations
# - Similarité cosine entre déclarations
# - Différence zone d'impact
# - Analyse sentiment (aggression, certitude)
# - Métadata (heure, lieu)

model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)
```

**Option B : Deep Learning**
```python
import torch
from transformers import BertModel

# Utiliser BERT pour comprendre les déclarations
# + CNN pour analyser les photos
# = Modèle multimodal
```

---

## 🚗 Modèle 2 : Reconnaissance des Dégâts

### Objectif
Identifier les parties endommagées d'une voiture à partir d'une photo.

### Output Attendu
```json
{
  "damagedParts": [
    {
      "part": "front_bumper",
      "confidence": 0.94,
      "severity": "moderate",
      "bbox": [120, 230, 450, 380]
    },
    {
      "part": "headlight_left",
      "confidence": 0.87,
      "severity": "severe",
      "bbox": [150, 180, 220, 240]
    }
  ],
  "overallSeverity": "moderate",
  "estimatedDamageRatio": 0.35,
  "processingTime": 0.43
}
```

### Parties à Reconnaître
```python
PARTS = [
    "front_bumper", "rear_bumper",
    "hood", "trunk",
    "door_front_left", "door_front_right",
    "door_rear_left", "door_rear_right",
    "fender_front_left", "fender_front_right",
    "fender_rear_left", "fender_rear_right",
    "headlight_left", "headlight_right",
    "taillight_left", "taillight_right",
    "mirror_left", "mirror_right",
    "windshield", "rear_window",
    "wheel_front_left", "wheel_front_right",
    "wheel_rear_left", "wheel_rear_right"
]

SEVERITIES = ["minor", "moderate", "severe", "total_loss"]
```

### FastAPI Endpoint
```python
# damage_recognition/app.py
from fastapi import FastAPI, UploadFile, File
from PIL import Image
import torch
from torchvision import models, transforms

app = FastAPI()

# Load ton modèle (ex: YOLOv8, Faster R-CNN)
model = torch.load('damage_detector.pth')
model.eval()

@app.post("/analyze-damage")
async def analyze_damage(image: UploadFile = File(...)):
    # 1. Load image
    img = Image.open(image.file)
    
    # 2. Preprocess
    transform = transforms.Compose([
        transforms.Resize((640, 640)),
        transforms.ToTensor()
    ])
    img_tensor = transform(img).unsqueeze(0)
    
    # 3. Inference
    with torch.no_grad():
        predictions = model(img_tensor)
    
    # 4. Post-process
    damaged_parts = parse_predictions(predictions)
    
    return {
        "damagedParts": damaged_parts,
        "overallSeverity": calculate_severity(damaged_parts),
        "estimatedDamageRatio": len(damaged_parts) / 20,
        "processingTime": 0.43
    }
```

### Datasets Recommandés
1. **CarDD (Car Damage Detection)**
   - https://www.kaggle.com/datasets/anujms/car-damage-detection
   - 4,000+ images labellisées
   
2. **Custom Dataset** (fortement recommandé)
   - Scraper des images de voitures accidentées tunisiennes
   - Labeliser avec LabelImg ou Roboflow
   
3. **COCO Dataset** (pour préentraînement)
   - https://cocodataset.org

### Approche ML
**Recommandé : YOLOv8**
```python
from ultralytics import YOLO

# 1. Télécharger YOLOv8
model = YOLO('yolov8n.pt')

# 2. Fine-tune sur CarDD
model.train(
    data='car_damage.yaml',
    epochs=50,
    imgsz=640,
    batch=16
)

# 3. Export
model.export(format='onnx')  # Pour inférence rapide
```

**Alternative : Faster R-CNN**
```python
from torchvision.models.detection import fasterrcnn_resnet50_fpn

model = fasterrcnn_resnet50_fpn(pretrained=True)
# Fine-tune sur ton dataset
```

---

## 💰 Modèle 3 : Estimation Coût de Réparation

### Objectif
Prédire le coût de réparation en dinars tunisiens (TND).

### Input Format
```json
{
  "vehicle": {
    "make": "Renault",
    "model": "Clio",
    "year": 2019
  },
  "damage": {
    "parts": ["front_bumper", "headlight_left"],
    "severities": ["moderate", "severe"]
  },
  "location": "Tunis"
}
```

### Output Format
```json
{
  "estimatedCost": 2450,
  "currency": "TND",
  "confidence": 0.82,
  "breakdown": [
    {
      "item": "Front bumper replacement",
      "cost": 800,
      "category": "parts"
    },
    {
      "item": "Left headlight replacement",
      "cost": 450,
      "category": "parts"
    },
    {
      "item": "Painting (2 panels)",
      "cost": 600,
      "category": "labor"
    },
    {
      "item": "Labor (4 hours)",
      "cost": 600,
      "category": "labor"
    }
  ],
  "range": {
    "min": 2100,
    "max": 2800
  }
}
```

### FastAPI Endpoint
```python
# repair_estimation/app.py
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

app = FastAPI()

# Load ton modèle
model = joblib.load('repair_price_model.pkl')
parts_prices = pd.read_csv('parts_catalog.csv')

class RepairRequest(BaseModel):
    vehicle: dict
    damage: dict
    location: str

@app.post("/estimate-repair")
async def estimate_repair(data: RepairRequest):
    # 1. Extract features
    features = [
        data.vehicle['year'],
        len(data.damage['parts']),
        get_vehicle_category(data.vehicle),
        get_location_multiplier(data.location)
    ]
    
    # 2. Predict base cost
    base_cost = model.predict([features])[0]
    
    # 3. Calculate breakdown
    breakdown = calculate_breakdown(
        data.damage['parts'],
        data.damage['severities'],
        parts_prices
    )
    
    total = sum(item['cost'] for item in breakdown)
    
    return {
        "estimatedCost": int(total),
        "currency": "TND",
        "confidence": 0.82,
        "breakdown": breakdown,
        "range": {
            "min": int(total * 0.85),
            "max": int(total * 1.15)
        }
    }
```

### Datasets à Créer
**Malheureusement, pas de dataset public pour les prix tunisiens.**

Tu dois créer ton propre dataset :

1. **Scraper les sites tunisiens**
   ```python
   # Sites à scraper:
   # - MAE Assurance (mae.com.tn)
   # - STAR Assurance (star.com.tn)
   # - Garages tunisiens
   # - Pièces auto en ligne
   ```

2. **Format du Dataset**
   ```csv
   vehicle_make,vehicle_model,year,damaged_part,severity,cost_tnd,location
   Renault,Clio,2019,front_bumper,moderate,800,Tunis
   Peugeot,208,2020,door_front_left,severe,1200,Sfax
   ...
   ```

3. **Features à Inclure**
   - Marque / modèle du véhicule
   - Année
   - Partie endommagée
   - Gravité
   - Région (Tunis vs rural)
   - Disponibilité des pièces

### Approche ML
```python
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder

# Features engineering
le_make = LabelEncoder()
le_model = LabelEncoder()
le_part = LabelEncoder()

X = pd.DataFrame({
    'make': le_make.fit_transform(df['vehicle_make']),
    'model': le_model.fit_transform(df['vehicle_model']),
    'year': df['year'],
    'part': le_part.fit_transform(df['damaged_part']),
    'severity': df['severity'].map({'minor': 1, 'moderate': 2, 'severe': 3}),
    'location': df['location'].map({'Tunis': 1.2, 'Other': 1.0})
})

y = df['cost_tnd']

# Train
model = GradientBoostingRegressor(n_estimators=100, max_depth=5)
model.fit(X, y)

# Evaluate
print(f"R² Score: {model.score(X_test, y_test):.2f}")
```

---

## 🔌 Intégration avec l'App

### Étape 1 : Lancer Ton Service ML
```bash
cd ml_services/fraud_detection
uvicorn app:app --port 8001

cd ml_services/damage_recognition
uvicorn app:app --port 8002

cd ml_services/repair_estimation
uvicorn app:app --port 8003
```

### Étape 2 : Mettre à Jour le Backend Node.js
Éditer `server/index.mjs` :

```javascript
// Add ML service endpoints
app.post('/api/ml/detect-fraud', async (req, res) => {
  const response = await fetch('http://localhost:8001/detect-fraud', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.json(data);
});

app.post('/api/ml/analyze-damage', async (req, res) => {
  const response = await fetch('http://localhost:8002/analyze-damage', {
    method: 'POST',
    body: req.body  // FormData with image
  });
  const data = await response.json();
  res.json(data);
});

app.post('/api/ml/estimate-repair', async (req, res) => {
  const response = await fetch('http://localhost:8003/estimate-repair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.json(data);
});
```

### Étape 3 : Le Frontend Appelle Automatiquement
Le frontend React est **déjà configuré** pour appeler ces endpoints. Pas de modification nécessaire !

---

## 📚 Ressources

### Tutorials
- **YOLOv8 :** https://docs.ultralytics.com/
- **FastAPI :** https://fastapi.tiangolo.com/
- **Hugging Face (BERT) :** https://huggingface.co/docs

### Datasets
- **CarDD :** https://www.kaggle.com/datasets/anujms/car-damage-detection
- **Insurance Fraud :** https://www.kaggle.com/datasets/buntyshah/auto-insurance-claims-data
- **COCO :** https://cocodataset.org/

### Tools
- **LabelImg :** Pour labeliser des images
- **Roboflow :** Pour gérer datasets de vision
- **Weights & Biases :** Pour tracking experiments

---

## ✅ Checklist

### Modèle 1 : Détection Fraude
- [ ] Télécharger dataset fraud
- [ ] Créer données synthétiques
- [ ] Entraîner modèle (target accuracy > 85%)
- [ ] Créer service FastAPI
- [ ] Tester avec curl
- [ ] Intégrer avec backend Node

### Modèle 2 : Reconnaissance Dégâts
- [ ] Télécharger CarDD
- [ ] Fine-tune YOLOv8
- [ ] Valider accuracy (mAP > 0.7)
- [ ] Créer service FastAPI
- [ ] Tester avec images réelles
- [ ] Intégrer avec backend Node

### Modèle 3 : Estimation Prix
- [ ] Scraper prix tunisiens
- [ ] Créer dataset CSV
- [ ] Entraîner modèle régression
- [ ] Valider R² score (> 0.8)
- [ ] Créer service FastAPI
- [ ] Tester prédictions
- [ ] Intégrer avec backend Node

---

## 🚀 Next Steps

1. **Commence par Modèle 2** (reconnaissance dégâts)
   - Dataset déjà disponible (CarDD)
   - Plus facile à valider visuellement
   - Impact immédiat sur l'app

2. **Puis Modèle 3** (estimation prix)
   - Nécessite scraping mais plus simple ML
   - Régression classique

3. **Enfin Modèle 1** (détection fraude)
   - Le plus complexe (multimodal)
   - Nécessite données synthétiques

---

## 💬 Questions ?

Contacte-moi si tu as besoin :
- D'aide pour setup l'environnement
- De précisions sur les formats de données
- D'accès aux APIs frontend
- De données de test

**Good luck! 🚀**
