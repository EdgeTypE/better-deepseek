package com.betterdeepseek.app

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * @JavascriptInterface object exposed to the WebView as `window.AndroidBridge`.
 *
 * Methods here back the chrome.* polyfill in src/platform/android-chrome-polyfill.js.
 * All methods MUST be safe to call from arbitrary JS — they validate inputs and
 * return JSON strings (or null) rather than throwing.
 *
 * Phase 1 implements:
 *   - SharedPreferences-backed key/value storage
 *   - Generic HTTP GET/POST via OkHttp routed by message.type
 *   - Asset URL resolution against the WebViewAssetLoader authority
 *   - Blob download stub (Phase 2 will implement the actual file write)
 */
class WebViewBridge(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .build()

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
     * Phase 1 stub. Phase 2 wires this to MediaStore / DownloadManager so
     * create_file / LONG_WORK ZIPs land in the user's Downloads folder.
     */
    @JavascriptInterface
    fun downloadBlob(base64: String?, mimeType: String?, fileName: String?) {
        Log.w(
            TAG,
            "downloadBlob called (phase 1 stub): name=$fileName mime=$mimeType " +
                "size=${base64?.length ?: 0}"
        )
    }

    /**
     * Single entry point for sendMessage-shaped payloads. The JS polyfill calls
     * this with the JSON-encoded message and parses the JSON response.
     *
     * Supported types (Phase 1):
     *   bds-fetch-url           -> { ok, html }
     *   bds-fetch-github-zip    -> { ok, base64, status?, authRejected? }
     *   bds-get-youtube-transcript -> { ok: false, error: "..." }  (Phase 2)
     *
     * Unknown types return { ok: false, error: "..." } so the JS side never
     * sees an exception cross the bridge.
     */
    @JavascriptInterface
    fun fetch(payloadJson: String?): String {
        val response = JSONObject()
        try {
            val payload = JSONObject(payloadJson ?: "{}")
            when (val type = payload.optString("type")) {
                "bds-fetch-url" -> handleFetchUrl(payload, response)
                "bds-fetch-github-zip" -> handleFetchGithubZip(payload, response)
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
            "DELETE" -> builder.delete(
                body?.toRequestBody("application/octet-stream".toMediaTypeOrNull())
            )
            else -> {
                val mediaType = headersJson?.optString("Content-Type")
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
            val authResponse = runCatching {
                httpClient.newCall(
                    Request.Builder()
                        .url(url)
                        .header("Authorization", "token $token")
                        .build()
                ).execute()
            }.getOrNull()

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

    private fun encodeZipToResponse(
        resp: okhttp3.Response,
        url: String,
        response: JSONObject
    ) {
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

    private fun isCodeloadHost(url: String): Boolean = try {
        java.net.URI(url).host == "codeload.github.com"
    } catch (t: Throwable) {
        false
    }

    companion object {
        private const val TAG = "BdsWebViewBridge"
        private const val PREFS_NAME = "bds_storage"
    }
}
