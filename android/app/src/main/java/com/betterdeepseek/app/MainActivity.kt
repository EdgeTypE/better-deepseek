package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
                userAgentString = userAgentString +
                    " BetterDeepSeekAndroid/${BuildConfig.VERSION_NAME}"
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
    }
}
