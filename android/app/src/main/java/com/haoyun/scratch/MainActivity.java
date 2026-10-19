/* Copyright (c) 2026 Lucky Scratch contributors. */
package com.haoyun.scratch;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebResourceErrorCompat;

import java.io.ByteArrayInputStream;

/** Offline host for the bundled scratch game. No native JavaScript bridge is exposed. */
public final class MainActivity extends ComponentActivity {
    private static final String TAG = "ScratchActivity";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/assets/www/index.html?platform=android";
    private static final int PAPER_COLOR = Color.rgb(238, 234, 226);

    private WebView webView;
    private LinearLayout errorView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightNavigationBars(true);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(PAPER_COLOR);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(root);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        createErrorView(root);
        configureWebView();
        webView.loadUrl(START_URL);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                // WebView.canGoBack() does not reliably include SPA pushState entries.
                // Ask the local page so Android Back follows the same route as its visible button.
                webView.evaluateJavascript("['ticket','settings'].includes(document.body.dataset.page)", result -> {
                    if (isDestroyed() || isFinishing() || webView == null) return;
                    if ("true".equals(result)) {
                        webView.evaluateJavascript("document.querySelector(document.body.dataset.page === 'settings' ? '#back-from-settings' : '#back-to-catalog').click()", null);
                    } else {
                        // Keep the WebView alive when leaving the catalog, including partial foil strokes.
                        moveTaskToBack(true);
                    }
                });
            }
        });
    }

    /** Configure local-only content loading and persistent app-private DOM storage. */
    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        webView.setBackgroundColor(PAPER_COLOR);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (BuildConfig.DEBUG && message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    // Do not copy console payloads, account data or hidden ticket contents into logs.
                    Log.e(TAG, "Web script error in " + Uri.parse(message.sourceId()).getLastPathSegment()
                            + " at line " + message.lineNumber());
                }
                return true;
            }
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView view,
                    @NonNull WebResourceRequest request) {
                WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                return response != null ? response : new WebResourceResponse("text/plain", "UTF-8",
                        new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view,
                    @NonNull WebResourceRequest request) {
                Uri url = request.getUrl();
                return !("https".equals(url.getScheme()) && APP_HOST.equals(url.getHost())
                        && "/assets/www/index.html".equals(url.getPath()));
            }

            @Override
            public void onReceivedError(@NonNull WebView view, @NonNull WebResourceRequest request,
                    @NonNull WebResourceErrorCompat error) {
                if (request.isForMainFrame()) {
                    Log.e(TAG, "Bundled main-frame asset load failed");
                    errorView.setVisibility(View.VISIBLE);
                    webView.setVisibility(View.INVISIBLE);
                }
            }
        });
    }

    /** Add a native retry surface for a failed main-frame asset load. */
    private void createErrorView(FrameLayout root) {
        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(32, 32, 32, 32);
        errorView.setBackgroundColor(PAPER_COLOR);
        TextView message = new TextView(this);
        message.setText(R.string.load_error);
        message.setGravity(Gravity.CENTER);
        message.setTextSize(16);
        errorView.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(view -> {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(START_URL);
        });
        errorView.addView(retry);
        root.addView(errorView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        errorView.setVisibility(View.GONE);
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            ((ViewGroup) webView.getParent()).removeView(webView);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
