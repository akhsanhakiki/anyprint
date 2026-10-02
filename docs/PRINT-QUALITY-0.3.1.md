# Print-quality conclusion — Anyprint 0.3.1

## Conclusion from the physical test

The VSC TM-58D Pro built-in self-test was sharp. The user later identified the thermal paper as the cause of the pale/mottled Anyprint receipt. This rules out a source-image-resolution defect as the practical cause of that printed result.

A 58 mm thermal printer has a fixed printhead resolution—commonly 384 dots across at about 203 dpi. A higher-resolution image file cannot create additional physical dots. Anyprint already sends images as one-bit data at the configured printer-dot width. The correct remedy for the observed paper result is suitable thermal paper and a clean, adequately powered printer, rather than an undocumented ESC/POS heat or density command.

## Generic printer behaviour

Anyprint targets ESC/POS-compatible printers through Bluetooth Classic, USB Printer Class, and raw TCP. Printer profiles retain independently selectable paper width, printable dot width, text mode, logo rendering, image protocol, pacing, and cutter setting. No model-specific preset or model detection is used.

- **Raster (GS v 0)** is the common default image path.
- **Column (ESC *)** is an alternate image path for firmware that handles it better.
- Both paths send the same source dots without rescaling; the compact test prints both so a user can select the clearer result for their own printer.
- **Solid** logo mode is for lettering and flat logos. **Photo** mode uses halftoning for shaded artwork.
- A short test uses no sale data, QR code, or long footer and normally consumes about 4–5 cm on a 384-dot/58 mm printer.

This is general compatibility behavior, not a claim that all printers advertised as thermal printers implement the same ESC/POS commands. BLE-only, USB-serial, proprietary protocols, firmware limitations, printhead wear, paper quality, power, and mechanical calibration remain device-specific.

## Validation

- The two image encoders preserve every black/white dot at 192, 384, 576, and 832-dot widths, including incomplete 24-dot bands.
- The compact test sends both image protocols and excludes sale totals and QR content.
- Existing printer profiles remain compatible; omitted quality fields use the safe native/bold/solid defaults.
- TypeScript validation, browser UI tests, Android unit and instrumentation tests, Android lint, and APK assembly passed before release.

For the command details behind the generic paths, see [Epson's GS v 0 reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html) and [ESC * reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_asterisk.html).
