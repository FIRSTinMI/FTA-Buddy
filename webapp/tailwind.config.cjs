/** @type {import('tailwindcss').Config}*/
const config = {
    content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],

    plugins: [require('flowbite/plugin')],

    darkMode: 'class',

    theme: {
        extend: {
            colors: {
                primary: '#BB86FC',
                secondary: '#03DAC6',
                accent: '#3700B3',
                gray: {
                    50: '#FAFAFA',
                    100: '#F5F5F5',
                    200: '#EEEEEE',
                    300: '#E0E0E0',
                    400: '#BDBDBD',
                    500: '#9E9E9E',
                    600: '#757575',
                    700: '#616161',
                    800: '#424242',
                    900: '#212121',
                }
            }
        }
    },
};

module.exports = config;
