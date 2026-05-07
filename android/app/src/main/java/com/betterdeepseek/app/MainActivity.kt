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
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        /**
         * Google sign-in (accounts.google.com / oauth2 endpoints) refuses
         * embedded WebViews — the user lands on a "couldn't sign you in /
         * disallowed_useragent" page. Detect those URLs and hand them off to
         * Chrome Custom Tabs (or the system browser as a fallback). The OAuth
         * callback eventually returns to chat.deepseek.com, which re-enters
         * this app via the VIEW intent filter declared in AndroidManifest.xml.
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
         * Without this, the WebView opens a blank browser window and the
         * OAuth flow stalls. We route popup URLs that should go to Custom
         * Tabs through the same external-opening path.
         */
        override fun onCreateWindow(
            view: WebView?,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: android.os.Message?
        ): Boolean {
            // The resultMsg contains a WebViewTransport — we have to supply
            // a WebView to avoid crashing, but we cancel the popup and
            // handle the URL ourselves.
            val transport = resultMsg?.obj as? WebView.WebViewTransport
            val newWebView = WebView(this@MainActivity)
            transport?.webView = newWebView
            resultMsg?.sendToTarget()

            val url = view?.url ?: view?.originalUrl
            if (url != null) {
                val uri = Uri.parse(url)
                if (shouldOpenExternally(uri)) {
                    openInCustomTab(uri)
                }
            }
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
     * URLs that must NOT load inside the WebView. Today this is just Google's
     * sign-in surface, but the helper is centralized so future hosts (Apple
     * sign-in, Microsoft, etc.) can be added in one place.
     */
    private fun shouldOpenExternally(url: Uri): Boolean {
        val host = url.host?.lowercase() ?: return false
        return host == "accounts.google.com" ||
            host.endsWith(".accounts.google.com") ||
            host == "accounts.youtube.com"
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
