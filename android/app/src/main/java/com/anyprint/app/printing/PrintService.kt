package com.anyprint.app.printing

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.anyprint.app.MainActivity
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class PrintService : Service() {
    private val executor = Executors.newSingleThreadExecutor()
    private val timer = Executors.newSingleThreadScheduledExecutor()
    private val running = AtomicBoolean(false)
    @Volatile private var active: PrinterTransport? = null
    @Volatile private var latestStartId = 0
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        if(Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("printing", "Print queue", NotificationManager.IMPORTANCE_LOW))
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        latestStartId = startId
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = if(Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "printing") else Notification.Builder(this)
        val notification = builder.setContentTitle("Anyprint is printing").setContentText("Your receipts are being sent. Tap to see the queue.").setSmallIcon(com.anyprint.app.R.drawable.ic_print_notification).setContentIntent(open).setOngoing(true).build()
        startForeground(41, notification)
        if(running.compareAndSet(false, true)) executor.execute { drain() }
        return START_NOT_STICKY
    }
    private fun drain() {
        val store = PrintStore.get(this)
        while(true) {
            val job = store.next()
            if(job == null) {
                // Finish on the main thread so a concurrent enqueue cannot strand a queued job.
                android.os.Handler(mainLooper).post {
                    running.set(false)
                    val hasPending = store.hasQueued()
                    if(hasPending && running.compareAndSet(false, true)) executor.execute { drain() }
                    else stopSelf(latestStartId)
                }
                return
            }
            val id = job.getString("id")
            var started = false
            var connection: PrinterTransport? = null
            var deadline: java.util.concurrent.ScheduledFuture<*>? = null
            val timedOut = AtomicBoolean(false)
            try {
                val profile = job.getJSONObject("profile")
                val chunks = ReceiptEncoder.encode(job.getJSONObject("receipt"), profile)
                connection = Transports.create(this, profile)
                active = connection
                val transport = connection
                deadline = timer.schedule({ timedOut.set(true); runCatching { transport.close() } }, 90, TimeUnit.SECONDS)
                connection.connect()
                if(timedOut.get()) error("Printer connection timed out.")
                store.transition(id, "sending", "Sending receipt. Keep the printer connected.")
                started = true // Persisted before the first byte. A crash here is conservatively uncertain.
                for(chunk in chunks) {
                    if(timedOut.get() || Thread.currentThread().isInterrupted) error("Printer stopped responding.")
                    connection.write(chunk)
                    Thread.sleep(profile.optInt("paceMs", 10).toLong())
                }
                store.transition(id, "sent", "Sent to the printer. Check the paper to confirm the receipt printed.")
            } catch(e: Exception) {
                val detail = if(timedOut.get()) "The printer timed out. Check its power and connection." else when(e) {
                    is SecurityException -> "Printer permission is missing. Open printer settings and allow access again."
                    is java.net.UnknownHostException -> "The printer address could not be found. Check the IP address or hostname."
                    is java.net.ConnectException -> "Cannot reach the printer. Check its power, IP address, and network."
                    is java.net.SocketTimeoutException -> "The printer did not respond in time. Check its power and connection."
                    is java.io.IOException -> "The printer connection closed. Check the printer, cable, or Bluetooth connection."
                    else -> e.message ?: "Printer connection failed."
                }
                store.transition(id, EscPos.stateAfterFailure(started), if(started) "$detail Some or all of the receipt may have printed. Check the paper before reprinting." else "$detail Nothing was sent. Fix the connection, then retry.")
            } finally {
                deadline?.cancel(false); runCatching { connection?.close() }; active = null
            }
        }
    }
    override fun onDestroy() {
        runCatching { active?.close() }; executor.shutdownNow(); timer.shutdownNow(); super.onDestroy()
    }
}
