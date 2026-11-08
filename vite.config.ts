import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // The generated stat tables are most of the bundle and change only when
        // source A is re-pinned, so they get their own long-cached chunk, and
        // React its own. App updates then re-download only the app chunk.
        codeSplitting: {
          groups: [
            { name: 'data-tables', test: /[\\/]src[\\/]data[\\/]generated[\\/]/ },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
