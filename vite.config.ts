import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';

export default defineConfig(({ mode }) => ({
  plugins:
    mode === 'development' && process.env.VITE_COVERAGE === 'true'
      ? [istanbul({ include: ['src/**/*', 'index.tsx'], requireEnv: true })]
      : [],
}));
