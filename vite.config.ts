import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev` = plain http (localhost demo, browser pane, two tabs).
// `npm run dev:https` = self-signed https so phones on the LAN get a secure
// context (required for geolocation + camera on real devices).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: true, // listen on the LAN so a phone can scan the session QR
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
}));
