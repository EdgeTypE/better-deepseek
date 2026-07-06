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
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

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
    if (host == "hcaptcha.com" || host.endsWith(".hcaptcha.com")) return false
    if (
            host == "accounts.google.com" ||
                    host.endsWith(".accounts.google.com") ||
                    host == "accounts.youtube.com"
    ) {
        return false
    }

    return true
}

internal fun deriveWebViewUserAgent(defaultUserAgent: String): String {
    return defaultUserAgent
            .replace(Regex(""";\s*wv(?=\))"""), "")
            .replace(Regex("""\bVersion/\d+(?:\.\d+)*\s*"""), "")
            .replace(Regex("""\s+"""), " ")
            .trim()
}

internal fun parseChromeMajorVersion(ua: String): String? {
    return CHROME_VERSION_REGEX.find(ua)?.groupValues?.get(1)?.substringBefore('.')
}

internal fun buildUserAgentMetadata(derivedUa: String): UserAgentMetadata {
    val chromeVersion = CHROME_VERSION_REGEX.find(derivedUa)?.groupValues?.get(1)
    val builder = UserAgentMetadata.Builder().setPlatform("Android").setMobile(true)
    if (chromeVersion != null) {
        val majorVersion = chromeVersion.substringBefore('.')
        val brandVersions =
                listOf(
                        UserAgentMetadata.BrandVersion.Builder()
                                .setBrand("Chromium")
                                .setMajorVersion(majorVersion)
                                .setFullVersion(chromeVersion)
                                .build(),
                        UserAgentMetadata.BrandVersion.Builder()
                                .setBrand("Google Chrome")
                                .setMajorVersion(majorVersion)
                                .setFullVersion(chromeVersion)
                                .build(),
                )
        builder.setFullVersion(chromeVersion).setBrandVersionList(brandVersions)
    }
    return builder.build()
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

private val CHROME_VERSION_REGEX = Regex("""\bChrome/(\d+(?:\.\d+)*)""")

/**
 * Single-activity host. Loads chat.deepseek.com inside a full-screen WebView and injects the BDS
 * extension scripts on every page finish.
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
    @Volatile private var pendingPickFilesMode: String? = null

    private val multiFileLauncher: ActivityResultLauncher<Array<String>> =
            registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
                val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
                val acceptImages = pendingPickFilesMode?.endsWith("+images") == true
                pendingPickFilesRequestId = null
                pendingPickFilesMode = null
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
                            when (val result = bridge.readPickedContentUri(uri, acceptImages)) {
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
                val acceptImages = pendingPickFilesMode?.endsWith("+images") == true
                pendingPickFilesRequestId = null
                pendingPickFilesMode = null
                if (treeUri == null) {
                    bridge.deliverPickError(requestId, "cancelled")
                    return@registerForActivityResult
                }
                bridge.deliverPickStatus(requestId, "reading")
                Thread {
                    try {
                        val result = bridge.readPickedFolderTree(treeUri, acceptImages)
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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        bridge = WebViewBridge(applicationContext)
        cookieManager = CookieManager.getInstance()
        pendingPickFilesRequestId = savedInstanceState?.getString(STATE_PENDING_PICK_REQUEST_ID)
        pendingPickFilesMode = savedInstanceState?.getString(STATE_PENDING_PICK_MODE)

        bridge.onPickFiles = { mode, requestId ->
            runOnUiThread {
                try {
                    pendingPickFilesRequestId = requestId
                    pendingPickFilesMode = mode
                    when (mode) {
                        "folder", "folder+images" -> folderPickerLauncher.launch(null)
                        else -> multiFileLauncher.launch(arrayOf("*/*"))
                    }
                    bridge.deliverPickStatus(requestId, "opened")
                } catch (t: Throwable) {
                    Log.e(TAG, "Native file picker launch failed", t)
                    pendingPickFilesRequestId = null
                    pendingPickFilesMode = null
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
        val derivedUserAgent =
                deriveWebViewUserAgent(WebSettings.getDefaultUserAgent(this@MainActivity))

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
                        userAgentString = derivedUserAgent
                    }
                    addJavascriptInterface(bridge, BRIDGE_NAME)
                    webViewClient = bdsWebViewClient()
                    webChromeClient = bdsWebChromeClient()
                    bridge.evaluateJs = { script -> evaluateJavascript(script, null) }
                    isVerticalScrollBarEnabled = true
                    setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
                }

        configureWebViewCookiePolicy(webView)
        configureWebViewFingerprint(webView, derivedUserAgent)
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
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
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

    private fun configureWebViewFingerprint(webView: WebView, derivedUa: String) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(
                    webView.settings,
                    emptySet<String>(),
            )
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            WebSettingsCompat.setUserAgentMetadata(
                    webView.settings,
                    buildUserAgentMetadata(derivedUa),
            )
        }
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
        pendingPickFilesMode?.let { outState.putString(STATE_PENDING_PICK_MODE, it) }
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
                 * Serve bundled BDS assets. Network requests fall through to native WebView
                 * loading so Chromium owns a single session and transport path.
                 */
                override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                ): WebResourceResponse? {
                    assetLoader.shouldInterceptRequest(request.url)?.let {
                        return it
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
                 * null. Visible popup targets still go through the same external-link routing.
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

    // External URL handling

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
        private const val STATE_PENDING_PICK_MODE = "bds_pending_pick_mode"

        // Default WebView background colours used in the inset-padding area behind transparent
        // system bars. Approximates DeepSeek's own page backgrounds so the status/nav bar region
        // blends seamlessly before (and if) the page reports its live theme via reportTheme().
        private val PAGE_BG_DARK = Color.rgb(0x15, 0x15, 0x17)
        private val PAGE_BG_LIGHT = Color.WHITE
    }
}
