# Android 验证结果

验证日期：2026-10-19。

## 概率设置页

- 选票页右上角进入设置，整张票至少中奖一次的概率可设为 0%～100%，步长 0.1%，默认 10%，所有票种统一适用。设置保存在本机，从下一张新票生效；当前票券、余额和已揭晓结果不变。
- JavaScript 测试 49 / 49 通过，覆盖 10 种玩法的 0% / 100% 边界、5% / 35% / 80% 抽样概率及非法输入。
- Android 集成测试 3 / 3 通过，验证设置保存、重建恢复、101% 输入被拒绝、当前票券和账号不变、新票使用新概率、系统返回，以及原有跨格刮奖和积分恢复。测试结束恢复原设置。
- 构建及 Lint 成功（0 错误、3 项 SDK / 依赖提示）；新版 APK 已覆盖安装到真机。真机确认设置页完整显示，未修改用户保存的概率。
- 证据：`artifacts/android-qa/settings-instrumentation.txt`、`artifacts/android-qa/probability-settings.png`。

空白区滚动修正：网格允许纵向原生滚动，仅从未揭晓的 canvas 涂层按下时捕获刮奖手势。从空白、分区标题、已揭晓格子按下不扣款、不阻止滚动；已开始的刮奖手势仍可跨格。JavaScript 回归测试现为 28 / 28 通过，构建和覆盖安装成功。

真机从刮奖网格内的分区标题空白处上滑，页面位置向上移动，揭晓数量和余额均未改变。验证 UI：`artifacts/android-qa/scroll-before.xml`、`scroll-after.xml`。

## 连续跨格刮奖修正

手势捕获改为绑定刮奖网格；按下后可连续经过多个格子，初始格的画布移除也不会中断。按移动线段检测经过的格子，包含高速跨过的中间格子和格间空隙。仍按涂层覆盖率揭晓，并且每张票只扣款一次。

- JavaScript 回归测试 27 / 27 通过，包含跨格、起始画布移除、第二指针、取消手势、斜线路径。
- Android 集成测试 2 / 2 通过；新增测试发送真实 Android MotionEvent，一次 ACTION_DOWN、连续跨越前三格来回刮动、一次 ACTION_UP，确认至少三格揭晓且只扣一次 10 积分。
- 原导航、重建、积分恢复测试继续通过。原始输出：`artifacts/android-qa/cross-cell-instrumentation.txt`。
- Android 构建、Lint 成功，修正版已覆盖安装到真机；账号保留。

顶栏视觉修正：票面导航高度统一为 44 CSS px，积分单行显示，移除半透明背景与背景模糊。真机截图 `artifacts/android-qa/compact-header.png` 中状态栏和导航栏背景采样均为 RGB(238,234,226)。修正版构建、Lint 和覆盖安装成功。

## 两页导航更新

- 选票页和刮奖页独立显示；选票页改为手机两列卡片网格。
- 点击票种或「继续刮」进入票面，顶部按钮返回选票。返回不销毁当前票券或局部涂层轨迹。
- 已付费未完成时仅可继续当前票券，禁止换券造成进度丢失。
- Android 系统返回键明确调用票面返回逻辑，选票页再返回才退到后台；不依赖 WebView 对 pushState 历史的识别。
- 扩充后的集成测试通过：1 / 1，覆盖两页互斥显示、页面返回、系统返回键、继续刮及重建后积分与票号不变。结果见 `artifacts/android-qa/navigation-instrumentation.txt`。
- 22 项玩法／积分测试继续通过，Android 构建与 Lint 成功。更新 APK 已覆盖安装到 PLJ110，保留原账号。
- 新页面真机图为 `artifacts/android-qa/catalog-page.png`、`ticket-page.png`。本轮以离线 Android APK 验证导航，未重新验证桌面浏览器布局。

## 构建和资源

- `assembleDebug`、`assembleDebugAndroidTest`、`lintDebug` 成功。
- Lint 0 错误；3 项提示为 target SDK 35 和 Activity / WebKit 可升级版本，不影响本次本地安装。
- debug APK 签名验证通过；APK 内包含当前网页、样式、游戏脚本与两张本地插画，不包含测试脚本、截图、文档。
- APK 无 INTERNET 权限，无文件访问或原生 JavaScript bridge。
- 网页玩法和钱包测试：22 / 22 通过。

## Android 集成测试

环境：Pixel 10 Pro XL 临时只读模拟器，API 37，Android 17 测试镜像。使用独立 ADB 服务，不重启电脑原有 Oppo Connect 服务。

`MainActivityTest.webView_revealAndReopen_preservesBalanceAndTicket`：**通过，1 / 1**。

该测试运行实际 APK 内的网页，在原生 WebView 中验证：

1. HTTPS 本地资源正确加载，10 种玩法完整，无横向溢出。
2. 20 积分票券首次揭晓只扣一次；后续揭晓不重复扣款。
3. 揭晓一格后重建 Activity，账号、票号、积分和已揭晓格子保持一致。
4. 一键刮开后，余额等于原余额减 20 加已入账奖励；重复点击不重复结算。
5. 关闭 Activity 再打开，完成票券的积分及进度保持一致。

结果原文：`artifacts/android-qa/instrumentation.txt`。测试揭晓使用票面支持的键盘事件；该集成检查不等同于手指涂层覆盖率和手感测试。

## 真机检查

设备：PLJ110，Android 17。

- APK 安装并启动成功；原生状态栏、导航栏与底部操作栏无重叠。
- 初始积分 10,000；本次真机检查没有消耗票券积分。
- 触摸选择顺顺利利、横向滑动选票、选择新春大吉2026成功。
- 强制停止应用后重新启动，账号、余额、票号、进度和玩法与停止前一致。首次 UI 抓取发生在加载完成前，等待网页加载后复核一致。
- 新春票券使用手机纵排布局，固定操作栏始终可见。

真机证据：`artifacts/android-qa/phone-home.png`、`phone-shun.png`、`phone-newyear.png`，重启前后 UI 为 `phone-before-restart.xml`、`phone-after-restart.xml`。

## 验证边界

390px 浏览器视口已检查，无水平溢出；新春号码区四列、按钮高度 48px。未声称覆盖全部 Android 6.0～17 设备、所有 WebView 版本、长时间手指刮奖手感或商店审核。当前账号仅在本机应用内保存，尚无云端账号同步。
