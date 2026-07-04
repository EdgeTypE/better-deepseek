package com.betterdeepseek.app

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows

@RunWith(RobolectricTestRunner::class)
class FileChooserTest {

    @Before
    fun setUp() {
        Shadows.shadowOf(MimeTypeMap.getSingleton())
                .addExtensionMimeTypeMapping("txt", "text/plain")
    }

    @Test
    fun `buildFileChooserIntent uses GET_CONTENT with openable category and wildcard type`() {
        val intent = buildFileChooserIntent(null, allowMultiple = false)

        assertEquals(Intent.ACTION_GET_CONTENT, intent.action)
        assertTrue(intent.categories?.contains(Intent.CATEGORY_OPENABLE) == true)
        assertEquals("*/*", intent.type)
    }

    @Test
    fun `buildFileChooserIntent sets EXTRA_ALLOW_MULTIPLE when multiple requested`() {
        val multipleIntent = buildFileChooserIntent(null, allowMultiple = true)
        val singleIntent = buildFileChooserIntent(null, allowMultiple = false)

        assertTrue(multipleIntent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))
        assertFalse(singleIntent.hasExtra(Intent.EXTRA_ALLOW_MULTIPLE))
    }

    @Test
    fun `buildFileChooserIntent maps extension accept tokens to concrete MIME types`() {
        val intent = buildFileChooserIntent(arrayOf(".txt", "text/plain"), allowMultiple = false)

        assertArrayEquals(arrayOf("text/plain"), intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
    }

    @Test
    fun `buildFileChooserIntent omits the MIME filter when any accept token is unmappable`() {
        val intent = buildFileChooserIntent(arrayOf(".weirdext", "text/plain"), allowMultiple = false)

        assertNull(intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
    }

    @Test
    fun `buildFileChooserIntent omits the MIME filter for blank or null acceptTypes`() {
        val nullIntent = buildFileChooserIntent(null, allowMultiple = false)
        val blankIntent = buildFileChooserIntent(arrayOf("", "  "), allowMultiple = false)

        assertNull(nullIntent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
        assertNull(blankIntent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
    }

    @Test
    fun `parseFileChooserResult returns null for cancelled results`() {
        val data = Intent().setData(Uri.parse("content://files/one.txt"))

        assertNull(parseFileChooserResult(Activity.RESULT_CANCELED, data))
    }

    @Test
    fun `parseFileChooserResult reads multiple uris from clipData in order`() {
        val first = Uri.parse("content://files/one.txt")
        val second = Uri.parse("content://files/two.txt")
        val data = Intent().apply {
            clipData =
                    ClipData.newRawUri("files", first).apply {
                        addItem(ClipData.Item(second))
                    }
        }

        assertArrayEquals(arrayOf(first, second), parseFileChooserResult(Activity.RESULT_OK, data))
    }

    @Test
    fun `parseFileChooserResult falls back to intent data for single selections`() {
        val uri = Uri.parse("content://files/one.txt")
        val data = Intent().setData(uri)

        assertArrayEquals(arrayOf(uri), parseFileChooserResult(Activity.RESULT_OK, data))
    }

    @Test
    fun `parseFileChooserResult dedupes duplicate uris`() {
        val uri = Uri.parse("content://files/one.txt")
        val data = Intent().apply {
            clipData =
                    ClipData.newRawUri("files", uri).apply {
                        addItem(ClipData.Item(uri))
                    }
        }

        assertArrayEquals(arrayOf(uri), parseFileChooserResult(Activity.RESULT_OK, data))
    }

    @Test
    fun `parseFileChooserResult returns null when RESULT_OK carries nothing`() {
        assertNull(parseFileChooserResult(Activity.RESULT_OK, Intent()))
    }
}
