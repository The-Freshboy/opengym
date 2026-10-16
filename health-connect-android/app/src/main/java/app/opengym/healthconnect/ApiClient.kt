package app.opengym.healthconnect

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object ApiClient {
    fun upload(server: String, token: String, records: List<JSONObject>) {
        require(server.startsWith("https://")) { "Use an HTTPS OpenGym URL (Tailscale HTTPS or a trusted reverse proxy)." }
        records.chunked(250).forEach { batch ->
            val connection = URL("$server/api/health-connect/v1/import").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"; connection.connectTimeout = 15_000; connection.readTimeout = 30_000
            connection.setRequestProperty("Authorization", "Bearer $token"); connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.outputStream.use { it.write(JSONObject().put("records", JSONArray(batch)).toString().toByteArray()) }
            val code = connection.responseCode
            if (code !in 200..299) throw IllegalStateException("OpenGym returned HTTP $code")
            connection.disconnect()
        }
    }
}
