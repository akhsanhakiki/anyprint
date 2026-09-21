package com.anyprint.app.printing

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.hardware.usb.*
import java.io.Closeable
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID

interface PrinterTransport : Closeable {
    fun connect()
    fun write(bytes: ByteArray)
}

object Transports {
    fun create(context: Context, profile: org.json.JSONObject): PrinterTransport = when(profile.getString("connection")) {
        "bluetooth" -> BluetoothTransport(context, profile.getString("address"))
        "usb" -> UsbTransport(context, profile.getString("address"), profile.getInt("vendorId"), profile.getInt("productId"))
        "network" -> NetworkTransport(profile.getString("address"), profile.getInt("port"))
        else -> error("Unsupported printer connection.")
    }
}

private class NetworkTransport(private val address: String, private val port: Int) : PrinterTransport {
    private val socket = Socket()
    override fun connect() { socket.connect(InetSocketAddress(address, port), 8000); socket.tcpNoDelay = true }
    override fun write(bytes: ByteArray) { socket.getOutputStream().write(bytes); socket.getOutputStream().flush() }
    override fun close() { socket.close() }
}

@SuppressLint("MissingPermission")
private class BluetoothTransport(context: Context, address: String) : PrinterTransport {
    private val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: error("This device has no Bluetooth adapter.")
    private val socket: BluetoothSocket
    init {
        check(adapter.isEnabled) { "Bluetooth is off. Enable it in Android settings, then retry." }
        socket = adapter.getRemoteDevice(address).createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805f9b34fb"))
    }
    override fun connect() { socket.connect() }
    override fun write(bytes: ByteArray) { socket.outputStream.write(bytes); socket.outputStream.flush() }
    override fun close() { socket.close() }
}

private class UsbTransport(context: Context, private val address: String, private val vendor: Int, private val product: Int) : PrinterTransport {
    private val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    @Volatile private var handle: UsbDeviceConnection? = null
    @Volatile private var closed = false
    private var usbInterface: UsbInterface? = null
    private var endpoint: UsbEndpoint? = null
    override fun connect() {
        val devices = manager.deviceList.values.filter { it.vendorId == vendor && it.productId == product }
        val device = devices.firstOrNull { it.deviceName == address } ?: devices.singleOrNull()
            ?: error("USB printer not found, or multiple identical printers are attached. Select the printer again.")
        check(manager.hasPermission(device)) { "USB access is needed. Open printer settings and grant access again." }
        for(i in 0 until device.interfaceCount) {
            val candidate = device.getInterface(i)
            if(candidate.interfaceClass != UsbConstants.USB_CLASS_PRINTER) continue
            for(j in 0 until candidate.endpointCount) {
                val ep = candidate.getEndpoint(j)
                if(ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    usbInterface = candidate; endpoint = ep; break
                }
            }
            if(endpoint != null) break
        }
        check(endpoint != null) { "This USB device does not expose a standard printer interface. USB-serial models need a separate driver." }
        val opened = manager.openDevice(device) ?: error("Cannot open the USB printer.")
        synchronized(this) {
            if(closed) { opened.close(); error("USB connection timed out.") }
            handle = opened
            check(opened.claimInterface(usbInterface, true)) { "USB printer is busy. Close other printing apps." }
        }
    }
    override fun write(bytes: ByteArray) {
        var offset = 0
        while(offset < bytes.size) {
            val count = handle?.bulkTransfer(endpoint, bytes, offset, bytes.size - offset, 5000) ?: -1
            check(count > 0) { "USB printer stopped responding. Check the cable and paper." }
            offset += count
        }
    }
    @Synchronized override fun close() {
        closed = true
        handle?.let { connection -> usbInterface?.let { runCatching { connection.releaseInterface(it) } }; connection.close() }
        handle = null
    }
}
