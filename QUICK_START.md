# ASSURINI AI - Guide de Démarrage Rapide 🚀

## 🎯 Démarrage en 30 secondes

```bash
# 1. Installer les dépendances (première fois seulement)
npm install

# 2. Lancer l'application
npm run dev
```

**Voilà !** L'application est maintenant accessible sur :
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:8787

---

## 📱 Navigation dans l'App

### Route par défaut : eKYC
Quand vous ouvrez http://localhost:5173, vous arrivez sur le flux eKYC.

### Routes disponibles :
- `http://localhost:5173` ou `http://localhost:5173#ekyc` → **eKYC flow**
- `http://localhost:5173#accident` → **Accident claims**
- `http://localhost:5173#chat` → **Chat AI** (ancien mode)

---

## 🔍 Test Complet du Flux

### Option A : Flux Complet (eKYC → Accident)

```
1. Ouvrir http://localhost:5173
   ↓
2. Compléter eKYC (9 étapes)
   - CIN capture (upload ou camera)
   - Liveness check (ou skip)
   - Profil utilisateur
   - Signature
   ↓
3. Cliquer "Continue to Accident Claims"
   ↓
4. Créer une session accident
   ↓
5. Inviter 2ème conducteur
   ↓
6. Remplir le constat FTUSA
   ↓
7. Ajouter les preuves (photos + déclarations)
```

### Option B : Test Rapide Accident (sans eKYC)

```bash
# Naviguer directement vers accident
http://localhost:5173#accident
```

---

## 🧪 Scénarios de Test

### Test 1 : eKYC avec Upload de Fichier
**Durée : 3 minutes**

1. Ouvrir http://localhost:5173
2. Cliquer "Start eKYC →"
3. **CIN Capture** → Onglet "📁 Upload File"
4. Upload n'importe quelle image (pour tester)
5. Upload une 2ème image pour le verso
6. Éditer les détails extraits
7. **Liveness Check** → Cliquer "Having trouble?" → "Skip Liveness Check"
8. Remplir le questionnaire profil
9. Voir la police recommandée
10. Dessiner une signature
11. Cliquer "Continue to Accident Claims"

✅ **Résultat attendu :** Navigation vers #accident avec profil rempli

---

### Test 2 : Session Accident à 2 Conducteurs
**Durée : 5 minutes**  
**Besoins : 2 onglets de navigateur**

#### Onglet 1 (Conducteur A) :
1. Ouvrir http://localhost:5173#accident
2. Cliquer "Start shared session"
3. **Noter le code à 6 lettres** (ex: ABCD12)
4. Marquer la zone d'impact sur la voiture
5. Cliquer "Confirm"

#### Onglet 2 (Conducteur B) :
1. Ouvrir http://localhost:5173#accident (mode incognito ou autre navigateur)
2. Entrer le code du Conducteur A
3. Cliquer "Join"
4. Marquer sa zone d'impact
5. Cliquer "Confirm"

#### Les deux onglets :
6. **Case locks** → Voir "Both drivers confirmed"
7. Cliquer "Continue to Constat Form"
8. Remplir **Field 9** (plaque, marque, modèle)
9. Cocher des **circonstances** (ex: #7, #11, #16)
10. Décrire les dégâts dans **Field 11**
11. Observer la **sync en temps réel** entre les deux onglets
12. Cliquer "Download constat (PDF)"
13. Cliquer "Continue to Evidence"
14. Uploader des photos
15. Taper ou enregistrer une déclaration vocale

✅ **Résultat attendu :** PDF téléchargé, preuves synchronisées

---

### Test 3 : Enregistrement Vocal
**Durée : 2 minutes**

1. Suivre Test 2 jusqu'à l'étape "Continue to Evidence"
2. Dans la section "Language AI", cliquer sur onglet **"Voice Recording"**
3. Cliquer "Start Recording" (autoriser le micro)
4. Parler pendant 10-15 secondes (n'importe quelle langue)
5. Cliquer "Done"
6. Observer la transcription (actuellement mock)
7. Voir l'analyse linguistique (FR/AR/Darija détecté)

✅ **Résultat attendu :** Transcription affichée, langues détectées

---

## 🐛 Dépannage

### Problème : "Cannot GET /"
**Solution :** Vérifier que les serveurs sont lancés avec `npm run dev`

### Problème : WebSocket non connecté
**Symptôme :** Footer indique "🟠 reconnecting…"  
**Solution :** 
1. Vérifier que le backend tourne sur http://localhost:8787
2. Recharger la page

### Problème : Camera ne fonctionne pas
**Solution :**
1. Autoriser l'accès à la caméra dans le navigateur
2. Utiliser HTTPS si sur réseau externe : `npm run dev:https`
3. Alternative : Utiliser "📁 Upload File" à la place

### Problème : eKYC Streamlit ne démarre pas
**Note :** L'app Streamlit (`ekyc-streamlit/`) est maintenant **dépréciée**. Tout a été migré vers React. Vous pouvez ignorer ou supprimer ce dossier.

---

## 📂 Structure du Projet

```
auto_or_die/
├── src/
│   ├── ekyc/                    # ✅ Nouveau flux eKYC React
│   │   ├── EkycApp.tsx         # Container principal (9 étapes)
│   │   ├── CinCapture.tsx      # Capture CIN (camera + upload)
│   │   ├── LivenessCheck.tsx   # Vérification biométrique
│   │   ├── ProfileForm.tsx     # Questionnaire profil
│   │   └── SignatureCapture.tsx # Signature digitale
│   │
│   ├── accident/                # Déclaration accident
│   │   ├── AccidentApp.tsx     # Container accident
│   │   ├── SessionLive.tsx     # Session en direct
│   │   ├── ConstatForm.tsx     # Formulaire FTUSA
│   │   └── constatPDF.ts       # Export PDF
│   │
│   ├── components/              # Composants réutilisables
│   │   └── VoiceRecorder.tsx   # Enregistrement vocal
│   │
│   ├── App.tsx                  # Routing principal
│   └── styles.css               # Tous les styles
│
├── server/
│   ├── index.mjs               # Backend principal
│   ├── sessions.mjs            # Gestion sessions WebSocket
│   ├── amlData.mjs             # Données AML/PEP
│   └── consistency.mjs         # Analyse cohérence
│
├── ekyc-streamlit/             # ⚠️ DÉPRÉCIÉ (peut être supprimé)
│
├── EKYC_REACT_MIGRATION.md     # 📖 Documentation migration eKYC
├── INTEGRATION_STATUS.md       # 📊 Statut d'intégration
├── ML_MODEL_SPECS.md           # 🤖 Spécs modèles ML
└── QUICK_START.md              # 🚀 Ce fichier
```

---

## 🔑 Fonctionnalités Clés

### ✅ Fonctionnalités Complètes
- [x] **eKYC complet** (9 étapes)
- [x] **CIN capture** (camera + upload)
- [x] **Liveness check** (avec option skip)
- [x] **Formulaire constat FTUSA** (17 circonstances bilingues)
- [x] **Sync temps réel** (WebSocket entre 2 conducteurs)
- [x] **Enregistrement vocal** (pause/resume/waveform)
- [x] **Upload photos**
- [x] **Export PDF**
- [x] **Routing intégré** (eKYC → Accident)

### ⚠️ Fonctionnalités Mock (à connecter)
- [ ] **OCR CIN** (actuellement mock)
- [ ] **Face matching** (actuellement mock)
- [ ] **Transcription vocale** (actuellement mock)
- [ ] **Screening AML/PEP** (mock, APIs prêtes)
- [ ] **Policy matching ML** (mock, APIs prêtes)
- [ ] **Détection fraude ML** (non implémenté)
- [ ] **Reconnaissance dégâts ML** (non implémenté)
- [ ] **Estimation prix réparation ML** (non implémenté)

---

## 🎨 Personnalisation

### Changer les couleurs
Éditer `src/styles.css` :
```css
:root {
  --accent: #2563eb;      /* Bleu principal */
  --accent-2: #0ea5e9;    /* Bleu secondaire */
  --red: #dc2626;         /* Rouge (accident) */
  --green: #059669;       /* Vert (succès) */
}
```

### Changer le port
Éditer `package.json` :
```json
{
  "scripts": {
    "dev": "concurrently \"node server/index.mjs\" \"vite --port 3000\""
  }
}
```

### Ajouter une nouvelle langue
1. Éditer `src/ekyc/ProfileForm.tsx` pour ajouter des traductions
2. Éditer `src/accident/ConstatForm.tsx` pour les labels AR/FR
3. Ajouter la détection dans `src/lib/speechToText.ts`

---

## 📝 Prochaines Étapes

### Priorité 1 : Tester Tout ✅
- [ ] Tester eKYC complet (avec upload de fichiers)
- [ ] Tester session accident à 2 conducteurs
- [ ] Tester formulaire constat (sync temps réel)
- [ ] Tester enregistrement vocal
- [ ] Tester export PDF

### Priorité 2 : Connecter les APIs Réelles
- [ ] Intégrer API OCR (recommandé : Google Cloud Vision ou Tesseract)
- [ ] Intégrer API Speech-to-Text (recommandé : OpenAI Whisper)
- [ ] Intégrer API AML/PEP réelle (ex: ComplyAdvantage)

### Priorité 3 : Entraîner les Modèles ML (Votre Coéquipier)
- [ ] Model 1 : Détection fraude (story vs evidence)
- [ ] Model 2 : Reconnaissance dégâts (CNN sur photos)
- [ ] Model 3 : Estimation prix réparation

### Priorité 4 : Production
- [ ] Ajouter persistence database (SQLite/PostgreSQL)
- [ ] Ajouter gestion d'erreurs robuste
- [ ] Ajouter tests automatisés
- [ ] Déployer sur serveur

---

## 🆘 Besoin d'Aide ?

### Documentation Détaillée
- **eKYC Migration:** Voir `EKYC_REACT_MIGRATION.md`
- **Intégrations:** Voir `INTEGRATION_STATUS.md`
- **Modèles ML:** Voir `ML_MODEL_SPECS.md`

### Commandes Utiles
```bash
# Voir les logs serveur
npm run dev    # Les logs s'affichent dans le terminal

# Builder pour production
npm run build

# Lancer en HTTPS (pour tester sur 2 laptops)
npm run dev:https

# Vérifier la qualité du code
npm run lint
```

---

## 🎉 Résumé

**État actuel :** ~65% complet

**Ce qui marche :**
- ✅ Flux eKYC complet (React)
- ✅ Session accident 2 conducteurs
- ✅ Constat FTUSA avec sync temps réel
- ✅ Enregistrement vocal
- ✅ Upload photos

**Ce qui manque :**
- ⚠️ APIs réelles (OCR, Speech-to-Text, AML)
- ⚠️ Modèles ML (fraude, dégâts, prix)
- ⚠️ Base de données
- ⚠️ Tests automatisés

**Prochaine étape :** Tester le flux complet, puis intégrer les APIs réelles ! 🚀
