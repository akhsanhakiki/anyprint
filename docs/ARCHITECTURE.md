# Android architecture

## UI and native boundary

React is bundled in the APK and served by Capacitor's local asset origin. It is not fetched from a remote host. UI state is a local draft and a selected-printer preference. The native module is authoritative for saved printer profiles and jobs.

`PrinterPlugin` validates incoming structured data and handles Android device permissions. It does not accept arbitrary raw ESC/POS bytes from external callers. The Android service is not exported. The browser build explicitly rejects hardware operations.

## Job state machine

```
queued -> connecting -> sending -> sent
            |             |
          failed        unknown
            |
       explicit retry -> queued

queued / failed -> explicit cancel -> cancelled
sent / unknown -> confirmed reprint -> new queued job with COPY marker
```

A job snapshots the profile and receipt at enqueue. Editing or deleting the profile does not alter a pending or historical job. This is important for predictable recovery and auditability; use a new print job to target an edited printer.

On a fresh process, any `sending` job becomes `unknown` and any `connecting` job becomes `failed`. A write can succeed at the printer but fail to be acknowledged at the host, so exactly-once physical printing is not promised.

## Rendering and transport

Version 0.2.0 encodes printable ASCII as resident Font A text (12 × 24 dots), with emphasis enabled by default. Unicode blocks fall back to Android raster rendering; image text mode renders the whole receipt for firmware compatibility. Shared structured receipt blocks preserve content and totals across both modes. Missing quality fields on older profiles default to native text and bold weight.

Raster text uses hinted 24-dot fonts and a strict monochrome threshold. Logos are composited onto white at final dot dimensions, using a solid threshold by default or optional photo dithering. The previous 160-dot height cap is replaced by a printable-area square bound. Stronger weight increases dot coverage. QR modules use integer scaling and remain unchanged by weight settings. No undocumented heating or density commands are sent.

The compact quality diagnostic always compares identical samples over raster and column protocols. It bypasses sale layout and the selected full-image mode, with a shorter final feed. Model-labelled setup is optional and uses generic commands only.

All rendering and encoding completes before opening the transport. The encoder emits either GS v 0 horizontal raster bands or ESC * 24-dot vertical bands for images, restoring text line spacing afterwards. Data is divided into 512-byte writes with profile-controlled delays. Initialization, content, feed, and optional cut remain serialized. A timeout closes the connection to unblock writes.

The initial version deliberately does not infer paper-out state or print completion from a successful socket write. Firmware-specific status adapters can be added after testing. BLE and USB-serial drivers are similarly separate future adapters.

## Scope and security

Only Android is operational. The shared React layer is ready for a future Windows/macOS bridge, but the current browser build is a preview. There is no relay server, print-from-another-website API, or cloud synchronization.

The app needs Nearby devices permission for Bluetooth on Android 12+, USB device permission, Internet access for raw TCP, and a foreground connected-device service. It does not scan for location, use the camera, or access contacts. Receipt data is stored in app-private storage, with Android cloud backup disabled. The debug build exposes WebView debugging for test automation; a normal release build does not.
