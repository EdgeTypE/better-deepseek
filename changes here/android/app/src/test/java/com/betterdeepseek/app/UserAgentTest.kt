package com.betterdeepseek.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UserAgentTest {

    @Test
    fun `derives browser-like UA from WebView default UA`() {
        val defaultUserAgent =
                "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AD1A.240905.004; wv) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
                        "Chrome/137.0.7151.61 Mobile Safari/537.36"

        val derived = deriveWebViewUserAgent(defaultUserAgent)

        assertEquals(
                "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AD1A.240905.004) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/137.0.7151.61 Mobile Safari/537.36",
                derived,
        )
        assertTrue(derived.contains("Chrome/137.0.7151.61"))
        assertTrue(derived.contains("Pixel 7 Build/AD1A.240905.004"))
        assertFalse(derived.contains("; wv"))
        assertFalse(derived.contains("Version/4.0"))
        assertFalse(derived.contains("BetterDeepSeek"))
        assertFalse(derived.contains("  "))
        assertFalse(derived.contains("; )"))
        assertFalse(derived.contains(";)"))
        assertEquals(derived, deriveWebViewUserAgent(derived))
    }

    @Test
    fun `leaves non-WebView UA unchanged`() {
        val chromeUserAgent =
                "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AD1A.240905.004) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/137.0.7151.61 Mobile Safari/537.36"

        assertEquals(chromeUserAgent, deriveWebViewUserAgent(chromeUserAgent))
    }
}
