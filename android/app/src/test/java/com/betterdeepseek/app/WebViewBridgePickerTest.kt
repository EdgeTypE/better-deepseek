package com.betterdeepseek.app

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any
import org.mockito.kotlin.eq

class WebViewBridgePickerTest {

    private lateinit var bridge: WebViewBridge

    @Before
    fun setUp() {
        val prefs = mock(SharedPreferences::class.java)
        val context = mock(Context::class.java)
        `when`(context.getSharedPreferences(any(), eq(Context.MODE_PRIVATE))).thenReturn(prefs)
        bridge = WebViewBridge(context)
    }

    @Test
    fun `classifyPickedFile accepts an allowlisted extension with clean content`() {
        val result = classifyPickedFile("notes.md", 10, "# hi", requireKnownExtension = false)

        assertTrue(result is PickedItemResult.Ok)
        val file = (result as PickedItemResult.Ok).file
        assertEquals("notes.md", file.name)
        assertEquals("# hi", file.content)
    }

    @Test
    fun `classifyPickedFile skips oversized files as too-large`() {
        val result =
                classifyPickedFile(
                        "notes.md",
                        3L * 1024 * 1024,
                        "# hi",
                        requireKnownExtension = false,
                )

        assertSkipped(result, "notes.md", "too-large")
    }

    @Test
    fun `classifyPickedFile skips null content as unreadable`() {
        val result = classifyPickedFile("notes.md", -1, null, requireKnownExtension = false)

        assertSkipped(result, "notes.md", "unreadable")
    }

    @Test
    fun `classifyPickedFile skips allowlisted extension with NUL bytes as binary`() {
        val result = classifyPickedFile("notes.md", -1, "a\u0000b", requireKnownExtension = false)

        assertSkipped(result, "notes.md", "binary")
    }

    @Test
    fun `classifyPickedFile skips unknown extensions in folder mode as unsupported-type`() {
        val result = classifyPickedFile("photo.png", -1, "not image data", requireKnownExtension = true)

        assertSkipped(result, "photo.png", "unsupported-type")
    }

    @Test
    fun `classifyPickedFile accepts extensionless text in files mode`() {
        val result = classifyPickedFile("Dockerfile", -1, "FROM busybox\n", requireKnownExtension = false)

        assertTrue(result is PickedItemResult.Ok)
        assertEquals("Dockerfile", (result as PickedItemResult.Ok).file.name)
    }

    @Test
    fun `classifyPickedFile skips NUL content without allowlisted extension in files mode as unsupported-type`() {
        val result = classifyPickedFile("doc.pdf", -1, "a\u0000b", requireKnownExtension = false)

        assertSkipped(result, "doc.pdf", "unsupported-type")
    }

    @Test
    fun `classifyPickedFile skips content exceeding the byte cap after decode as too-large`() {
        val content = "a".repeat((WebViewBridge.MAX_PICKED_FILE_SIZE + 1).toInt())

        val result = classifyPickedFile("notes.md", -1, content, requireKnownExtension = false)

        assertSkipped(result, "notes.md", "too-large")
    }

    @Test
    fun `buildPickResultScripts emits a single chunk script for small payloads`() {
        val scripts = buildPickResultScripts("req-1", """{"files":[],"skipped":[]}""")

        assertEquals(1, scripts.size)
        val script = scripts.single()
        assertTrue(script.contains("__bds_native_files_picked_req-1"))
        assertTrue(script.contains("v:2"))
        assertTrue(script.contains("kind:'chunk'"))
        assertTrue(script.contains("seq:0"))
        assertTrue(script.contains("total:1"))
        assertTrue(script.contains("console.error"))
    }

    @Test
    fun `buildPickResultScripts splits payloads larger than the chunk limit`() {
        val payload = "x".repeat(450_000)

        val scripts = buildPickResultScripts("req-1", payload)

        assertEquals(3, scripts.size)
        assertEquals(listOf(0, 1, 2), scripts.map { extractInt(it, "seq") })
        assertEquals(payload, scripts.joinToString("") { extractData(it) })
    }

    @Test
    fun `buildPickResultScripts sanitizes the requestId`() {
        val script = buildPickResultScripts("ab!cd", "{}").single()

        assertTrue(script.contains("__bds_native_files_picked_abcd"))
        assertFalse(script.contains("ab!cd"))
    }

    @Test
    fun `pickFiles delivers picker-launch-failed when no handler is wired`() {
        val scripts = mutableListOf<String>()
        bridge.scriptPoster = { scripts.add(it) }
        bridge.onPickFiles = null

        bridge.pickFiles("files", "req-1")

        assertTrue(scripts.joinToString("\n").contains("picker-launch-failed"))
    }

    private fun assertSkipped(result: PickedItemResult, name: String, reason: String) {
        assertTrue(result is PickedItemResult.Skipped)
        val skipped = result as PickedItemResult.Skipped
        assertEquals(name, skipped.name)
        assertEquals(reason, skipped.reason)
    }

    private fun extractInt(script: String, field: String): Int {
        return Regex("""$field:(\d+)""").find(script)?.groupValues?.get(1)?.toInt()
                ?: error("missing $field in $script")
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
