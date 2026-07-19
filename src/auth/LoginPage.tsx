import { useState } from 'react';
import { useAuth } from './AuthContext';
import { useTranslation } from '../i18n/useTranslation';

export function LoginPage({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ email, password });
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-icon">🛡️</div>
        <h1>ASSURINI AI</h1>
        <h2>{t('login')}</h2>
        <p className="auth-subtitle">Accédez à votre compte</p>

        <form onSubmit={handleSubmit} className="auth-form">
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
            {t('password')}
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
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
            {isLoading ? 'Connexion...' : t('login')}
          </button>
        </form>

        <div className="auth-footer">
          <p>Pas encore de compte ?</p>
          <button className="linklike" onClick={onSwitchToSignup}>
            {t('signup')} →
          </button>
        </div>
      </div>
    </div>
  );
}
