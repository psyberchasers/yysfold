"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                canvas: '#060608',
                surface: '#111218',
                accent: '#8a5cf6',
                'accent-muted': '#dcb3ff',
            },
        },
    },
    plugins: [],
};
exports.default = config;
