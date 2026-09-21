package com.anyprint.app.printing

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PrintingIntegrationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun receipt() = JSONObject().put("title", "Kopi Pagi · café").put("subtitle", "Jakarta").put("currency", "IDR").put("reference", "TEST-001").put("date", "20 September 2026").put("footer", "Terima kasih").put("qr", "https://example.com").put("items", JSONArray().put(JSONObject().put("name", "Iced latte").put("quantity", 2).put("price", 18000)))
    @Test fun rendersAtAllSupportedWidthsWithBlackAndWhitePixels() {
        listOf(192, 384, 576, 832).forEach { width ->
            val bitmap = ReceiptRenderer.render(receipt(), width)
            assertEquals(width, bitmap.width); assertTrue(bitmap.height > 200)
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, width, 0, 0, width, bitmap.height)
            assertTrue(pixels.any { it == android.graphics.Color.BLACK }); assertTrue(pixels.any { it == android.graphics.Color.WHITE })
            bitmap.recycle()
        }
    }
    @Test fun transportSendsExactBytesToLocalPrinterReceiver() {
        val server = ServerSocket(0)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val received = executor.submit<ByteArray> { server.accept().use { it.getInputStream().readBytes() } }
            val profile = JSONObject().put("connection", "network").put("address", "127.0.0.1").put("port", server.localPort)
            val bytes = EscPos.initialize + EscPos.raster(384, 24) { x, y -> x == y } + EscPos.finish
            Transports.create(context, profile).use { it.connect(); it.write(bytes) }
            assertArrayEquals(bytes, received.get(5, TimeUnit.SECONDS))
        } finally { server.close(); executor.shutdownNow() }
    }
    @Test fun queueDeduplicatesAndDisallowsUnsafeRetry() {
        val store = PrintStore.get(context)
        val id = "test-${UUID.randomUUID()}"
        val job = JSONObject().put("id", id).put("created", System.currentTimeMillis()).put("receipt", receipt()).put("profile", JSONObject())
        assertTrue(store.enqueue(job)); assertFalse(store.enqueue(job))
        store.transition(id, "unknown", "Interrupted after sending")
        try { store.retry(id); fail("Uncertain jobs must require a new explicit copy") } catch (_: IllegalStateException) {}
        assertEquals("unknown", store.job(id)?.getString("state"))
        store.transition(id, "failed"); store.retry(id); assertEquals("queued", store.job(id)?.getString("state"))
        store.cancel(id); assertEquals("cancelled", store.job(id)?.getString("state"))
    }
    @Test fun rejectsMalformedReceiptBeforeOpeningTransport() {
        val invalid = receipt().put("items", JSONArray().put(JSONObject().put("name", "Bad price").put("quantity", 1).put("price", -10)))
        try { ReceiptRenderer.render(invalid, 384); fail("Negative price accepted") } catch (_: IllegalArgumentException) {}
    }
}
