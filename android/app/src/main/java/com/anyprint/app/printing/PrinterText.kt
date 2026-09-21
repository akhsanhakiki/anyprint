package com.anyprint.app.printing

/** Only printable ASCII enters the printer's character interpreter. Unicode is rasterized. */
object PrinterText {
    fun clean(value: String): String = value.replace("\r\n", "\n").replace('\r', '\n').replace("\t", "    ").map {
        if((it.code < 32 && it != '\n') || it.code == 127) '\uFFFD' else it
    }.joinToString("")

    fun supported(value: String) = value.all { it == '\n' || it.code in 32..126 }

    fun wrap(value: String, columns: Int): List<String> {
        require(columns >= 1)
        require(supported(value))
        val result = mutableListOf<String>()
        for(line in value.split('\n')) {
            var remaining = line
            while(remaining.length > columns) {
                val space = remaining.lastIndexOf(' ', columns)
                val end = if(space > 0) space else columns
                result.add(remaining.substring(0, end))
                remaining = remaining.substring(end).trimStart(' ')
            }
            result.add(remaining)
        }
        return result
    }

    fun encode(value: String, dots: Int, bold: Boolean, centered: Boolean, large: Boolean): ByteArray {
        require(dots in 192..832 && dots % 8 == 0)
        require(supported(value)) { "Unicode text must use image fallback." }
        // Common ESC/POS Font A is a 12 × 24 dot cell. Integer enlargement uses printer glyphs.
        val lines = wrap(value, maxOf(1, dots / if(large) 24 else 12))
        val style = byteArrayOf(
            0x1b, 0x4d, 0, // Font A
            0x1b, 0x20, 0, // No additional character spacing
            0x1b, 0x61, if(centered) 1 else 0,
            0x1b, 0x45, if(bold) 1 else 0,
            0x1d, 0x21, if(large) 0x11 else 0,
            0x1b, 0x32 // Restore normal line spacing after any image block
        )
        return style + (lines.joinToString("\n") + "\n").toByteArray(Charsets.US_ASCII) + reset
    }
    val reset = byteArrayOf(0x1b, 0x61, 0, 0x1b, 0x45, 0, 0x1d, 0x21, 0)
}
