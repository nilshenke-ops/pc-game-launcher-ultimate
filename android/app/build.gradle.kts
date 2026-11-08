import java.util.Properties

plugins { id("com.android.application") }

val versionFile = Properties().apply { file("../version.properties").reader().use { load(it) } }

android {
    namespace = "de.nilshenke.jarvishub"
    compileSdk = 34

    defaultConfig {
        applicationId = "de.nilshenke.jarvishub"
        minSdk = 26
        targetSdk = 34
        versionCode = versionFile.getProperty("versionCode").toInt()
        versionName = versionFile.getProperty("versionName")
        buildConfigField("String", "SITE_URL", "\"https://nilshenke-ops.github.io/pc-game-launcher-ultimate/\"")
        buildConfigField("String", "UPDATE_URL", "\"https://nilshenke-ops.github.io/pc-game-launcher-ultimate/android/latest.json\"")
    }

    // A stable key for side-loading: without the same signature Android refuses to install an update.
    signingConfigs {
        create("app") {
            storeFile = file("../keystore/jarvis.p12")
            storeType = "PKCS12"
            storePassword = System.getenv("ANDROID_STORE_PASSWORD") ?: "jarvis-update"
            keyAlias = "jarvis"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "jarvis-update"
        }
    }

    buildTypes {
        release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("app") }
        debug { signingConfig = signingConfigs.getByName("app") }
    }

    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { buildConfig = true }
}

dependencies { implementation("androidx.core:core:1.13.1") }
