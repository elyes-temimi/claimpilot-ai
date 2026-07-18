import { useState } from 'react';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';

export function AuthScreen() {
  const [view, setView] = useState<'login' | 'signup'>('login');

  return view === 'login' ? (
    <LoginPage onSwitchToSignup={() => setView('signup')} />
  ) : (
    <SignupPage onSwitchToLogin={() => setView('login')} />
  );
}
