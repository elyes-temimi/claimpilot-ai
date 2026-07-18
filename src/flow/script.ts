import QRCode from 'qrcode';
import { api } from '../lib/api';
import { descriptorFromImage, loadModels, MATCH_THRESHOLD } from '../lib/face';
import { ageFromDob, runOcr } from '../lib/ocr';
import { SPECIMEN_FIELDS } from '../lib/specimen';
import type { BiometricResult, IdFields, KycProfile, QuestionOption } from '../types';
import type { FlowController } from './controller';

type SelfieOutcome = BiometricResult & { hadReference: boolean };

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function runFlow(c: FlowController) {
  const startedAt = Date.now();
  loadModels(); // warm up the biometric models in the background

  // ============================ PHASE 1 — eKYC ============================
  c.step('identity');
  await c.say("Hi, I'm ClaimPilot 🛡️ Getting insured usually takes 20–30 minutes of forms and queues. We'll do it right here, in a few minutes of chat.");
  await c.say('First: your identity. Show me your ID document — photo, upload, or the built-in specimen card if you just want to see the magic.');

  const idRes = await c.ask<{ image: string; specimen: boolean }>({ type: 'idCapture' });
  c.userImage(idRes.image, 'ID document');

  // Kick off face-reference extraction from the document photo in parallel with OCR
  c.refDescriptor = descriptorFromImage(idRes.image).catch(() => null);

  c.processing('Reading your document with OCR…', 0);
  let fields: IdFields;
  let ocrOk = true;
  try {
    const out = await runOcr(idRes.image, (pct) => c.processing('Reading your document with OCR…', pct));
    fields = out.fields;
    if (!fields.fullName && idRes.specimen) fields = { ...SPECIMEN_FIELDS };
  } catch {
    ocrOk = false;
    fields = idRes.specimen ? { ...SPECIMEN_FIELDS } : { fullName: '', dob: '', idNumber: '' };
  }
  c.clearWidget();

  if (ocrOk) await c.say("Here's what I read from the document — fix anything the camera got wrong, then confirm.");
  else await c.say("OCR couldn't run just now (offline?). Mind filling these three fields in for me?");

  const confirmed = await c.ask<IdFields>({ type: 'fieldsConfirm', fields });
  c.card({ kind: 'fields', fields: confirmed, source: ocrOk ? 'ocr' : 'manual' });

  const firstName = confirmed.fullName.split(' ')[0] || 'there';

  // ----------------------------- Liveness --------------------------------
  c.step('liveness');
  await c.say(`Thanks, ${firstName}! Now the part fraudsters hate: a live selfie. Look at the camera and blink twice — that proves you're a real person, not a photo of one.`);

  const bio = await c.ask<SelfieOutcome>({ type: 'selfie', hasReference: true });
  if (bio.image) c.userImage(bio.image, 'Live selfie');
  c.card({ kind: 'biometric', data: bio, hasReference: bio.hadReference });

  if (bio.simulated) {
    await c.say('Simulated biometrics accepted for this demo run — on a phone this is a real blink-detection + face-match step.');
  } else if (bio.distance !== null && bio.distance < MATCH_THRESHOLD) {
    await c.say('Liveness confirmed and your face matches the document photo. ✓');
  } else if (bio.distance !== null) {
    await c.say("Hmm — the selfie doesn't match the document photo closely enough. In production this routes to manual review; I'll flag it and continue for the demo.");
  } else if (!bio.hadReference) {
    await c.say('The specimen card has no real photo to compare against, so I verified liveness only — with a real ID the face match runs automatically.');
  } else {
    await c.say('Biometric comparison was skipped this time — flagged on the profile.');
  }

  // ----------------------------- Screening -------------------------------
  c.step('screening');
  await c.say('Now the compliance part — screening you against international sanctions and PEP lists. Most banks make you wait a day for this…', 500);
  c.processing('Screening against 4 watchlists…');
  await c.sleep(1100);
  let aml;
  try {
    aml = await api.amlScreen(confirmed.fullName, confirmed.dob);
  } catch {
    aml = null;
  }
  c.clearWidget();

  if (aml) {
    c.card({ kind: 'aml', data: aml });
    if (aml.status === 'clear') {
      await c.say('…we do it in about a second. All clear — no sanctions or PEP matches. ✓');
    } else {
      await c.say('I found a potential watchlist match. In production a compliance officer reviews this before the account activates — I\'ll flag the profile and continue so you can see the rest of the flow.');
    }
  } else {
    await c.say('Screening service unreachable — flagged for retry. Continuing.');
  }

  // ----------------------------- Signature -------------------------------
  c.step('signature');
  await c.say('Last step of onboarding: your signature. This consent covers identity verification and your insurance application — nothing else, no small print.');

  const sig = await c.ask<{ dataUrl: string }>({ type: 'signature' });
  c.processing('Sealing your profile cryptographically…');

  const profile: KycProfile = {
    fullName: confirmed.fullName,
    dob: confirmed.dob,
    idNumber: confirmed.idNumber,
    checks: {
      documentOcr: ocrOk ? 'passed' : 'manual',
      faceMatch: bio.simulated
        ? 'simulated (demo)'
        : bio.distance === null
          ? 'no reference face'
          : bio.distance < MATCH_THRESHOLD
            ? `passed (distance ${bio.distance.toFixed(2)})`
            : `review (distance ${bio.distance.toFixed(2)})`,
      liveness: bio.liveness,
      amlScreening: aml ? `${aml.status} (${aml.screeningId})` : 'pending',
    },
    consentSignatureHash: await sha256Hex(sig.dataUrl),
    createdAt: new Date().toISOString(),
  };

  let signedCardShown = false;
  try {
    const signed = await api.signProfile(profile);
    const qr = await QRCode.toDataURL(`CPAI:v1:${signed.profileId}:${signed.hash.slice(0, 16)}`, {
      margin: 1,
      width: 220,
    });
    c.clearWidget();
    c.card({ kind: 'signed', data: signed, profile, qr });
    signedCardShown = true;
    // Persist for Phase 3: the verified identity travels to the accident session
    localStorage.setItem(
      'cp_profile',
      JSON.stringify({
        fullName: confirmed.fullName,
        idNumber: confirmed.idNumber,
        dob: confirmed.dob,
        profileId: signed.profileId,
        verified: true,
      })
    );
  } catch {
    c.clearWidget();
    await c.say('Signing service unreachable — profile stored locally, will be sealed on reconnect.');
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  if (signedCardShown) {
    await c.say(`That's it — your identity profile is verified, screened and cryptographically signed. Total time: ${mm}:${ss}. The paper version of this takes half an hour. 🎉`);
  }

  // ====================== PHASE 2 — Smart Policy ==========================
  c.step('policy');
  await c.say("Now let's get you covered. I won't show you a wall of 12 policies to compare — I'll ask a few quick questions and recommend the one that actually fits.");

  const age = ageFromDob(confirmed.dob);
  const answers: Record<string, string> = {};

  for (;;) {
    let res;
    try {
      res = await api.policyStep(answers, { age });
    } catch {
      await c.say('Policy engine unreachable — please try again in a moment.');
      break;
    }
    if (res.type === 'question') {
      const q = res.question;
      await c.say(q.hint ? `${q.text}\n· ${q.hint}` : q.text, 450);
      const opt = await c.ask<QuestionOption>({ type: 'chips', options: q.options });
      c.user(opt.label);
      answers[q.id] = opt.value;
    } else {
      c.processing('Matching you against our policy book…');
      await c.sleep(1000);
      c.clearWidget();
      c.card({ kind: 'policy', data: res });
      localStorage.setItem(
        'cp_policy',
        JSON.stringify({ name: res.policy.name, premiumTND: res.premiumTND })
      );
      await c.say(`My pick for you: ${res.policy.name} — ${res.confidence}% fit confidence. One matched policy instead of a comparison wall, with the reasoning right there.`);
      break;
    }
  }

  c.step('done');
  await c.say('Phase 1 + Phase 2 complete ✅ Your verified profile now travels with you — if you ever have an accident, both drivers work on one shared live case. Want to see it?');

  const cta = await c.ask<QuestionOption>({
    type: 'chips',
    options: [
      { value: 'accident', label: '🚨 Simulate an accident — open shared session', emoji: undefined },
      { value: 'finish', label: '🏁 Finish the demo here' },
    ],
  });
  if (cta.value === 'accident') {
    window.location.hash = '#accident';
  } else {
    c.user(cta.label);
    await c.say('Thanks for flying ClaimPilot ✈️ The 🚨 button up top opens the shared accident session any time.');
  }
}
