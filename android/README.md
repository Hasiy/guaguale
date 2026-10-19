# 好运刮刮 Android

Android WebView 应用，最低 Android 6.0（API 23），compile / target SDK 35。保留网页中的全部 10 种票券与现有积分规则。

## 编译安装

用 Android Studio 打开本目录，或在仓库根目录执行：

```powershell
# 需要 JDK 17 或 21，Android SDK 35 / Build Tools 35.0.0。
# ANDROID_HOME 指向 SDK；也可以在 android/local.properties 写 sdk.dir。
.\android\build.ps1
# 依赖已下载时可加 -Offline。
adb install -r .\artifacts\haoyun-guagua-debug.apk
```

输出为可直接安装的 debug 签名 APK。正式发布需要配置自己的签名、版本与发行流程；当前未提供商店发布包。

标准入口也可用 `android/gradlew.bat -p android :app:assembleDebug :app:lintDebug`。Gradle 8.11.1 / AGP 8.9.1；`build.ps1` 额外处理本机 Windows Java 临时通信路径兼容问题。

## 网页资源与手机适配

`syncWebAssets` 在每次构建时自动收集仓库根目录的 HTML、CSS、游戏 JS 和 `assets/*.png`，不打包测试、截图或文档。不需要启动 localhost 服务。修改网页后重新构建 APK 即可。

手机使用 `mobile.css` 和 `navigation.css`：独立选票页展示两列票券网格；点击票券进入独立刮奖页，顶部可返回选票并查看余额。刮奖页保留 48px 操作按钮和底部固定刮开与换票按钮。新春横版票券在手机上分区纵排，号码区改为四列。

两个页面通过 `#ticket` 和选票路由在同一个 WebView 内切换，返回选票不销毁票面，局部刮开轨迹也会保留。已付费未完成的票券显示「继续刮」入口，完成前禁用其他票种。新开应用先显示选票页；保留原账号和票券。桌面浏览器也采用这两个页面。

原生容器处理状态栏、导航栏和刘海安全区域。手指在涂层上移动刮奖；在票面边缘或其他区域上下滑动浏览。返回键把应用退到后台，旋转时保留当前 WebView；进程重建时从本地存储恢复账号、票券、扣款状态及已揭晓格子。尚未完全刮开的局部涂层轨迹不跨进程保存。

## 账号与离线行为

选票页右上角的「设置」可调整所有票种的整张中奖概率，范围 0%～100%，支持滑块、数字输入和恢复默认 10%。点击保存后从下一张新票生效；当前已生成票券保持原结果，在票面使用「换一张」可生成新票。设置保存在本机 `scratch-settings-v1`，覆盖安装和重启会保留；它与钱包数据分别存储。设置页和票面页均支持 Android 返回键回到选票页。

- 新安装生成本地账号，初始 10,000 积分；首次刮票扣票价，奖励自动累加，避免重复扣款和重复入账。
- 数据保存在本应用 WebView 的私有 localStorage 中。重启、强制停止后打开、同签名覆盖安装会保留；卸载或清除应用数据会删除。
- 手机应用与电脑浏览器各有独立存储，原浏览器账号不会自动转入手机。当前尚无登录、服务器账号或跨设备同步。
- 概率、奖池和积分规则沿用网页版本；仅为虚拟积分模拟，没有支付或现金兑奖。

## WebView 容器

使用 [Android 官方 WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) 从 `https://appassets.androidplatform.net/assets/www/index.html` 加载 APK 内资源，保持固定 HTTPS origin。启用 JS 和 DOM storage，不提供原生 JavaScript bridge；不申请 INTERNET 权限，不允许文件/内容 URI、外部导航或混合内容。仅 debug 包启用 WebView 调试。

## 验证

玩法和跨格手势测试：`node --test --test-isolation=none game.test.cjs wallet.test.cjs reference-tickets.test.cjs scratch-gesture.test.cjs`。

Android 检查和真机结果见 [QA.md](QA.md)。

集成测试仅在测试设备上运行，会消耗该测试账号的一张 20 积分虚拟票券，不清除或重置账号：

```powershell
.\android\gradlew.bat -p android :app:assembleDebugAndroidTest
adb -s <测试设备> install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s <测试设备> install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s <测试设备> shell am instrument -w -r -e class com.haoyun.scratch.MainActivityTest com.haoyun.scratch.test/androidx.test.runner.AndroidJUnitRunner
```

测试使用 Espresso 3.7.0，兼容新版 Android 的输入管理接口（[官方版本说明](https://developer.android.com/jetpack/androidx/releases/test)）。
