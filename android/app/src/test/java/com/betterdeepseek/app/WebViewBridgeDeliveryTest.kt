package com.betterdeepseek.app

import android.net.Uri
import android.os.Looper
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows

@RunWith(RobolectricTestRunner::class)
class WebViewBridgeDeliveryTest {

    private lateinit var bridge: WebViewBridge
    private lateinit var scripts: MutableList<String>

    @Before
    fun setUp() {
        bridge = WebViewBridge(RuntimeEnvironment.getApplication())
        scripts = mutableListOf()
        bridge.evaluateJs = { scripts.add(it) }
    }

    @Test
    fun `deliverPickedFiles includes skipped entries in the payload`() {
        bridge.deliverPickedFiles(
                "req-1",
                listOf(PickedFile("notes.md", "# hi")),
                listOf(SkippedFile("photo.png", "unsupported-type")),
                "repo",
        )

        Shadows.shadowOf(Looper.getMainLooper()).idle()

        val payload = reassemblePayload(scripts)
        assertEquals("repo", payload.getString("folderName"))
        assertEquals("notes.md", payload.getJSONArray("files").getJSONObject(0).getString("name"))
        assertEquals("# hi", payload.getJSONArray("files").getJSONObject(0).getString("content"))
        assertEquals(
                "photo.png",
                payload.getJSONArray("skipped").getJSONObject(0).getString("name"),
        )
        assertEquals(
                "unsupported-type",
                payload.getJSONArray("skipped").getJSONObject(0).getString("reason"),
        )
    }

    @Test
    fun `deliverPickError produces a payload the v2 client can parse`() {
        bridge.deliverPickError("req-1", "picker-launch-failed")

        Shadows.shadowOf(Looper.getMainLooper()).idle()

        val payload = reassemblePayload(scripts)
        assertEquals("picker-launch-failed", payload.getString("error"))
        assertEquals(0, payload.getJSONArray("files").length())
    }

    @Test
    fun `deliverPickStatus posts a status event script`() {
        bridge.deliverPickStatus("req-1", "opened")

        Shadows.shadowOf(Looper.getMainLooper()).idle()

        val script = scripts.single()
        assertTrue(script.contains("__bds_native_files_picked_req-1"))
        assertTrue(script.contains("v:2"))
        assertTrue(script.contains("kind:'status'"))
        assertTrue(script.contains("phase:'opened'"))
    }

    @Test
    fun `resolvePickedDisplayName falls back to the uri path segment`() {
        val uri = Uri.parse("content://com.oem.files/document/primary%3ADocuments%2Fnotes.md")

        assertEquals("notes.md", bridge.resolvePickedDisplayName(uri))
    }

    @Test
    fun `resolvePickedDisplayName returns the fallback name when nothing is available`() {
        val uri = Uri.parse("content://com.oem.files")

        assertEquals("picked_file.txt", bridge.resolvePickedDisplayName(uri))
    }

    private fun reassemblePayload(scripts: List<String>): JSONObject {
        return JSONObject(scripts.joinToString("") { extractData(it) })
    }

    private fun extractData(script: String): String {
        val marker = "data:"
        val start = script.indexOf(marker).takeIf { it >= 0 }?.plus(marker.length)
                ?: error("missing data in $script")
        require(script[start] == '"') { "data literal did not start with a quote" }
        var end = start + 1
        var escaped = false
        while (end < script.length) {
            val ch = script[end]
            if (escaped) {
                escaped = false
            } else if (ch == '\\') {
                escaped = true
            } else if (ch == '"') {
                break
            }
            end += 1
        }
        val literal = script.substring(start, end + 1)
        return JSONObject("""{"data":$literal}""").getString("data")
    }
}
