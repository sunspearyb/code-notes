#!/usr/bin/env python3
"""Package demo/法典笔记.html as an Android APK for the owner's own phone.

By default the APK embeds the debug edition, including the imported lecture notes,
so it is for self-testing only and must not be distributed. 维护工具/制作各终端版本.py
calls build() with the pure page, its own package name and a release key to make
the distributable 安卓版; that APK installs alongside the self-test one. Notes written on the phone stay
in the app's WebView storage; they are not synced with the computer. Use
「导出同步」 to save a JSON backup into the phone's Download folder, then merge it
on the computer.

Toolchain (about 450 MB, downloaded once into --tools): Temurin JDK 17,
Android build-tools 34 and the android-34 platform. No Android Studio needed.
The signing key is kept outside the project so that later builds install over
earlier ones without uninstalling (uninstalling would erase notes on the phone).
"""
import argparse
import datetime
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

PROJECT = Path(__file__).resolve().parent.parent
PAGE = PROJECT / 'demo' / '法典笔记.html'
OUT = PROJECT / '手机版'
PACKAGE = 'cn.fadian.notes.selftest'
KEYSTORE = Path.home() / '.fadian' / 'android-selftest.keystore'
KEYPASS = 'fadian-selftest'
REPO = 'https://dl.google.com/android/repository/'
JDK = {
    ('Darwin', 'arm64'): 'mac/aarch64', ('Darwin', 'x86_64'): 'mac/x64',
    ('Linux', 'x86_64'): 'linux/x64', ('Linux', 'aarch64'): 'linux/aarch64',
}

MANIFEST = '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="@PACKAGE@"
    android:versionCode="@VERSION_CODE@" android:versionName="@VERSION_NAME@">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>
  <application android:label="@LABEL@" android:icon="@mipmap/icon" android:allowBackup="false"
      android:theme="@android:style/Theme.Material.Light.NoActionBar" android:usesCleartextTraffic="false">
    <activity android:name=".MainActivity" android:exported="true"
        android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize|uiMode"
        android:windowSoftInputMode="adjustResize">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
'''

JAVA = '''package @PACKAGE@;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
  // A fixed https origin keeps localStorage stable between versions of the app.
  static final String HOST = "appassets.androidplatform.net";
  static final int PICK = 7;
  WebView web;
  ValueCallback<Uri[]> pending;

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().setStatusBarColor(Color.rgb(246, 244, 238));
    if (Build.VERSION.SDK_INT >= 23) getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(246, 244, 238));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setTextZoom(100);
    web.addJavascriptInterface(new Bridge(), "FadianAndroid");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!HOST.equals(u.getHost())) return null;
        String path = u.getPath() == null || u.getPath().equals("/") ? "/index.html" : u.getPath();
        if (!path.equals("/index.html")) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        try { return new WebResourceResponse("text/html", "utf-8", getAssets().open("index.html")); }
        catch (Exception e) { return null; }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (HOST.equals(u.getHost())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (pending != null) pending.onReceiveValue(null);
        pending = callback;
        try { startActivityForResult(params.createIntent(), PICK); }
        catch (Exception e) { pending = null; return false; }
        return true;
      }
    });
    setContentView(web);
    if (saved != null) web.restoreState(saved);
    else web.loadUrl("https://" + HOST + "/index.html");
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

  @Override protected void onActivityResult(int request, int result, Intent data) {
    if (request != PICK || pending == null) { super.onActivityResult(request, result, data); return; }
    pending.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
    pending = null;
  }

  @Override public void onBackPressed() {
    web.evaluateJavascript("typeof androidBack==='function'&&androidBack()", new ValueCallback<String>() {
      @Override public void onReceiveValue(String value) { if (!"true".equals(value)) moveTaskToBack(true); }
    });
  }

  class Bridge {
    @JavascriptInterface public String saveText(String name, String text, String type) {
      try {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        String mime = type == null ? "text/plain" : type.split(";")[0];
        if (Build.VERSION.SDK_INT >= 29) {
          ContentValues values = new ContentValues();
          values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
          values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
          values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/法典笔记");
          Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
          try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
          return "已保存到手机“下载/法典笔记”文件夹：" + name;
        }
        File dir = new File(getExternalFilesDir(null), "导出");
        dir.mkdirs();
        try (OutputStream out = new FileOutputStream(new File(dir, name))) { out.write(bytes); }
        return "已保存到应用目录：" + dir.getAbsolutePath();
      } catch (Exception e) {
        return "保存失败：" + e.getMessage();
      }
    }
    @JavascriptInterface public void copyText(String text) {
      ClipboardManager c = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
      c.setPrimaryClip(ClipData.newPlainText("法典笔记", text));
    }
  }
}
'''

ICON = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#A33A2A" android:pathData="M18,18h72v72h-72z"/>
  <path android:fillColor="#F6F4EE" android:pathData="M30,40h48v6h-48zM30,56h48v6h-48zM30,72h32v6h-32zM30,24h20v8h-20z"/>
</vector>
'''


def run(*args, **kw):
    print('  $', ' '.join(str(a) for a in args[:3]), '…' if len(args) > 3 else '')
    subprocess.run([str(a) for a in args], check=True, **kw)


def fetch(url, target):
    print('下载', url)
    part = target.with_suffix(target.suffix + '.part')
    for _ in range(8):
        have = part.stat().st_size if part.exists() else 0
        request = urllib.request.Request(url, headers={'Range': f'bytes={have}-'} if have else {})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, open(part, 'ab' if have else 'wb') as out:
                shutil.copyfileobj(response, out)
            part.rename(target)
            return
        except Exception as error:  # resume after dropped connections
            print('  中断，续传：', error)
    sys.exit(f'下载失败：{url}')


def toolchain(tools):
    tools.mkdir(parents=True, exist_ok=True)
    jdk = next(tools.glob('jdk/*/Contents/Home'), None) or next(tools.glob('jdk/*/bin/..'), None)
    if not jdk:
        key = (platform.system(), platform.machine())
        if key not in JDK:
            sys.exit('无法识别本机系统，请手动把 JDK 17 解压到 ' + str(tools / 'jdk'))
        archive = tools / 'jdk.tar.gz'
        fetch(f'https://api.adoptium.net/v3/binary/latest/17/ga/{JDK[key]}/jdk/hotspot/normal/eclipse', archive)
        (tools / 'jdk').mkdir(exist_ok=True)
        run('tar', 'xzf', archive, '-C', tools / 'jdk')
        archive.unlink()
        jdk = next(tools.glob('jdk/*/Contents/Home'), None) or next(tools.glob('jdk/*/bin/..'))
    host = {'Darwin': 'macosx', 'Linux': 'linux', 'Windows': 'windows'}[platform.system()]
    for name, zipname in [('bt', f'build-tools_r34-{host}.zip'), ('pf', 'platform-34-ext7_r03.zip')]:
        if not (tools / name).exists():
            archive = tools / zipname
            fetch(REPO + zipname, archive)
            with zipfile.ZipFile(archive) as z:
                z.extractall(tools / name)
            archive.unlink()
    bt = next((tools / 'bt').iterdir())
    for tool in bt.iterdir():  # zipfile does not keep the executable bit
        if tool.is_file():
            tool.chmod(tool.stat().st_mode | 0o111)
    return jdk.resolve(), bt, next((tools / 'pf').glob('*/android.jar'))


def build(page, target, *, package, label, keystore, alias, password, icons=None, version_name=None, tools=None):
    """Build and sign one APK. icons is a folder holding android-foreground.png, android-background.png
    and android-legacy.png (维护工具/应用图标); without it the plain vector icon is used."""
    jdk, bt, android_jar = toolchain(tools or Path.home() / 'Library' / 'Caches' / 'fadian-android')
    env = {**os.environ, 'JAVA_HOME': str(jdk), 'PATH': f'{jdk}/bin:' + os.environ['PATH']}
    now = datetime.datetime.now()
    version_code, version_name = int(now.strftime('%y%m%d%H')), version_name or now.strftime('%Y%m%d-%H%M')

    with tempfile.TemporaryDirectory(prefix='fadian-apk-') as temp:
        work = Path(temp)
        (work / 'res/mipmap-anydpi-v26').mkdir(parents=True)
        adaptive = ('<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">'
                    '<background android:drawable="@{}"/><foreground android:drawable="@drawable/icon"/></adaptive-icon>')
        if icons:
            (work / 'res/drawable-xxxhdpi').mkdir(parents=True)  # 432 px = 108 dp at xxxhdpi
            shutil.copy(icons / 'android-foreground.png', work / 'res/drawable-xxxhdpi/icon.png')
            shutil.copy(icons / 'android-background.png', work / 'res/drawable-xxxhdpi/icon_bg.png')
            (work / 'res/mipmap-xxxhdpi').mkdir()
            shutil.copy(icons / 'android-legacy.png', work / 'res/mipmap-xxxhdpi/icon.png')
            (work / 'res/mipmap-anydpi-v26/icon.xml').write_text(adaptive.format('drawable/icon_bg'), encoding='utf-8')
        else:
            (work / 'res/drawable').mkdir()
            (work / 'res/drawable/icon.xml').write_text(ICON, encoding='utf-8')
            (work / 'res/mipmap-anydpi-v26/icon.xml').write_text(adaptive.format('android:color/white'), encoding='utf-8')
            (work / 'res/mipmap').mkdir()  # pre-26 devices fall back to the vector
            (work / 'res/mipmap/icon.xml').write_text(ICON, encoding='utf-8')
        manifest = work / 'AndroidManifest.xml'
        manifest.write_text(MANIFEST.replace('@PACKAGE@', package).replace('@LABEL@', label)
                            .replace('@VERSION_CODE@', str(version_code)).replace('@VERSION_NAME@', version_name), encoding='utf-8')
        source = work / 'src' / package.replace('.', '/') / 'MainActivity.java'
        source.parent.mkdir(parents=True)
        source.write_text(JAVA.replace('@PACKAGE@', package), encoding='utf-8')
        (work / 'assets').mkdir()
        shutil.copy(page, work / 'assets/index.html')

        print('编译资源与代码')
        run(bt / 'aapt2', 'compile', '--dir', work / 'res', '-o', work / 'res.zip')
        run(bt / 'aapt2', 'link', '-o', work / 'base.apk', '-I', android_jar, '--manifest', manifest,
            '-A', work / 'assets', work / 'res.zip', '--min-sdk-version', '24', '--target-sdk-version', '34')
        (work / 'classes').mkdir()
        run(jdk / 'bin/javac', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-nowarn', '-Xlint:-options',
            '-bootclasspath', android_jar, '-d', work / 'classes', source, env=env)
        classes = [str(p) for p in (work / 'classes').rglob('*.class')]
        run(bt / 'd8', '--release', '--min-api', '24', '--lib', android_jar, '--output', work, *classes, env=env)
        with zipfile.ZipFile(work / 'base.apk', 'a') as apk:
            apk.write(work / 'classes.dex', 'classes.dex')
        run(bt / 'zipalign', '-f', '-p', '4', work / 'base.apk', work / 'aligned.apk')

        if not keystore.exists():
            keystore.parent.mkdir(parents=True, exist_ok=True)
            run(jdk / 'bin/keytool', '-genkeypair', '-keystore', keystore, '-alias', alias, '-keyalg', 'RSA',
                '-keysize', '2048', '-validity', '10000', '-storepass', password, '-keypass', password,
                '-dname', 'CN=Fadian Self Test' if alias == 'selftest' else 'CN=Fadian Notes', env=env)
        target.parent.mkdir(parents=True, exist_ok=True)
        run(bt / 'apksigner', 'sign', '--ks', keystore, '--ks-pass', 'pass:' + password, '--ks-key-alias', alias,
            '--out', target, work / 'aligned.apk', env=env)
        run(bt / 'apksigner', 'verify', target, env=env)
        idsig = target.with_name(target.name + '.idsig')
        if idsig.exists():
            idsig.unlink()
    return target


def main():
    parser = argparse.ArgumentParser(description='制作仅供自测的安卓版法典笔记')
    parser.add_argument('--tools', type=Path, default=Path.home() / 'Library' / 'Caches' / 'fadian-android',
                        help='JDK 与安卓构建工具的存放目录，首次运行时自动下载')
    args = parser.parse_args()
    if not PAGE.exists():
        sys.exit('找不到 demo/法典笔记.html，请先运行 python3 demo/build.py')
    name = datetime.datetime.now().strftime('%Y%m%d-%H%M')
    target = build(PAGE, OUT / f'法典笔记-安卓自测版-{name}.apk', package=PACKAGE, label='法典笔记（自测）',
                   keystore=KEYSTORE, alias='selftest', password=KEYPASS, version_name=name, tools=args.tools)
    print(f'完成：{target.relative_to(PROJECT)}（{target.stat().st_size / 1e6:.1f} MB）')
    print('此安装包含个人讲义笔记，仅供自己的手机测试，请勿外发。')


if __name__ == '__main__':
    main()
