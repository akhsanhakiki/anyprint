package com.anyprint.app.printing

import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

/** Shared content and money calculations for both native text and image printing. */
sealed interface ReceiptBlock {
    data class Text(val value: String, val bold: Boolean = false, val centered: Boolean = false, val large: Boolean = false, val forceNormal: Boolean = false) : ReceiptBlock
    data class Logo(val data: String) : ReceiptBlock
    data class Qr(val value: String) : ReceiptBlock
    data class Gap(val dots: Int) : ReceiptBlock
    data object Rule : ReceiptBlock
    data class ImageSample(val column: Boolean) : ReceiptBlock
}

object ReceiptDocument {
    fun build(receipt: JSONObject): List<ReceiptBlock> {
        ReceiptRenderer.validate(receipt)
        val blocks = mutableListOf<ReceiptBlock>()
        fun text(value: String, bold: Boolean = false, centered: Boolean = false, large: Boolean = false) {
            val clean = PrinterText.clean(value)
            if(clean.isNotBlank()) blocks.add(ReceiptBlock.Text(clean, bold, centered, large))
        }
        // A diagnostic is a bounded calibration slip, never a sale or a long receipt.
        if(receipt.optBoolean("qualityCheck")) return listOf(
            ReceiptBlock.Text("Anyprint / short test", bold = true),
            ReceiptBlock.Text("Normal: AaBb 0123456789", forceNormal = true),
            ReceiptBlock.Text("Bold:   AaBb 0123456789", bold = true),
            ReceiptBlock.Text("A / Raster", bold = true),
            ReceiptBlock.ImageSample(false),
            ReceiptBlock.Text("B / Column", bold = true),
            ReceiptBlock.ImageSample(true)
        )
        receipt.optString("logo").takeIf { it.isNotBlank() }?.let { blocks.add(ReceiptBlock.Logo(it)) }
        text(receipt.getString("title"), bold = true, centered = true, large = true)
        text(receipt.optString("subtitle"), centered = true)
        blocks.add(ReceiptBlock.Gap(8))
        if(receipt.optBoolean("isCopy")) text("COPY / REPRINT", bold = true, centered = true)
        text(receipt.optString("reference"), centered = true)
        text(receipt.optString("date"), centered = true)
        blocks.add(ReceiptBlock.Rule)
        val currency = receipt.getString("currency")
        val formatter = NumberFormat.getNumberInstance(if(currency == "IDR") Locale.forLanguageTag("id-ID") else Locale.US).apply {
            minimumFractionDigits = if(currency == "IDR") 0 else 2
            maximumFractionDigits = minimumFractionDigits
        }
        fun money(value: BigDecimal) = "$currency ${formatter.format(value)}"
        var total = BigDecimal.ZERO
        val items = receipt.getJSONArray("items")
        for(i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            val qty = item.getInt("quantity")
            val price = BigDecimal(item.getString("price")).setScale(if(currency == "IDR") 0 else 2, RoundingMode.HALF_UP)
            val amount = price.multiply(BigDecimal(qty))
            total = total.add(amount)
            text(item.getString("name"), bold = true)
            text("$qty x ${money(price)}\n${money(amount)}")
            blocks.add(ReceiptBlock.Gap(8))
        }
        blocks.add(ReceiptBlock.Rule)
        text("TOTAL", bold = true)
        text(money(total), bold = true, large = true)
        blocks.add(ReceiptBlock.Rule)
        text(receipt.optString("footer"), centered = true)
        receipt.optString("qr").takeIf { it.isNotBlank() }?.let {
            blocks.add(ReceiptBlock.Gap(12)); blocks.add(ReceiptBlock.Qr(it))
        }
        blocks.add(ReceiptBlock.Gap(16))
        return blocks
    }
}
