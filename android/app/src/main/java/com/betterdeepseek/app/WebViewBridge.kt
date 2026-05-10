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
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** File entry returned by the native file/folder picker to JavaScript. */
internal data class PickedFile(val name: String, val content: String)

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
     * Set by MainActivity to forward a JS script to the WebView's JS context. Must be called on
     * the main thread; [deliverPickResult] already posts to [mainHandler] before invoking this.
     */
    @Volatile var evaluateJs: ((script: String) -> Unit)? = null

    /**
     * Set by MainActivity to launch the native file or folder picker. Invoked on the
     * @JavascriptInterface thread; the implementation must marshal to the UI thread before
     * calling an ActivityResultLauncher.
     */
    @Volatile var onPickFiles: ((mode: String, requestId: String) -> Unit)? = null

    /**
     * Returns the last DeepSeek page theme written by the extension's theme.js via
     * chrome.storage.local (which the Android polyfill routes through [setStorage] as
     * JSON.stringify(boolean) -> stored as the string "true" or "false"). Falls back to [default]
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

    /**
     * Called by JS (android-file-picker.js) to open the native multi-file or folder picker.
     *
     * [mode] is "files" or "folder". [requestId] is a UUID from the JS side used as a
     * correlation key — the Kotlin side fires `__bds_native_files_picked_<requestId>` via
     * [evaluateJs] when the Activity result arrives.
     *
     * If [onPickFiles] is null (old APK version), the method immediately delivers a "cancelled"
     * result so the JS Promise resolves without hanging.
     */
    @JavascriptInterface
    fun pickFiles(mode: String?, requestId: String?) {
        val safeId = requestId
            ?.filter { it.isLetterOrDigit() || it == '-' }
            ?.take(64)
        if (safeId.isNullOrEmpty()) return

        val safeMode = if (mode == "folder") "folder" else "files"
        val handler = onPickFiles
        if (handler == null) {
            deliverPickError(safeId, "cancelled")
            return
        }
        handler.invoke(safeMode, safeId)
    }

    /**
     * Called by MainActivity after the ActivityResult delivers files. Serialises [files] to JSON
     * and dispatches a `__bds_native_files_picked_<requestId>` CustomEvent in the page.
     */
    internal fun deliverPickedFiles(requestId: String, files: List<PickedFile>, folderName: String?) {
        val filesArr = JSONArray()
        for (f in files) {
            filesArr.put(JSONObject().apply {
                put("name", f.name)
                put("content", f.content)
            })
        }
        val payload = JSONObject().apply {
            put("files", filesArr)
            if (folderName != null) put("folderName", folderName)
        }
        deliverPickResult(requestId, payload)
    }

    /** Deliver an error result (e.g. "cancelled") to the waiting JS Promise. */
    internal fun deliverPickError(requestId: String, error: String) {
        val payload = JSONObject().apply {
            put("error", error)
            put("files", JSONArray())
        }
        deliverPickResult(requestId, payload)
    }

    private fun deliverPickResult(requestId: String, payload: JSONObject) {
        val safeId = requestId.filter { it.isLetterOrDigit() || it == '-' }.take(64)
        if (safeId.isEmpty()) return
        // JSONObject.quote wraps in double-quotes and escapes special chars — safe as JS string literal
        val jsLiteral = JSONObject.quote(payload.toString())
        val js = "(function(){try{var d=JSON.parse($jsLiteral);" +
                "window.dispatchEvent(new CustomEvent('__bds_native_files_picked_$safeId'," +
                "{detail:d}));}catch(e){}})();"
        mainHandler.post { evaluateJs?.invoke(js) }
    }

    /**
     * Read a single content URI (returned by OpenMultipleDocuments) into a [PickedFile].
     * Returns null when the URI is not a readable text file or exceeds [MAX_FILE_SIZE].
     */
    internal fun readPickedContentUri(uri: Uri): PickedFile? {
        return try {
            val name = getDisplayName(uri) ?: return null
            if (!isTextFileExtension(name)) return null
            if (getContentLength(uri) > MAX_FILE_SIZE) return null
            val content = context.contentResolver.openInputStream(uri)?.use { stream ->
                stream.bufferedReader(Charsets.UTF_8).readText()
            } ?: return null
            if (content.any { it.code == 0 }) return null // null bytes indicate binary
            PickedFile(name, content)
        } catch (t: Throwable) {
            Log.w(TAG, "readPickedContentUri failed for $uri", t)
            null
        }
    }

    /**
     * Recursively read all text files under a document tree URI (returned by OpenDocumentTree).
     * Returns a pair of (files, folderName). Respects [MAX_FILE_SIZE], [MAX_FOLDER_DEPTH], and
     * [SKIP_DIRS], mirroring the JS folder-reader.js behaviour.
     */
    internal fun readPickedFolderTree(treeUri: Uri): Pair<List<PickedFile>, String> {
        val docTree = DocumentFile.fromTreeUri(context, treeUri)
            ?: return Pair(emptyList(), "folder")
        val folderName = docTree.name ?: "folder"
        val files = mutableListOf<PickedFile>()
        traverseDocumentTree(docTree, "", files, 0)
        return Pair(files, folderName)
    }

    private fun traverseDocumentTree(
        dir: DocumentFile,
        pathPrefix: String,
        out: MutableList<PickedFile>,
        depth: Int,
    ) {
        if (depth > MAX_FOLDER_DEPTH) return
        for (child in dir.listFiles()) {
            val name = child.name ?: continue
            val relPath = if (pathPrefix.isEmpty()) name else "$pathPrefix/$name"
            if (isSkippedPath(relPath)) continue
            if (child.isDirectory) {
                traverseDocumentTree(child, relPath, out, depth + 1)
            } else if (child.isFile) {
                val picked = readDocumentFile(child, relPath) ?: continue
                out.add(picked)
            }
        }
    }

    private fun readDocumentFile(file: DocumentFile, relPath: String): PickedFile? {
        if (!isTextFileExtension(file.name ?: return null)) return null
        if (file.length() > MAX_FILE_SIZE) return null
        return try {
            val content = context.contentResolver.openInputStream(file.uri)?.use { stream ->
                stream.bufferedReader(Charsets.UTF_8).readText()
            } ?: return null
            if (content.any { it.code == 0 }) return null // null bytes indicate binary
            PickedFile(relPath, content)
        } catch (t: Throwable) {
            Log.w(TAG, "readDocumentFile failed for $relPath", t)
            null
        }
    }

    private fun getDisplayName(uri: Uri): String? =
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (!cursor.moveToFirst() || idx < 0) null else cursor.getString(idx)
        }

    private fun getContentLength(uri: Uri): Long =
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (!cursor.moveToFirst() || idx < 0 || cursor.isNull(idx)) Long.MAX_VALUE
            else cursor.getLong(idx)
        } ?: Long.MAX_VALUE

    private fun isTextFileExtension(filename: String): Boolean {
        val ext = filename.substringAfterLast('.', "").lowercase()
        return ext.isNotEmpty() && ext in TEXT_EXTENSIONS
    }

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
     * Supported types: bds-fetch-url -> { ok, html } bds-fetch-github-zip -> { ok, base64,
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
        val url = payload.optString("url")
        if (url.isEmpty()) {
            response.put("ok", false)
            response.put("error", "No URL provided.")
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
            response.put("html", resp.body?.string() ?: "")
        }
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

        /** Max bytes per file — mirrors the 2 MB cap in folder-reader.js. */
        internal const val MAX_FILE_SIZE = 2L * 1024 * 1024

        /** Max directory nesting depth during folder traversal. */
        private const val MAX_FOLDER_DEPTH = 15

        /** Text-file extensions considered readable — mirrors isTextFile() in folder-reader.js. */
        private val TEXT_EXTENSIONS = setOf(
            "js", "ts", "jsx", "tsx", "svelte", "vue", "html", "css", "scss", "json",
            "md", "txt", "py", "c", "cpp", "h", "hpp", "java", "go", "rs", "rb", "php",
            "sh", "yml", "yaml", "toml", "ini", "csv", "sql", "xml", "env",
            "cs", "csproj", "sln", "fs", "fsproj", "razor", "swift", "kt", "dart",
        )

        /** Directory names skipped during folder traversal to avoid large generated trees. */
        private val SKIP_DIRS = setOf(
            "node_modules", ".git", ".svn", "dist", "build", "__pycache__",
            ".gradle", ".idea", "vendor", ".next", ".cache",
        )
    }
}
