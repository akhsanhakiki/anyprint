package com.anyprint.app.printing

import android.graphics.Bitmap
import android.graphics.Color
import org.json.JSONObject

/** Prepare every byte before connecting, so malformed content can never partially print. */
object ReceiptEncoder {
    fun encode(receipt: JSONObject, profile: JSONObject): List<ByteArray> {
        val width = profile.getInt("dots")
        require(width in 192..832 && width % 8 == 0)
        val sharp = profile.optString("textMode", "native") == "native"
        val strong = profile.optString("textWeight", "bold") == "bold"
        val logoDither = profile.optString("logoMode", "solid") == "photo"
        val diagnostic = receipt.optBoolean("qualityCheck")
        val legacy = profile.optString("imageMode", "raster") == "column"
        val commands = mutableListOf<ByteArray>()
        var rows = 0
        commands.add(EscPos.initialize)
        // Restore default character set/mode, left margin and printable width after another app.
        commands.add(byteArrayOf(0x1c, 0x2e, 0x1b, 0x52, 0, 0x1b, 0x74, 0, 0x1d, 0x4c, 0, 0,
            0x1d, 0x57, (width and 255).toByte(), (width shr 8).toByte()))
        fun image(bitmap: Bitmap, column: Boolean = legacy) {
            try {
                rows += bitmap.height
                require(rows <= 16000) { "Receipt is too long. Split it into smaller receipts." }
                commands.add(PrinterText.reset)
                if(column) commands.add(byteArrayOf(0x1b, 0x33, 24))
                for(top in 0 until bitmap.height step 24) {
                    val count = minOf(24, bitmap.height - top)
                    val pixels = IntArray(width * count)
                    bitmap.getPixels(pixels, 0, width, 0, top, width, count)
                    val black = { x: Int, y: Int -> pixels[y * width + x] == Color.BLACK }
                    commands.add(if(column) EscPos.bitImage(width, count, black) else EscPos.raster(width, count, black))
                }
                if(column) commands.add(byteArrayOf(0x1b, 0x32))
            } finally { bitmap.recycle() }
        }
        if(!sharp && !diagnostic) image(ReceiptRenderer.render(receipt, width, strong, logoDither))
        else for(block in ReceiptDocument.build(receipt)) {
            when {
                block is ReceiptBlock.Text && PrinterText.supported(block.value) -> {
                    val lines = PrinterText.wrap(block.value, width / if(block.large) 24 else 12)
                    rows += lines.size * if(block.large) 56 else 32
                    commands.add(PrinterText.encode(block.value, width, block.bold || (strong && !block.forceNormal), block.centered, block.large))
                }
                block is ReceiptBlock.ImageSample -> image(ReceiptRenderer.renderBlock(block, width, strong), block.column)
                block is ReceiptBlock.Gap -> {
                    rows += block.dots
                    commands.add(byteArrayOf(0x1b, 0x4a, block.dots.toByte()))
                }
                block == ReceiptBlock.Rule -> {
                    rows += 32
                    commands.add(PrinterText.encode("-".repeat(width / 12), width, false, false, false))
                }
                else -> image(ReceiptRenderer.renderBlock(block, width, strong, logoDither))
            }
            require(rows <= 16000) { "Receipt is too long. Split it into smaller receipts." }
        }
        commands.add(PrinterText.reset)
        commands.add(if(diagnostic) byteArrayOf(0x1b, 0x4a, 48) else EscPos.finish)
        if(profile.optBoolean("cut")) commands.add(EscPos.cut)
        // Keep transport pacing on a consistent 512-byte boundary, even for native text.
        val bytes = java.io.ByteArrayOutputStream()
        commands.forEach { bytes.write(it) }
        val all = bytes.toByteArray()
        return (all.indices step 512).map { all.copyOfRange(it, minOf(it + 512, all.size)) }
    }
}
