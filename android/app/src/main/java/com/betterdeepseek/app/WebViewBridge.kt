package com.betterdeepseek.app

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.Locale
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** File entry returned by the native Android picker to JavaScript. */
internal data class PickedFile(
        val name: String,
        val content: String,
        val encoding: String? = null,
        val mime: String? = null,
)

/** Native-picked file that could not be delivered to JavaScript. */
internal data class SkippedFile(val name: String, val reason: String)

internal data class BoundedReadResult(val bytes: ByteArray, val overflowed: Boolean)

internal data class PickReadResult(
        val files: List<PickedFile>,
        val skipped: List<SkippedFile>,
        val folderName: String?,
)

private data class FolderImageCounter(var accepted: Int = 0)

internal sealed class PickedItemResult {
    data class Ok(val file: PickedFile) : PickedItemResult()
    data class Skipped(val name: String, val reason: String) : PickedItemResult()
}

internal fun readBoundedBytes(stream: InputStream, capBytes: Long): BoundedReadResult {
    val output = ByteArrayOutputStream(minOf(capBytes, 8192L).toInt())
    val buffer = ByteArray(8192)
    var total = 0L

    while (true) {
        val remaining = capBytes - total
        val readLimit =
                if (remaining >= buffer.size) buffer.size
                else (remaining + 1).coerceAtLeast(1).toInt()
        val read = stream.read(buffer, 0, readLimit)
        if (read == -1) {
            return BoundedReadResult(output.toByteArray(), overflowed = false)
        }
        if (total + read > capBytes) {
            val keep = (capBytes - total).toInt()
            if (keep > 0) output.write(buffer, 0, keep)
            return BoundedReadResult(output.toByteArray(), overflowed = true)
        }
        output.write(buffer, 0, read)
        total += read
    }
}

internal fun classifyPickedFile(
        name: String,
        byteSize: Long,
        content: String?,
        requireKnownExtension: Boolean,
): PickedItemResult {
    if (hasImageFileExtension(name)) {
        return PickedItemResult.Skipped(name, "image-requires-vision")
    }
    if (byteSize > WebViewBridge.MAX_PICKED_FILE_SIZE) {
        return PickedItemResult.Skipped(name, "too-large")
    }
    if (content == null) {
        return PickedItemResult.Skipped(name, "unreadable")
    }
    if (content.toByteArray(Charsets.UTF_8).size > WebViewBridge.MAX_PICKED_FILE_SIZE) {
        return PickedItemResult.Skipped(name, "too-large")
    }

    val hasKnownExtension = hasTextFileExtension(name)
    val hasNul = content.any { it.code == 0 }
    if (hasKnownExtension) {
        return if (hasNul) {
            PickedItemResult.Skipped(name, "binary")
        } else {
            PickedItemResult.Ok(PickedFile(name, content))
        }
    }

    if (requireKnownExtension || hasNul) {
        return PickedItemResult.Skipped(name, "unsupported-type")
    }
    return PickedItemResult.Ok(PickedFile(name, content))
}

internal fun encodePickedImage(
        name: String,
        bytes: ByteArray,
        capBytes: Long = WebViewBridge.MAX_PICKED_IMAGE_SIZE,
): PickedItemResult {
    if (bytes.size.toLong() > capBytes) {
        return PickedItemResult.Skipped(name, "too-large")
    }
    return PickedItemResult.Ok(
            PickedFile(
                    name = name,
                    content = java.util.Base64.getEncoder().encodeToString(bytes),
                    encoding = "base64",
                    mime = mimeForImageName(name),
            )
    )
}

internal fun mimeForImageName(name: String): String {
    val ext = fileExtension(name)
    return WebViewBridge.IMAGE_MIME_TYPES[ext] ?: "application/octet-stream"
}

internal fun classifyFolderImageCap(name: String, acceptedImageCount: Int): PickedItemResult? {
    return if (acceptedImageCount >= WebViewBridge.MAX_FOLDER_IMAGES) {
        PickedItemResult.Skipped(name, "image-cap-exceeded")
    } else {
        null
    }
}

internal fun buildPickResultScripts(requestId: String, payloadJson: String): List<String> {
    val safeId = sanitizePickRequestId(requestId)
    if (safeId.isEmpty()) return emptyList()

    val chunks =
            if (payloadJson.isEmpty()) listOf("")
            else payloadJson.chunked(WebViewBridge.MAX_PICK_CHUNK_CHARS)
    val total = chunks.size
    return chunks.mapIndexed { index, chunk ->
        val dataLiteral = JSONObject.quote(chunk)
        "(function(){try{window.dispatchEvent(new CustomEvent('__bds_native_files_picked_$safeId'," +
                "{detail:{v:2,kind:'chunk',seq:$index,total:$total,data:$dataLiteral}}));}" +
                "catch(e){console.error('[BDS] pick delivery failed',e)}})();"
    }
}

private fun sanitizePickRequestId(requestId: String): String =
        requestId.filter { it.isLetterOrDigit() || it == '-' }.take(64)

private fun hasTextFileExtension(filename: String): Boolean {
    val ext = fileExtension(filename)
    return ext.isNotEmpty() && ext in WebViewBridge.TEXT_EXTENSIONS
}

private fun hasImageFileExtension(filename: String): Boolean {
    val ext = fileExtension(filename)
    return ext.isNotEmpty() && ext in WebViewBridge.IMAGE_EXTENSIONS
}

private fun fileExtension(filename: String): String =
        filename.substringAfterLast('.', "").lowercase()

/**
 * @JavascriptInterface object exposed to the WebView as `window.AndroidBridge`.
 *
 * Methods here back the chrome.* polyfill in src/platform/android-chrome-polyfill.js. All methods
 * MUST be safe to call from arbitrary JS — they validate inputs and return JSON strings (or null)
 * rather than throwing.
 *
 * Phase 1 implements:
 * - SharedPreferences-backed key/value storage
 * - Generic HTTP GET/POST via OkHttp routed by message.type
 * - Asset URL resolution against the WebViewAssetLoader authority
 * - Blob download stub (Phase 2 will implement the actual file write)
 */
class WebViewBridge(
        private val context: Context,
        httpClient: OkHttpClient? = null,
        private val githubApiBaseUrl: String = DEFAULT_GITHUB_API_BASE_URL,
) {

    private val prefs: SharedPreferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val httpClient: OkHttpClient =
            httpClient
                    ?: OkHttpClient.Builder()
                            .connectTimeout(20, TimeUnit.SECONDS)
                            .readTimeout(60, TimeUnit.SECONDS)
                            .callTimeout(120, TimeUnit.SECONDS)
                            .build()

    /** Set by MainActivity to react to page theme changes without leaking the Activity window. */
    @Volatile var onThemeChanged: ((isDark: Boolean) -> Unit)? = null

    /**
     * Set by MainActivity to evaluate JS in the WebView. Results from native picker launchers
     * are delivered through CustomEvent instances in the page.
     */
    @Volatile var evaluateJs: ((script: String) -> Unit)? = null

    /** Test hook for unit tests that cannot rely on Android's main looper. */
    @Volatile internal var scriptPoster: ((String) -> Unit)? = null

    /**
     * Set by MainActivity to launch the native file or folder picker.
     * Mode is "files" or "folder"; requestId is the JS correlation key.
     */
    @Volatile var onPickFiles: ((mode: String, requestId: String) -> Unit)? = null

    /**
     * Returns the last DeepSeek page theme written by the extension's theme.js via
     * chrome.storage.local (which the Android polyfill routes through [setStorage] as
     * JSON.stringify(boolean) → stored as the string "true" or "false"). Falls back to [default]
     * on first-ever launch before any value has been persisted.
     */
    fun getLastKnownIsDark(default: Boolean = false): Boolean {
        val raw = prefs.getString(KEY_LAST_PAGE_DARK, null) ?: return default
        return raw == "true"
    }

    /**
     * Called by theme.js (via AndroidBridge.reportTheme) when the page's light/dark state changes.
     * Persistence is handled cross-platform by chrome.storage.local.set in theme.js; this method
     * exists solely so MainActivity can update status/navigation bar icon colours immediately.
     */
    @JavascriptInterface
    fun reportTheme(isDark: Boolean) {
        onThemeChanged?.invoke(isDark)
    }

    /** Returns the Android system locale for JS locale detection inside WebView. */
    @JavascriptInterface
    fun getSystemLocale(): String {
        val tag = Locale.getDefault().toLanguageTag()
        return if (tag.isNotBlank() && tag != "und") tag else "en-US"
    }

    /**
     * Called by JS to open the native Android file or folder picker.
     *
     * The result is delivered asynchronously as a page CustomEvent named
     * "__bds_native_files_picked_<requestId>".
     */
    @JavascriptInterface
    fun pickFiles(mode: String?, requestId: String?) {
        val safeId =
                requestId
                        ?.let(::sanitizePickRequestId)
                        ?: return
        if (safeId.isEmpty()) return

        val safeMode =
                when (mode) {
                    "folder", "folder+images", "files+images" -> mode
                    else -> "files"
                }
        val handler = onPickFiles
        if (handler == null) {
            deliverPickError(safeId, "picker-launch-failed")
            return
        }
        handler.invoke(safeMode, safeId)
    }

    internal fun deliverPickedFiles(
            requestId: String,
            files: List<PickedFile>,
            skipped: List<SkippedFile>,
            folderName: String?
    ) {
        val filesJson = JSONArray()
        for (file in files) {
            filesJson.put(
                    JSONObject().apply {
                        put("name", file.name)
                        put("content", file.content)
                        if (file.encoding != null) put("encoding", file.encoding)
                        if (file.mime != null) put("mime", file.mime)
                    }
            )
        }
        val skippedJson = JSONArray()
        for (file in skipped) {
            skippedJson.put(
                    JSONObject().apply {
                        put("name", file.name)
                        put("reason", file.reason)
                    }
            )
        }
        val payload =
                JSONObject().apply {
                    put("files", filesJson)
                    put("skipped", skippedJson)
                    if (folderName != null) put("folderName", folderName)
                }
        deliverPickResult(requestId, payload)
    }

    internal fun deliverPickError(requestId: String, error: String) {
        val payload =
                JSONObject().apply {
                    put("error", error)
                    put("files", JSONArray())
                }
        deliverPickResult(requestId, payload)
    }

    internal fun deliverPickStatus(requestId: String, phase: String) {
        val safeId = sanitizePickRequestId(requestId)
        if (safeId.isEmpty()) return
        val safePhase = phase.filter { it.isLetter() || it == '-' }.take(32)
        if (safePhase.isEmpty()) return
        val script =
                "(function(){try{window.dispatchEvent(new CustomEvent('__bds_native_files_picked_$safeId'," +
                        "{detail:{v:2,kind:'status',phase:'$safePhase'}}));}" +
                        "catch(e){console.error('[BDS] pick delivery failed',e)}})();"
        postScript(script)
    }

    private fun deliverPickResult(requestId: String, payload: JSONObject) {
        buildPickResultScripts(requestId, payload.toString()).forEach(::postScript)
    }

    private fun postScript(script: String) {
        val poster = scriptPoster
        if (poster != null) {
            poster(script)
            return
        }
        mainHandler.post { evaluateJs?.invoke(script) }
    }

    internal fun readPickedContentUri(uri: Uri, acceptImages: Boolean = false): PickedItemResult {
        val name = resolvePickedDisplayName(uri)
        if (hasImageFileExtension(name)) {
            if (!acceptImages) {
                return PickedItemResult.Skipped(name, "image-requires-vision")
            }
            return readPickedImageUri(uri, name)
        }

        val length = runCatching { getContentLength(uri) }.getOrDefault(-1L)
        if (length > MAX_PICKED_FILE_SIZE) {
            return PickedItemResult.Skipped(name, "too-large")
        }

        val content =
                try {
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        val read = readBoundedBytes(stream, MAX_PICKED_FILE_SIZE)
                        if (read.overflowed) {
                            return PickedItemResult.Skipped(name, "too-large")
                        }
                        String(read.bytes, Charsets.UTF_8)
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "readPickedContentUri failed for $uri", t)
                    null
                }
        return classifyPickedFile(name, length, content, requireKnownExtension = false)
    }

    internal fun readPickedFolderTree(treeUri: Uri, acceptImages: Boolean = false): PickReadResult {
        val docTree = DocumentFile.fromTreeUri(context, treeUri)
                ?: return PickReadResult(emptyList(), emptyList(), "folder")
        val folderName = docTree.name ?: "folder"
        val files = mutableListOf<PickedFile>()
        val skipped = mutableListOf<SkippedFile>()
        val imageCounter = FolderImageCounter()
        traverseDocumentTree(docTree, "", files, skipped, 0, acceptImages, imageCounter)
        return PickReadResult(files, skipped, folderName)
    }

    internal fun resolvePickedDisplayName(uri: Uri): String {
        runCatching { getDisplayName(uri) }
                .getOrNull()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.let { return it }

        runCatching { DocumentFile.fromSingleUri(context, uri)?.name }
                .getOrNull()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.let { return it }

        val parsed =
                uri.lastPathSegment
                        ?.let(Uri::decode)
                        ?.substringAfterLast('/')
                        ?.substringAfterLast(':')
                        ?.trim()
        if (!parsed.isNullOrEmpty()) return parsed
        return "picked_file.txt"
    }

    private fun traverseDocumentTree(
            dir: DocumentFile,
            pathPrefix: String,
            out: MutableList<PickedFile>,
            skipped: MutableList<SkippedFile>,
            depth: Int,
            acceptImages: Boolean,
            imageCounter: FolderImageCounter,
    ) {
        if (depth > MAX_FOLDER_DEPTH) return
        for (child in dir.listFiles()) {
            val name = child.name
            if (name == null) {
                if (child.isFile) skipped.add(SkippedFile("unknown", "unreadable"))
                continue
            }
            val relPath = if (pathPrefix.isEmpty()) name else "$pathPrefix/$name"
            if (isSkippedPath(relPath)) continue
            if (child.isDirectory) {
                traverseDocumentTree(child, relPath, out, skipped, depth + 1, acceptImages, imageCounter)
            } else if (child.isFile) {
                when (val picked = readDocumentFile(child, relPath, acceptImages, imageCounter)) {
                    is PickedItemResult.Ok -> out.add(picked.file)
                    is PickedItemResult.Skipped -> skipped.add(SkippedFile(picked.name, picked.reason))
                }
            }
        }
    }

    private fun readDocumentFile(
            file: DocumentFile,
            relPath: String,
            acceptImages: Boolean,
            imageCounter: FolderImageCounter,
    ): PickedItemResult {
        val name = file.name ?: return PickedItemResult.Skipped(relPath, "unreadable")
        if (hasImageFileExtension(name)) {
            if (!acceptImages) {
                return PickedItemResult.Skipped(relPath, "image-requires-vision")
            }
            classifyFolderImageCap(relPath, imageCounter.accepted)?.let { return it }
            return readPickedImageDocument(file, relPath).also { result ->
                if (result is PickedItemResult.Ok) imageCounter.accepted += 1
            }
        }
        if (!isTextFileExtension(name)) {
            return PickedItemResult.Skipped(relPath, "unsupported-type")
        }
        val length = file.length()
        if (length > MAX_PICKED_FILE_SIZE) {
            return PickedItemResult.Skipped(relPath, "too-large")
        }
        val content =
                try {
                    context.contentResolver.openInputStream(file.uri)?.use { stream ->
                        val read = readBoundedBytes(stream, MAX_PICKED_FILE_SIZE)
                        if (read.overflowed) {
                            return PickedItemResult.Skipped(relPath, "too-large")
                        }
                        String(read.bytes, Charsets.UTF_8)
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "readDocumentFile failed for $relPath", t)
                    null
                }
        return classifyPickedFile(relPath, length, content, requireKnownExtension = true)
    }

    private fun readPickedImageUri(uri: Uri, name: String): PickedItemResult {
        val length = runCatching { getContentLength(uri) }.getOrDefault(-1L)
        if (length > MAX_PICKED_IMAGE_SIZE) {
            return PickedItemResult.Skipped(name, "too-large")
        }
        val bytes =
                try {
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        val read = readBoundedBytes(stream, MAX_PICKED_IMAGE_SIZE)
                        if (read.overflowed) {
                            return PickedItemResult.Skipped(name, "too-large")
                        }
                        read.bytes
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "readPickedImageUri failed for $uri", t)
                    null
                }
        return if (bytes == null) {
            PickedItemResult.Skipped(name, "unreadable")
        } else {
            encodePickedImage(name, bytes)
        }
    }

    private fun readPickedImageDocument(file: DocumentFile, relPath: String): PickedItemResult {
        val length = file.length()
        if (length > MAX_PICKED_IMAGE_SIZE) {
            return PickedItemResult.Skipped(relPath, "too-large")
        }
        val bytes =
                try {
                    context.contentResolver.openInputStream(file.uri)?.use { stream ->
                        val read = readBoundedBytes(stream, MAX_PICKED_IMAGE_SIZE)
                        if (read.overflowed) {
                            return PickedItemResult.Skipped(relPath, "too-large")
                        }
                        read.bytes
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "readPickedImageDocument failed for $relPath", t)
                    null
                }
        return if (bytes == null) {
            PickedItemResult.Skipped(relPath, "unreadable")
        } else {
            encodePickedImage(relPath, bytes)
        }
    }

    private fun getDisplayName(uri: Uri): String? =
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (!cursor.moveToFirst() || index < 0) null else cursor.getString(index)
            }

    private fun getContentLength(uri: Uri): Long =
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (!cursor.moveToFirst() || index < 0 || cursor.isNull(index)) -1L
                else cursor.getLong(index)
            } ?: -1L

    private fun isTextFileExtension(filename: String): Boolean = hasTextFileExtension(filename)

    private fun isSkippedPath(relPath: String): Boolean =
            relPath.split("/").any { it in SKIP_DIRS }

    @JavascriptInterface
    fun getStorage(key: String?): String? {
        if (key.isNullOrEmpty()) return null
        return prefs.getString(key, null)
    }

    @JavascriptInterface
    fun setStorage(key: String?, value: String?) {
        if (key.isNullOrEmpty()) return
        prefs.edit().putString(key, value ?: "").apply()
    }

    @JavascriptInterface
    fun removeStorage(key: String?) {
        if (key.isNullOrEmpty()) return
        prefs.edit().remove(key).apply()
    }

    @JavascriptInterface
    fun getAssetUrl(relativePath: String?): String {
        val authority = context.getString(R.string.bds_asset_authority)
        val cleaned = (relativePath ?: "").trimStart('/')
        return "https://$authority/bds/$cleaned"
    }

    /**
     * Decode a base64 blob produced by the JS download helpers and write it to the user's Downloads
     * folder.
     *
     * Strategy:
     * - API 29+ (Q): insert into MediaStore.Downloads, write via openOutputStream.
     * ```
     *     The system DownloadManager surfaces the file to the user automatically.
     * ```
     * - Legacy (API 26-28): write into Environment.DIRECTORY_DOWNLOADS, fire
     * ```
     *     a DOWNLOAD_COMPLETE broadcast and try ACTION_VIEW via FileProvider.
     * ```
     * The JS side is fire-and-forget; failures are logged and surfaced as a Toast so the user is
     * never left wondering why the download didn't appear.
     */
    @JavascriptInterface
    fun downloadBlob(base64: String?, mimeType: String?, fileName: String?) {
        val payload = base64?.takeIf { it.isNotEmpty() }
        if (payload == null) {
            Log.w(TAG, "downloadBlob: empty payload, ignoring (name=$fileName)")
            return
        }

        val safeName = sanitizeDownloadName(fileName)
        val resolvedMime = mimeType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"

        try {
            val bytes = Base64.decode(payload, Base64.DEFAULT)
            val uri = writeBytesToDownloads(bytes, safeName, resolvedMime)
            if (uri == null) {
                showToast("Download failed: $safeName")
                return
            }

            showToast("Saved: $safeName")
            tryLaunchViewer(uri, resolvedMime)
        } catch (t: Throwable) {
            Log.e(TAG, "downloadBlob failed for $safeName", t)
            showToast("Download error: ${t.message ?: "unknown"}")
        }
    }

    private fun writeBytesToDownloads(
            bytes: ByteArray,
            fileName: String,
            mimeType: String,
    ): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values =
                    ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType)
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
            val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val itemUri = resolver.insert(collection, values) ?: return null

            resolver.openOutputStream(itemUri)?.use { it.write(bytes) } ?: return null

            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(itemUri, values, null, null)
            itemUri
        } else {
            @Suppress("DEPRECATION")
            val downloadsDir =
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            val file = uniqueFileIn(downloadsDir, fileName)
            FileOutputStream(file).use { it.write(bytes) }

            val authority = "${context.packageName}.fileprovider"
            try {
                FileProvider.getUriForFile(context, authority, file)
            } catch (t: Throwable) {
                Log.w(TAG, "FileProvider URI failed; falling back to file scheme", t)
                Uri.fromFile(file)
            }
        }
    }

    private fun tryLaunchViewer(uri: Uri, mimeType: String) {
        mainHandler.post {
            runCatching {
                val intent =
                        Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, mimeType)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                context.startActivity(intent)
            }
                    .onFailure { Log.i(TAG, "No viewer for $mimeType — file remains in Downloads") }
        }
    }

    private fun uniqueFileIn(dir: File, baseName: String): File {
        val candidate = File(dir, baseName)
        if (!candidate.exists()) return candidate
        val dot = baseName.lastIndexOf('.')
        val stem = if (dot > 0) baseName.substring(0, dot) else baseName
        val ext = if (dot > 0) baseName.substring(dot) else ""
        var i = 1
        while (true) {
            val f = File(dir, "${stem}_$i$ext")
            if (!f.exists()) return f
            i++
        }
    }

    private fun sanitizeDownloadName(fileName: String?): String {
        val raw = fileName?.trim().orEmpty().ifEmpty { "download.bin" }
        // Strip path separators and characters Android FS rejects. Mirrors
        // flattenPathForDownload() in src/lib/utils/download.js.
        return raw.replace('/', '_').replace('\\', '_').replace(Regex("[<>:\"|?*]"), "_").take(200)
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private fun showToast(message: String) {
        mainHandler.post {
            runCatching { Toast.makeText(context, message, Toast.LENGTH_SHORT).show() }
        }
    }

    /**
     * Single entry point for sendMessage-shaped payloads. The JS polyfill calls this with the
     * JSON-encoded message and parses the JSON response.
     *
     * Supported types: bds-fetch-url -> { ok, status, html } bds-fetch-github-zip -> { ok, base64,
     * status?, authRejected? } bds-fetch-github-commits -> { ok, commits, status?,
     * authRejected?, rateLimited? } bds-get-youtube-transcript -> { ok: false, error: "..." }
     *
     * Unknown types return { ok: false, error: "..." } so the JS side never sees an exception cross
     * the bridge.
     */
    @JavascriptInterface
    fun fetch(payloadJson: String?): String {
        val response = JSONObject()
        try {
            val payload = JSONObject(payloadJson ?: "{}")
            when (val type = payload.optString("type")) {
                "bds-fetch-url" -> handleFetchUrl(payload, response)
                "bds-fetch-github-zip" -> handleFetchGithubZip(payload, response)
                "bds-fetch-github-commits" -> handleFetchGithubCommits(payload, response)
                "bds-get-youtube-transcript" -> {
                    response.put("ok", false)
                    response.put(
                            "error",
                            "YouTube transcript fetching is not yet implemented on Android."
                    )
                }
                else -> {
                    response.put("ok", false)
                    response.put("error", "Unsupported bridge message type: $type")
                }
            }
        } catch (t: Throwable) {
            response.put("ok", false)
            response.put("error", "Bridge error: ${t.message ?: t.javaClass.simpleName}")
        }
        return response.toString()
    }

    private fun handleFetchUrl(payload: JSONObject, response: JSONObject) {
        val rawUrl = payload.optString("url")
        if (rawUrl.isEmpty()) {
            response.put("ok", false)
            response.put("error", "No URL provided.")
            return
        }

        val url = normalizeHttpUrl(rawUrl)
        if (url == null) {
            response.put("ok", false)
            response.put("error", "Expected an http or https URL.")
            return
        }

        val options = payload.optJSONObject("options")
        val method = options?.optString("method")?.uppercase()?.ifEmpty { "GET" } ?: "GET"
        val headersJson = options?.optJSONObject("headers")
        val body = options?.optString("body")?.takeIf { it.isNotEmpty() }

        val builder = Request.Builder().url(url)
        if (headersJson != null) {
            val keys = headersJson.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                builder.header(k, headersJson.optString(k))
            }
        }
        when (method) {
            "GET" -> builder.get()
            "HEAD" -> builder.head()
            "DELETE" ->
                    builder.delete(
                            body?.toRequestBody("application/octet-stream".toMediaTypeOrNull())
                    )
            else -> {
                val mediaType =
                        headersJson
                                ?.optString("Content-Type")
                                ?.takeIf { it.isNotEmpty() }
                                ?.toMediaTypeOrNull()
                                ?: "application/json".toMediaTypeOrNull()
                builder.method(method, (body ?: "").toRequestBody(mediaType))
            }
        }

        httpClient.newCall(builder.build()).execute().use { resp ->
            response.put("status", resp.code)
            if (!resp.isSuccessful) {
                response.put("ok", false)
                response.put("error", "Server returned ${resp.code} for $url")
                return
            }
            response.put("ok", true)
            val bytes = resp.body?.bytes()
            if (bytes != null) {
                val charset = detectCharsetFromHeaders(resp) ?: detectCharsetFromHtml(bytes)
                val html = try {
                    String(bytes, Charset.forName(charset ?: "UTF-8"))
                } catch (_: Exception) {
                    String(bytes, Charset.forName("UTF-8"))
                }
                response.put("html", html)
            } else {
                response.put("html", "")
            }
        }
    }

    private fun normalizeHttpUrl(rawUrl: String): String? {
        val input = rawUrl.trim()
        if (input.isEmpty()) return null

        val markdownUrl =
                Regex("""\[[^\]]*]\(\s*(https?://[^\)\s]+)""", RegexOption.IGNORE_CASE)
                        .find(input)
                        ?.groupValues
                        ?.getOrNull(1)
        val inlineUrl =
                Regex("""https?://[^\s<>"'\)\]]+""", RegexOption.IGNORE_CASE)
                        .find(input)
                        ?.value
        val candidate =
                (markdownUrl ?: inlineUrl ?: input)
                        .trim()
                        .trim('`', '"', '\'')
                        .removeSurrounding("<", ">")
                        .replace("&amp;", "&")
                        .replace(Regex("[.,;:]+$"), "")

        return candidate.toHttpUrlOrNull()?.toString()
    }

    private fun detectCharsetFromHeaders(resp: okhttp3.Response): String? {
        val contentType = resp.header("Content-Type") ?: return null
        val regex = Regex("""charset\s*=\s*([^\s;]+)""", RegexOption.IGNORE_CASE)
        return regex.find(contentType)
            ?.groupValues
            ?.get(1)
            ?.trim()
            ?.removeSurrounding("\"")
            ?.removeSurrounding("'")
    }

    private fun detectCharsetFromHtml(bytes: ByteArray): String? {
        val scanSize = minOf(bytes.size, 10240)
        val scanBytes = bytes.copyOfRange(0, scanSize)
        val scanView = scanBytes.toString(Charset.forName("ISO-8859-1"))

        val metaCharset = Regex(
            """<meta[\s>][^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)\s*["']?[^>]*\/?>""",
            RegexOption.IGNORE_CASE
        ).find(scanView)
        if (metaCharset != null) return metaCharset.groupValues[1]

        val httpEquiv = Regex(
            """<meta\s+http-equiv\s*=\s*["']?\s*Content-Type\s*["']?\s*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9_-]+)""",
            RegexOption.IGNORE_CASE
        ).find(scanView)
        if (httpEquiv != null) return httpEquiv.groupValues[1]

        return null
    }

    private fun handleFetchGithubZip(payload: JSONObject, response: JSONObject) {
        val url = payload.optString("url")
        if (url.isEmpty()) {
            response.put("ok", false)
            response.put("error", "No URL provided.")
            return
        }
        val token = payload.optString("token").trim()
        val canSendToken = token.isNotEmpty() && isCodeloadHost(url)

        if (canSendToken) {
            val authResponse =
                    runCatching {
                                httpClient
                                        .newCall(
                                                Request.Builder()
                                                        .url(url)
                                                        .header("Authorization", "token $token")
                                                        .build()
                                        )
                                        .execute()
                            }
                            .getOrNull()

            if (authResponse != null) {
                authResponse.use { resp ->
                    if (resp.isSuccessful) {
                        encodeZipToResponse(resp, url, response)
                        return
                    }
                    if (resp.code == 401 || resp.code == 403) {
                        response.put("ok", false)
                        response.put("status", resp.code)
                        response.put("authRejected", true)
                        response.put("error", "GitHub rejected the supplied token for $url")
                        return
                    }
                }
            }
        }

        httpClient.newCall(Request.Builder().url(url).build()).execute().use { resp ->
            if (!resp.isSuccessful) {
                response.put("ok", false)
                response.put("status", resp.code)
                response.put("error", "GitHub returned ${resp.code} for $url")
                return
            }
            encodeZipToResponse(resp, url, response)
        }
    }

    private fun handleFetchGithubCommits(payload: JSONObject, response: JSONObject) {
        val owner = payload.optString("owner").trim()
        val repo = payload.optString("repo").trim()
        val branch = payload.optString("branch").trim().ifEmpty { "main" }
        val token = payload.optString("token").trim()
        val count = normalizeGithubCommitCount(payload.opt("count"))

        if (owner.isEmpty() || repo.isEmpty()) {
            response.put("ok", false)
            response.put("error", "Missing GitHub repository.")
            return
        }

        val commits = JSONArray()
        var page = 1

        // GitHub's commits API only returns up to 100 items per page, so
        // larger UI counts must be assembled across multiple requests.
        while (commits.length() < count) {
            val remaining = count - commits.length()
            val perPage = minOf(GITHUB_COMMITS_PAGE_SIZE, remaining)
            var fetchedThisPage: Int
            val requestBuilder =
                    Request.Builder()
                            .url(buildGithubCommitsUrl(owner, repo, branch, perPage, page))
                            .header("Accept", "application/vnd.github+json")

            if (token.isNotEmpty()) {
                requestBuilder.header("Authorization", "token $token")
            }

            httpClient.newCall(requestBuilder.build()).execute().use { resp ->
                val bodyText = resp.body?.string() ?: ""

                if (!resp.isSuccessful) {
                    if (isGithubRateLimitResponse(resp.code, resp.header("X-RateLimit-Remaining"), bodyText)) {
                        putGithubError(
                                response,
                                "GitHub API rate limit hit. Add a token for more requests.",
                                resp.code,
                                rateLimited = true,
                        )
                        return
                    }

                    if (token.isNotEmpty() && (resp.code == 401 || resp.code == 403)) {
                        putGithubError(
                                response,
                                "GitHub rejected the supplied token for $owner/$repo",
                                resp.code,
                                authRejected = true,
                        )
                        return
                    }

                    if (resp.code == 404) {
                        putGithubError(
                                response,
                                "Repository not found or you may need a GitHub token for private repos. Add one in Advanced Settings.",
                                resp.code,
                        )
                        return
                    }

                    putGithubError(
                            response,
                            "GitHub returned ${resp.code} ${resp.message}".trim(),
                            resp.code,
                    )
                    return
                }

                val pageCommits =
                        try {
                            JSONArray(bodyText)
                        } catch (t: Throwable) {
                            response.put("ok", false)
                            response.put("error", "Unexpected GitHub commits response.")
                            return
                        }

                for (i in 0 until pageCommits.length()) {
                    if (commits.length() >= count) break
                    commits.put(normalizeGithubCommit(pageCommits.getJSONObject(i)))
                }
                fetchedThisPage = pageCommits.length()
            }

            if (fetchedThisPage < perPage) break
            page += 1
        }

        response.put("ok", true)
        response.put("commits", commits)
    }

    private fun encodeZipToResponse(resp: okhttp3.Response, url: String, response: JSONObject) {
        val bytes = resp.body?.bytes() ?: ByteArray(0)
        if (bytes.size < 100) {
            response.put("ok", false)
            response.put("error", "Received empty or invalid ZIP from $url")
            return
        }
        response.put("ok", true)
        response.put("status", resp.code)
        response.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    private fun isCodeloadHost(url: String): Boolean =
            try {
                java.net.URI(url).host == "codeload.github.com"
            } catch (t: Throwable) {
                false
            }

    private fun normalizeGithubCommitCount(rawCount: Any?): Int {
        val parsed =
                when (rawCount) {
                    is Number -> rawCount.toInt()
                    is String -> rawCount.toIntOrNull()
                    else -> null
                } ?: DEFAULT_GITHUB_COMMIT_COUNT
        return maxOf(1, parsed)
    }

    private fun buildGithubCommitsUrl(
            owner: String,
            repo: String,
            branch: String,
            perPage: Int,
            page: Int,
    ): String {
        val encodedBranch = Uri.encode(branch)
        return "$githubApiBaseUrl/repos/$owner/$repo/commits?sha=$encodedBranch&per_page=$perPage&page=$page"
    }

    private fun isGithubRateLimitResponse(
            statusCode: Int,
            remainingHeader: String?,
            bodyText: String,
    ): Boolean {
        val remaining = remainingHeader?.toIntOrNull()
        return (statusCode == 403 || statusCode == 429) &&
                (remaining == 0 || bodyText.contains("API rate limit exceeded", ignoreCase = true))
    }

    private fun normalizeGithubCommit(commit: JSONObject): JSONObject {
        val commitData = commit.optJSONObject("commit") ?: JSONObject()
        val authorData =
                commitData.optJSONObject("author")
                        ?: commitData.optJSONObject("committer")
                        ?: JSONObject()
        val sha = commit.optString("sha").trim()
        val author = authorData.optString("name").trim().ifEmpty { "Unknown author" }
        val date = authorData.optString("date").trim().ifEmpty { "unknown date" }
        val message = commitData.optString("message").trim().ifEmpty { "(no message)" }

        return JSONObject().apply {
            put("sha", if (sha.isNotEmpty()) sha.take(7) else "unknown")
            put("author", author)
            put("date", date)
            put("message", message)
        }
    }

    private fun putGithubError(
            response: JSONObject,
            message: String,
            status: Int? = null,
            authRejected: Boolean = false,
            rateLimited: Boolean = false,
    ) {
        response.put("ok", false)
        response.put("error", message)
        if (status != null) {
            response.put("status", status)
        }
        if (authRejected) {
            response.put("authRejected", true)
        }
        if (rateLimited) {
            response.put("rateLimited", true)
        }
    }

    companion object {
        private const val TAG = "BdsWebViewBridge"
        private const val PREFS_NAME = "bds_storage"
        private const val DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com"
        private const val DEFAULT_GITHUB_COMMIT_COUNT = 100
        private const val GITHUB_COMMITS_PAGE_SIZE = 100
        // Must match STORAGE_KEYS.pageIsDark in src/lib/constants.js — the Android chrome.storage
        // polyfill routes chrome.storage.local.set({ bds_page_is_dark: ... }) through setStorage,
        // so getLastKnownIsDark() and the polyfill share the same SharedPreferences key.
        internal const val KEY_LAST_PAGE_DARK = "bds_page_is_dark"

        /** Max bytes per native-picked text file. */
        internal const val MAX_PICKED_FILE_SIZE = 2L * 1024 * 1024

        /** Max bytes per native-picked image file. */
        internal const val MAX_PICKED_IMAGE_SIZE = 8L * 1024 * 1024

        internal const val MAX_FOLDER_IMAGES = 10

        internal const val MAX_PICK_CHUNK_CHARS = 200_000

        private const val MAX_FOLDER_DEPTH = 15

        internal val TEXT_EXTENSIONS =
                setOf(
                        "js", "ts", "jsx", "tsx", "svelte", "vue", "html", "css", "scss",
                        "json", "md", "txt", "py", "c", "cpp", "h", "hpp", "java", "go",
                        "rs", "rb", "php", "sh", "yml", "yaml", "toml", "ini", "csv", "sql",
                        "xml", "env", "cs", "csproj", "sln", "fs", "fsproj", "razor",
                        "swift", "kt", "dart"
                )

        internal val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "webp", "gif", "bmp")

        internal val IMAGE_MIME_TYPES =
                mapOf(
                        "png" to "image/png",
                        "jpg" to "image/jpeg",
                        "jpeg" to "image/jpeg",
                        "webp" to "image/webp",
                        "gif" to "image/gif",
                        "bmp" to "image/bmp",
                )

        private val SKIP_DIRS =
                setOf(
                        "node_modules", ".git", ".github", ".svn", "dist", "build",
                        "__pycache__", ".gradle", ".idea", ".vscode", ".vs", "vendor",
                        ".next", ".cache", "bin", "obj", "out", "target", "dist-chrome",
                        "dist-firefox"
                )
    }
}
