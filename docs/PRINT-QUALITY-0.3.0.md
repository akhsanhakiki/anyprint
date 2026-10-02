# Superseded by Anyprint 0.3.1

This investigation was completed after the user identified the thermal paper as the cause of the physical print-quality issue. See [the final generic-printer conclusion](PRINT-QUALITY-0.3.1.md).

# Historical investigation: Anyprint 0.3.0 — image fidelity and compact calibration

## Findings from the user's print

The user identifies the printer as VSC TM-58D Pro and reports a sharp built-in self-test. The photo shows the previous native/bold setting. Both resident characters and the supposedly solid image patch appear mottled. The patch is generated directly as black pixels, without logo dithering. Its missing density cannot be attributed to low-resolution source artwork or corrected merely by increasing a file's DPI. The photo alone cannot establish the firmware, thermal-energy, transport or mechanical cause; it does show that the previous fix did not resolve the physical output.

Two independently verifiable software issues were found:

1. Logos were constrained to 160 dots high even when a square image could use most of the printer's printable width. A 360 × 360 logo therefore shrank to 160 × 160, discarding detail unnecessarily.
2. All logos used photo dithering. Flat gray/color lettering then became a pattern of black and white dots, rather than solid strokes. This affected uploaded logos, not the solid diagnostic patch.

## Changes

- Preserve square logos up to the printable area (368 × 368 at a configured 384-dot width). Do not upscale small source files. The final conversion occurs at actual printer-dot dimensions.
- Default to **Solid** rendering for logos/lettering. **Photo** dithering remains selectable for shaded artwork. Alpha is composited on white. QR matrices remain unchanged.
- Add an optional **Use VSC TM-58D Pro setup** action: 58 mm / 384 dots, bold image text, solid logos, ESC * mode 33 column images, 30 ms transport pacing, cutter disabled. It preserves connection/address and only affects the profile being edited after Save. This is an alternate generic ESC/POS path to try, not a certified VSC firmware profile. Transfer pacing is not a print-speed or heat command.
- Keep generic defaults and both ESC/POS protocols; no model detection, global override or undocumented heating commands.
- Replace the long diagnostic with five short native lines and two identical 72-row image samples, labelled **A / Raster** and **B / Column**. It omits sale items, totals, long footer and QR. At 384 dots the estimated feed is 352 dots including a 48-dot tear allowance (approximately 4–5 cm on common 8-dot/mm hardware). Actual default text line feed is firmware-dependent.
- Diagnostic always compares both image protocols, even with Image text selected. Ordinary receipts use the saved protocol.

The A/B slip is essential because both encoders already specify full density: GS v 0 mode 0 is 1:1, and ESC * mode 33 is 24-dot double density. A mode change is a firmware compatibility experiment, not a claim to exceed printhead resolution. If A is clearer, select Raster; if B is clearer, select Column. If both solid patches remain mottled while self-test remains sharp, the next investigation requires this exact model's supported print-density settings or a known-good application's command stream; raising raster resolution cannot fill missing physical dots.

## Verification

- Production web build, APK build and Android lint passed.
- 49 tests passed: 15 TypeScript, 15 native unit, 14 Android instrumentation and 5 browser UI tests.
- Every encoded pixel round-tripped through both formats at widths 192, 384, 576 and 832 dots, including partial final bands. Solid pixels remain set and white padding remains clear.
- A 360 × 360 source with a one-dot line retained that line at 1:1. Solid mode preserved flat ink; Photo mode retained its separate dithering behavior.
- A/B image samples have identical pixels and contain a verified all-black 80 × 24 rectangle. The compact stream contains both commands and no sale total; QR regression tests still decode at 384 and 576 dots.
- Actual emulator update from 0.2.0 retained an entered draft and a legacy profile. UI preset selection saved correctly and delivered column-mode receipt bytes through the native bridge to a TCP simulator.
- Simulator received 518 bytes for native receipt, 7,229 bytes for compact A/B test, and 20,888 bytes for image/column receipt. See `quality-030-result.json`.
- Android-rendered visual proof: `screenshots/quality-030-proof.png`. This shows expected pixels, not a physical paper result.
- No physical VSC printer was connected. Bluetooth/USB firmware-specific quality and printed darkness are unverified. Generic compatibility remains limited to supported ESC/POS transports, not every device sold as a thermal printer.

## Sources and limits of model research

- [Epson GS v 0 reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html): mode 0 uses normal scaling; raster graphics are unaffected by character emphasis/double-strike modes.
- [Epson ESC * reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_asterisk.html): alternative column-image encoding. Exact density/feed implementation remains printer-dependent.
- [iREAP's own VSC MP-58X integration guide](https://www.ireappos.com/id/how-to-ireappos-pro/print-struk-penjualan-menggunakan-mini-printer-bluetooth-vsc-mp58x.php): demonstrates a 360-pixel logo workflow on a different VSC 58 mm model. It is not a TM-58D Pro programming manual and was not used to infer proprietary commands.

No authoritative TM-58D Pro programming manual or documented model-specific density command was located. No such command was invented or borrowed from an unrelated printer.
