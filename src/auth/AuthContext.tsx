import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, SignupData } from './types';
import { safeRandomUUID } from '../lib/uuid';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  updateLanguage: (lang: 'ar' | 'fr' | 'en') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Check for existing session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        localStorage.removeItem('user');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    // In production, this would call your backend API
    // For now, simulate API call with localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(
      (u: any) => u.email === credentials.email && u.password === credentials.password
    );

    if (!user) {
      throw new Error('Email ou mot de passe incorrect');
    }

    // Don't store password
    const { password, ...userWithoutPassword } = user;

    setState({
      user: userWithoutPassword,
      isAuthenticated: true,
      isLoading: false,
    });

    localStorage.setItem('user', JSON.stringify(userWithoutPassword));
  };

  const signup = async (data: SignupData) => {
    // In production, this would call your backend API
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Check if email already exists
    if (users.some((u: any) => u.email === data.email)) {
      throw new Error('Cet email est déjà utilisé');
    }

    const newUser: User & { password: string } = {
      id: safeRandomUUID(),
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      createdAt: new Date().toISOString(),
      ekycCompleted: false,
      preferredLanguage: data.preferredLanguage,
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    // Don't store password
    const { password, ...userWithoutPassword } = newUser;

    setState({
      user: userWithoutPassword,
      isAuthenticated: true,
      isLoading: false,
    });

    localStorage.setItem('user', JSON.stringify(userWithoutPassword));
  };

  const logout = () => {
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    localStorage.removeItem('user');
  };

  const updateLanguage = (lang: 'ar' | 'fr' | 'en') => {
    if (!state.user) return;

    const updatedUser = { ...state.user, preferredLanguage: lang };
    setState(prev => ({ ...prev, user: updatedUser }));
    localStorage.setItem('user', JSON.stringify(updatedUser));

    // Update in users array
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex((u: any) => u.id === state.user!.id);
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], preferredLanguage: lang };
      localStorage.setItem('users', JSON.stringify(users));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        logout,
        updateLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
