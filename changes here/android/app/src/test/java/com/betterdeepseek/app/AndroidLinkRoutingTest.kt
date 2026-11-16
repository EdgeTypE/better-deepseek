package com.betterdeepseek.app

import android.net.Uri
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AndroidLinkRoutingTest {

    @Test
    fun `external http and https links open outside the WebView`() {
        assertTrue(shouldOpenExternally(Uri.parse("https://github.com/EdgeTypE/better-deepseek")))
        assertTrue(shouldOpenExternally(Uri.parse("http://example.com/page")))
    }

    @Test
    fun `DeepSeek hosts stay inside the WebView`() {
        assertFalse(shouldOpenExternally(Uri.parse("https://chat.deepseek.com/chat/s/abc")))
        assertFalse(shouldOpenExternally(Uri.parse("https://api-docs.deepseek.com/quick_start/pricing")))
        assertFalse(shouldOpenExternally(Uri.parse("https://deepseek.com/")))
    }

    @Test
    fun `BDS asset host stays inside the WebView`() {
        assertFalse(
                shouldOpenExternally(
                        Uri.parse("https://bds-asset.local/bds/content.js"),
                        assetHost = "bds-asset.local",
                )
        )
    }

    @Test
    fun `Google OAuth hosts stay inside the WebView`() {
        assertFalse(shouldOpenExternally(Uri.parse("https://google.com/")))
        assertFalse(shouldOpenExternally(Uri.parse("https://www.google.com/gsi/select")))
        assertFalse(shouldOpenExternally(Uri.parse("https://myaccount.google.com/")))
        assertFalse(shouldOpenExternally(Uri.parse("https://accounts.google.com/o/oauth2/v2/auth")))
        assertFalse(shouldOpenExternally(Uri.parse("https://login.accounts.google.com/path")))
        assertFalse(shouldOpenExternally(Uri.parse("https://accounts.youtube.com/accounts/SetSID")))
        assertFalse(shouldOpenExternally(Uri.parse("https://lh3.googleusercontent.com/a/x")))
        assertTrue(shouldOpenExternally(Uri.parse("https://www.googleapis.com/oauth2/v3/certs")))
        assertTrue(shouldOpenExternally(Uri.parse("https://oauthaccountmanager.googleapis.com/")))
    }

    @Test
    fun `isGoogleAuthHost matches identity hosts only`() {
        assertTrue(isGoogleAuthHost("accounts.google.com"))
        assertTrue(isGoogleAuthHost("www.google.com"))
        assertTrue(isGoogleAuthHost("lh3.googleusercontent.com"))
        assertFalse(isGoogleAuthHost("www.googleapis.com"))
        assertFalse(isGoogleAuthHost("github.com"))
    }

    @Test
    fun `hCaptcha hosts stay inside the WebView`() {
        assertFalse(shouldOpenExternally(Uri.parse("https://hcaptcha.com/")))
        assertFalse(
                shouldOpenExternally(
                        Uri.parse("https://newassets.hcaptcha.com/captcha/v1/hcaptcha.html")
                )
        )
        assertFalse(shouldOpenExternally(Uri.parse("https://api.hcaptcha.com/getcaptcha")))
    }

    @Test
    fun `popup capture follows internal routing allowlist`() {
        assertTrue(shouldCapturePopupInApp(Uri.parse("https://accounts.google.com/o/oauth2/v2/auth")))
        assertTrue(shouldCapturePopupInApp(Uri.parse("https://www.google.com/gsi/select")))
        assertTrue(shouldCapturePopupInApp(Uri.parse("https://lh3.googleusercontent.com/a/x")))
        assertTrue(shouldCapturePopupInApp(Uri.parse("https://chat.deepseek.com/sign_in")))
        assertTrue(
                shouldCapturePopupInApp(
                        Uri.parse("https://newassets.hcaptcha.com/captcha/v1/hcaptcha.html")
                )
        )
        assertFalse(shouldCapturePopupInApp(Uri.parse("https://github.com/EdgeTypE/better-deepseek")))
    }

    @Test
    fun `non-http schemes are not routed as browser links`() {
        assertFalse(shouldOpenExternally(Uri.parse("mailto:hello@example.com")))
        assertFalse(shouldOpenExternally(Uri.parse("javascript:alert(1)")))
    }
}
