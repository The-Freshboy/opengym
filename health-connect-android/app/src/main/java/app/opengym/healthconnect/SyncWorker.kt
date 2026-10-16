package app.opengym.healthconnect

import android.content.Context
import androidx.work.*
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val settings = SecureSettings(applicationContext)
        if (settings.serverUrl.isBlank() || settings.token.isBlank()) return Result.failure()
        return try {
            val reader = HealthReader(applicationContext); val until = Instant.now()
            // Five-minute overlap makes interrupted uploads safe; the server deduplicates by Health Connect record id.
            for (type in listOf("exercise", "resting_heart_rate", "hrv", "sleep", "steps", "distance", "active_calories", "weight")) {
                val saved = settings.cursor(type)
                val after = if (saved > 0) Instant.ofEpochMilli(saved).minus(5, ChronoUnit.MINUTES) else until.minus(settings.historyDays.toLong(), ChronoUnit.DAYS)
                val records = reader.read(type, after, until)
                if (records.isNotEmpty()) ApiClient.upload(settings.serverUrl, settings.token, records)
                settings.setCursor(type, until.toEpochMilli())
            }
            settings.status("Synced ${java.time.ZonedDateTime.now()}"); Result.success()
        } catch (error: SecurityException) { settings.status("Permission needed: ${error.message}"); Result.failure() }
        catch (error: Exception) { settings.status("Retrying: ${error.message}"); Result.retry() }
    }
    companion object {
        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val work = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("health-connect-sync", ExistingPeriodicWorkPolicy.UPDATE, work)
        }
        fun now(context: Context) = WorkManager.getInstance(context).enqueueUniqueWork("health-connect-sync-now", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<SyncWorker>().build())
    }
}
