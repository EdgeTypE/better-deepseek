package com.betterdeepseek.app

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
}
