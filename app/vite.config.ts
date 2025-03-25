import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import Icons from 'unplugin-icons/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        svelte(),
        Icons({
            compiler: 'svelte',
        }),
        visualizer({
            open: true, // opens the report in your browser automatically
            gzipSize: true,
            brotliSize: true,
            filename: 'build-stats.html',
        }),
    ],
    base: "/app/",
});
