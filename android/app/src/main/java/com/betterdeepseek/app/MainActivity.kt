package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.MimeTypeMap
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

internal fun applyRootWindowInsets(view: View, windowInsets: WindowInsetsCompat): WindowInsetsCompat {
    val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
    val imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
    val bottomInset = maxOf(systemBars.bottom, imeInsets.bottom)

    // Resize the WebView host from the bottom so the top of the viewport stays anchored like a
    // normal adjustResize layout, while still preserving the persistent system-bar insets.
    view.setPadding(systemBars.left, systemBars.top, systemBars.right, bottomInset)
    view.translationY = 0f
    return WindowInsetsCompat.CONSUMED
}

internal fun shouldOpenExternally(url: Uri, assetHost: String = "bds-asset.local"): Boolean {
    val scheme = url.scheme?.lowercase() ?: return false
    if (scheme != "http" && scheme != "https") return false

    val host = url.host?.lowercase() ?: return false
    if (host == assetHost.lowercase()) return false
    if (host == "deepseek.com" || host.endsWith(".deepseek.com")) return false
    if (
            host == "accounts.google.com" ||
                    host.endsWith(".accounts.google.com") ||
                    host == "accounts.youtube.com"
    ) {
        return false
    }

    return true
}

internal fun buildFileChooserIntent(acceptTypes: Array<String>?, allowMultiple: Boolean): Intent {
    return Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        if (allowMultiple) {
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }

        val mimeTypes = mapAcceptTypes(acceptTypes)
        if (mimeTypes.isNotEmpty()) {
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        }
    }
}

internal fun parseFileChooserResult(resultCode: Int, data: Intent?): Array<Uri>? {
    if (resultCode != Activity.RESULT_OK) return null

    val uris = linkedSetOf<Uri>()
    val clipData = data?.clipData
    if (clipData != null) {
        for (i in 0 until clipData.itemCount) {
            clipData.getItemAt(i).uri?.let { uris.add(it) }
        }
    } else {
        data?.data?.let { uris.add(it) }
    }

    if (uris.isNotEmpty()) return uris.toTypedArray()
    return runCatching { WebChromeClient.FileChooserParams.parseResult(resultCode, data) }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
}

private fun mapAcceptTypes(acceptTypes: Array<String>?): List<String> {
    val tokens =
            acceptTypes
                    ?.flatMap { it.split(',') }
                    ?.map { it.trim() }
                    ?.filter { it.isNotEmpty() }
                    .orEmpty()
    if (tokens.isEmpty()) return emptyList()

    val mapped = linkedSetOf<String>()
    for (token in tokens) {
        val mimeType =
                when {
                    "/" in token -> token
                    token.startsWith(".") ->
                            MimeTypeMap.getSingleton()
                                    .getMimeTypeFromExtension(
                                            token.removePrefix(".").lowercase()
                                    )
                    else -> null
                }
        if (mimeType.isNullOrBlank()) return emptyList()
        mapped.add(mimeType)
    }
    return mapped.toList()
}

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
    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
            registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                val callback = pendingFileChooser
                pendingFileChooser = null
                // The WebView callback is not persistable across Activity recreation. If Android
                // returns here after a reload, there is no live callback to complete.
                callback?.onReceiveValue(parseFileChooserResult(result.resultCode, result.data))
            }

    @Volatile private var pendingPickFilesRequestId: String? = null

    private val multiFileLauncher: ActivityResultLauncher<Array<String>> =
            registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
                val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
                pendingPickFilesRequestId = null
                if (uris.isEmpty()) {
                    bridge.deliverPickError(requestId, "cancelled")
                    return@registerForActivityResult
                }
                bridge.deliverPickStatus(requestId, "reading")
                Thread {
                    try {
                        val files = mutableListOf<PickedFile>()
                        val skipped = mutableListOf<SkippedFile>()
                        for (uri in uris) {
                            when (val result = bridge.readPickedContentUri(uri)) {
                                is PickedItemResult.Ok -> files.add(result.file)
                                is PickedItemResult.Skipped ->
                                        skipped.add(SkippedFile(result.name, result.reason))
                            }
                        }
                        bridge.deliverPickedFiles(requestId, files, skipped, null)
                    } catch (t: Throwable) {
                        Log.e(TAG, "Native file pick read failed", t)
                        bridge.deliverPickError(requestId, "read-failed")
                    }
                }.start()
            }

    private val folderPickerLauncher: ActivityResultLauncher<Uri?> =
            registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { treeUri ->
                val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
                pendingPickFilesRequestId = null
                if (treeUri == null) {
                    bridge.deliverPickError(requestId, "cancelled")
                    return@registerForActivityResult
                }
                bridge.deliverPickStatus(requestId, "reading")
                Thread {
                    try {
                        val result = bridge.readPickedFolderTree(treeUri)
                        bridge.deliverPickedFiles(
                                requestId,
                                result.files,
                                result.skipped,
                                result.folderName,
                        )
                    } catch (t: Throwable) {
                        Log.e(TAG, "Native folder pick read failed", t)
                        bridge.deliverPickError(requestId, "read-failed")
                    }
                }.start()
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
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        bridge = WebViewBridge(applicationContext)
        cookieManager = CookieManager.getInstance()
        pendingPickFilesRequestId = savedInstanceState?.getString(STATE_PENDING_PICK_REQUEST_ID)

        bridge.onPickFiles = { mode, requestId ->
            runOnUiThread {
                try {
                    pendingPickFilesRequestId = requestId
                    when (mode) {
                        "folder" -> folderPickerLauncher.launch(null)
                        else -> multiFileLauncher.launch(arrayOf("*/*"))
                    }
                    bridge.deliverPickStatus(requestId, "opened")
                } catch (t: Throwable) {
                    Log.e(TAG, "Native file picker launch failed", t)
                    pendingPickFilesRequestId = null
                    bridge.deliverPickError(requestId, "picker-launch-failed")
                }
            }
        }

        assetLoader =
                WebViewAssetLoader.Builder()
                        .setDomain(getString(R.string.bds_asset_authority))
                        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
                        .build()

        val isSystemDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        // DeepSeek's persisted theme drives colours; system dark mode is only the first-launch
        // fallback (before any reportTheme call has been persisted to prefs).
        val isPageDark = bridge.getLastKnownIsDark(default = isSystemDark)

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
                    bridge.evaluateJs = { script -> evaluateJavascript(script, null) }
                    isVerticalScrollBarEnabled = true
                    setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
                }

        configureWebViewCookiePolicy(webView)
        applySystemLocaleCookie()

        // FrameLayout wrapper receives system-bar padding and expands its bottom inset for IME.
        // WebView.setPadding() does not shift the viewport reliably, so the wrapper is the
        // inset target. Its background fills the padding band behind the system bars.
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
            addView(webView)
        }

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, ::applyRootWindowInsets)

        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isPageDark
            isAppearanceLightNavigationBars = !isPageDark
        }

        bridge.onThemeChanged = { isDark ->
            runOnUiThread {
                val bg = if (isDark) PAGE_BG_DARK else PAGE_BG_LIGHT
                rootLayout.setBackgroundColor(bg)
                webView.setBackgroundColor(bg)
                WindowInsetsControllerCompat(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !isDark
                    isAppearanceLightNavigationBars = !isDark
                }
            }
        }

        setContentView(rootLayout)
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

    private fun configureWebViewCookiePolicy(webView: WebView) {
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)
        cookieManager.flush()
    }

    private fun applySystemLocaleCookie() {
        val localeTag =
                bridge.getSystemLocale()
                        .replace('_', '-')
                        .filter { it.isLetterOrDigit() || it == '-' }
        if (localeTag.isBlank()) return

        cookieManager.setCookie(
                getString(R.string.bds_target_url),
                "NEXT_LOCALE=$localeTag; Path=/; SameSite=Lax"
        )
        cookieManager.flush()
    }

    override fun onResume() {
        super.onResume()
        if (::cookieManager.isInitialized) {
            cookieManager.flush()
        }
    }

    override fun onPause() {
        super.onPause()
        if (::cookieManager.isInitialized) {
            cookieManager.flush()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        pendingPickFilesRequestId?.let { outState.putString(STATE_PENDING_PICK_REQUEST_ID, it) }
    }

    override fun onDestroy() {
        bridge.onThemeChanged = null
        bridge.evaluateJs = null
        bridge.onPickFiles = null
        webView.removeJavascriptInterface(BRIDGE_NAME)
        if (::cookieManager.isInitialized) {
            cookieManager.flush()
        }
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

                override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest
                ): Boolean {
                    val url = request.url ?: return false
                    // Never externalize subframe/iframe navigations (e.g. hCaptcha captcha
                    // iframes, embedded auth flows). Only top-level navigation decisions are
                    // delegated to shouldOpenExternally.
                    if (!request.isForMainFrame) return false
                    if (!shouldOpenExternally(url, getString(R.string.bds_asset_authority))) {
                        return false
                    }
                    return openExternalUrl(url)
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
                    val callback = filePathCallback ?: return true
                    pendingFileChooser = callback
                    val allowMultiple =
                            fileChooserParams?.mode ==
                                    WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
                    return try {
                        fileChooserLauncher.launch(
                                buildFileChooserIntent(fileChooserParams?.acceptTypes, allowMultiple)
                        )
                        true
                    } catch (t: Throwable) {
                        Log.e(TAG, "File chooser launch failed", t)
                        pendingFileChooser = null
                        callback.onReceiveValue(null)
                        true
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
                    val targetUrl = view?.hitTestResult?.extra
                    if (!targetUrl.isNullOrBlank()) {
                        val uri = Uri.parse(targetUrl)
                        if (shouldOpenExternally(uri, getString(R.string.bds_asset_authority))) {
                            openExternalUrl(uri)
                            return false
                        }
                    }

                    val transport = resultMsg?.obj as? WebView.WebViewTransport
                    val stub = WebView(this@MainActivity)
                    transport?.webView = stub
                    resultMsg?.sendToTarget()
                    return true
                }
            }

    // ── OAuth proxy ──────────────────────────────────────────────────────

    private fun openExternalUrl(url: Uri): Boolean {
        return runCatching {
                    val intent =
                            Intent(Intent.ACTION_VIEW, url).apply {
                                addCategory(Intent.CATEGORY_BROWSABLE)
                            }
                    startActivity(intent)
                }
                .onFailure { Log.w(TAG, "Failed to open external URL: $url", it) }
                .isSuccess
    }

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

        view.evaluateJavascript(injected, null)
        view.evaluateJavascript(bootstrap, null)
        // content.js installs Android platform helpers, mounts the UI, and calls
        // startThemeWatcher(), which persists pageIsDark via chrome.storage and fires
        // AndroidBridge.reportTheme() for the live native bar-icon colour update.
        view.evaluateJavascript(content, null)
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
        // SAF picker result launchers can survive Activity recreation; the reloaded WebView may
        // have no matching JS listener, but the JS-side timeout bounds any surviving wait.
        private const val STATE_PENDING_PICK_REQUEST_ID = "bds_pending_pick_request_id"

        // Default WebView background colours used in the inset-padding area behind transparent
        // system bars. Approximates DeepSeek's own page backgrounds so the status/nav bar region
        // blends seamlessly before (and if) the page reports its live theme via reportTheme().
        private val PAGE_BG_DARK = Color.rgb(0x15, 0x15, 0x17)
        private val PAGE_BG_LIGHT = Color.WHITE

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
