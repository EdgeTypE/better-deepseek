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
                // Replace the default WebView UA with a modern Chrome mobile UA so
                // hosts that block embedded browsers (notably Google sign-in,
                // disallowed_useragent / 403) do not reject us outright. The UA
                // string is intentionally close to a real Chrome on Android — the
                // BDS suffix is preserved so server-side analytics can still
                // identify the client.
                userAgentString = buildSpoofedUserAgent(userAgentString)
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
     */
    private fun openInCustomTab(url: Uri) {
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
            }
        }
    }

    /**
     * Append a Chrome-mobile UA hint after the system default. Servers that
     * refuse embedded WebViews (Google sign-in) rely on the legacy
     * "; wv)" marker — by replacing it with a desktop-style "; Mobile)" we
     * satisfy the heuristic without forging a fully synthetic UA.
     */
    private fun buildSpoofedUserAgent(default: String): String {
        val cleaned = default.replace("; wv)", ")")
        return "$cleaned BetterDeepSeekAndroid/${BuildConfig.VERSION_NAME}"
    }

    /**
     * Forwards inbound VIEW intents (e.g. OAuth callback that lands back on
     * chat.deepseek.com) into the existing WebView so we don't pop a fresh
     * Activity instance.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
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
    }
}
