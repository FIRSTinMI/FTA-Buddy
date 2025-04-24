import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        svelte(),
        Icons({
            compiler: 'svelte',
        }),
        tailwindcss()
    ],
    base: "/",
});
