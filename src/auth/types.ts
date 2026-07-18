export interface User {
  id: string;
  email: string;
  fullName: string;
  cinNumber?: string;
  createdAt: string;
  ekycCompleted: boolean;
  preferredLanguage: 'ar' | 'fr' | 'en';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  preferredLanguage: 'ar' | 'fr' | 'en';
}
