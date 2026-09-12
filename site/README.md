# AIOS download site

Vite's automatic public-directory copying is disabled. Import reviewed assets through source code; local screenshots and old installers must never be published merely because they were left under `public/`. The previous unused screenshot is retained as a local reference at the repository root. Installer URLs come from the verified release manifest, not legacy `VITE_AIOS_*` environment variables.

This static Vite site has no filesystem bridge or access to a visitor's configuration.

```sh
npm ci
npm run dev
npm run build
```

For hosting, use `site` as the project root, `npm run build` as the build command, and `dist` as the output directory. No deployment is performed by the application build.

`src/release.json` is the only installer manifest. Set `available: false` when no build has been published. Published builds declare `channel` (`beta` or `stable`) and `verification` (`unsigned`, `ad-hoc` or `developer-id-notarized`). Beta downloads without an Apple certificate are supported and clearly labeled. Stable downloads require Developer ID signing and notarization. Both architectures require HTTPS DMG URLs, final sizes and SHA-512 checksums. New beta packages use complete ad-hoc signatures, which protect bundle integrity without establishing Apple trust.

The root project's `scripts/verify-release.mjs` generates a stable manifest after both architectures pass signature, Gatekeeper, notarization, version and checksum checks. Supply `AIOS_DOWNLOAD_BASE_URL` as an HTTPS artifact directory during verification. For a beta, run `npm run dist:mac:beta` from the repository root, use its tested final metadata, upload the exact bytes, verify each public download's size and checksum, then publish a manifest with `channel: "beta"` and `verification: "ad-hoc"`. The current beta follows that process. Do not describe an ad-hoc beta as Apple verified. The beta build command validates signatures in both built apps and both ZIP/DMG pairs, then tests installation, native saves and reinstall persistence.

The site manifest contains the version, minimum macOS version and both published DMGs' filenames, sizes, SHA-512 digests and URLs. ZIP metadata is retained in package-validation results. Both download sections display the same verified DMG links.

The old `VITE_AIOS_DMG_URL`, `VITE_AIOS_VERSION` and `VITE_AIOS_ZIP_URL` settings are no longer used. Build and deploy the updated source and manifest to change the live page. Download buttons appear in both the hero and Installation section. Unsigned betas link to Apple's manual first-launch approval instructions; the site does not change macOS security settings.
