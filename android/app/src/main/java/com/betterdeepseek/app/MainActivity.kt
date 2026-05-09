package com.betterdeepseek.app

import android.annotation.SuppressLint
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
                callback?.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(
                                result.resultCode,
                                result.data
                        )
                )
            }

    // Correlation key for in-flight native file/folder pick requests.
    @Volatile private var pendingPickFilesRequestId: String? = null

    private val multiFileLauncher: ActivityResultLauncher<Array<String>> =
            registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
                val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
                pendingPickFilesRequestId = null
                if (uris.isNullOrEmpty()) {
                    bridge.deliverPickError(requestId, "cancelled")
                    return@registerForActivityResult
                }
                Thread {
                    val files = uris.mapNotNull { uri -> bridge.readPickedContentUri(uri) }
                    bridge.deliverPickedFiles(requestId, files, null)
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
                Thread {
                    val (files, folderName) = bridge.readPickedFolderTree(treeUri)
                    bridge.deliverPickedFiles(requestId, files, folderName)
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

        // Wire native file/folder picker callbacks. pickFiles() is invoked on the JS thread;
        // the launcher must be called on the UI thread, so we use runOnUiThread.
        bridge.onPickFiles = { mode, requestId ->
            pendingPickFilesRequestId = requestId
            runOnUiThread {
                when (mode) {
                    "folder" -> folderPickerLauncher.launch(null)
                    else -> multiFileLauncher.launch(arrayOf("*/*"))
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
                    // evaluateJavascript must be called on the main thread; bridge.deliverPickResult
                    // already posts to mainHandler before invoking this lambda.
                    bridge.evaluateJs = { script -> evaluateJavascript(script, null) }
                    isVerticalScrollBarEnabled = true
                    setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
                }

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

    override fun onDestroy() {
        bridge.onThemeChanged = null
        bridge.evaluateJs = null
        bridge.onPickFiles = null
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
                    return try {
                        fileChooserLauncher.launch(
                                fileChooserParams?.createIntent()
                                        ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                                            addCategory(Intent.CATEGORY_OPENABLE)
                                            type = "*/*"
                                        }
                        )
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
        // The observer stays alive for the lifetime of the page so SPA navigations that
        // re-insert the button are caught automatically.
        val hideGetApp =
                """
            (function () {
                if (window.__bdsGetAppObserver) return;
                function hideButton() {
                    var spans = document.querySelectorAll('span');
                    for (var i = 0; i < spans.length; i++) {
                        var span = spans[i];
                        if (span.textContent.trim() !== 'Get App') continue;
                        var el = span.parentElement;
                        while (el && el.tagName !== 'BUTTON') { el = el.parentElement; }
                        if (el && el.parentElement) {
                            el.parentElement.style.display = 'none';
                            console.log('[BDS] Hidden Get App container');
                        }
                    }
                }
                hideButton();
                var observer = new MutationObserver(hideButton);
                observer.observe(document.body, { subtree: true, childList: true });
                window.__bdsGetAppObserver = observer;
            })();
        """.trimIndent()

        // Hides the "Download mobile App" (or equivalent) item from the settings drawer
        // (.ds-floating-position-wrapper). Detection is text-based (/download.*app|get.*app/i)
        // so it survives class-name renames. The observer stays alive for the page lifetime.
        // NodeFilter.SHOW_TEXT = 4.
        // Hides the "Download mobile App" item from DeepSeek's settings dropdown.
        // Uses the same .ds-dropdown-menu / .ds-dropdown-menu-option__label structure
        // as SidebarMenuInjector. Update TARGET if DeepSeek renames the item (e.g. i18n).
        val hideDrawerItem =
                """
            (function () {
                if (window.__bdsDrawerItemObserver) return;
                var TARGET = 'Download mobile App';
                function hideItem(menu) {
                    var options = menu.querySelectorAll('.ds-dropdown-menu-option');
                    for (var i = 0; i < options.length; i++) {
                        var label = options[i].querySelector('.ds-dropdown-menu-option__label');
                        if (label && label.textContent.trim().includes(TARGET)) {
                            options[i].style.display = 'none';
                            console.log('[BDS] Hidden drawer app item');
                        }
                    }
                }
                document.querySelectorAll('.ds-dropdown-menu').forEach(hideItem);
                var observer = new MutationObserver(function (mutations) {
                    for (var m = 0; m < mutations.length; m++) {
                        var added = mutations[m].addedNodes;
                        for (var n = 0; n < added.length; n++) {
                            var node = added[n];
                            if (node.nodeType !== 1) continue;
                            if (node.classList.contains('ds-dropdown-menu')) {
                                hideItem(node);
                            } else {
                                var menu = node.querySelector && node.querySelector('.ds-dropdown-menu');
                                if (menu) hideItem(menu);
                            }
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                window.__bdsDrawerItemObserver = observer;
            })();
        """.trimIndent()

        view.evaluateJavascript(injected, null)
        view.evaluateJavascript(bootstrap, null)
        // content.js calls startThemeWatcher() which persists pageIsDark via chrome.storage and
        // fires AndroidBridge.reportTheme() for the live native bar-icon colour update.
        view.evaluateJavascript(content, null)
        view.evaluateJavascript(hideGetApp, null)
        view.evaluateJavascript(hideDrawerItem, null)
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
