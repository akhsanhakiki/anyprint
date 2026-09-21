package com.anyprint.app.printing

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.*
import android.hardware.usb.UsbManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

@CapacitorPlugin(name = "Printer", permissions = [Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_CONNECT])])
class PrinterPlugin : Plugin() {
    private val store get() = PrintStore.get(context)
    private var pendingUsb: PluginCall? = null
    private var receiver: BroadcastReceiver? = null
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private fun respond(call: PluginCall, work: () -> JSObject) {
        try { call.resolve(work()) } catch(e: Exception) { call.reject(e.message ?: "The printer operation failed.") }
    }
    @PluginMethod fun getState(call: PluginCall) = respond(call) {
        JSObject().put("profiles", store.profiles()).put("jobs", store.jobs())
    }
    @PluginMethod fun getJob(call: PluginCall) = respond(call) {
        JSObject((store.job(call.getString("id") ?: "") ?: error("Print job not found.")).toString())
    }
    @PluginMethod fun saveProfile(call: PluginCall) = respond(call) {
        val profile = call.getObject("profile") ?: error("Printer settings are missing.")
        validateProfile(profile); store.saveProfile(profile); JSObject()
    }
    @PluginMethod fun deleteProfile(call: PluginCall) = respond(call) {
        store.deleteProfile(call.getString("id") ?: error("Printer ID is missing.")); JSObject()
    }
    @PluginMethod fun enqueue(call: PluginCall) = respond(call) {
        val profile = call.getObject("profile") ?: error("Select a printer first.")
        val receipt = call.getObject("receipt") ?: error("Receipt is missing.")
        validateProfile(profile); ReceiptRenderer.validate(receipt)
        val id = call.getString("id") ?: error("Job ID is missing.")
        require(id.length in 1..80)
        store.enqueue(JSONObject().put("id", id).put("profile", profile).put("receipt", receipt).put("created", System.currentTimeMillis()).put("state", "queued").put("message", "Waiting to print."))
        startQueue()
        JSObject().put("id", id)
    }
    @PluginMethod fun retry(call: PluginCall) = respond(call) { store.retry(call.getString("id") ?: ""); startQueue(); JSObject() }
    @PluginMethod fun cancel(call: PluginCall) = respond(call) { store.cancel(call.getString("id") ?: ""); JSObject() }
    @PluginMethod fun resume(call: PluginCall) = respond(call) { startQueue(); JSObject() }
    private fun startQueue() {
        // Called only from an explicit foreground UI action; never an unrestricted background start.
        ContextCompat.startForegroundService(context, Intent(context, PrintService::class.java))
    }
    @PluginMethod fun bluetoothSettings(call: PluginCall) = respond(call) {
        activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); JSObject()
    }
    @PluginMethod fun listBluetooth(call: PluginCall) {
        if(Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED) requestPermissionForAlias("bluetooth", call, "bluetoothPermission")
        else listPaired(call)
    }
    @PermissionCallback private fun bluetoothPermission(call: PluginCall) {
        if(getPermissionState("bluetooth") == PermissionState.GRANTED) listPaired(call)
        else call.reject("Nearby devices permission was denied. Allow it in Android app settings to use Bluetooth printers.")
    }
    @SuppressLint("MissingPermission") private fun listPaired(call: PluginCall) = respond(call) {
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: error("This device does not have Bluetooth.")
        check(adapter.isEnabled) { "Bluetooth is off. Turn it on in Android settings." }
        JSObject().put("devices", JSONArray().also { devices -> adapter.bondedDevices.sortedBy { it.name ?: it.address }.forEach { device ->
            devices.put(JSONObject().put("name", device.name ?: "Bluetooth device").put("address", device.address))
        } })
    }
    @PluginMethod fun listUsb(call: PluginCall) = respond(call) {
        val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        JSObject().put("devices", JSONArray().also { list -> manager.deviceList.values.forEach { device ->
            val supported = (0 until device.interfaceCount).any { device.getInterface(it).interfaceClass == 7 }
            list.put(JSONObject().put("name", device.productName ?: "USB printer").put("address", device.deviceName).put("vendorId", device.vendorId).put("productId", device.productId).put("supported", supported).put("permission", manager.hasPermission(device)))
        } })
    }
    @PluginMethod fun requestUsb(call: PluginCall) {
        try {
            check(pendingUsb == null) { "A USB permission request is already open." }
            val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            val device = manager.deviceList[call.getString("address")] ?: error("USB printer was disconnected.")
            if(manager.hasPermission(device)) { call.resolve(); return }
            val action = "${context.packageName}.USB_PERMISSION.${UUID.randomUUID()}"
            pendingUsb = call
            receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    if(intent?.action != action) return
                    val pending = pendingUsb
                    cleanupUsb()
                    if(manager.hasPermission(device)) pending?.resolve() else pending?.reject("USB access was denied. Select the printer again to allow access.")
                }
            }
            ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            manager.requestPermission(device, PendingIntent.getBroadcast(context, 0, Intent(action).setPackage(context.packageName), flags))
            handler.postDelayed({ if(pendingUsb === call) { cleanupUsb(); call.reject("USB permission request expired. Try selecting the printer again.") } }, 60000)
        } catch(e: Exception) { cleanupUsb(); call.reject(e.message) }
    }
    private fun cleanupUsb() { receiver?.let { runCatching { context.unregisterReceiver(it) } }; receiver = null; pendingUsb = null }
    override fun handleOnDestroy() { pendingUsb?.reject("Printer setup was interrupted."); cleanupUsb(); handler.removeCallbacksAndMessages(null) }
    private fun validateProfile(profile: JSONObject) {
        require(profile.optString("id").length in 1..80 && profile.optString("name").length in 1..80) { "Give the printer a name." }
        val dots = profile.getInt("dots")
        require(dots in 192..832 && dots % 8 == 0) { "Printable width must be 192–832 dots, in multiples of 8." }
        require(profile.getInt("paperMm") in 58..112) { "Paper width must be 58–112 mm." }
        require(profile.optInt("paceMs", 10) in 0..100) { "Invalid print speed setting." }
        require(profile.optString("imageMode") in listOf("raster", "column")) { "Choose a supported image mode." }
        require(profile.optString("textMode", "native") in listOf("native", "image")) { "Choose a supported text mode." }
        require(profile.optString("logoMode", "solid") in listOf("solid", "photo")) { "Choose a supported logo mode." }
        require(profile.optString("textWeight", "bold") in listOf("normal", "bold")) { "Choose a supported text weight." }
        val address = profile.optString("address")
        when(profile.optString("connection")) {
            "bluetooth" -> require(android.bluetooth.BluetoothAdapter.checkBluetoothAddress(address)) { "Choose a paired Bluetooth printer." }
            "usb" -> require(address.isNotEmpty() && profile.has("vendorId") && profile.has("productId")) { "Choose a USB printer." }
            "network" -> {
                require(address.length in 1..253 && Regex("[A-Za-z0-9.:_-]+").matches(address)) { "Enter a printer IP address or hostname, without http:// or a path." }
                require(profile.getInt("port") in 1..65535) { "Port must be 1–65535." }
            }
            else -> error("Choose a printer connection.")
        }
    }
}
