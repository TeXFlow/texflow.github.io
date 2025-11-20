
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    // Base "./" ensures assets are loaded relatively, which is required for GitHub Pages
    base: './'
  };
});
