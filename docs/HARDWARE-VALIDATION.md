# Physical printer validation

No physical printer was connected during development. Mark a model supported only after this checklist passes on the actual model and transport. Record its firmware version and Android device, not just the brand.

## Test matrix

| Model / firmware | Android phone / OS | Transport | Paper / printable dots | Image mode | Result |
| --- | --- | --- | --- | --- | --- |
| Pending hardware | — | Bluetooth Classic | 58 mm / 384 | Standard + compatibility | Not tested |
| Pending hardware | — | USB Printer Class | 58 mm / 384 | Standard + compatibility | Not tested |
| Pending hardware | — | Raw TCP | 80 mm / 576 | Standard + compatibility | Not tested |

## Setup and output

- Grant and deny Nearby devices and USB permissions. Denial must be recoverable.
- Pair, select, save, restart, and run a diagnostic receipt.
- Verify entire width, long item names, IDR and decimal currency totals, accented text, logo legibility, and QR scanning.
- Calibrate printable dot width; do not infer it solely from paper width.
- Verify feed distance and optional cutter; leave cutting disabled on tear-bar devices.
- Run Standard and Compatibility mode. Keep the working profile saved per printer.
- Print a long receipt and 20 sequential receipts. There must be no mixed jobs or corrupted blocks.

## Failure recovery

- Power off before printing: job must fail safely or report an appropriate connection failure.
- Disconnect midway: app must mark outcome uncertain, never automatically resend.
- Pull paper / open lid: hardware may accept bytes anyway. UI must never promise physical completion.
- Reconnect and reselect USB, then retry a pre-send failure.
- Tap Print repeatedly: one in-flight UI submission must enqueue once.
- Switch apps during printing and return; queue must remain readable.
- Force-stop during sending, reopen: show uncertain outcome and require explicit copy.
- Restart with queued jobs: resume only on user action.
- Test with Android battery saver and the specific manufacturer's background restrictions.
- For two identical USB printers: reselect the correct device after reconnection; do not assume vendor/product IDs distinguish them.

## Production gates

- Sign a release build privately, test an upgrade without data loss, and retain the key securely.
- Validate behavior on the minimum Android/WebView version you will support in practice.
- Validate representative low-cost 58 mm and 80 mm hardware before claiming broad compatibility.
