import { useAuth } from '../auth/AuthContext';

export function LanguageSelector() {
  const { user, updateLanguage } = useAuth();

  if (!user) return null;

  const languages = [
    { code: 'fr' as const, label: 'FR', flag: '🇫🇷', name: 'Français' },
    { code: 'ar' as const, label: 'AR', flag: '🇹🇳', name: 'العربية' },
    { code: 'en' as const, label: 'EN', flag: '🇬🇧', name: 'English' },
  ];

  return (
    <div className="language-selector">
      {languages.map((lang) => (
        <button
          key={lang.code}
          className={`lang-btn ${user.preferredLanguage === lang.code ? 'active' : ''}`}
          onClick={() => updateLanguage(lang.code)}
          title={lang.name}
        >
          {lang.flag} {lang.label}
        </button>
      ))}
    </div>
  );
}
