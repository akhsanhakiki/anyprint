package com.anyprint.app.printing
import org.junit.Assert.*
import org.junit.Test
class EscPosTest {
    @Test fun rasterEncodesHorizontalBitsMostSignificantFirst() {
        val data = EscPos.raster(8, 2) { x, y -> (y == 0 && x == 0) || (y == 1 && x == 7) }
        assertArrayEquals(byteArrayOf(0x1d, 0x76, 0x30, 0, 1, 0, 2, 0, 0x80.toByte(), 1), data)
    }
    @Test fun columnModeEncodesVerticalBytes() {
        val data = EscPos.bitImage(8, 24) { x, y -> x == 0 && y in listOf(0, 8, 23) }
        assertEquals(0x80, data[5].toInt() and 255)
        assertEquals(0x80, data[6].toInt() and 255)
        assertEquals(1, data[7].toInt())
        assertEquals(10, data.last().toInt())
        assertEquals(30, data.size)
    }
    @Test fun partialFinalBandHasWhitePadding() {
        val data = EscPos.bitImage(8, 1) { _, _ -> true }
        assertEquals(0, data[6].toInt()); assertEquals(0, data[7].toInt())
    }
    @Test fun rasterWidthIsEncodedInBytes() {
        val data = EscPos.raster(832, 24) { _, _ -> false }
        assertEquals(104, data[4].toInt()); assertEquals(2504, data.size)
    }
    @Test(expected = IllegalArgumentException::class) fun rejectsUnalignedWidth() { EscPos.raster(383, 24) { _, _ -> false } }
    @Test fun transmissionFailureIsNeverSafeForAutomaticRetry() {
        assertEquals("unknown", EscPos.stateAfterFailure(true))
        assertEquals("failed", EscPos.stateAfterFailure(false))
    }
    @Test fun bothImageProtocolsPreserveEveryDotAcrossGenericWidths() {
        for(width in listOf(192,384,576,832)) for(height in listOf(1,23,24)) {
            val black = { x: Int, y: Int -> x < 80 || (x + y) % 5 == 0 }
            val raster = EscPos.raster(width,height,black)
            val column = EscPos.bitImage(width,height,black)
            assertEquals(0,raster[3].toInt()) // 1:1 scaling, never half-resolution enlargement
            assertEquals(33,column[2].toInt()) // 24-dot double density
            for(y in 0 until 24) for(x in 0 until width) {
                val columnDot = (column[5 + x * 3 + y/8].toInt() and (128 shr (y%8))) != 0
                val expected = y < height && black(x,y)
                assertEquals(expected,columnDot)
                if(y < height) {
                    val rasterDot = (raster[8 + y * (width/8) + x/8].toInt() and (128 shr (x%8))) != 0
                    assertEquals(expected,rasterDot)
                }
            }
        }
    }
}
