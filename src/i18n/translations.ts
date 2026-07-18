export type Language = 'ar' | 'fr' | 'en';

export const translations = {
  // Welcome Screen
  welcome_title: {
    ar: 'دعنا نتحقق من هويتك',
    fr: 'Vérifions votre identité',
    en: 'Let\'s verify your identity',
  },
  welcome_description: {
    ar: 'ستحتاج إلى بطاقة التعريف الوطنية التونسية (الوجه + الخلف). يستغرق هذا بضع دقائق فقط',
    fr: 'Vous aurez besoin de votre CIN tunisienne (recto + verso). Cela prend quelques minutes',
    en: 'You\'ll need your Tunisian CIN (front + back). This takes just a few minutes',
  },
  start_ekyc: {
    ar: 'ابدأ التحقق →',
    fr: 'Démarrer eKYC →',
    en: 'Start eKYC →',
  },

  // CIN Capture
  cin_capture_title: {
    ar: 'التقط بطاقة التعريف الخاصة بك',
    fr: 'Capturez votre CIN',
    en: 'Capture Your CIN',
  },
  cin_front_instruction: {
    ar: 'التقط أو قم برفع الوجه الأمامي لبطاقة التعريف الوطنية التونسية',
    fr: 'Capturez ou téléchargez le RECTO de votre CIN tunisienne',
    en: 'Capture or upload the FRONT of your Tunisian CIN',
  },
  cin_back_instruction: {
    ar: 'الآن التقط أو قم برفع الجهة الخلفية من بطاقة التعريف الخاصة بك',
    fr: 'Maintenant capturez ou téléchargez le VERSO de votre CIN',
    en: 'Now capture or upload the BACK of your CIN',
  },
  upload_file: {
    ar: '📁 رفع ملف',
    fr: '📁 Upload File',
    en: '📁 Upload File',
  },
  use_camera: {
    ar: '📷 استخدام الكاميرا',
    fr: '📷 Use Camera',
    en: '📷 Use Camera',
  },
  processing_ocr: {
    ar: 'معالجة {side} بالتعرف الضوئي على الحروف...',
    fr: 'Traitement {side} avec OCR...',
    en: 'Processing {side} side with OCR...',
  },
  captured: {
    ar: 'تم التقاط',
    fr: 'CAPTURÉ',
    en: 'CAPTURED',
  },
  capture: {
    ar: '📸 التقاط',
    fr: '📸 Capturer',
    en: '📸 Capture',
  },
  back: {
    ar: '← رجوع',
    fr: '← Retour',
    en: '← Back',
  },
  continue: {
    ar: 'متابعة →',
    fr: 'Continuer →',
    en: 'Continue →',
  },

  // Confirm Details
  confirm_details_title: {
    ar: '✓ تأكيد المعلومات',
    fr: '✓ Confirmez vos informations',
    en: '✓ Confirm your details',
  },
  confirm_details_subtitle: {
    ar: 'راجع وصحح المعلومات المستخرجة من بطاقة التعريف الخاصة بك',
    fr: 'Vérifiez et corrigez les informations extraites de votre CIN',
    en: 'Review and edit the information extracted from your CIN',
  },
  full_name: {
    ar: 'الاسم الكامل *',
    fr: 'Nom complet *',
    en: 'Full name *',
  },
  date_of_birth: {
    ar: 'تاريخ الميلاد (يوم/شهر/سنة) *',
    fr: 'Date de naissance (JJ/MM/AAAA) *',
    en: 'Date of birth (DD/MM/YYYY) *',
  },
  cin_number: {
    ar: 'رقم بطاقة التعريف *',
    fr: 'Numéro CIN *',
    en: 'CIN number *',
  },
  address: {
    ar: 'العنوان *',
    fr: 'Adresse *',
    en: 'Address *',
  },
  confirm_continue: {
    ar: 'تأكيد ومتابعة →',
    fr: 'Confirmer & Continuer →',
    en: 'Confirm & Continue →',
  },

  // Validation Errors
  error_fullname: {
    ar: 'يجب أن يحتوي الاسم على كلمتين على الأقل (الاسم الأول واسم العائلة)',
    fr: 'Le nom doit contenir au moins 2 mots (prénom et nom)',
    en: 'Name must contain at least 2 words (first and last name)',
  },
  error_dob: {
    ar: 'تاريخ غير صالح. التنسيق: يوم/شهر/سنة. يجب أن يكون عمرك 18 سنة على الأقل',
    fr: 'Date invalide. Format: JJ/MM/AAAA. Vous devez avoir au moins 18 ans',
    en: 'Invalid date. Format: DD/MM/YYYY. You must be at least 18 years old',
  },
  error_cin: {
    ar: 'رقم بطاقة تعريف غير صالح. يجب أن يحتوي على 8 أرقام بالضبط',
    fr: 'Numéro CIN invalide. Doit contenir exactement 8 chiffres',
    en: 'Invalid CIN number. Must contain exactly 8 digits',
  },
  error_address: {
    ar: 'العنوان قصير جدا. 10 أحرف على الأقل',
    fr: 'Adresse trop courte. Minimum 10 caractères',
    en: 'Address too short. Minimum 10 characters',
  },

  // Liveness Check
  liveness_title: {
    ar: '🧬 فحص الحيوية',
    fr: '🧬 Vérification biométrique',
    en: '🧬 Liveness Check',
  },
  liveness_subtitle: {
    ar: 'أثبت أنك موجود - اختر طريقة التحقق',
    fr: 'Prouvez que vous êtes réel - choisissez une méthode',
    en: 'Prove you\'re real - choose a verification method',
  },
  blink_twice: {
    ar: 'رمش مرتين',
    fr: 'Cligner deux fois',
    en: 'Blink Twice',
  },
  turn_head: {
    ar: 'أدر رأسك',
    fr: 'Tourner la tête',
    en: 'Turn Head',
  },
  quick_easy: {
    ar: 'سريع وسهل',
    fr: 'Rapide et facile',
    en: 'Quick and easy',
  },
  left_right: {
    ar: 'يسار ثم يمين',
    fr: 'Gauche puis droite',
    en: 'Left then right',
  },
  skip_liveness: {
    ar: 'تخطي فحص الحيوية',
    fr: 'Ignorer la vérification',
    en: 'Skip Liveness Check',
  },

  // Auth
  login: {
    ar: 'تسجيل الدخول',
    fr: 'Connexion',
    en: 'Login',
  },
  signup: {
    ar: 'إنشاء حساب',
    fr: 'Créer un compte',
    en: 'Sign Up',
  },
  email: {
    ar: 'البريد الإلكتروني',
    fr: 'Email',
    en: 'Email',
  },
  password: {
    ar: 'كلمة المرور',
    fr: 'Mot de passe',
    en: 'Password',
  },
  logout: {
    ar: 'تسجيل الخروج',
    fr: 'Déconnexion',
    en: 'Logout',
  },
  my_profile: {
    ar: 'حسابي',
    fr: 'Mon profil',
    en: 'My profile',
  },
  preferred_language: {
    ar: 'اللغة المفضلة',
    fr: 'Langue préférée',
    en: 'Preferred language',
  },
};

export function t(key: keyof typeof translations, lang: Language): string {
  return translations[key]?.[lang] || translations[key]?.['en'] || key;
}

export function formatWithVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
}
