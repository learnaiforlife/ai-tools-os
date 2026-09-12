import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'site/node_modules/**', 'dist/**', 'site/dist/**', 'release*/**', 'docs/**', 'test-results/**', 'design_src/**',
    'src/agents.jsx', 'src/config.jsx', 'src/dashboard.jsx', 'src/data.jsx', 'src/data2.jsx', 'src/drawer.jsx', 'src/learn.jsx', 'src/library.jsx', 'src/mcp.jsx', 'src/memory.jsx', 'src/onboarding.jsx', 'src/palette.jsx', 'src/security.jsx', 'src/settings.jsx', 'src/share.jsx', 'src/shell.jsx', 'src/skills.jsx', 'src/statusline.jsx', 'src/theme.js', 'src/tokens.jsx', 'src/tools.jsx', 'src/tweaks-panel.jsx', 'src/ui.jsx'] },
  js.configs.recommended,
  { files: ['**/*.{js,mjs,cjs,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] } },
  { files: ['src/**/*.jsx'], rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_', caughtErrors: 'none' }] } },
];
