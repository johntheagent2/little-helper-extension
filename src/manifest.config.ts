import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// Manifest V3, Chrome + Edge (both Chromium/MV3 - single build works for both).
// Phase 1: local-only. No `identity`, no host permissions for Google APIs -
// those arrive in Phase 2 (Drive sync). See docs/design/phase1-design.md.
export default defineManifest({
  manifest_version: 3,
  name: 'TextStore',
  description:
    'Save reusable text templates locally and expand them instantly with a shortcut, in any text field.',
  version: pkg.version,
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage'],
});
