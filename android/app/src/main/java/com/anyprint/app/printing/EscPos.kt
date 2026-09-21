package com.anyprint.app.printing

/** Pure encoder, independent of Android, so byte-level behavior can be unit tested. */
object EscPos {
    val initialize = byteArrayOf(0x1b, 0x40)
    val finish = byteArrayOf(0x1b, 0x64, 0x04)
    val cut = byteArrayOf(0x1d, 0x56, 0x01)
    fun raster(width: Int, height: Int, black: (Int, Int) -> Boolean): ByteArray {
        require(width in 8..832 && width % 8 == 0 && height in 1..256)
        val stride = width / 8
        val output = ByteArray(8 + stride * height)
        byteArrayOf(0x1d, 0x76, 0x30, 0, (stride and 255).toByte(), (stride shr 8).toByte(), (height and 255).toByte(), (height shr 8).toByte()).copyInto(output)
        for(y in 0 until height) for(x in 0 until width) if(black(x,y)) {
            val index = 8 + y * stride + x / 8
            output[index] = (output[index].toInt() or (0x80 shr (x % 8))).toByte()
        }
        return output
    }
    fun bitImage(width: Int, height: Int, black: (Int, Int) -> Boolean): ByteArray {
        require(width in 8..832 && height in 1..24)
        // 24-dot double density, three vertical bytes per column.
        val output = ByteArray(5 + width * 3 + 1)
        byteArrayOf(0x1b, 0x2a, 33, (width and 255).toByte(), (width shr 8).toByte()).copyInto(output)
        for(x in 0 until width) for(y in 0 until height) if(black(x,y)) {
            val index = 5 + x * 3 + y / 8
            output[index] = (output[index].toInt() or (0x80 shr (y % 8))).toByte()
        }
        output[output.lastIndex] = 0x0a
        return output
    }
    fun stateAfterFailure(transmissionStarted: Boolean) = if(transmissionStarted) "unknown" else "failed"
}
