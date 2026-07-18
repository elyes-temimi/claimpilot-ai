# Guide de Test - Nouvelles Fonctionnalités 🧪

## 🚀 Démarrage Rapide

```bash
npm run dev
```
Ouvrir: http://localhost:5173

---

## Test 1 : Créer un Compte ✅

**Objectif :** Tester l'inscription

**Étapes :**
1. Voir l'écran de connexion
2. Cliquer "Créer un compte →"
3. Remplir le formulaire :
   - Nom : `Ahmed Ben Mohamed`
   - Email : `test@example.com`
   - Mot de passe : `123456`
   - Langue : Sélectionner `🇫🇷 Français`
4. Cliquer "Créer mon compte"

**Résultat attendu :**
- ✅ Compte créé
- ✅ Redirection automatique vers eKYC
- ✅ Avatar avec initiales "AB" visible dans le header
- ✅ Nom "Ahmed" affiché à côté de l'avatar

---

## Test 2 : Changer la Langue 🌐

**Objectif :** Tester le sélecteur multilingue

**Étapes :**
1. Dans le header, voir `🇫🇷 FR | 🇹🇳 AR | 🇬🇧 EN`
2. Cliquer sur `🇹🇳 AR`
3. Observer l'interface
4. Cliquer sur `🇬🇧 EN`
5. Observer l'interface
6. Cliquer sur `🇫🇷 FR`

**Résultat attendu :**
- ✅ **AR** : Texte en arabe, alignement RTL
  - Titre : "دعنا نتحقق من هويتك"
  - Bouton : "ابدأ التحقق ←"
- ✅ **EN** : Texte en anglais
  - Titre : "Let's verify your identity"
  - Bouton : "Start eKYC →"
- ✅ **FR** : Texte en français
  - Titre : "Vérifions votre identité"
  - Bouton : "Démarrer eKYC →"
- ✅ Changement instantané sans rechargement

---

## Test 3 : OCR CIN (avec une image test) 📄

**Objectif :** Tester l'extraction automatique

**Prérequis :** Avoir une image de CIN tunisienne (ou créer une image test)

**Étapes :**
1. Cliquer "Démarrer eKYC →"
2. **Étape CIN Capture**
3. Cliquer sur onglet "📁 Upload File"
4. Sélectionner l'image du **recto** de la CIN
5. Attendre le traitement OCR (barre de progression)
6. Observer les données extraites
7. Sélectionner l'image du **verso**
8. Attendre le traitement OCR
9. Observer l'adresse extraite

**Résultat attendu :**
- ✅ **Pendant OCR :**
  - Spinner visible
  - Message "Traitement recto avec OCR..."
  - Progression affichée
- ✅ **Après OCR recto :**
  - Nom complet extrait
  - Date de naissance extraite (format JJ/MM/AAAA)
  - Numéro CIN extrait (8 chiffres)
  - Badge vert "✓ FRONT CAPTURÉ"
- ✅ **Après OCR verso :**
  - Adresse extraite
  - Badge vert "✓ BACK CAPTURÉ"
  - Bouton "Continuer" activé

**Note :** L'accuracy dépend de la qualité de l'image. Si l'extraction est imparfaite, c'est normal (OCR pas parfait).

---

## Test 4 : Validation des Champs ⚠️

**Objectif :** Tester le contrôle de saisie

**Étapes :**
1. Après l'étape CIN, arriver à "Confirmez vos informations"
2. **Test Nom Invalide :**
   - Effacer le nom
   - Entrer : `Ahmed` (1 seul mot)
   - Observer : ❌ Bordure rouge + Message d'erreur
   - Corriger : `Ahmed Ben`
   - Observer : ✅ Erreur disparue

3. **Test Date Invalide :**
   - Changer la date : `15/03/2010` (âge 16 ans)
   - Observer : ❌ Erreur "18 ans minimum"
   - Corriger : `15/03/1990`
   - Observer : ✅ Erreur disparue

4. **Test CIN Invalide :**
   - Effacer le CIN
   - Entrer : `123`
   - Observer : ❌ Erreur "8 chiffres exactement"
   - Continuer à taper : Le champ bloque à 8 chiffres max
   - Entrer : `12345678`
   - Observer : ✅ Erreur disparue

5. **Test Adresse Invalide :**
   - Effacer l'adresse
   - Entrer : `Tunis` (5 caractères)
   - Observer : ❌ Erreur "10 caractères minimum"
   - Compléter : `Tunis, Tunisia`
   - Observer : ✅ Erreur disparue

6. **Essayer de continuer avec erreurs :**
   - Vider tous les champs
   - Cliquer "Confirmer & Continuer"
   - Observer : ❌ Toutes les erreurs s'affichent
   - Observer : Le formulaire ne se soumet pas

**Résultat attendu :**
- ✅ Champs invalides = bordure rouge
- ✅ Messages d'erreur précis et multilingues
- ✅ Erreurs disparaissent en temps réel quand corrigées
- ✅ Impossible de continuer avec des erreurs
- ✅ Validation uniquement sur champs non vides au départ

---

## Test 5 : Menu Utilisateur 👤

**Objectif :** Tester le menu dropdown

**Étapes :**
1. Dans le header eKYC, cliquer sur l'avatar (AB)
2. Observer le menu dropdown
3. Voir le nom complet affiché
4. Cliquer en dehors du menu
5. Observer : menu se ferme
6. Re-cliquer sur l'avatar
7. Cliquer "🚪 Déconnexion"

**Résultat attendu :**
- ✅ Menu s'ouvre au clic
- ✅ Affiche "👤 Ahmed Ben Mohamed"
- ✅ Affiche "🚪 Déconnexion"
- ✅ Menu se ferme si on clique ailleurs
- ✅ Déconnexion → Retour à l'écran login

---

## Test 6 : Reconnexion 🔑

**Objectif :** Tester la persistance de session

**Étapes :**
1. Se déconnecter (voir Test 5)
2. Sur l'écran de connexion :
   - Email : `test@example.com`
   - Mot de passe : `123456`
3. Cliquer "Se connecter"
4. Observer : Redirection vers eKYC
5. **Refresh la page (F5)**
6. Observer : Toujours connecté

**Résultat attendu :**
- ✅ Connexion réussie
- ✅ Session persistante après refresh
- ✅ Pas de re-login nécessaire
- ✅ Langue préférée conservée

---

## Test 7 : Erreur de Connexion ❌

**Objectif :** Tester la gestion d'erreurs

**Étapes :**
1. Sur l'écran de connexion
2. Entrer :
   - Email : `wrong@example.com`
   - Mot de passe : `wrongpassword`
3. Cliquer "Se connecter"

**Résultat attendu :**
- ❌ Message d'erreur : "Email ou mot de passe incorrect"
- ❌ Reste sur l'écran de connexion
- ✅ Peut réessayer

---

## Test 8 : Email Déjà Utilisé ⚠️

**Objectif :** Tester validation signup

**Étapes :**
1. Aller sur "Créer un compte"
2. Entrer :
   - Email : `test@example.com` (déjà utilisé)
   - Autres champs : valides
3. Cliquer "Créer mon compte"

**Résultat attendu :**
- ❌ Message d'erreur : "Cet email est déjà utilisé"
- ❌ Reste sur l'écran signup
- ✅ Peut utiliser un autre email

---

## Test 9 : Mot de Passe Court ⚠️

**Objectif :** Tester validation mot de passe

**Étapes :**
1. Sur "Créer un compte"
2. Entrer :
   - Mot de passe : `12345` (5 caractères)
3. Cliquer "Créer mon compte"

**Résultat attendu :**
- ❌ Message : "Le mot de passe doit contenir au moins 6 caractères"
- ❌ Compte non créé

---

## Test 10 : Flux Complet 🎬

**Objectif :** Test end-to-end

**Étapes :**
1. ✅ Créer compte (FR)
2. ✅ Changer langue (AR)
3. ✅ Démarrer eKYC
4. ✅ Upload CIN recto
5. ✅ Attendre OCR
6. ✅ Upload CIN verso
7. ✅ Attendre OCR
8. ✅ Confirmer détails (corriger si erreurs)
9. ✅ Continuer vers Liveness
10. ✅ Skip liveness (pour tester)
11. ✅ Voir screening results
12. ✅ Remplir profile
13. ✅ Voir policy match
14. ✅ Dessiner signature
15. ✅ Compléter eKYC
16. ✅ Naviguer vers Accident Claims

**Résultat attendu :**
- ✅ Flux complet sans blocage
- ✅ Toutes les données validées
- ✅ Langue reste AR tout au long
- ✅ Profile créé et utilisable

---

## 🐛 Bugs Connus / Limitations

### OCR
- ⚠️ **Accuracy variable** selon qualité image
- ⚠️ **Peut rater des caractères** arabes stylisés
- ⚠️ **Adresse parfois incomplète** si multi-lignes
- 💡 **Solution :** Permettre correction manuelle (déjà fait)

### Traductions
- ⚠️ **Pas toutes les pages traduites** (Profile, Policy, Signature)
- ⚠️ **Quelques textes hardcodés** en anglais
- 💡 **Solution :** Ajouter traductions manquantes

### Auth
- ⚠️ **LocalStorage seulement** (dev mode)
- ⚠️ **Mots de passe en clair** (dev mode)
- ⚠️ **Pas de reset password**
- 💡 **Solution :** Backend API en production

---

## ✅ Checklist de Test

Cocher après chaque test réussi :

- [ ] **Test 1** : Créer un compte
- [ ] **Test 2** : Changer la langue (AR/EN/FR)
- [ ] **Test 3** : OCR CIN (recto + verso)
- [ ] **Test 4** : Validation des champs
- [ ] **Test 5** : Menu utilisateur
- [ ] **Test 6** : Reconnexion
- [ ] **Test 7** : Erreur de connexion
- [ ] **Test 8** : Email déjà utilisé
- [ ] **Test 9** : Mot de passe court
- [ ] **Test 10** : Flux complet

---

## 📝 Rapport de Bug

Si vous trouvez un bug, notez :

```
🐛 Bug trouvé:
- Étape: [quelle fonctionnalité ?]
- Action: [qu'avez-vous fait ?]
- Attendu: [que devrait-il se passer ?]
- Observé: [que s'est-il passé ?]
- Screenshot: [si possible]
```

---

## 🎉 Test Réussi !

Si tous les tests passent :
- ✅ OCR fonctionne
- ✅ Validation fonctionne
- ✅ Auth fonctionne
- ✅ Traductions fonctionnent

**Prêt pour la production (avec vraies APIs) !** 🚀
