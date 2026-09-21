package com.anyprint.app.printing

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream

@RunWith(AndroidJUnit4::class)
class PrintQualityIntegrationTest {
    private fun receipt() = JSONObject().put("title", "Kopi Pagi").put("subtitle", "Jakarta")
        .put("currency", "IDR").put("reference", "QUALITY-001").put("date", "2026-09-21")
        .put("footer", "Terima kasih").put("qr", "").put("logo", "")
        .put("items", JSONArray().put(JSONObject().put("name", "Iced latte").put("quantity", 2).put("price", 18000)))
    private fun profile(mode: String = "native", weight: String = "bold", image: String = "raster") = JSONObject()
        .put("dots", 384).put("textMode", mode).put("textWeight", weight).put("imageMode", image)
    private fun joined(chunks: List<ByteArray>) = ByteArrayOutputStream().also { output -> chunks.forEach { output.write(it) } }.toByteArray()
    private fun raw(bytes: ByteArray) = bytes.toString(Charsets.ISO_8859_1)
    private fun pixels(bitmap: Bitmap) = IntArray(bitmap.width * bitmap.height).also { bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }

    @Test fun legacyPrinterProfilesAutomaticallyUseNativeTextAndDarkerWeight() {
        val encoded = joined(ReceiptEncoder.encode(receipt(), JSONObject().put("dots",384).put("imageMode","raster")))
        assertTrue(raw(encoded).contains("Iced latte\n"))
        assertTrue(raw(encoded).contains("IDR 36.000\n"))
        assertTrue(raw(encoded).contains("\u001bE\u0001"))
        assertFalse(raw(encoded).contains("\u001dv0"))
        assertTrue(encoded.size < 2000)
    }
    @Test fun unicodeFallsBackOnlyForItsBlockAndDoesNotCorruptNativeTextAfterIt() {
        val r = receipt().put("subtitle", "café 你好")
        val encoded = raw(joined(ReceiptEncoder.encode(r, profile())))
        assertTrue(encoded.contains("\u001dv0"))
        assertTrue(encoded.contains("Kopi Pagi\n"))
        assertTrue(encoded.contains("Iced latte\n"))
        assertFalse(encoded.contains("caf?"))
    }
    @Test fun compatibilityColumnImagesRestoreLineSpacingBeforeNextNativeText() {
        val encoded = raw(joined(ReceiptEncoder.encode(receipt().put("subtitle", "café"), profile(image = "column"))))
        val column = encoded.indexOf("\u001b*")
        assertTrue(column >= 0)
        val restore = encoded.indexOf("\u001b2", column)
        assertTrue(restore > column)
        assertTrue(encoded.indexOf("Iced latte") > restore)
    }
    @Test fun imageModeIsStrictlyOneBitAndDarkerAddsTextCoverage() {
        val text = ReceiptBlock.Text("Regular receipt text 0123456789")
        val normal = ReceiptRenderer.renderBlock(text, 384, false)
        val dark = ReceiptRenderer.renderBlock(text, 384, true)
        try {
            assertTrue(pixels(normal).all { it == Color.BLACK || it == Color.WHITE })
            assertTrue(pixels(dark).all { it == Color.BLACK || it == Color.WHITE })
            assertTrue(pixels(dark).count { it == Color.BLACK } > pixels(normal).count { it == Color.BLACK })
        } finally { normal.recycle(); dark.recycle() }
    }
    @Test fun qrRemainsPixelExactAndDecodableAtBothPaperWidths() {
        val payload = "https://example.com/receipt/12345"
        for(width in listOf(384, 576)) {
            val normal = ReceiptRenderer.renderBlock(ReceiptBlock.Qr(payload), width, false)
            val dark = ReceiptRenderer.renderBlock(ReceiptBlock.Qr(payload), width, true)
            try {
                assertArrayEquals(pixels(normal), pixels(dark))
                val source = RGBLuminanceSource(normal.width, normal.height, pixels(normal))
                assertEquals(payload, MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(source))).text)
            } finally { normal.recycle(); dark.recycle() }
        }
    }
    @Test fun logoToneProcessingPreservesWhiteAndProvidesStrongerCoverage() {
        val source = Bitmap.createBitmap(128, 64, Bitmap.Config.ARGB_8888)
        source.eraseColor(Color.LTGRAY)
        val output = ByteArrayOutputStream(); source.compress(Bitmap.CompressFormat.PNG,100,output); source.recycle()
        val block = ReceiptBlock.Logo(Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))
        val normal = ReceiptRenderer.renderBlock(block,384,false,true)
        val dark = ReceiptRenderer.renderBlock(block,384,true,true)
        try {
            assertTrue(pixels(dark).count { it == Color.BLACK } > pixels(normal).count { it == Color.BLACK })
            assertEquals(Color.WHITE,dark.getPixel(0,0))
        } finally { normal.recycle(); dark.recycle() }
    }
    @Test fun diagnosticProducesNormalAndBoldCommandsAndAnUnfilteredBlackPattern() {
        val blocks = ReceiptDocument.build(receipt().put("qualityCheck",true))
        assertTrue(blocks.any { it is ReceiptBlock.Text && it.forceNormal })
        val encoded = raw(joined(ReceiptEncoder.encode(receipt().put("qualityCheck",true),profile())))
        assertTrue(encoded.contains("Normal: AaBb 0123456789\n")); assertTrue(encoded.contains("Bold:   AaBb 0123456789\n"))
        val pattern = ReceiptRenderer.renderBlock(ReceiptBlock.ImageSample(false),384,true)
        try {
            for(y in 36 until 60) for(x in 8 until 88) assertEquals(Color.BLACK,pattern.getPixel(x,y))
        } finally { pattern.recycle() }
    }
    @Test fun shortDiagnosticAlwaysComparesBothProtocolsWithoutSaleOrQr() {
        val r = receipt().put("qualityCheck",true).put("qr","https://example.com")
        for(mode in listOf("native", "image")) {
            val bytes = joined(ReceiptEncoder.encode(r,profile(mode)))
            val encoded = raw(bytes)
            assertTrue(encoded.contains("A / Raster\n"))
            assertTrue(encoded.contains("B / Column\n"))
            assertTrue(encoded.contains("\u001dv0"))
            assertTrue(encoded.contains("\u001b*"))
            assertFalse(encoded.contains("TOTAL"))
            assertFalse(encoded.contains("Iced latte"))
            assertArrayEquals(byteArrayOf(0x1b,0x4a,48), bytes.takeLast(3).toByteArray())
            assertTrue(bytes.size < 8500)
        }
        val blocks = ReceiptDocument.build(r)
        assertFalse(blocks.any { it is ReceiptBlock.Qr || it is ReceiptBlock.Logo })
        // Native Font A lines (32 dots each) plus two 72-dot samples and 48-dot tear feed.
        assertEquals(352, blocks.count { it is ReceiptBlock.Text } * 32 + blocks.count { it is ReceiptBlock.ImageSample } * 72 + 48)
        val a = ReceiptRenderer.renderBlock(ReceiptBlock.ImageSample(false),384,true)
        val b = ReceiptRenderer.renderBlock(ReceiptBlock.ImageSample(true),384,true)
        try {
            assertArrayEquals(pixels(a),pixels(b))
            for(y in 36 until 60) for(x in 8 until 88) assertEquals(Color.BLACK,a.getPixel(x,y))
        } finally { a.recycle(); b.recycle() }
    }
    @Test fun fullSizeSquareLogoRetainsDetailAndSolidModeDoesNotHalftoneInk() {
        val source = Bitmap.createBitmap(360,360,Bitmap.Config.ARGB_8888)
        source.eraseColor(Color.rgb(150,150,150))
        // Known one-dot white lines must survive at 1:1, not shrink to the old 160-dot height.
        for(y in 0 until 360) source.setPixel(100,y,Color.WHITE)
        val output=ByteArrayOutputStream(); source.compress(Bitmap.CompressFormat.PNG,100,output); source.recycle()
        val block=ReceiptBlock.Logo(Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP))
        val solid=ReceiptRenderer.renderBlock(block,384,true)
        val photo=ReceiptRenderer.renderBlock(block,384,true,true)
        try {
            assertEquals(376,solid.height)
            for(y in 0 until 360) {
                assertEquals(Color.WHITE,solid.getPixel(112,y))
                assertEquals(Color.BLACK,solid.getPixel(111,y))
                assertEquals(Color.BLACK,solid.getPixel(113,y))
            }
            assertTrue(pixels(solid).count { it == Color.BLACK } > pixels(photo).count { it == Color.BLACK })
        } finally {solid.recycle(); photo.recycle()}
    }
    @Test fun exportsRasterProofForVisualReview() {
        val bitmap = ReceiptRenderer.render(receipt().put("qualityCheck",true),384,true)
        try {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            context.openFileOutput("quality-proof.png",0).use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
        } finally { bitmap.recycle() }
    }
}
