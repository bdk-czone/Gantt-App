/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
  prompt?: string;
  token_type?: string;
  scope?: string;
}

interface GoogleOAuthTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleOAuthTokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

interface GoogleOAuthRequestOptions {
  prompt?: '' | 'consent' | 'select_account';
}

interface GoogleOAuthTokenClient {
  callback: (response: GoogleOAuthTokenResponse) => void;
  requestAccessToken: (options?: GoogleOAuthRequestOptions) => void;
}

interface GoogleAccountsOauth2 {
  initTokenClient: (config: GoogleOAuthTokenClientConfig) => GoogleOAuthTokenClient;
  revoke: (token: string, done?: () => void) => void;
}

interface GoogleAccountsNamespace {
  oauth2: GoogleAccountsOauth2;
}

interface GoogleNamespace {
  accounts: GoogleAccountsNamespace;
}

interface Window {
  google?: GoogleNamespace;
}
