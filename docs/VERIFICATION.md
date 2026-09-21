# Verification — Anyprint 0.1.0

The delivered APK is `releases/Anyprint-0.1.0-debug.apk` (approximately 4.5 MB). Its SHA-256 is recorded in `releases/SHA256SUMS`. The APK signature verifies, and the packaged file matches the successfully built APK.

## Passed

- TypeScript checking and production web build.
- Android debug APK compilation for SDK 36 / minimum SDK 24.
- Android lint: no errors; remaining warnings concern template resources and newer dependency versions.
- 11 receipt/profile validation and currency-calculation tests.
- 6 native ESC/POS byte-encoding and failure-classification unit tests.
- 4 Android instrumentation tests on an Android 15 / API 35 ARM64 emulator: rendering at multiple widths, exact TCP byte delivery, queue deduplication and retry protection, malformed-receipt rejection.
- 3 browser UI tests: persistent receipt editing and totals, honest browser limitations, and navigation/layout at 320 px.
- npm dependency audit: zero reported vulnerabilities, including development dependencies.

## Actual Android UI + native bridge

The final APK was installed on the emulator and operated through its actual WebView UI. No fake printing adapter was used.

- Added a native network printer profile and printed a diagnostic receipt plus an edited receipt to a local TCP printer simulator.
- Received two complete jobs. Diagnostic output contained 40,029 ESC/POS bytes.
- Decoded the native output to a 384 × 828 PNG and visually inspected text, accented characters, amount, and QR structure (`screenshots/native-test-receipt.png`). This does not replace scanning a QR printed on physical paper.
- Closed the simulator, attempted another print, observed `Not sent` with an explicit safe retry, and cancelled the failed job.
- Denied the actual Android Nearby devices permission dialog and observed the recoverable error.
- Queried USB devices with no printer attached and observed the appropriate empty state.

## Interruption and duplicate protection

The recovery script submitted the same native job ID twice. Exactly one job existed. It then force-stopped the app after 1,026 bytes had reached the simulator, while the durable job state was `sending`.

After reopening, the job was `unknown` (shown as **Check the paper**), no safe-retry button was offered, and reprinting required an explicit copy confirmation. Dismissing that confirmation left the original job unchanged. See `recovery-result.json`.

## Not verified

No physical printer was connected. Bluetooth radio transport, actual USB transfer, firmware compatibility, paper feed, cutter operation, buffer capacity, physical QR readability, and manufacturer-specific Android background behavior remain hardware-validation items. BLE-only printers, proprietary embedded printers, and USB-serial adapters are not implemented.

This is a debug-signed testing build, not a production or Play Store release. Follow `HARDWARE-VALIDATION.md` before deploying to a checkout counter.
