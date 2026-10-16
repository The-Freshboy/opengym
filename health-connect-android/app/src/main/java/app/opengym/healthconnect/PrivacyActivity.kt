package app.opengym.healthconnect
import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
class PrivacyActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContentView(TextView(this).apply { setPadding(40, 60, 40, 40); text = "OpenGym Health Sync reads only health categories you approve and sends them to the OpenGym server URL you configure. It does not read routes or GPS, does not use Garmin credentials, does not sell data, and does not contact third-party analytics services. Revoke access at any time in Health Connect and revoke the mobile credential in OpenGym Settings." }) }
}
