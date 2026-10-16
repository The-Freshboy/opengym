package app.opengym.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONObject
import java.time.Instant

class HealthReader(context: Context) {
    private val client = HealthConnectClient.getOrCreate(context)
    suspend fun read(type: String, after: Instant, until: Instant): List<JSONObject> = when (type) {
        "exercise" -> pages(ExerciseSessionRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.startTime, r.endTime, r.metadata.dataOrigin.packageName).put("exerciseType", r.exerciseType.toString()).put("title", r.title) }
        "resting_heart_rate" -> pages(RestingHeartRateRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.time, r.time, r.metadata.dataOrigin.packageName).put("value", r.beatsPerMinute) }
        "hrv" -> pages(HeartRateVariabilityRmssdRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.time, r.time, r.metadata.dataOrigin.packageName).put("value", r.heartRateVariabilityMillis) }
        "sleep" -> pages(SleepSessionRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.startTime, r.endTime, r.metadata.dataOrigin.packageName).put("minutes", (r.endTime.toEpochMilli() - r.startTime.toEpochMilli()) / 60000.0) }
        "steps" -> pages(StepsRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.startTime, r.endTime, r.metadata.dataOrigin.packageName).put("value", r.count) }
        "distance" -> pages(DistanceRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.startTime, r.endTime, r.metadata.dataOrigin.packageName).put("value", r.distance.inKilometers) }
        "active_calories" -> pages(ActiveCaloriesBurnedRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.startTime, r.endTime, r.metadata.dataOrigin.packageName).put("value", r.energy.inKilocalories) }
        "weight" -> pages(WeightRecord::class.java, after, until) { r -> base(type, r.metadata.id, r.time, r.time, r.metadata.dataOrigin.packageName).put("value", r.weight.inKilograms) }
        else -> emptyList() // Raw heart-rate samples are intentionally omitted until explicitly selected in a future UI.
    }
    private suspend fun <T : Record> pages(clazz: Class<T>, after: Instant, until: Instant, map: (T) -> JSONObject): List<JSONObject> {
        val out = mutableListOf<JSONObject>(); var page: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(clazz.kotlin, TimeRangeFilter.between(after, until), pageToken = page, pageSize = 500))
            // This companion is for Garmin ingestion, not a general export of the user's
            // Health Connect database. Source filtering is another collection-minimisation
            // boundary on top of Android's per-category permission controls.
            out += response.records.filter { it.metadata.dataOrigin.packageName.contains("garmin", ignoreCase = true) }.map(map)
            page = response.pageToken?.takeIf { it.isNotEmpty() }
        } while (page != null)
        return out
    }
    private fun base(type: String, id: String, start: Instant, end: Instant, source: String) = JSONObject().put("type", type).put("sourceRecordId", id).put("startTime", start.toString()).put("endTime", end.toString()).put("source", source)
}
