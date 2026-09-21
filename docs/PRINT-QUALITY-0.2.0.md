# Print quality — Anyprint 0.2.0

## Fix

The earlier version rasterized every line using small, antialiased text and a single threshold. That could discard edge pixels and produce thin strokes. Version 0.2.0 uses the printer's resident Font A for printable ASCII, with bold enabled by default. Unicode blocks use a larger, hinted monochrome renderer. Logos receive separate dithering and contrast treatment; QR patterns are not thickened.

Existing printer profiles automatically use native text and bold when quality settings are absent. Image text remains available under **Printers → Edit → Print quality** for incompatible firmware. No model-specific heating commands are guessed.

Install `releases/Anyprint-0.2.0-debug.apk` over the existing app, without uninstalling. Run **Printers → Test print** to compare normal/bold text and solid-black patterns. New settings apply to new jobs; saved jobs retain their original profile snapshots.

## Verification

- Production build, Android APK compilation, unit tests and Android lint passed.
- 13 TypeScript tests, 14 native unit tests, 12 Android instrumentation tests and 4 browser UI tests passed.
- Tests cover resident text commands, line wrapping, Unicode fallback, control-character sanitization, monochrome output, logo contrast, image line-spacing restoration and diagnostic patterns.
- QR matrices at 384 and 576 dots decoded successfully with ZXing and were identical across weight settings.
- Actual emulator upgrade from v0.1.0 retained the printer profile and a draft entered through the UI. The legacy profile received native/bold defaults.
- Actual Android WebView → native bridge → TCP simulator delivered a native receipt (518 bytes), diagnostic (18,262 bytes) and image-mode receipt (20,775 bytes). See `quality-result.json`.
- Interrupting transmission after 1,024 bytes preserved one job after duplicate submission, recovered it as uncertain, and required explicit confirmation for another copy. No automatic retry occurred.
- Raster proof `screenshots/quality-proof.png` was exported by Android instrumentation and visually inspected.
- The delivered APK signature verifies; successful in-place installation also verifies signing compatibility with v0.1.0. SHA-256 is in `releases/SHA256SUMS`.

Physical print darkness and firmware behavior still require confirmation on the user's printer. The user reports sharp printer self-test output and faint output only from the prior Anyprint build. No physical printer was available during this verification.

## References

[Epson emphasis command](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_ce.html) documents text emphasis. [Epson bit-image command](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_asterisk.html) explains why text emphasis alone does not fix raster images. The new renderer therefore also corrects image output.
