# AIOS download site

Vite's automatic public-directory copying is disabled. Import reviewed assets through source code; local screenshots and old installers must never be published merely because they were left under `public/`. Local reference screenshots are not part of the published source or site. Installer URLs come from the verified release manifest, not legacy `VITE_AIOS_*` environment variables.

This static Vite site has no filesystem bridge or access to a visitor's configuration.

```sh
npm ci
npm run dev
npm run build
```

For hosting, use `site` as the project root, `npm run build` as the build command, and `dist` as the output directory. No deployment is performed by the application build.

`src/release.json` is the only installer manifest. Its default is `available: false`, so there are no broken fallback links or unsigned download instructions. The root project's `scripts/verify-release.mjs` can generate this manifest after both architectures pass signature, Gatekeeper, notarization, version and checksum checks. Supply `AIOS_DOWNLOAD_BASE_URL` as an HTTPS artifact directory during verification. Upload the exact verified bytes, without renaming or modifying them, then build/deploy the site.

The manifest contains the version, minimum macOS version, architecture-specific DMG/ZIP filenames, sizes, SHA-512 digests and URLs. Only verified DMG links are shown in the page. ZIP metadata remains available in the manifest for distribution workflows.

The old `VITE_AIOS_DMG_URL`, `VITE_AIOS_VERSION` and `VITE_AIOS_ZIP_URL` settings are no longer used. This change does not alter an already-deployed site until the updated source and verified manifest are deployed. Do not distribute older unsigned installers or recommend quarantine bypasses.
