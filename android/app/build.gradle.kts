import org.gradle.api.tasks.testing.Test
import java.util.zip.ZipFile

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Monotonic identity for every build, supplied by the release workflow as the GitHub Actions run
// number. versionCode/versionName only change when a release is cut, so the beta channel — which
// rebuilds on every push to `main` — would otherwise have no way to tell two builds of the same
// version apart. Left at 0 for local builds, which the updater reads as "not a CI build" and
// falls back to its timestamp heuristic for.
val bdsBuildId: Long = (project.findProperty("BdsBuildId") as String?)?.toLongOrNull() ?: 0L

// ── Robolectric + Conscrypt native loading ──────────────────────────────────
// Robolectric 4.13 registers Conscrypt as the JCE provider in
// AndroidTestEnvironment.setUpApplicationState(), which runs before any test body.
// Conscrypt then asks System.loadLibrary for a binary named after the OS it detected,
// deriving that name with a no-argument String.toLowerCase(). Under a Turkish default
// locale that turns "Windows" into "wındows" (dotless i), so the JVM looks for
// "conscrypt_openjdk_jni-wındows-x86_64.dll", finds nothing, and every Robolectric test
// aborts in beforeTest() with UnsatisfiedLinkError before a single assertion runs.
//
// Pinning the test JVM to en-US fixes the name. The loader also needs a place to load
// the DLL from: it only unpacks the copy bundled in the uber jar when
// org.conscrypt.native.workdir is set, otherwise it falls back to java.library.path, so on
// Windows we stage the file there ourselves. Linux and macOS resolve it straight from the
// jar and need neither workaround.
fun stageConscryptNativeDir(): File? {
    if (!System.getProperty("os.name").startsWith("Windows")) return null

    // Conscrypt names its binaries after the JVM's os.arch, not the Windows arch names.
    val dllSuffix = when (System.getProperty("os.arch")) {
        "amd64" -> "windows-x86_64"
        "x86" -> "windows-x86"
        else -> return null
    }

    // Take the version Robolectric already resolves, so this can never drift from it.
    // The Android plugin creates one classpath per variant — debugUnitTestRuntimeClasspath,
    // releaseUnitTestRuntimeClasspath — so match on that shape rather than a single name.
    val conscryptJar = configurations
        .matching { it.name.endsWith("UnitTestRuntimeClasspath") }
        .mapNotNull { cfg ->
            runCatching {
                cfg.resolvedConfiguration.resolvedArtifacts
                    .firstOrNull { it.moduleVersion.id.group == "org.conscrypt" }
                    ?.file
            }.getOrNull()
        }
        .firstOrNull()
        ?: return null

    val entryName = "META-INF/native/conscrypt_openjdk_jni-$dllSuffix.dll"
    val targetDir = layout.buildDirectory.file("conscrypt-native").get().asFile
    targetDir.mkdirs()
    val target = File(targetDir, "conscrypt_openjdk_jni-$dllSuffix.dll")

    ZipFile(conscryptJar).use { zip ->
        val entry = zip.getEntry(entryName) ?: return null
        // Re-extract only when missing or stale, so incremental test runs stay cheap.
        if (!target.exists() || target.length() != entry.size) {
            zip.getInputStream(entry).use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
        }
    }
    return targetDir
}

android {
    namespace = "com.betterdeepseek.app"
    compileSdk = 34

    buildFeatures {
        buildConfig = true
    }
    
    defaultConfig {
        applicationId = "com.betterdeepseek.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 11
        // Keep in sync with package.json "version" and static/manifest.json "version".
        versionName = "0.1.15"
        buildConfigField("long", "BUILD_ID", "${bdsBuildId}L")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        signingConfigs {
            create("release") {
                storeFile = rootProject.file("ci-release.jks")
                storePassword = System.getenv("BDS_KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("BDS_KEY_ALIAS") ?: ""
                keyPassword = System.getenv("BDS_KEY_PASSWORD") ?: ""
            }
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
        }
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
            isIncludeAndroidResources = true
        }
    }
}

// Applied to the unit-test JVMs only; instrumented tests run on a real device and are
// unaffected. doFirst rather than the task body so it runs after the Android plugin has
// created the per-variant classpaths, and always before the test JVM forks.
tasks.withType<Test>().configureEach {
    doFirst {
        // Pin the locale so results never depend on the developer's system language.
        // Not cosmetic: a Turkish default locale breaks Conscrypt's native library
        // lookup, which is what makes every Robolectric test fail on a Turkish machine.
        systemProperty("user.language", "en")
        systemProperty("user.country", "US")

        val nativeDir = stageConscryptNativeDir() ?: return@doFirst
        // Prepend so the staged DLL wins over any stale copy on the path.
        val current = System.getProperty("java.library.path").orEmpty()
        systemProperty(
            "java.library.path",
            (listOf(nativeDir.absolutePath) + current.split(File.pathSeparator))
                .filter { it.isNotBlank() }
                .joinToString(File.pathSeparator)
        )
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.documentfile:documentfile:1.0.1")

    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.mockito:mockito-core:5.12.0")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.json:json:20240303")
    testImplementation("org.robolectric:robolectric:4.13")

    androidTestImplementation("androidx.test.ext:junit-ktx:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
