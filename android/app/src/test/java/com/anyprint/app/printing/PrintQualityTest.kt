package com.anyprint.app.printing

import org.junit.Assert.*
import org.junit.Test

class PrintQualityTest {
    @Test fun nativeTextUsesResidentFontAndEmphasisInsteadOfRaster() {
        val bytes = PrinterText.encode("Coffee  IDR 18.000", 384, true, false, false)
        val raw = bytes.toString(Charsets.ISO_8859_1)
        assertTrue(raw.contains("Coffee  IDR 18.000\n"))
        assertTrue(raw.contains("\u001bE\u0001"))
        assertFalse(raw.contains("\u001dv0"))
    }
    @Test fun wrapsAt32And48ColumnsWithoutLosingLongWords() {
        listOf(32, 48).forEach { columns ->
            val input = "A".repeat(121)
            val lines = PrinterText.wrap(input, columns)
            assertTrue(lines.all { it.length <= columns })
            assertEquals(input, lines.joinToString(""))
        }
    }
    @Test fun nativeTextResetsStyleAndKeepsNewlines() {
        val bytes = PrinterText.encode("First\nSecond", 384, true, true, true)
        assertTrue(bytes.toString(Charsets.ISO_8859_1).contains("First\nSecond\n"))
        assertArrayEquals(PrinterText.reset, bytes.takeLast(PrinterText.reset.size).toByteArray())
    }
    @Test fun controlsNeverReachPrinterInterpreterAndUnicodeUsesFallback() {
        assertFalse(PrinterText.supported("café"))
        assertFalse(PrinterText.supported(PrinterText.clean("Danger\u001b@\u001dV\u0000")))
        assertEquals("A\nB    C", PrinterText.clean("A\r\nB\tC"))
    }
    @Test(expected = IllegalArgumentException::class) fun nativeEncoderRejectsUnicodeRatherThanReplacingWithQuestionMarks() {
        PrinterText.encode("你好", 384, false, false, false)
    }
    @Test fun blackAndWhiteDotsRemainExactEvenWhenDarker() {
        val input = intArrayOf(0xff000000.toInt(), 0xffffffff.toInt(), 0xff000000.toInt(), 0xffffffff.toInt())
        for(dither in listOf(false,true)) assertArrayEquals(input, Monochrome.convert(input, 2, 2, dither, true))
    }
    @Test fun partiallyTransparentLogosCompositeOntoWhite() {
        assertEquals(0xffffffff.toInt(), Monochrome.convert(intArrayOf(0x00000000), 1, 1)[0])
    }
    @Test fun darkerLogoAddsDotCoverageWithoutTurningBackgroundGray() {
        val gray = IntArray(64 * 64) { 0xffaaaaaa.toInt() }
        val normal = Monochrome.convert(gray, 64, 64, true)
        val dark = Monochrome.convert(gray, 64, 64, true, true)
        assertTrue(dark.count { it == 0xff000000.toInt() } > normal.count { it == 0xff000000.toInt() })
        assertTrue(Monochrome.convert(IntArray(64) { 0xffffffff.toInt() }, 8, 8, true, true).all { it == 0xffffffff.toInt() })
    }
}
