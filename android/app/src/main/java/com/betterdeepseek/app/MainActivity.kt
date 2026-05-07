package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
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
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import okhttp3.OkHttpClient
import okhttp3.Request as OkRequest
import java.util.concurrent.TimeUnit

/**
 * Single-activity host. Loads chat.deepseek.com inside a full-screen WebView and
 * injects the BDS extension scripts on every page finish.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var bridge: WebViewBridge

    // Non-zero when a Custom Tab was opened for auth. On resume, if the
    // flag is still set (no onNewIntent callback arrived), we reload the
    // page to reset the spinner.
    private var customTabOpenedAt: Long = 0
    private val customTabTimeoutMs: Long = 120_000

    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher: ActivityResultLauncher<Array<String>> =
        registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val callback = pendingFileChooser
            pendingFileChooser = null
            callback?.onReceiveValue(uris.toTypedArray())
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        bridge = WebViewBridge(applicationContext)

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(getString(R.string.bds_asset_authority))
            .addPathHandler(
                "/",
                WebViewAssetLoader.AssetsPathHandler(this) // serves android_asset/
            )
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
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
                // Replace the entire WebView UA with a Chrome-mobile synthetic so
                // hosts that block embedded browsers (Google sign-in, 403) never
                // see the legacy "; wv)" or "Version/4.0" markers.
                userAgentString = String.format(
                    SPOOFED_UA, BuildConfig.VERSION_NAME)
            }
            addJavascriptInterface(bridge, BRIDGE_NAME)
            webViewClient = bdsWebViewClient()
            webChromeClient = bdsWebChromeClient()
            isVerticalScrollBarEnabled = true
            setBackgroundColor(0x00000000)
        }

        setContentView(webView)
        webView.loadUrl(getString(R.string.bds_target_url))

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    moveTaskToBack(true)
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        val opened = customTabOpenedAt
        if (opened > 0 && System.currentTimeMillis() - opened > 2_500) {
            customTabOpenedAt = 0
            // Custom Tab was opened but no onNewIntent callback arrived —
            // the user aborted or the auth flow failed. Reload to reset
            // the loading spinner so the user can try again immediately.
            Log.d(TAG, "Custom Tab returned without auth callback; reloading page")
            webView.reload()
        }
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface(BRIDGE_NAME)
        super.onDestroy()
    }

    private fun bdsWebViewClient() = object : WebViewClient() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            // BDS bundled assets (sandbox.html, etc.) go through the native
            // asset loader first.
            assetLoader.shouldInterceptRequest(request.url)?.let { return it }

            // For Google OAuth pages, proxy the request through OkHttp to
            // suppress the X-Requested-With header that Android WebView
            // automatically injects. Google uses this header to detect
            // embedded browsers and shows a "disallowed_useragent" error.
            // We proxy both main-frame and subresource requests; POST
            // navigations are handled by shouldOverrideUrlLoading which
            // now lets them load inside the WebView.
            val host = request.url.host?.lowercase() ?: ""
            if (host == "accounts.google.com" ||
                host.endsWith(".accounts.google.com")
            ) {
                val proxied = proxyGoogleOAuthPage(request)
                if (proxied != null) return proxied
            }
            return null
        }

        /**
         * Any URL on shouldOpenExternally is routed to Custom Tabs instead
         * of the WebView. Currently empty — the synthetic Chrome UA and
         * shouldInterceptRequest proxy are sufficient for Google OAuth.
         */
        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val url = request.url
            if (shouldOpenExternally(url)) {
                openInCustomTab(url)
                return true
            }
            return false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            if (url.isNullOrEmpty()) return
            if (url.startsWith("https://chat.deepseek.com")) {
                injectBdsScripts(view)
            }
        }
    }

    /**
     * Fetch a Google OAuth page via OkHttp (which does not add the
     * X-Requested-With header) and return the response as a
     * WebResourceResponse. Cookies from the WebView's cookie manager are
     * forwarded so the OAuth flow keeps session continuity.
     */
    private fun proxyGoogleOAuthPage(request: WebResourceRequest): WebResourceResponse? {
        // Only proxy GET — POST/XHR requests don't expose a body through
        // WebResourceRequest and can't be reliably proxied. Google's bot
        // detection is triggered on the initial page load (GET), so
        // subsequent XHRs within the page are less critical.
        if (request.method != "GET") return null

        return try {
            val authClient = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .followRedirects(false)
                .build()

            val builder = OkRequest.Builder().url(request.url.toString())
            // Mirror only Safe-header values from the original request so
            // we don't pass X-Requested-With and other WebView markers.
            val safeHeaders = listOf("Accept", "Accept-Language", "Cookie", "Referer")
            for (header in request.requestHeaders) {
                if (safeHeaders.any { it.equals(header.key, ignoreCase = true) }) {
                    builder.header(header.key, header.value)
                }
            }

            // Forward WebView cookies for accounts.google.com so Google
            // recognises returning users and saved account sessions.
            val cookieManager = android.webkit.CookieManager.getInstance()
            val cookies = cookieManager.getCookie(request.url.toString())
            if (!cookies.isNullOrEmpty()) {
                builder.header("Cookie", cookies)
            }

            authClient.newCall(builder.build()).execute().use { response ->
                val body = response.body?.bytes() ?: ByteArray(0)
                val mime = response.header("Content-Type") ?: "text/html"
                val charset = response.header("Content-Type")
                    ?.substringAfter("charset=")
                    ?.takeIf { it.isNotBlank() }
                    ?: "utf-8"

                // Feed cookies from the proxied response back into the
                // WebView's cookie jar so subsequent requests carry them.
                val setCookieHeaders = response.headers("Set-Cookie")
                for (setCookie in setCookieHeaders) {
                    cookieManager.setCookie(request.url.toString(), setCookie)
                }
                cookieManager.flush()

                WebResourceResponse(
                    mime.substringBefore(";"),
                    charset,
                    body.inputStream(),
                ).apply {
                    responseHeaders = mapOf(
                        "Content-Type" to "$mime; charset=$charset",
                    )
                    for (setCookie in setCookieHeaders) {
                        responseHeaders = responseHeaders + ("Set-Cookie" to setCookie)
                    }
                    responseHeaders = responseHeaders +
                        ("X-Bds-Proxied" to "1")
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to proxy Google OAuth page: ${t.message}")
            null
        }
    }

    private fun bdsWebChromeClient() = object : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            pendingFileChooser?.onReceiveValue(null)
            pendingFileChooser = filePathCallback
            val mimeTypes = fileChooserParams?.acceptTypes
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
         * Intercept JS-initiated popups (e.g. window.open for Google OAuth).
         * The popup URL is NOT available here — it will be the dummy WebView's
         * first load. We supply a dummy WebView whose shouldOverrideUrlLoading
         * checks the actual destination. If it's a Google auth URL we open
         * it in Custom Tabs instead of the WebView.
         */
        override fun onCreateWindow(
            view: WebView?,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: android.os.Message?
        ): Boolean {
            val transport = resultMsg?.obj as? WebView.WebViewTransport ?: run {
                resultMsg?.sendToTarget()
                return false
            }

            val newWebView = WebView(this@MainActivity).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    userAgentString = String.format(SPOOFED_UA, BuildConfig.VERSION_NAME)
                }
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                setBackgroundColor(0xFF000000.toInt())

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        popupView: WebView,
                        req: WebResourceRequest
                    ): WebResourceResponse? {
                        val host = req.url.host?.lowercase() ?: ""
                        if (host == "accounts.google.com" ||
                            host.endsWith(".accounts.google.com")
                        ) {
                            return proxyGoogleOAuthPage(req)
                        }
                        return null
                    }

                    override fun shouldOverrideUrlLoading(
                        popupView: WebView,
                        request: WebResourceRequest
                    ): Boolean {
                        val targetUrl = request.url
                        if (shouldOpenExternally(targetUrl)) {
                            openInCustomTab(targetUrl)
                            return true
                        }
                        return false
                    }

                    override fun onPageFinished(popupView: WebView, url: String?) {
                        Log.d(TAG, "onCreateWindow popup finished: $url")
                        if (url != null && url.startsWith("https://chat.deepseek.com")) {
                            // OAuth complete — remove the popup and reload
                            // the main WebView to pick up login cookies.
                            popupView.post {
                                (popupView.parent as? ViewGroup)?.removeView(popupView)
                                popupView.destroy()
                                webView.reload()
                            }
                        }
                    }
                }
            }

            // Show the popup as a full-screen overlay so the user can
            // interact with Google's sign-in UI.
            (findViewById<ViewGroup>(android.R.id.content)).addView(newWebView)
            transport.webView = newWebView
            resultMsg?.sendToTarget()
            return true
        }
    }

    /**
     * Read the BDS bundle (content.css/js, injected.js) from assets/bds and
     * inject them into the page after every navigation. Order matters:
     *   1. injected.js  (MAIN-world equivalent — patches fetch/XHR)
     *   2. content.css  (UI styles)
     *   3. content.js   (mounts Svelte UI, scans DOM)
     */
    private fun injectBdsScripts(view: WebView) {
        val injected = readAsset("bds/injected.js") ?: return
        val css = readAsset("bds/content.css") ?: ""
        val content = readAsset("bds/content.js") ?: return

        val cssLiteral = jsStringLiteral(css)
        val bootstrap = """
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
        view.evaluateJavascript(content, null)
    }

    private fun readAsset(path: String): String? = try {
        assets.open(path).use { it.bufferedReader().readText() }
    } catch (t: Throwable) {
        null
    }

    /**
     * URLs that must NOT load inside the WebView. Currently empty — the
     * synthetic Chrome UA (see SPOOFED_UA) is sufficient to pass Google's
     * embedded-browser checks. If a future OAuth provider requires Custom
     * Tabs, add hosts here. Do NOT route Google OAuth externally: the
     * Custom Tab has a separate cookie jar, which breaks the OAuth state
     * validation on the callback.
     */
    private fun shouldOpenExternally(url: Uri): Boolean {
        return false
    }

    /**
     * Open `url` in Chrome Custom Tabs. Falls back to the system browser via
     * ACTION_VIEW if no Custom-Tabs-capable browser is installed. After OAuth
     * completes the IDP redirects to chat.deepseek.com, which Android routes
     * back to this Activity via the VIEW intent filter (see AndroidManifest).
     *
     * On opening, customTabOpenedAt is set. onResume checks whether the user
     * returned without completing auth and reloads the page to stop the spinner.
     */
    private fun openInCustomTab(url: Uri) {
        customTabOpenedAt = System.currentTimeMillis()
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        try {
            intent.launchUrl(this, url)
        } catch (t: ActivityNotFoundException) {
            Log.w(TAG, "Custom Tabs unavailable; falling back to ACTION_VIEW", t)
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (inner: ActivityNotFoundException) {
                Log.e(TAG, "No browser available for $url", inner)
                customTabOpenedAt = 0
            }
        }
    }

    /**
     * Forwards inbound VIEW intents (e.g. OAuth callback that lands back on
     * chat.deepseek.com) into the existing WebView so we don't pop a fresh
     * Activity instance. Clears customTabOpenedAt so onResume knows auth
     * completed.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        customTabOpenedAt = 0
        val data = intent.data ?: return
        val url = data.toString()
        if (url.startsWith("https://chat.deepseek.com")) {
            webView.loadUrl(url)
        }
    }

    /**
     * Wrap a JS source string as a single-quoted JS literal, escaping
     * backslashes, quotes, and newlines.
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
                else -> if (c.code < 0x20) {
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
         * Fully synthetic Chrome-mobile UA string. Servers that block embedded
         * WebViews (notably Google OAuth) check for the legacy "; wv)" marker
         * AND for the `Version/4.0` part that Android WebView adds even when
         * the stock UA is customised. We replace the entire string.
         */
        private const val SPOOFED_UA =
            "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/132.0.6834.122 Mobile Safari/537.36 " +
            "BetterDeepSeekAndroid/%s"
    }
}
