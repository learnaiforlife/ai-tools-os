# AIOS download site

Vite's automatic public-directory copying is disabled. Import reviewed assets through source code; local screenshots and old installers must never be published merely because they were left under `public/`. The previous unused screenshot is retained as a local reference at the repository root. Installer URLs come from the verified release manifest, not legacy `VITE_AIOS_*` environment variables.

This static Vite site has no filesystem bridge or access to a visitor's configuration.

```sh
npm ci
npm run dev
npm run build
```

For hosting, use `site` as the project root, `npm run build` as the build command, and `dist` as the output directory. No deployment is performed by the application build.

`src/release.json` is the only installer manifest. Set `available: false` when no build has been published. Published builds declare `channel` (`beta` or `stable`) and `verification` (`unsigned` or `developer-id-notarized`). Unsigned beta downloads are supported and clearly labeled; they do not require Apple signing to appear. Stable downloads require Developer ID signing and notarization. Both architectures require HTTPS DMG URLs, final sizes and SHA-512 checksums.

The root project's `scripts/verify-release.mjs` generates a stable manifest after both architectures pass signature, Gatekeeper, notarization, version and checksum checks. Supply `AIOS_DOWNLOAD_BASE_URL` as an HTTPS artifact directory during verification. For a beta, use the tested packages' final metadata, upload the exact bytes, verify each public download's size and checksum, then publish a manifest with `channel: "beta"` and `verification: "unsigned"`. The current beta follows that process. Do not describe an unsigned beta as Apple verified.

The manifest contains the version, minimum macOS version, architecture-specific DMG/ZIP filenames, sizes, SHA-512 digests and URLs. Only verified DMG links are shown in the page. ZIP metadata remains available in the manifest for distribution workflows.

The old `VITE_AIOS_DMG_URL`, `VITE_AIOS_VERSION` and `VITE_AIOS_ZIP_URL` settings are no longer used. Build and deploy the updated source and manifest to change the live page. Download buttons appear in both the hero and Installation section. Unsigned betas link to Apple's manual first-launch approval instructions; the site does not change macOS security settings.
