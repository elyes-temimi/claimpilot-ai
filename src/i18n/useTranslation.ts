import { useAuth } from '../auth/AuthContext';
import { t, formatWithVars, type Language } from './translations';

export function useTranslation() {
  const { user } = useAuth();
  const lang: Language = user?.preferredLanguage || 'fr';

  const translate = (key: Parameters<typeof t>[0], vars?: Record<string, string>) => {
    const text = t(key, lang);
    return vars ? formatWithVars(text, vars) : text;
  };

  return { t: translate, lang };
}
