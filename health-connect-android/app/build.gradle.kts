plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "app.opengym.healthconnect"
    compileSdk = 35
    defaultConfig { applicationId = "app.opengym.healthconnect"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }
    buildFeatures { viewBinding = false }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    testImplementation("junit:junit:4.13.2")
}
