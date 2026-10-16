package app.opengym.healthconnect

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureSettings(private val context: Context) {
    private val prefs = context.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private val alias = "opengym-health-token"
    var serverUrl: String
        get() = prefs.getString("server", "") ?: ""
        set(value) { prefs.edit().putString("server", value.trimEnd('/')).apply() }
    var token: String
        get() = decrypt(prefs.getString("token", "") ?: "")
        set(value) { prefs.edit().putString("token", encrypt(value)).apply() }
    var historyDays: Int
        get() = prefs.getInt("history_days", 30)
        set(value) { prefs.edit().putInt("history_days", value.coerceIn(1, 3650)).apply() }
    fun cursor(type: String): Long = prefs.getLong("cursor_$type", 0L)
    fun setCursor(type: String, value: Long) = prefs.edit().putLong("cursor_$type", value).apply()
    fun status(value: String) = prefs.edit().putString("status", value).apply()
    fun status(): String = prefs.getString("status", "Not synced yet") ?: "Not synced yet"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
    private fun encrypt(value: String): String {
        if (value.isBlank()) return ""
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }
    private fun decrypt(value: String): String = try {
        if (value.isBlank()) "" else Base64.decode(value, Base64.NO_WRAP).let { raw -> Cipher.getInstance("AES/GCM/NoPadding").run { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw.copyOfRange(0, 12))); String(doFinal(raw.copyOfRange(12, raw.size))) } }
    } catch (_: Exception) { "" }
}
