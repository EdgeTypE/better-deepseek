package com.betterdeepseek.app

import android.graphics.Color
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests that verify edge-to-edge rendering is correctly configured in MainActivity.
 *
 * Must run on a connected device or emulator (API 26+). These tests do NOT exercise web content
 * rendering — they assert only that the Activity has configured the window and WebView correctly.
 *
 * Run with: ./gradlew connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class EdgeToEdgeTest {

    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun statusBarColor_isTransparent() {
        activityRule.scenario.onActivity { activity ->
            assertEquals(
                "Status bar must be fully transparent for edge-to-edge",
                Color.TRANSPARENT,
                activity.window.statusBarColor,
            )
        }
    }

    @Test
    fun navigationBarColor_isTransparent() {
        activityRule.scenario.onActivity { activity ->
            assertEquals(
                "Navigation bar must be fully transparent — white strip not allowed",
                Color.TRANSPARENT,
                activity.window.navigationBarColor,
            )
        }
    }

    @Test
    fun window_hasFlagDrawsSystemBarBackgrounds() {
        activityRule.scenario.onActivity { activity ->
            val flags = activity.window.attributes.flags
            assertTrue(
                "FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS required for transparent system bars",
                flags and WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS != 0,
            )
        }
    }

    @Test
    fun decorView_doesNotFitSystemWindows() {
        activityRule.scenario.onActivity { activity ->
            assertFalse(
                "setDecorFitsSystemWindows(false) must be applied for edge-to-edge",
                ViewCompat.getFitsSystemWindows(activity.window.decorView),
            )
        }
    }

    @Test
    fun rootLayout_hasPaddingMatchingSystemBars() {
        activityRule.scenario.onActivity { activity ->
            val rootLayout = activity.window.decorView
                .findViewById<FrameLayout>(android.R.id.content)
                .getChildAt(0) as? FrameLayout
            checkNotNull(rootLayout) { "Root FrameLayout not found as first child of content" }

            val insets = ViewCompat.getRootWindowInsets(rootLayout)
            checkNotNull(insets) { "Window insets not yet available" }

            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            assertEquals("Padding top must equal status bar inset", bars.top, rootLayout.paddingTop)
            assertEquals("Padding bottom must equal nav bar inset", bars.bottom, rootLayout.paddingBottom)
        }
    }
}
