# Anyprint — Android first

An offline Android receipt-printing app with a reusable React interface and a native Kotlin print engine. No account or cloud service is required. This repository implements Android; a desktop printing bridge is not yet included.

## Install and use

Use `releases/Anyprint-0.3.0-debug.apk` on Android 7.0 or newer. This is a debug-signed testing build, not a Play Store release. Android will ask you to allow installation from the app used to open the APK.

1. Open **Printers → Add your first printer**.
2. Choose Bluetooth, USB, or Network.
3. Bluetooth: first pair the printer in Android settings, then show paired devices. Allow Nearby devices permission when asked.
4. USB: attach a USB OTG adapter, find the printer, and allow USB access. If reconnected, select it again to renew permission.
5. Network: enter the printer's IP address and raw print port (usually 9100); use the same local network.
6. Name the printer, select paper width, save, and run **Test print**.
7. Under **Print**, edit your receipt, preview it, then print. Track the result in **Activity**.

If a test is blank or garbled, try **Compatibility settings → Image mode → Compatibility**. If clipped, change printable width in multiples of eight dots. For unreliable small buffers, choose Slow transfer pacing. Only enable cutting on printers with a cutter.

Version 0.3.0 preserves larger logo detail and defaults to solid lettering; Photo rendering remains available. Existing profiles keep their connection and text settings. Install over the previous version without uninstalling. **Test print** now prints a short A/B image comparison (approximately 4–5 cm at 384 dots). Under **Printers → Edit → Print quality**, an optional VSC TM-58D Pro setup selects a generic alternate image path; it is not a certified model-specific density command. Save and compare the A/B slip. See [image-quality analysis and verification](docs/PRINT-QUALITY-0.3.0.md).

## Compatibility contract

| Connection | Implemented | Limits |
| --- | --- | --- |
| Bluetooth Classic | Android bonded devices, standard SPP / RFCOMM UUID | Not BLE-only printers or custom RFCOMM protocols. Pair in Android settings. |
| USB OTG | USB Printer Class (class 7), bulk OUT | Android USB host/OTG required. USB-serial chipsets and proprietary interfaces need separate drivers. |
| Wi-Fi / Ethernet | Raw TCP, configurable host and port | Printer must accept ESC/POS raw bytes and be reachable on the network. |
| Paper | 58 mm, 80 mm, configurable 58–112 mm | Printable width is separately configurable: 192–832 dots, multiples of eight. |
| Content | Text, Unicode raster rendering, PNG/JPEG/WebP logo, raster QR | Device fonts determine available glyphs. Maximum 40 items and 16,000 rendered rows. |

Both GS v 0 raster and ESC * 24-dot modes are implemented. They are alternative compatibility modes, not universal guarantees. No real printer model is certified yet: simulator/emulator validation cannot verify paper handling, firmware dialects, mechanical cutters, or Bluetooth/USB hardware behavior. See [hardware checklist](docs/HARDWARE-VALIDATION.md) and [verification results](docs/VERIFICATION.md).

Receipt preview approximates paper layout; native wrapping is based on the selected printer's dot width. The app currently supports simple itemized receipts, not tax accounting, inventory, payments, or fiscal compliance.

## Reliability model

- SQLite stores the complete immutable printer and receipt snapshot before transmission.
- A native foreground service serializes jobs. It continues while switching apps; Android force-stop and device shutdown still interrupt it.
- A stable client job ID prevents duplicate enqueue after an uncertain bridge response.
- Failures before transmission are **Not sent**, with an explicit safe retry.
- Once the first write is attempted, any error becomes **Check the paper**. No automatic retries are performed.
- A process restart changes interrupted sending jobs to uncertain, and interrupted connecting jobs to safely failed. Queued jobs remain saved; use **Resume**.
- **Sent to printer** means transport writes completed. It is not proof that paper printed; no bidirectional paper-out/cutter status protocol is assumed.
- Reprinting creates a new job marked **COPY / REPRINT** after confirmation.
- Jobs are bounded to 100 pending; Activity shows the most recent 200. Historical jobs remain stored locally.
- The transport has a 90-second deadline, an 8-second TCP connection timeout, 5-second USB write timeouts, 512-byte chunks, and configurable pacing.
- There is no network listener, external print intent, remotely loaded website, analytics, or cloud receipt storage. Native capabilities are exposed only to bundled application code.

## Develop

Requirements: Node 22+, npm, Java 21, Android SDK platform 36 and platform-tools. A current Android System WebView is recommended, especially on old Android devices. SDK/toolchain setup follows Capacitor 8.

```sh
npm ci
npm run dev                 # Honest UI preview; hardware actions require Android
npm run android:sync        # Build and bundle the interface into Android
npm run android:open        # Open Android Studio
```

Set `JAVA_HOME` to Java 21 and `ANDROID_HOME` to the Android SDK, or set `sdk.dir` in the ignored `android/local.properties` file. On this Mac, Android Studio includes Java 21 at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.

```sh
cd android
./gradlew :app:assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

The checked-in lockfile installs cleanly with `npm ci`. If updating dependencies encounters npm 10's `edgesOut` peer-resolution error, use npm 11 for the update (`npx npm@11 install`).

## Verify

```sh
npm test
npx playwright install chromium
npm run test:e2e
cd android
./gradlew :app:testDebugUnitTest :app:lintDebug
./gradlew :app:connectedDebugAndroidTest # connected emulator/device
```

`scripts/android-ui-test.mjs` tests the actual debug app through its WebView and a TCP printer simulator. It requires a clean emulator install and port 9222 forwarded to its `webview_devtools_remote_<app-pid>` socket. It uses the emulator-only host address `10.0.2.2:19100`; do not enter that address on a physical phone.

## Structure

- `src/`: React screens, receipt model, validation, native API boundary, styles.
- `android/app/src/main/java/com/anyprint/app/printing/`: Capacitor plugin, SQLite store, foreground service, receipt renderer, ESC/POS encoder, and Bluetooth/USB/TCP transports.
- `docs/`: architecture, verification evidence, and hardware test checklist.
- `releases/`: installable testing APK.

Release publishing requires a private release signing key and testing with the target printers. Do not publish the debug APK as a production release.
