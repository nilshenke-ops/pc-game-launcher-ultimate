package de.nilshenke.jarvishub;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * The app for the phone: the same website in its own window, plus the update way the PC software has.
 * The app asks latest.json for a newer versionCode, offers the update in a bar, downloads the APK, checks its
 * SHA-256 and hands it to Android's installer (Android always asks once – a silent self-update needs system rights).
 */
public class MainActivity extends Activity {

    private static final long CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final String CACHE_DIR = "updates";
    private static final String FILE_NAME = "jarvis-android.apk";

    private WebView web;
    private LinearLayout bar;
    private TextView barText;
    private Button barInstall;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private JSONObject newer;          // the newer version once known
    private boolean downloading;

    private final Runnable autoCheck = new Runnable() {
        @Override public void run() {
            check(false);
            ui.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(buildUi());
        web.loadUrl(BuildConfig.SITE_URL);
        ui.postDelayed(autoCheck, 2500);
    }

    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#07090D"));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(8), dp(6), dp(8));
        bar.setBackgroundColor(Color.parseColor("#1A2040"));
        bar.setVisibility(View.GONE);

        barText = new TextView(this);
        barText.setTextColor(Color.parseColor("#E8EDF6"));
        barText.setTextSize(13);
        barText.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(barText);

        barInstall = new Button(this);
        barInstall.setText("Installieren");
        barInstall.setOnClickListener(v -> installNow());
        bar.addView(barInstall);

        Button later = new Button(this);
        later.setText("Später");
        later.setOnClickListener(v -> bar.setVisibility(View.GONE));
        bar.addView(later);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " NexusAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "JarvisApp");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if ("nilshenke-ops.github.io".equals(host)) return false;     // the app's own pages
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        root.addView(bar);
        root.addView(web);
        return root;
    }

    // ------------------------------------------------------------------ update check

    private void check(boolean manual) {
        new Thread(() -> {
            try {
                JSONObject o = new JSONObject(fetch(BuildConfig.UPDATE_URL));
                int code = o.optInt("versionCode", 0);
                String name = o.optString("versionName", "");
                if (code > BuildConfig.VERSION_CODE) {
                    newer = o;
                    ui.post(() -> {
                        barText.setText("Version " + name + " verfügbar");
                        bar.setVisibility(View.VISIBLE);
                        if (manual) Toast.makeText(this, "Update gefunden – oben antippen", Toast.LENGTH_SHORT).show();
                    });
                } else if (manual) {
                    ui.post(() -> Toast.makeText(this, "Die App ist aktuell (" + BuildConfig.VERSION_NAME + ")", Toast.LENGTH_SHORT).show());
                }
                report(o.optString("versionName", ""), code > BuildConfig.VERSION_CODE);
            } catch (Exception e) {
                if (manual) ui.post(() -> Toast.makeText(this, "Prüfung nicht möglich – keine Verbindung?", Toast.LENGTH_SHORT).show());
                report("", false);
            }
        }, "update-check").start();
    }

    /** Tells the page what it found, so the card in the app can show it. */
    private void report(String latest, boolean hasUpdate) {
        String js = "window.__jarvisUpdate&&window.__jarvisUpdate(" + JSONObject.quote(
                "{\"installed\":\"" + BuildConfig.VERSION_NAME + "\",\"installedCode\":" + BuildConfig.VERSION_CODE
                        + ",\"latest\":\"" + latest + "\",\"update\":" + hasUpdate + "}") + ")";
        ui.post(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private void installNow() {
        if (downloading) return;
        if (newer == null) { Toast.makeText(this, "Kein Update gefunden", Toast.LENGTH_SHORT).show(); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Bitte „Unbekannte Apps installieren“ für diese App erlauben", Toast.LENGTH_LONG).show();
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) { }
            return;
        }
        String url = newer.optString("apkUrl", "");
        String sha = newer.optString("sha256", "");
        if (url.isEmpty()) { Toast.makeText(this, "Keine Adresse für die Datei", Toast.LENGTH_SHORT).show(); return; }
        downloading = true;
        barInstall.setEnabled(false);
        barText.setText("Wird geladen …");
        new Thread(() -> download(url, sha), "update-download").start();
    }

    private void download(String url, String sha) {
        File dir = new File(getCacheDir(), CACHE_DIR);
        if (!dir.exists()) dir.mkdirs();
        File out = new File(dir, FILE_NAME);
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            c.connect();
            if (c.getResponseCode() / 100 != 2) throw new Exception("HTTP " + c.getResponseCode());
            long total = c.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                long done = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    fos.write(buf, 0, n);
                    md.update(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        ui.post(() -> barText.setText("Wird geladen … " + pct + " %"));
                    }
                }
            }
            String got = hex(md.digest());
            if (!sha.isEmpty() && !sha.equalsIgnoreCase(got)) throw new Exception("Prüfsumme stimmt nicht");
            ui.post(() -> {
                downloading = false;
                barInstall.setEnabled(true);
                bar.setVisibility(View.GONE);
                install(out);
            });
        } catch (Exception e) {
            ui.post(() -> {
                downloading = false;
                barInstall.setEnabled(true);
                barText.setText("Download fehlgeschlagen – nochmal versuchen");
                Toast.makeText(this, e.getMessage() == null ? "Download fehlgeschlagen" : e.getMessage(), Toast.LENGTH_LONG).show();
            });
        }
    }

    private void install(File apk) {
        try {
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".files", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Installieren nicht möglich", Toast.LENGTH_LONG).show();
        }
    }

    // ------------------------------------------------------------------ helpers

    private static String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
            StringBuilder b = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) b.append(line);
            return b.toString();
        } finally { c.disconnect(); }
    }

    private static String hex(byte[] bytes) {
        StringBuilder b = new StringBuilder(bytes.length * 2);
        for (byte x : bytes) b.append(String.format(Locale.ROOT, "%02x", x));
        return b.toString();
    }

    private int dp(int v) { return Math.round(getResources().getDisplayMetrics().density * v); }

    /** What the website is allowed to ask the app – version and an update check. */
    public class Bridge {
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public int versionCode() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public void checkForUpdates() { ui.post(() -> check(true)); }
        @JavascriptInterface public void install() { ui.post(MainActivity.this::installNow); }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        super.onBackPressed();
    }

    @Override protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        ui.removeCallbacks(autoCheck);
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
