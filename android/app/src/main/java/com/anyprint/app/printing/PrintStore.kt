package com.anyprint.app.printing

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/** All job transitions are durable before the next transport operation. */
class PrintStore private constructor(context: Context) : SQLiteOpenHelper(context, "anyprint.db", null, 1) {
    companion object {
        @Volatile private var instance: PrintStore? = null
        fun get(context: Context): PrintStore = instance ?: synchronized(this) {
            instance ?: PrintStore(context.applicationContext).also { store ->
                store.recoverInterrupted(); instance = store
            }
        }
    }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        db.execSQL("CREATE TABLE jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX job_state ON jobs(state, created)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    @Synchronized private fun recoverInterrupted() {
        val interrupted = JSONArray()
        readableDatabase.rawQuery("SELECT data, state FROM jobs WHERE state IN ('sending', 'connecting')", null).use { c ->
            while(c.moveToNext()) interrupted.put(JSONObject(c.getString(0)).put("state", c.getString(1)))
        }
        interrupted.let { all -> for (i in 0 until all.length()) {
            val job = all.getJSONObject(i)
            when (job.getString("state")) {
                "sending" -> transition(job.getString("id"), "unknown", "The app stopped while sending. Check the paper before reprinting.")
                "connecting" -> transition(job.getString("id"), "failed", "The app stopped before sending. It is safe to retry.")
            }
        } }
    }
    @Synchronized fun profiles(): JSONArray = JSONArray().also { list ->
        readableDatabase.rawQuery("SELECT data FROM profiles ORDER BY rowid", null).use { c -> while(c.moveToNext()) list.put(JSONObject(c.getString(0))) }
    }
    @Synchronized fun saveProfile(profile: JSONObject) {
        writableDatabase.insertWithOnConflict("profiles", null, ContentValues().apply {
            put("id", profile.getString("id")); put("data", profile.toString())
        }, SQLiteDatabase.CONFLICT_REPLACE).also { check(it != -1L) { "Could not save the printer." } }
    }
    @Synchronized fun deleteProfile(id: String) { writableDatabase.delete("profiles", "id=?", arrayOf(id)) }
    @Synchronized fun jobs(): JSONArray = JSONArray().also { list ->
        readableDatabase.rawQuery("SELECT data, state FROM jobs ORDER BY created DESC, rowid DESC LIMIT 200", null).use { c ->
            while(c.moveToNext()) {
                val data = JSONObject(c.getString(0)).put("state", c.getString(1))
                // Logos can be hundreds of KB. Poll summaries; fetch the original only for details.
                data.optJSONObject("receipt")?.put("logo", "")
                list.put(data)
            }
        }
    }
    @Synchronized fun job(id: String): JSONObject? = readableDatabase.rawQuery("SELECT data, state FROM jobs WHERE id=?", arrayOf(id)).use { c ->
        if(c.moveToFirst()) JSONObject(c.getString(0)).put("state", c.getString(1)) else null
    }
    @Synchronized fun enqueue(job: JSONObject): Boolean {
        if (job(job.getString("id")) != null) return false // Submission idempotency, including restarts.
        check(android.database.DatabaseUtils.longForQuery(readableDatabase, "SELECT COUNT(*) FROM jobs WHERE state IN ('queued','connecting','sending')", null) < 100) { "The queue is full. Finish or cancel pending jobs first." }
        val inserted = writableDatabase.insertOrThrow("jobs", null, ContentValues().apply {
            put("id", job.getString("id")); put("data", job.toString()); put("state", "queued"); put("created", job.getLong("created"))
        })
        return inserted != -1L
    }
    @Synchronized fun transition(id: String, state: String, message: String = "") {
        val job = job(id) ?: error("Print job not found.")
        job.put("state", state).put("message", message).put("updated", System.currentTimeMillis())
        writableDatabase.update("jobs", ContentValues().apply { put("data", job.toString()); put("state", state) }, "id=?", arrayOf(id))
    }
    @Synchronized fun hasQueued(): Boolean = android.database.DatabaseUtils.longForQuery(readableDatabase, "SELECT COUNT(*) FROM jobs WHERE state='queued'", null) > 0
    @Synchronized fun next(): JSONObject? {
        val next = readableDatabase.rawQuery("SELECT id FROM jobs WHERE state='queued' ORDER BY created, rowid LIMIT 1", null).use { if(it.moveToFirst()) it.getString(0) else null } ?: return null
        transition(next, "connecting", "Preparing your receipt…")
        return job(next)
    }
    @Synchronized fun retry(id: String) {
        check(job(id)?.getString("state") == "failed") { "Only jobs that failed before sending can be retried. Use Reprint for uncertain jobs." }
        transition(id, "queued")
    }
    @Synchronized fun cancel(id: String) {
        check(job(id)?.getString("state") in listOf("queued", "failed")) { "This job can no longer be cancelled." }
        transition(id, "cancelled", "Cancelled before sending.")
    }
}
