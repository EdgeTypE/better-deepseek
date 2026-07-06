package com.betterdeepseek.app

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.widget.FrameLayout
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * JVM (Robolectric) tests for WebView navigation routing in MainActivity.
 *
 * These tests exercise the real [WebViewClient.shouldOverrideUrlLoading] implementation
 * through the activity's anonymous [bdsWebViewClient]. Subframe / iframe navigations
 * (notably hCaptcha) must never be routed to external intents, while top-level external
 * links must continue to open in the browser.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WebViewNavigationTest {

    private lateinit var activity: MainActivity
    private lateinit var webView: WebView

    @Before
    fun setUp() {
        activity = Robolectric
            .buildActivity(MainActivity::class.java)
            .create()
            .start()
            .resume()
            .get()
        webView = findWebView(activity)
    }

    @Test
    fun `non-main-frame hCaptcha URL stays in WebView`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse(
                "https://newassets.hcaptcha.com/captcha/v1/hcaptcha.html"
            )
            on { isForMainFrame } doReturn false
        }

        val result = webView.webViewClient.shouldOverrideUrlLoading(webView, request)
        assertFalse("hCaptcha subframe must not open externally", result)
    }

    @Test
    fun `top-level external URL opens in browser`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse("https://github.com/EdgeTypE/better-deepseek")
            on { isForMainFrame } doReturn true
        }

        val result = webView.webViewClient.shouldOverrideUrlLoading(webView, request)
        assertTrue("External top-level URL must open externally", result)
    }

    @Test
    fun `top-level DeepSeek URL stays in WebView`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse("https://chat.deepseek.com/chat/s/abc")
            on { isForMainFrame } doReturn true
        }

        val result = webView.webViewClient.shouldOverrideUrlLoading(webView, request)
        assertFalse("DeepSeek URL must stay inside WebView", result)
    }

    @Test
    fun `top-level Google OAuth URL stays in WebView`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse("https://accounts.google.com/o/oauth2/v2/auth")
            on { isForMainFrame } doReturn true
        }

        val result = webView.webViewClient.shouldOverrideUrlLoading(webView, request)
        assertFalse("Google OAuth URL must stay inside WebView", result)
    }

    @Test
    fun `Google OAuth requests are not intercepted`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse("https://accounts.google.com/o/oauth2/v2/auth")
        }

        val result = webView.webViewClient.shouldInterceptRequest(webView, request)
        assertNull("Google OAuth should load through the native WebView network stack", result)
    }

    @Test
    fun `top-level BDS asset URL stays in WebView`() {
        val request = mock<WebResourceRequest> {
            on { url } doReturn Uri.parse("https://bds-asset.local/bds/content.js")
            on { isForMainFrame } doReturn true
        }

        val result = webView.webViewClient.shouldOverrideUrlLoading(webView, request)
        assertFalse("BDS asset URL must stay inside WebView", result)
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private fun findWebView(activity: MainActivity): WebView {
        val content = activity.window.decorView
            .findViewById<android.view.ViewGroup>(android.R.id.content)
        val rootLayout = content.getChildAt(0) as FrameLayout
        return rootLayout.getChildAt(0) as WebView
    }
}
