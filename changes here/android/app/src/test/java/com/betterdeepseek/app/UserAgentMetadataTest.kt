package com.betterdeepseek.app

import androidx.webkit.UserAgentMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UserAgentMetadataTest {

    @Test
    fun `parses Chrome major version from UA`() {
        assertEquals(
                "137",
                parseChromeMajorVersion(
                        "Mozilla/5.0 (Linux; Android 14; Pixel 7) " +
                                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                                "Chrome/137.0.7151.61 Mobile Safari/537.36"
                ),
        )
        assertEquals(null, parseChromeMajorVersion("Mozilla/5.0 Mobile Safari/537.36"))
    }

    @Test
    fun `parses android platform version and device model`() {
        val pixelUa =
                "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AD1A.240905.004) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/137.0.7151.61 Mobile Safari/537.36"
        assertEquals("14", parseAndroidPlatformVersion(pixelUa))
        assertEquals("Pixel 7", parseDeviceModel(pixelUa))

        val samsungUa =
                "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        assertEquals("13", parseAndroidPlatformVersion(samsungUa))
        assertEquals("SM-G991B", parseDeviceModel(samsungUa))

        val noModelUa =
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/137.0.7151.61 Mobile Safari/537.36"
        assertEquals("14", parseAndroidPlatformVersion(noModelUa))
        assertEquals(null, parseDeviceModel(noModelUa))
    }

    @Test
    fun `builds Android Chrome user agent metadata`() {
        val metadata =
                buildUserAgentMetadata(
                        "Mozilla/5.0 (Linux; Android 14; Pixel 7) " +
                                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                                "Chrome/137.0.7151.61 Mobile Safari/537.36"
                )
        val brandVersions =
                metadata.brandVersionList.associate { brandVersion ->
                    brandVersion.brand to brandVersion.majorVersion
                }

        assertEquals("137", brandVersions["Chromium"])
        assertEquals("137", brandVersions["Google Chrome"])
        assertTrue(metadata.isMobile)
        assertEquals("Android", metadata.platform)
    }

    @Test
    fun `metadata includes GREASE brand and matching high-entropy fields`() {
        val metadata =
                buildUserAgentMetadata(
                        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AD1A.240905.004) " +
                                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                                "Chrome/137.0.7151.61 Mobile Safari/537.36"
                )
        val brands = metadata.brandVersionList.map { it.brand }
        val brandVersions =
                metadata.brandVersionList.associate { brandVersion ->
                    brandVersion.brand to brandVersion.majorVersion
                }

        assertTrue("must include Chromium", brands.contains("Chromium"))
        assertTrue("must include Google Chrome", brands.contains("Google Chrome"))
        assertTrue(
                "must include a GREASE brand",
                brands.any { it != "Chromium" && it != "Google Chrome" },
        )
        assertEquals("137", brandVersions["Chromium"])
        assertEquals("137", brandVersions["Google Chrome"])
        assertEquals("Android", metadata.platform)
        assertEquals("14", metadata.platformVersion)
        assertEquals("Pixel 7", metadata.model)
        assertEquals("", metadata.architecture)
        assertEquals(UserAgentMetadata.BITNESS_DEFAULT, metadata.bitness)
        assertTrue(metadata.isMobile)
        assertEquals("137.0.7151.61", metadata.fullVersion)
    }
}
