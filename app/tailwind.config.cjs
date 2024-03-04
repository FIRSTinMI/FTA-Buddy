/** @type {import('tailwindcss').Config}*/
const config = {
    content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],

    plugins: [require('flowbite/plugin')],

    darkMode: 'class',

    theme: {
        extend: {
            colors: {
                primary: {
                    '50': '#f9f5ff',
                    '100': '#f2e9fe',
                    '200': '#e7d6fe',
                    '300': '#d4b6fc',
                    '400': '#b988f8',
                    '500': '#ac71f4',
                    '600': '#8838e5',
                    '700': '#7427c9',
                    '800': '#6325a4',
                    '900': '#521f84',
                    '950': '#360a61',
                },
                secondary: {
                    '50': '#f2f0ff',
                    '100': '#e8e4ff',
                    '200': '#d3ccff',
                    '300': '#b2a4ff',
                    '400': '#8e70ff',
                    '500': '#6c37ff',
                    '600': '#5d0fff',
                    '700': '#4e00ff',
                    '800': '#4100da',
                    '900': '#3700b3',
                    '950': '#1e007a',
                },
                accent: {
                    '50': '#ebfeff',
                    '100': '#cdf9ff',
                    '200': '#a1f1ff',
                    '300': '#60e4ff',
                    '400': '#18cdf8',
                    '500': '#00b0de',
                    '600': '#0086b3',
                    '700': '#086f96',
                    '800': '#105a7a',
                    '900': '#124b67',
                    '950': '#053047',
                },
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
