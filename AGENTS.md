# AGENTS.md

Kids A-Z 答案助手：一个纯静态的 Chrome MV3 扩展，拦截 Kids A-Z 测验接口，在弹窗展示答案并可选高亮页面对应选项；另含学生自动登录、解除阅读速度限制、一键完成一本书和书籍下载（页图/ZIP/PDF/朗读音频/单页）。仓库是平铺结构（11 个源文件 + `icons/`），没有构建、依赖或测试。

## 运行与验证

- 没有 `package.json`、锁文件、bundler、lint/test 配置。不要去找，也不要擅自引入工具链。
- 安装：Chrome → `chrome://extensions` → 开启开发者模式 → “加载已解压的扩展程序” → 选择仓库根目录。
- 改完代码后必须**先点扩展页的“重新加载”，再刷新 Kids A-Z 页面**；content script 只在导航时注入，只刷新扩展不生效。
- 唯一的自动校验是语法检查（无 ESLint）：
  ```powershell
  Get-ChildItem *.js | ForEach-Object { node --check $_.Name }
  ```
- 功能只能手测：打开测验页 → 点扩展图标看答案 → 在设置页切换总开关和各功能开关；自动登录需在设置页填学生名字和学生密码，从 `/ng/` 或 `/ng/login/class-chart` 打开一次；一键完成从书卡按钮或弹窗书目入口启动，默认读+题，AA 书自动跳过 quiz；下载从书卡“下载”或弹窗下载面板启动，默认只下载每页图片，ZIP/PDF/音频/单页均为独立开关。设置页通过 `open_in_tab` 作为独立标签页打开。
- 本目录不是 git 仓库，改动没有版本控制兜底；大改前自行备份。
- 已确认的接口、路由和页面控件见 `API.md`；改选择器、活动 URL 或完成逻辑前先查并同步更新它。文档中标注“待验证”的部分不要当成稳定接口使用。

## 架构（运行上下文）

- `inject.js`：manifest 指定 `world: "MAIN"` + `run_at: "document_start"`，在页面主世界 monkey-patch `fetch` 和 `XMLHttpRequest`，只匹配 `HTML5QuizPlayerService/action/get_quiz_info`，通过 `window.postMessage({ source: 'kidsaz-answer-helper', type: 'quiz-data', payload }, '*')` 传出原始 JSON；同时监听 `reading-settings` 解除速度限制，并执行一键完成的 Read/Listen。
- `content.js`：隔离世界、同样 `document_start`。监听上述消息（受 `enabled` + `quizAnswersEnabled` 门控），整理成 `quizAnswers` 写入 `chrome.storage.local`；开启高亮时操作页面 DOM；并把 `enabled && ignoreReadingPace` 和 `readingSecondsPerPage` 通过 `reading-settings` 发给主世界。
- `auto-login.js`：隔离世界、`document_idle`。依次处理 `/ng/`（老师用户名）、`/ng/login/class-chart`（学生图标）、`/ng/login/student`（学生密码）；用 500ms 路径轮询适配 Angular 单页路由，`sessionStorage` 防止密码错误时反复提交；受 `enabled` 和 `autoLoginEnabled` 双重控制。
- `auto-complete.js`：隔离世界、`document_idle`。给 Level Up / Reading Room 书卡注入“一键完成”和“下载”，给弹窗提供 `getAutoCompleteBooks` / `getDownloadBooks` 书目接口，自动选择 quiz 答案并提交，把 Read/Listen 任务转给主世界。
- `download.js`：隔离世界、`document_idle`。读取下载任务，向主世界请求 `studentBook.playerData/imageData`，生成页图、ZIP、PDF、朗读 WAV（可插静音），并在活动页加“下载本页”。
- `background.js`：MV3 service worker。读取 `autoComplete*` / `download*` 配置，按 Listen → Read → Quiz 顺序开标签页；Read 完成后等 3.5 秒再开 Quiz；后台用 host 权限抓取 `mi.content.kidsa-z.com` 资源，并负责 `chrome.downloads` 写入；状态写入 `autoCompleteStatus`。
- `popup.js` 只读 storage 渲染弹窗、“一键完成一本书”和“下载一本书”面板；`options.js` 写 `enabled`（总开关）/ `quizAnswersEnabled` / `highlightEnabled` / `ignoreReadingPace` / `readingSecondsPerPage` / `autoComplete*` / `download*` / `autoLoginEnabled` / `teacherUsername` / `studentName` / `studentPassword`。

## 容易踩的坑

- `inject.js` 的 `world: "MAIN"` 和 `document_start` 都是必需的：隔离世界的 content script 改不到页面的 `fetch`，晚注入会错过测验请求。不要为了“统一”把两个脚本合并或改 world。
- `content.js` 启动时会把 `quizAnswers` 清为 `null`。因此弹窗在测验接口触发前是空的，这是有意设计，不是 bug。
- 跨上下文协议靠字符串约定：`source: 'kidsaz-answer-helper'` 和 `type: 'quiz-data'` 必须在 `inject.js`、`content.js` 同步修改，否则静默失效、无报错。
- 答案解析优先级：存在 `q.correct_answer_id` 时覆盖 `choices[].is_correct`；选项字母由 `'ABCDEFGH'[correctIndex]` 生成（最多支持 8 项）；题干和选项用 `replace(/<[^>]+>/g, '')` 粗暴去 HTML。
- 弹窗顶部答案串每 5 个字母一组、空格分隔，未知项显示 `?`。
- 页面高亮是启发式文本匹配（扫 `label/span/div/...`，跳过有子元素的节点），用 `data-kaz-highlighted` 防重复标记，并靠 `MutationObserver` 持续补标。Kids A-Z 改版后最易在此失效；`stopHighlight` 必须同时清内联样式和 `.kaz-marker`。
- 自动登录是 SPA 流程：`/ng/` → `/ng/login/class-chart` → `/ng/login/student`，Angular 路由变化不会重新注入脚本，靠 `watchPath()` 轮询 `location.pathname`；不要把自动登录逻辑只放在启动时执行一次。
- 自动登录选择器依赖 Kids A-Z 当前 DOM：`#username`、`button[aria-label="Go"]`、`button.class-chart__students-link`、`#password`、`button.student-password__submit-button`；页面改版后先更新这里。
- `studentPassword` 存在 `chrome.storage.local`，是本地明文；不要把密码写进源码、日志或测试脚本。设置页密码留空表示保留旧密码，清除按钮会删除全部自动登录信息。
- `enabled` 是总开关，必须同时门控答题、页面高亮、自动登录和阅读解锁；`quizAnswersEnabled` 只控制“自动获取测验答案”。新增功能时记得接入 `enabled`，否则总开关会名不副实。
- `options_ui.open_in_tab` 必须保持 `true`，这样 `chrome.runtime.openOptionsPage()` 和 Edge 的“扩展程序选项”会打开独立标签页，而不是扩展页里的嵌入式小弹窗。
- 设置页按“答题助手 / 阅读 / 学生自动登录”分类；`options.html` 的控件 ID 必须和 `options.js` 保持一致，默认值为 `enabled: true`、`quizAnswersEnabled: true`、`highlightEnabled: false`、`ignoreReadingPace: true`、`autoLoginEnabled: false`。
- 阅读器是旧版页面 `/main/Activity/id/<id>`，页面全局对象是 `window.studentBook`。真正的速度限制在书末完成逻辑：`isTimedRead && totalTime / pagesRead < 1000` 时会跳过 `engagementUrl`（通常就是进入 quiz 的跳转），不是单次翻页被节流。
- `setup` 里的 `throttle-click.js` 只作用于带 `[throttle-click]` 的 Back 按钮，不要把它误认为下一页限制；快速连点 `#forward-page` 本身会正常翻页。
- 阅读速度有两层：客户端跳过 `engagementUrl` 的 1 秒/页判断，以及服务端奖励页的 `You read this too quickly`。实测 1 秒/页仍被服务端拒绝，**10 秒/页**通过；因此 `readingSecondsPerPage` 默认 10，`inject.js` 把 `startTime` 回拨到至少这个值。不要改回 1 秒/页。
- 一键完成由 `background.js` + `auto-complete.js` 协作：后台按 Listen → Read → Quiz 开标签页；Read 完成等 3.5 秒再开 Quiz；Read/Listen 由 `inject.js` 在主世界执行，Quiz 由 `auto-complete.js` 点击 `#choice-<题号>-<选项号>` 后点 `#done`。
- Quiz 在 Read 完成前是锁定的；未勾 Read 时后台会自动补前置 Read。含开放题（`choices` 为空）时不要硬提交，直接报告无法自动完成。
- Reading Room 卡片的活动 ID 来自 `angular.element(card).scope().$ctrl.resource.deliveries`；Title/collectionId 也在同一对象。不要在 `.activity_link` 上找 `href`，它通常为空。
- 一键完成入口两个配置项 `autoCompleteCardEnabled` / `autoCompletePopupEnabled` 不互斥；弹窗书目接口是 `getAutoCompleteBooks`。Listen 的完成判定仍是 best-effort，默认关闭。
- 一键完成默认 `autoCompleteRead: true`、`autoCompleteQuiz: true`、`autoCompleteListen: false`、`readingSecondsPerPage: 10`；两个入口默认开启。已实测《All Kinds of Buttons》：Read 50 星、Quiz 5/5 150 星，`autoCompleteStatus.success=true`。
- 书卡按钮和弹窗书目会过滤 `hasPendingStep`：所选步骤都完成的书不显示。完成一本书后需要刷新书目页，Reading Room 的状态才会从服务器重新拉取；不要用旧页面判断是否完成。
- 下载资源在 `mi.content.kidsa-z.com`，页面和内容脚本直接 `fetch` 会被 CORS 拒绝；必须由 `background.js` 凭 host 权限抓取，再以 base64/data URL 交给 `chrome.downloads`。大尺寸 data URL 会丢失 filename，必须用 `chrome.downloads.onDeterminingFilename` 强制书名；Chrome 会把文件名里的空格换成下划线。
- 下载默认 `downloadImages: true`、`downloadZip: false`、`downloadPdf: false`、`downloadAudio: false`、`downloadAudioMerge: true`、`audioSilenceSeconds: 0`、`downloadBundle: true`、`downloadSinglePageEnabled: true`；ZIP/PDF/音频/打包/单页都是独立开关。
- `downloadBundle` 只在同时开启 PDF + 音频合并时生效：生成 `<title>_pdf_audio.zip`，内含 `<title>.pdf` 与 `<title>-audio.wav`，不再单独输出 PDF/WAV；任一项不满足则分别输出。不要把它和页图 ZIP（`<title>.zip`）混在一起。已实测《Carlos Counts Kittens》：ZIP 内仅 10 页 PDF + 52.6s WAV。
- ZIP 使用 store（不压缩，JPEG 本身已压缩）；PDF 直接嵌入 JPEG（DCTDecode）；音频合并用 Web Audio 解码后输出 WAV，`audioSilenceSeconds` 只在段间插入静音；关闭合并则逐段下载 MP3。
- 下载页由后台在后台标签页打开；`chrome.downloads` API 不受“后台标签页无用户手势”影响，不要改回 anchor 下载。单页按钮是 `#kaz-download-page`，只在活动页显示。
- 阅读器的 `studentBook` 由页面内联脚本创建，MAIN-world 脚本只能轮询等待；不要试图从隔离世界直接访问它。
- 权限：`storage` + `activeTab` + `downloads`；host 为 `*://www.kidsa-z.com/*` 和 `*://mi.content.kidsa-z.com/*`。新增站点或接口时同步改 `manifest.json` 的 `matches` / `host_permissions`，并注意 `popup.js` 里的 URL 判断。
- 界面文案全中文，保持中文；代码风格是每个文件一个 IIFE + `'use strict'`、无模块化，沿用现有写法。
