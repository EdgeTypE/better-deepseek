package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Single-activity host. Loads chat.deepseek.com inside a full-screen WebView and injects the BDS
 * extension scripts on every page finish.
 *
 * Google OAuth is proxied through OkHttp via [shouldInterceptRequest] so the code_verifier /
 * code_challenge pair generated in the WebView's JavaScript context is preserved. Cookies flow
 * bidirectionally: the WebView's [CookieManager] cookies are forwarded on proxy requests, and
 * `Set-Cookie` response headers are fed back into the WebView's cookie store.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var bridge: WebViewBridge
    private lateinit var cookieManager: CookieManager

    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher: ActivityResultLauncher<Array<String>> =
            registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
                val callback = pendingFileChooser
                pendingFileChooser = null
                callback?.onReceiveValue(uris.toTypedArray())
            }

    private val proxyClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .callTimeout(120, TimeUnit.SECONDS)
                .followRedirects(false)
                .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        bridge = WebViewBridge(applicationContext)
        cookieManager = CookieManager.getInstance()

        assetLoader =
                WebViewAssetLoader.Builder()
                        .setDomain(getString(R.string.bds_asset_authority))
                        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
                        .build()

        webView =
                WebView(this).apply {
                    layoutParams =
                            ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT
                            )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        mediaPlaybackRequiresUserGesture = false
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        cacheMode = WebSettings.LOAD_DEFAULT
                        userAgentString = String.format(SPOOFED_UA, BuildConfig.VERSION_NAME)
                    }
                    addJavascriptInterface(bridge, BRIDGE_NAME)
                    webViewClient = bdsWebViewClient()
                    webChromeClient = bdsWebChromeClient()
                    isVerticalScrollBarEnabled = true
                    setBackgroundColor(0x00000000)
                }

        setContentView(webView)
        webView.loadUrl(getString(R.string.bds_target_url))

        onBackPressedDispatcher.addCallback(
                this,
                object : OnBackPressedCallback(true) {
                    override fun handleOnBackPressed() {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            moveTaskToBack(true)
                        }
                    }
                }
        )
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface(BRIDGE_NAME)
        super.onDestroy()
    }

    /**
     * Routes VIEW intents (e.g. deep links to chat.deepseek.com) into the existing WebView session
     * instead of spawning a new Activity instance.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val data = intent.data ?: return
        val url = data.toString()
        if (url.startsWith("https://chat.deepseek.com")) {
            webView.loadUrl(url)
        }
    }

    private fun bdsWebViewClient() =
            object : WebViewClient() {

                /**
                 * Intercept Google OAuth requests and proxy them through OkHttp. This keeps the
                 * entire OAuth flow inside the WebView's cookie jar so the code_verifier /
                 * code_challenge generated in JavaScript is preserved. All other requests fall
                 * through to the asset loader or native WebView loading.
                 */
                override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                ): WebResourceResponse? {
                    assetLoader.shouldInterceptRequest(request.url)?.let {
                        return it
                    }

                    if (isGoogleOAuthUrl(request.url)) {
                        return proxyGoogleOAuthRequest(request)
                    }

                    return null
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    if (url.isNullOrEmpty()) return
                    if (url.startsWith("https://chat.deepseek.com")) {
                        injectBdsScripts(view)
                    }
                }
            }

    private fun bdsWebChromeClient() =
            object : WebChromeClient() {
                override fun onShowFileChooser(
                        webView: WebView?,
                        filePathCallback: ValueCallback<Array<Uri>>?,
                        fileChooserParams: FileChooserParams?
                ): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    pendingFileChooser = filePathCallback
                    val mimeTypes =
                            fileChooserParams
                                    ?.acceptTypes
                                    ?.filter { it.isNotBlank() }
                                    ?.toTypedArray()
                                    ?.takeIf { it.isNotEmpty() }
                                    ?: arrayOf("*/*")
                    return try {
                        fileChooserLauncher.launch(mimeTypes)
                        true
                    } catch (t: Throwable) {
                        pendingFileChooser = null
                        false
                    }
                }

                /**
                 * Supply a stub WebView when JS calls window.open() so the caller never receives
                 * null. Google OAuth navigations are intercepted by [shouldInterceptRequest] and do
                 * not need a popup.
                 */
                override fun onCreateWindow(
                        view: WebView?,
                        isDialog: Boolean,
                        isUserGesture: Boolean,
                        resultMsg: android.os.Message?
                ): Boolean {
                    val transport = resultMsg?.obj as? WebView.WebViewTransport
                    val stub = WebView(this@MainActivity)
                    transport?.webView = stub
                    resultMsg?.sendToTarget()
                    return true
                }
            }

    // ── OAuth proxy ──────────────────────────────────────────────────────

    /** Domains that must be proxied so the OAuth code_verifier state survives. */
    private fun isGoogleOAuthUrl(url: Uri): Boolean {
        val host = url.host?.lowercase() ?: return false
        return host == "accounts.google.com" ||
                host.endsWith(".accounts.google.com") ||
                host == "accounts.youtube.com"
    }

    /**
     * Forward the WebView request through OkHttp and return a [WebResourceResponse] the WebView can
     * consume.
     *
     * - Strips `X-Requested-With` so Google doesn't reject the embedded UA.
     * - Forwards the WebView's cookies into the proxy request.
     * - Feeds `Set-Cookie` response headers back into the WebView's cookie manager so subsequent
     * requests carry the correct session.
     * - On failure, returns `null` so the WebView falls back to native loading (the user may see a
     * "disallowed_useragent" page, but will not be stuck with an indefinite spinner).
     */
    private fun proxyGoogleOAuthRequest(request: WebResourceRequest): WebResourceResponse? {
        return try {
            val url = request.url.toString()
            val method = request.method
            val requestHeaders = request.requestHeaders

            val builder = Request.Builder().url(url)

            // Mirror safe headers, strip X-Requested-With
            for ((name, value) in requestHeaders) {
                if (name.equals("X-Requested-With", ignoreCase = true)) continue
                if (name.equals("Host", ignoreCase = true)) continue
                if (name.equals("Connection", ignoreCase = true)) continue
                if (name.equals("Accept-Encoding", ignoreCase = true)) continue
                if (name.equals("Content-Length", ignoreCase = true)) continue
                builder.header(name, value)
            }

            // Forward WebView cookies so the proxy request carries the
            // same session state (including any prior OAuth cookies).
            val cookies = cookieManager.getCookie(url)
            if (!cookies.isNullOrEmpty()) {
                builder.header("Cookie", cookies)
            }

            // WebResourceRequest does not expose the request body, so POST/PUT
            // cannot be proxied. Fall through to native WebView loading — the
            // spoofed UA alone is usually sufficient for form-submission POSTs
            // to succeed. The critical GET-based OAuth authorization requests
            // are fully proxied with X-Requested-With stripped.
            if (!method.equals("GET", ignoreCase = true) &&
                            !method.equals("HEAD", ignoreCase = true)
            ) {
                return null
            }

            val proxyResponse = proxyClient.newCall(builder.build()).execute()
            proxyResponse.use { resp ->
                // Feed Set-Cookie back into the WebView
                val setCookieHeaders = resp.headers("Set-Cookie")
                for (cookie in setCookieHeaders) {
                    cookieManager.setCookie(url, cookie)
                }
                cookieManager.flush()

                val responseBody = resp.body?.bytes() ?: ByteArray(0)
                val responseHeaders = mutableMapOf<String, String>()

                for ((name, value) in resp.headers) {
                    if (name.equals("Set-Cookie", ignoreCase = true)) continue
                    if (name.equals("Content-Encoding", ignoreCase = true)) continue
                    if (name.equals("Transfer-Encoding", ignoreCase = true)) continue
                    if (name.equals("Content-Length", ignoreCase = true)) continue
                    responseHeaders[name] = value
                }

                val fullContentType = resp.header("Content-Type") ?: "text/html"
                val mimeType = fullContentType.split(";").firstOrNull()?.trim() ?: "text/html"
                val encoding =
                        if (mimeType.startsWith("text/") ||
                                        mimeType == "application/json" ||
                                        mimeType == "application/javascript"
                        )
                                "UTF-8"
                        else null

                WebResourceResponse(
                        mimeType,
                        encoding,
                        resp.code,
                        resp.message,
                        responseHeaders,
                        ByteArrayInputStream(responseBody)
                )
            }
        } catch (t: Throwable) {
            Log.e(TAG, "OAuth proxy failed for ${request.url}", t)
            null
        }
    }

    // ── BDS script injection ─────────────────────────────────────────────

    /**
     * Read the BDS bundle (content.css/js, injected.js) from assets/bds and inject them into the
     * page after every navigation. Order matters:
     * 1. injected.js (MAIN-world equivalent — patches fetch/XHR)
     * 2. content.css (UI styles)
     * 3. content.js (mounts Svelte UI, scans DOM)
     */
    private fun injectBdsScripts(view: WebView) {
        val injected = readAsset("bds/injected.js") ?: return
        val css = readAsset("bds/content.css") ?: ""
        val content = readAsset("bds/content.js") ?: return

        val cssLiteral = jsStringLiteral(css)
        val bootstrap =
                """
            (function () {
                if (window.__bdsAndroidBootstrapped) return;
                window.__bdsAndroidBootstrapped = true;
                try {
                    var style = document.createElement('style');
                    style.textContent = $cssLiteral;
                    document.head.appendChild(style);
                } catch (e) { console.error('[BDS] css inject failed', e); }
            })();
        """.trimIndent()

        // Hides the "Get App" promotional button shown on mobile viewports.
        // Detection is text-based so it survives DeepSeek's dynamic class renames.
        // A MutationObserver retries if the element is not yet present at injection time.
        val hideGetApp =
                """
            (function () {
                if (window.__bdsGetAppHidden) return;
                function attempt() {
                    var spans = document.querySelectorAll('span');
                    for (var i = 0; i < spans.length; i++) {
                        var span = spans[i];
                        if (span.textContent.trim() !== 'Get App') continue;
                        var el = span.parentElement;
                        while (el && el.tagName !== 'BUTTON') { el = el.parentElement; }
                        if (el && el.parentElement) {
                            el.parentElement.style.display = 'none';
                            window.__bdsGetAppHidden = true;
                            console.log('[BDS] Hidden Get App container');
                            return true;
                        }
                    }
                    return false;
                }
                if (attempt()) return;
                var timeout;
                var observer = new MutationObserver(function () {
                    if (attempt()) { observer.disconnect(); clearTimeout(timeout); }
                });
                observer.observe(document.body, { subtree: true, childList: true });
                timeout = setTimeout(function () { observer.disconnect(); }, 10000);
            })();
        """.trimIndent()

        view.evaluateJavascript(injected, null)
        view.evaluateJavascript(bootstrap, null)
        view.evaluateJavascript(content, null)
        view.evaluateJavascript(hideGetApp, null)
    }

    private fun readAsset(path: String): String? =
            try {
                assets.open(path).use { it.bufferedReader().readText() }
            } catch (t: Throwable) {
                null
            }

    /**
     * Wrap a JS source string as a single-quoted JS literal, escaping backslashes, quotes, and
     * newlines.
     */
    private fun jsStringLiteral(source: String): String {
        val builder = StringBuilder(source.length + 2)
        builder.append('"')
        for (c in source) {
            when (c) {
                '\\' -> builder.append("\\\\")
                '"' -> builder.append("\\\"")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                '\u2028' -> builder.append("\\u2028")
                '\u2029' -> builder.append("\\u2029")
                else ->
                        if (c.code < 0x20) {
                            builder.append("\\u%04x".format(c.code))
                        } else {
                            builder.append(c)
                        }
            }
        }
        builder.append('"')
        return builder.toString()
    }

    companion object {
        private const val BRIDGE_NAME = "AndroidBridge"
        private const val TAG = "BdsMainActivity"

        /**
         * Fully synthetic Chrome-mobile UA string. Servers that block embedded WebViews (notably
         * Google OAuth) check for the legacy "; wv)" marker AND for the `Version/4.0` part that
         * Android WebView adds even when the stock UA is customised. We replace the entire string.
         */
        private const val SPOOFED_UA =
                "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/132.0.6834.122 Mobile Safari/537.36 " +
                        "BetterDeepSeekAndroid/%s"
    }
}
