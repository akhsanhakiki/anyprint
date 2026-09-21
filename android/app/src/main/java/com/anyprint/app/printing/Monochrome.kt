package com.anyprint.app.printing

/** Final dots are decided once, at printer resolution. QR and text never get photo dithering. */
object Monochrome {
    private fun luminance(pixel: Int): Int {
        val alpha = (pixel ushr 24) and 255
        val gray = (((pixel ushr 16) and 255) * 299 + ((pixel ushr 8) and 255) * 587 + (pixel and 255) * 114) / 1000
        return (gray * alpha + 255 * (255 - alpha)) / 255
    }
    fun convert(pixels: IntArray, width: Int, height: Int, dither: Boolean = false, strong: Boolean = false): IntArray {
        require(width > 0 && height > 0 && pixels.size == width * height)
        val result = IntArray(pixels.size)
        var current = FloatArray(width + 2)
        var next = FloatArray(width + 2)
        for(y in 0 until height) {
            val reverse = dither && y % 2 != 0
            for(step in 0 until width) {
                val x = if(reverse) width - 1 - step else step
                val index = y * width + x
                val gray = luminance(pixels[index]).toFloat()
                val adjusted = if(strong && dither) 255f - (255f - gray) * 1.25f else gray
                val level = (adjusted + if(dither) current[x + 1] else 0f).coerceIn(0f, 255f)
                // Preserve partially covered hinted text edges; photos use neutral error diffusion.
                val black = level < if(dither) 128f else if(strong) 200f else 184f
                result[index] = if(black) 0xff000000.toInt() else 0xffffffff.toInt()
                if(dither) {
                    val error = level - if(black) 0f else 255f
                    val direction = if(reverse) -1 else 1
                    current[x + 1 + direction] += error * 7 / 16
                    next[x + 1 - direction] += error * 3 / 16
                    next[x + 1] += error * 5 / 16
                    next[x + 1 + direction] += error / 16
                }
            }
            current = next
            next = FloatArray(width + 2)
        }
        return result
    }
}
