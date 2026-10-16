package app.opengym.healthconnect

import android.os.Bundle
import android.text.InputType
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*

class MainActivity : ComponentActivity() {
    private val permissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class), HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class), HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class), HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class), HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
    )
    private val permissionRequest = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { SyncWorker.schedule(this) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); val settings = SecureSettings(this)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 48, 40, 40) }
        layout.addView(TextView(this).apply { text = "OpenGym Health Sync"; textSize = 26f })
        layout.addView(TextView(this).apply { text = "Garmin → Health Connect → your OpenGym. No Garmin password, no GPS routes, no paid service." })
        val server = EditText(this).apply { hint = "https://your-opengym.example"; setText(settings.serverUrl); inputType = InputType.TYPE_TEXT_VARIATION_URI }
        val token = EditText(this).apply { hint = "ogh_… mobile credential"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        val history = Spinner(this).apply { adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("30 days", "90 days", "365 days")); setSelection(when (settings.historyDays) { 90 -> 1; 365 -> 2; else -> 0 }) }
        layout.addView(server); layout.addView(token); layout.addView(history)
        layout.addView(Button(this).apply { text = "Save connection"; setOnClickListener { settings.serverUrl = server.text.toString(); if (token.text.isNotBlank()) settings.token = token.text.toString(); settings.historyDays = listOf(30, 90, 365)[history.selectedItemPosition]; token.text.clear(); Toast.makeText(this@MainActivity, "Saved securely on this device", Toast.LENGTH_SHORT).show() } })
        layout.addView(Button(this).apply { text = "Choose Health Connect permissions"; setOnClickListener { permissionRequest.launch(if (settings.historyDays > 30) permissions + HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY else permissions) } })
        layout.addView(Button(this).apply { text = "Sync now"; setOnClickListener { SyncWorker.now(this@MainActivity); Toast.makeText(this@MainActivity, "Sync queued", Toast.LENGTH_SHORT).show() } })
        layout.addView(TextView(this).apply { text = "Android may delay periodic work. Allow background health reads and set battery use to Unrestricted for the most reliable hourly sync. Opening this app and tapping Sync now always queues a fresh attempt.\n\nStatus: ${settings.status()}" })
        setContentView(layout)
    }
}
