package com.anyprint.app.printing

import android.graphics.*
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.Base64
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject

object ReceiptRenderer {
    fun validate(receipt: JSONObject) {
        require(receipt.optString("title").length in 1..80) { "Add a receipt title (up to 80 characters)." }
        require(receipt.optString("subtitle").length <= 200 && receipt.optString("footer").length <= 500) { "Receipt text is too long." }
        require(receipt.optString("reference").length <= 80 && receipt.optString("date").length <= 80) { "Receipt reference is too long." }
        require(receipt.optString("qr").length <= 300) { "QR content must be 300 characters or less." }
        require(receipt.optString("logo").length <= 400_000) { "Logo is too large. Choose an image below 250 KB." }
        require(receipt.optString("currency") in listOf("IDR", "USD", "EUR", "GBP", "MYR", "SGD")) { "Unsupported currency." }
        val items = receipt.getJSONArray("items")
        require(items.length() in 1..40) { "A receipt needs 1–40 items." }
        for(i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            require(item.getString("name").length in 1..120) { "Each item needs a name, up to 120 characters." }
            require(item.getInt("quantity") in 1..999 && item.getDouble("quantity") == item.getInt("quantity").toDouble()) { "Quantity must be a whole number from 1 to 999." }
            val price = item.getDouble("price")
            require(price.isFinite() && price >= 0 && price <= 100_000_000) { "Invalid item price." }
        }
    }
    /** Full-image compatibility mode and deterministic image previews for tests. */
    fun render(receipt: JSONObject, width: Int, strong: Boolean = false, logoDither: Boolean = false): Bitmap {
        val bitmaps = mutableListOf<Bitmap>()
        try {
            var height = 0
            for(block in ReceiptDocument.build(receipt)) {
                val image = renderBlock(block, width, strong, logoDither)
                bitmaps.add(image); height += image.height
                require(height <= 16000) { "Receipt is too long. Split it into smaller receipts." }
            }
            return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
                val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE)
                var y = 0
                for(image in bitmaps) { canvas.drawBitmap(image, 0f, y.toFloat(), null); y += image.height }
            }
        } finally { bitmaps.forEach { it.recycle() } }
    }

    fun renderBlock(block: ReceiptBlock, width: Int, strong: Boolean = false, logoDither: Boolean = false): Bitmap {
        require(width in 192..832 && width % 8 == 0)
        val margin = 8
        val available = width - margin * 2
        var height = 1
        var draw: (Canvas) -> Unit = {}
        var logo: Bitmap? = null
        var dither = false
        val effectiveStrong = strong && !(block is ReceiptBlock.Text && block.forceNormal)
        when(block) {
            is ReceiptBlock.Text -> {
                val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.BLACK
                    textSize = if(block.large) 36f else 24f
                    typeface = Typeface.create(if(block.bold || effectiveStrong) "sans-serif" else "sans-serif-medium", if(block.bold || effectiveStrong) Typeface.BOLD else Typeface.NORMAL)
                    hinting = Paint.HINTING_ON
                    isSubpixelText = false
                    isLinearText = false
                }
                val layout = StaticLayout.Builder.obtain(block.value, 0, block.value.length, paint, available)
                    .setAlignment(if(block.centered) Layout.Alignment.ALIGN_CENTER else Layout.Alignment.ALIGN_NORMAL)
                    .setIncludePad(true).setLineSpacing(4f, 1f).build()
                height = layout.height + 6
                draw = { canvas -> canvas.save(); canvas.translate(margin.toFloat(), 0f); layout.draw(canvas); canvas.restore() }
            }
            is ReceiptBlock.Gap -> height = maxOf(1, block.dots)
            ReceiptBlock.Rule -> {
                height = 20
                draw = { canvas -> canvas.drawRect(margin.toFloat(), 8f, (width - margin).toFloat(), 10f, Paint().apply { color = Color.BLACK }) }
            }
            is ReceiptBlock.ImageSample -> {
                height = 72
                draw = { canvas ->
                    val ink = Paint().apply { color = Color.BLACK }
                    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.BLACK; textSize = 24f
                        typeface = Typeface.create("sans-serif", Typeface.BOLD)
                        hinting = Paint.HINTING_ON
                    }
                    canvas.drawText("Image: AaBb 012345", 8f, 25f, text)
                    canvas.drawRect(8f, 36f, 88f, 60f, ink)
                    for(x in 100 until minOf(180, width - 8) step 4)
                        canvas.drawRect(x.toFloat(), 36f, (x + 1).toFloat(), 60f, ink)
                    for(x in 196 until width - 8 step 6)
                        canvas.drawRect(x.toFloat(), 36f, (x + 2).toFloat(), 60f, ink)
                }
            }
            is ReceiptBlock.Logo -> {
                val bytes = Base64.decode(block.data.substringAfter(","), Base64.DEFAULT)
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth in 1..4096 && bounds.outHeight in 1..4096) { "Logo dimensions must be at most 4096 × 4096." }
                val ratio = minOf(available.toFloat() / bounds.outWidth, available.toFloat() / bounds.outHeight, 1f)
                val targetWidth = maxOf(1, (bounds.outWidth * ratio).toInt())
                val targetHeight = maxOf(1, (bounds.outHeight * ratio).toInt())
                var sample = 1
                while(bounds.outWidth / (sample * 2) >= targetWidth && bounds.outHeight / (sample * 2) >= targetHeight) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample; inScaled = false }
                logo = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: error("Cannot read this logo. Use PNG or JPEG.")
                height = targetHeight + 16
                val decoded = logo
                val left = (width - targetWidth) / 2
                draw = { canvas -> canvas.drawBitmap(decoded, null, Rect(left, 0, left + targetWidth, targetHeight), Paint(Paint.FILTER_BITMAP_FLAG)) }
                dither = logoDither
            }
            is ReceiptBlock.Qr -> {
                val matrix = QRCodeWriter().encode(block.value, BarcodeFormat.QR_CODE, 0, 0,
                    mapOf(EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.MARGIN to 4,
                        EncodeHintType.ERROR_CORRECTION to com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M))
                // Never blur modules or squeeze them below 3 printer dots. Keep the quiet zone.
                val scale = maxOf(3, minOf(available, 256) / matrix.width)
                val size = matrix.width * scale
                require(size <= available) { "QR content is too dense for this printer width. Shorten the QR content." }
                height = size + 8
                draw = { canvas ->
                    val ink = Paint().apply { color = Color.BLACK }
                    val left = (width - size) / 2
                    for(row in 0 until matrix.height) for(col in 0 until matrix.width) if(matrix[col, row]) {
                        canvas.drawRect((left + col * scale).toFloat(), (row * scale).toFloat(), (left + (col + 1) * scale).toFloat(), ((row + 1) * scale).toFloat(), ink)
                    }
                }
            }
        }
        try {
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            try {
                val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE); draw(canvas)
                val pixels = IntArray(width * height)
                bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
                bitmap.setPixels(Monochrome.convert(pixels, width, height, dither, effectiveStrong), 0, width, 0, 0, width, height)
                return bitmap
            } catch(e: Exception) { bitmap.recycle(); throw e }
        } finally { logo?.recycle() }
    }
}
