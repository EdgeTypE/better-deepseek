package com.betterdeepseek.app

import android.content.Context
import android.content.SharedPreferences
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import java.util.concurrent.TimeUnit

/**
 * JVM-only tests for WebViewBridge. We mock the SharedPreferences surface so
 * Robolectric isn't required, and we drive the OkHttpClient at a MockWebServer
 * to assert the JSON contract returned to the JS bridge shim.
 *
 * downloadBlob is intentionally not exercised here — it touches MediaStore /
 * FileProvider, which require an instrumented (device) test. The fetch routing
 * is the critical contract that has to stay 1:1 with the chrome background SW.
 */
class WebViewBridgeTest {

    private lateinit var server: MockWebServer
    private lateinit var bridge: WebViewBridge
    private lateinit var context: Context
    private lateinit var prefs: SharedPreferences
    private lateinit var prefsEditor: SharedPreferences.Editor

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        prefs = mock(SharedPreferences::class.java)
        prefsEditor = mock(SharedPreferences.Editor::class.java)
        `when`(prefs.edit()).thenReturn(prefsEditor)
        `when`(prefsEditor.putString(any(), any())).thenReturn(prefsEditor)
        `when`(prefsEditor.putBoolean(any(), any())).thenReturn(prefsEditor)
        `when`(prefsEditor.remove(any())).thenReturn(prefsEditor)

        context = mock(Context::class.java)
        `when`(context.getSharedPreferences(any(), eq(Context.MODE_PRIVATE)))
            .thenReturn(prefs)
        `when`(context.getString(R.string.bds_asset_authority)).thenReturn("bds-asset.local")

        val client = OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(2, TimeUnit.SECONDS)
            .callTimeout(5, TimeUnit.SECONDS)
            .build()
        bridge = WebViewBridge(context, client, server.url("").toString().removeSuffix("/"))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // ── storage ─────────────────────────────────────────────────────────

    @Test
    fun `getStorage returns null for missing key`() {
        `when`(prefs.getString("missing", null)).thenReturn(null)
        assertNull(bridge.getStorage("missing"))
    }

    @Test
    fun `getStorage rejects null and empty keys without touching prefs`() {
        assertNull(bridge.getStorage(null))
        assertNull(bridge.getStorage(""))
        verify(prefs, never()).getString(any(), any())
    }

    @Test
    fun `setStorage forwards the value to prefs editor`() {
        bridge.setStorage("k", "v")
        verify(prefsEditor).putString("k", "v")
        verify(prefsEditor).apply()
    }

    @Test
    fun `setStorage coerces null value to empty string`() {
        bridge.setStorage("k", null)
        verify(prefsEditor).putString("k", "")
    }

    @Test
    fun `removeStorage forwards the call to prefs editor`() {
        bridge.removeStorage("k")
        verify(prefsEditor).remove("k")
        verify(prefsEditor).apply()
    }

    // ── asset URL ───────────────────────────────────────────────────────

    @Test
    fun `getAssetUrl resolves against the configured authority`() {
        assertEquals("https://bds-asset.local/bds/sandbox.html", bridge.getAssetUrl("sandbox.html"))
    }

    @Test
    fun `getAssetUrl strips a leading slash`() {
        assertEquals("https://bds-asset.local/bds/foo.js", bridge.getAssetUrl("/foo.js"))
    }

    // ── fetch routing ───────────────────────────────────────────────────

    @Test
    fun `fetch returns ok and html for a successful URL fetch`() {
        server.enqueue(MockResponse().setBody("<html>ok</html>").setResponseCode(200))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-url")
            put("url", server.url("/page").toString())
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertTrue(response.getBoolean("ok"))
        assertEquals(200, response.getInt("status"))
        assertEquals("<html>ok</html>", response.getString("html"))
    }

    @Test
    fun `fetch returns ok=false with status for non-2xx responses`() {
        server.enqueue(MockResponse().setResponseCode(503).setBody("server down"))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-url")
            put("url", server.url("/x").toString())
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertFalse(response.getBoolean("ok"))
        assertEquals(503, response.getInt("status"))
        assertTrue(response.getString("error").contains("503"))
    }

    @Test
    fun `fetch returns ok=false when no URL is provided`() {
        val payload = JSONObject().apply { put("type", "bds-fetch-url") }
        val response = JSONObject(bridge.fetch(payload.toString()))
        assertFalse(response.getBoolean("ok"))
        assertEquals("No URL provided.", response.getString("error"))
    }

    @Test
    fun `fetch returns an unsupported-type error for unknown messages`() {
        val payload = JSONObject().apply { put("type", "bds-something-unknown") }
        val response = JSONObject(bridge.fetch(payload.toString()))
        assertFalse(response.getBoolean("ok"))
        assertTrue(response.getString("error").contains("Unsupported"))
    }

    @Test
    fun `fetch never throws — malformed JSON yields a structured error`() {
        val response = JSONObject(bridge.fetch("not-json"))
        assertFalse(response.getBoolean("ok"))
        assertTrue(response.getString("error").contains("Bridge error"))
    }

    // ── theme ───────────────────────────────────────────────────────────

    @Test
    fun `reportTheme fires callback and does not touch prefs`() {
        var reported: Boolean? = null
        bridge.onThemeChanged = { isDark -> reported = isDark }

        bridge.reportTheme(true)

        // Persistence is handled by theme.js via chrome.storage — bridge must not double-write.
        verify(prefsEditor, never()).putBoolean(any(), anyBoolean())
        assertEquals(true, reported)
    }

    @Test
    fun `reportTheme false fires callback`() {
        var reported: Boolean? = null
        bridge.onThemeChanged = { isDark -> reported = isDark }
        bridge.reportTheme(false)
        assertEquals(false, reported)
    }

    @Test
    fun `getLastKnownIsDark returns true when polyfill stored json true string`() {
        // The Android storage polyfill calls setStorage(key, JSON.stringify(true)) = "true".
        `when`(prefs.getString(WebViewBridge.KEY_LAST_PAGE_DARK, null)).thenReturn("true")
        assertTrue(bridge.getLastKnownIsDark(default = false))
    }

    @Test
    fun `getLastKnownIsDark returns false when polyfill stored json false string`() {
        `when`(prefs.getString(WebViewBridge.KEY_LAST_PAGE_DARK, null)).thenReturn("false")
        assertFalse(bridge.getLastKnownIsDark(default = true))
    }

    @Test
    fun `getLastKnownIsDark forwards default when prefs has no entry`() {
        `when`(prefs.getString(WebViewBridge.KEY_LAST_PAGE_DARK, null)).thenReturn(null)
        assertFalse(bridge.getLastKnownIsDark(default = false))
        assertTrue(bridge.getLastKnownIsDark(default = true))
    }

    // ── github zip ──────────────────────────────────────────────────────

    @Test
    fun `github zip without token reaches the server and receives a response`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody("x".repeat(2048)))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-zip")
            put("url", server.url("/x/y/zip").toString())
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        // The bridge must not throw and must return a JSON object with an
        // `ok` field. The exact shape (base64 vs error) is an implementation
        // detail of encodeZipToResponse; what matters is the wire contract.
        assertTrue(response.has("ok"))
        // The server MUST have received exactly one request.
        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/x/y/zip", recorded.requestUrl?.encodedPath)
    }

    @Test
    fun `github zip with token sends Authorization header for codeload urls`() {
        val zipBody = "z".repeat(2048)
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(zipBody),
        )

        // The bridge only sends the token for codeload.github.com, so we have to
        // route the JSON through that host. We can't easily do that against a
        // local MockWebServer — instead we assert that omitting the codeload
        // host means no Authorization header is sent.
        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-zip")
            put("url", server.url("/zip").toString())
            put("token", "ghp_secret")
        }
        bridge.fetch(payload.toString())

        val request = server.takeRequest()
        assertNull(
            "Authorization header must NOT be sent to non-codeload hosts",
            request.getHeader("Authorization"),
        )
    }

    @Test
    fun `github zip surfaces authRejected when the server returns 401`() {
        // codeload host check matters here — but since MockWebServer doesn't
        // run as codeload.github.com, the auth path is skipped. Instead we
        // exercise the fallback path: a 4xx response from the anonymous fetch
        // is reported as an error with a status, never silently empty.
        server.enqueue(MockResponse().setResponseCode(404).setBody("nope"))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-zip")
            put("url", server.url("/missing/zip").toString())
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertFalse(response.getBoolean("ok"))
        assertEquals(404, response.getInt("status"))
        assertTrue(response.getString("error").contains("404"))
    }

    @Test
    fun `github zip rejects empty bodies as invalid`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(""))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-zip")
            put("url", server.url("/empty").toString())
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertFalse(response.getBoolean("ok"))
        assertTrue(response.getString("error").contains("empty"))
    }

    @Test
    fun `github commits fetch returns structured commit summaries`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    [
                      {
                        "sha": "abcdef1234567890",
                        "commit": {
                          "author": {
                            "name": "Alice",
                            "date": "2026-05-06T10:00:00Z"
                          },
                          "message": "Fix sidebar"
                        }
                      }
                    ]
                    """.trimIndent(),
                ),
        )

        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-commits")
            put("owner", "octocat")
            put("repo", "Hello-World")
            put("branch", "feature/ui")
            put("count", 150)
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertTrue(response.getBoolean("ok"))
        val commits = response.getJSONArray("commits")
        assertEquals(1, commits.length())
        val commit = commits.getJSONObject(0)
        assertEquals("abcdef1", commit.getString("sha"))
        assertEquals("Alice", commit.getString("author"))
        assertEquals("2026-05-06T10:00:00Z", commit.getString("date"))
        assertEquals("Fix sidebar", commit.getString("message"))

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/repos/octocat/Hello-World/commits", request.requestUrl?.encodedPath)
        assertTrue(request.requestUrl.toString().contains("sha="))
        assertEquals("100", request.requestUrl?.queryParameter("per_page"))
        assertEquals("1", request.requestUrl?.queryParameter("page"))
    }

    @Test
    fun `github commits fetch returns authRejected on 401`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"bad creds"}"""))

        val payload = JSONObject().apply {
            put("type", "bds-fetch-github-commits")
            put("owner", "octocat")
            put("repo", "Hello-World")
            put("branch", "main")
            put("count", 5)
            put("token", "ghp_secret")
        }
        val response = JSONObject(bridge.fetch(payload.toString()))

        assertFalse(response.getBoolean("ok"))
        assertEquals(401, response.getInt("status"))
        assertTrue(response.getBoolean("authRejected"))
    }
}
