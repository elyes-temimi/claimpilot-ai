import { useState } from 'react';
import { useAuth } from './AuthContext';
import { useTranslation } from '../i18n/useTranslation';

export function SignupPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signup } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'ar' | 'fr' | 'en'>('fr');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate password
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsLoading(true);

    try {
      await signup({ email, password, fullName, preferredLanguage });
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-icon">🛡️</div>
        <h1>ClaimPilot AI</h1>
        <h2>{t('signup')}</h2>
        <p className="auth-subtitle">Commencez votre vérification eKYC</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-label">
            {t('full_name')}
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ahmed Ben Mohamed"
              required
            />
          </label>

          <label className="form-label">
            {t('email')}
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
            />
          </label>

          <label className="form-label">
            {t('password')} (min. 6)
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>

          <label className="form-label">
            {t('preferred_language')}
            <select
              className="form-input"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as 'ar' | 'fr' | 'en')}
            >
              <option value="fr">🇫🇷 Français</option>
              <option value="ar">🇹🇳 العربية (Arabe)</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </label>

          {error && (
            <div className="auth-error">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-danger btn-wide"
            disabled={isLoading}
          >
            {isLoading ? 'Création...' : t('signup')}
          </button>
        </form>

        <div className="auth-footer">
          <p>Déjà un compte ?</p>
          <button className="linklike" onClick={onSwitchToLogin}>
            {t('login')} →
          </button>
        </div>
      </div>
    </div>
  );
}
