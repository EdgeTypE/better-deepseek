package com.betterdeepseek.app

import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests verifying cookie policy in MainActivity.
 *
 * Runs on a connected device or emulator (API 26+). Robolectric's RoboCookieManager
 * always returns false from acceptThirdPartyCookies, so we must test on a real runtime.
 *
 * Run with: ./gradlew connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class CookiePolicyTest {

    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun thirdPartyCookies_areAccepted() {
        activityRule.scenario.onActivity { activity ->
            val webView = findWebView(activity)
            assertTrue(
                "Third-party cookies must be accepted for hCaptcha iframe auth",
                CookieManager.getInstance().acceptThirdPartyCookies(webView),
            )
        }
    }

    @Test
    fun firstPartyCookies_areAccepted() {
        activityRule.scenario.onActivity { _ ->
            assertTrue(
                "First-party cookies must be accepted",
                CookieManager.getInstance().acceptCookie(),
            )
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private fun findWebView(activity: MainActivity): WebView {
        val content = activity.window.decorView
            .findViewById<android.view.ViewGroup>(android.R.id.content)
        val rootLayout = content.getChildAt(0) as FrameLayout
        return rootLayout.getChildAt(0) as WebView
    }
}
