package com.betterdeepseek.app

import android.net.Uri
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows

@RunWith(RobolectricTestRunner::class)
class WebViewBridgeBoundedReadTest {

    @Test
    fun `readBoundedBytes returns full content under the cap`() {
        val result = readBoundedBytes("hello".byteInputStream(), 10)

        assertFalse(result.overflowed)
        assertArrayEquals("hello".toByteArray(), result.bytes)
    }

    @Test
    fun `readBoundedBytes signals overflow past the cap without reading further`() {
        val stream = CountingInputStream(ByteArray(20) { it.toByte() })

        val result = readBoundedBytes(stream, 5)

        assertTrue(result.overflowed)
        assertEquals(5, result.bytes.size)
        assertTrue(stream.bytesRead <= 6)
    }

    @Test
    fun `readPickedContentUri skips size-less oversized streams as too-large`() {
        val context = RuntimeEnvironment.getApplication()
        val bridge = WebViewBridge(context)
        val uri = Uri.parse("content://com.oem.files/document/primary%3ADocuments%2Fhuge.md")
        val oversized = ByteArray((WebViewBridge.MAX_PICKED_FILE_SIZE + 1).toInt()) { 'x'.code.toByte() }
        Shadows.shadowOf(context.contentResolver).registerInputStreamSupplier(uri) {
            oversized.inputStream()
        }

        val result = bridge.readPickedContentUri(uri)

        assertTrue(result is PickedItemResult.Skipped)
        val skipped = result as PickedItemResult.Skipped
        assertEquals("huge.md", skipped.name)
        assertEquals("too-large", skipped.reason)
    }

    private class CountingInputStream(private val bytes: ByteArray) : InputStream() {
        var bytesRead = 0
            private set

        private var index = 0

        override fun read(): Int {
            if (index >= bytes.size) return -1
            bytesRead += 1
            return bytes[index++].toInt() and 0xff
        }
    }
}
