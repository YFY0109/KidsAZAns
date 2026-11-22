# Kids A-Z API 与页面控件笔记

> 基于 2026-11-22 的实际页面与 JS 资产整理。站点版本会变；页面改版后先更新本文档，再改代码。
> 本文档不记录 Cookie、密码、学生姓名等个人信息。

## 1. 域名与登录流程

### 1.1 学生登录（当前使用）

| 步骤 | 路由 | 控件 |
| --- | --- | --- |
| 老师用户名 | `https://www.kidsa-z.com/ng/` | `#username`、`button[aria-label="Go"]` |
| 选择学生图标 | `/ng/login/class-chart` | `button.class-chart__students-link`，按钮文本 = 学生名字 |
| 学生密码 | `/ng/login/student` | `#password`、`button.student-password__submit-button`（也匹配 `button[aria-label="Go"]`） |
| 学生主页 | `/ng/student-portal` | — |

- 这是 Angular 单页应用，路由切换不一定重新加载脚本；自动登录用 `location.pathname` 轮询。
- 老师用户名页面可能已由站点记住；为空时才需要填。
- “选择学生图标”不是账号密码，是班级学生选择页。

### 1.2 家长/老师 Member Login（未纳入自动登录）

- `https://accounts.learninga-z.com/ng/member/login?siteAbbr=kaz`
- `#username`、`#password`、`Remember Me` 复选框、`LOG IN`
- `Remember Me` 默认未勾选；勾选后会话可跨浏览器重启保留。
- 该域名不在扩展当前 host 权限内（只有 `*://www.kidsa-z.com/*`）。

### 1.3 会话

- 登录态来自 Cookie；未观察到可复用的 localStorage token。
- `localStorage` 曾见键名：`multipleClassrooms`、`member`、`members`、`classroom`（不要输出值）。
- 扩展的自动登录凭据保存在 `chrome.storage.local`：`teacherUsername`、`studentName`、`studentPassword`（本地明文，未加密）。

---

## 2. 学生端常用路由

| 路由 | 用途 |
| --- | --- |
| `/ng/student-portal` | 学生主页 |
| `/ng/student-portal/foundations` | Foundations |
| `/ng/student-portal/reading` | Reading 入口（Level Up / Reading Room） |
| `/ng/student-portal/reading/self-paced-assignment` | Level Up 自学书目 |
| `/ng/federate?data=...` | 联邦跳转；Reading Room 会进入 `/main/ReadingBookRoom` |
| `/main/ReadingBookRoom` | Reading Room（旧版 AngularJS） |
| `/main/ReadingBookRoom#!/home` | Reading Room 首页 |
| `/main/ReadingStudent` | 返回 Reading 入口 |
| `/main/Activity/id/<deploymentId>` | 阅读/听力活动播放器 |
| `/main/ActivityPreview/id/<deploymentId>` | 预览模式 |
| `/main/ActivityReward/id/<deploymentId>` | 完成后的奖励页 |
| `/main/StudentPortal` | 完成接口无返回时的兜底跳转 |
| `/main/ReadingAssignment` | 旧版阅读作业入口（阅读器返回按钮指向） |

---

## 3. 已确认 API

### 3.1 Level Up 自学书目列表

```http
GET /ng/api/kids/student/reading/assignment/self-paced
Cookie: <登录态>
```

返回数组，每项：

```json
{
  "resourceId": 535,
  "title": "Big",
  "summary": "...",
  "activities": [
    {
      "activityType": "listen",
      "activityTypeId": 1,
      "displayName": "Listen",
      "activityStatus": "incomplete",
      "resourceDeploymentId": 68287,
      "hasBookmark": false,
      "isActive": true,
      "isLocked": false,
      "starPotential": 10,
      "federationContext": {
        "contextId": "reading.levelUp.activity",
        "resourceDeploymentId": 68287
      }
    },
    {
      "activityType": "read",
      "activityTypeId": 2,
      "displayName": "Read",
      "activityStatus": "incomplete",
      "resourceDeploymentId": 18329,
      "hasBookmark": true,
      "isActive": true,
      "isLocked": false,
      "starPotential": 50,
      "federationContext": {
        "contextId": "reading.levelUp.activity",
        "resourceDeploymentId": 18329
      }
    }
  ],
  "images": [],
  "isFavorite": false,
  "canBeFavorited": true,
  "languageId": 1
}
```

- `activityType` 目前见 `listen` / `read`，未在这批 Level Up 书中见 `quiz`。
- `resourceDeploymentId` 是打开活动页的关键 ID。
- 注意：Listen 的 API `resourceDeploymentId` 是 `68287`，但活动页隐藏字段 `#listenResourceDeploymentId` 是 `68286`，页面 `window.listenInfo.href` 也指向 `68286`。两者是不同层级的 ID，不要混用。

### 3.2 Level Up 状态

```http
GET /ng/api/kids/student/reading/assignment/self-paced/status
```

返回：

```json
{
  "currentLevel": { "name": "aa" },
  "completedTasks": 0,
  "remainingTasks": 44,
  "nextLevel": { "name": "A" }
}
```

### 3.3 阅读完成记录

阅读器完成最后一页时调用。客户端代码里有两套形式：

**POST 形式（当前代码路径）**

```http
POST /main/RecordStudentNonQuizActivityCompletion
Content-Type: application/x-www-form-urlencoded

resource_deployment_id=<readDeploymentId>
assignment_added_at=<#assignmentAddedAt>
duration=<毫秒>
pages=<totalPages - bookmarkedPage>
student-assignment-id=<#studentAssignmentId>
revertToNonAnimated=<bool>
```

- 成功响应可能包含 `badgeNotifications`；随后跳转 `onCompletedUrl`（通常是 `/main/ActivityReward/id/<id>`）。
- 若响应为空，跳转 `/main/StudentPortal`。

**旧版 GET 形式（`Book.prototype.recordActivityCompletion`）**

```text
/main/RecordStudentNonQuizActivityCompletion/resource_deployment_id/<id>/assignment_added_at/<ts>
```

若 `isTimedRead && readCompleted == "false"`，再追加：

```text
/duration/<ms>/pages/<n>
```

### 3.4 书签

```http
POST /main/RecordBookmarkService/
Content-Type: application/x-www-form-urlencoded

id=<activityId>&page=<page>&revertToNonAnimated=<bool>
```

- 只有 `currentPage >= 2` 时才记录。
- 阅读器 `beforeunload` 也会尝试记录书签。

### 3.5 Quiz 信息

扩展通过拦截以下 URL 片段获取题目：

```text
HTML5QuizPlayerService/action/get_quiz_info
```

返回结构（已在真实测验中观察到）：

```json
{
  "questions": [
    {
      "question_id": "...",
      "question": "题干（可能含 HTML）",
      "correct_answer_id": "...",
      "choices": [
        {
          "answer_id": "...",
          "answer": "选项（可能含 HTML）",
          "is_correct": false
        }
      ]
    }
  ]
}
```

- 优先使用 `correct_answer_id`；没有时才用 `choices[].is_correct`。
- 题干/选项需要去掉 HTML 标签。
- Quiz 页面的 DOM 选择器和提交接口尚未验证（当前 Level Up / Reading Room 低级别书没有 quiz）。

### 3.6 阅读速度限制（客户端 + 服务端）

`ebook-read.js` 在书末完成逻辑中：

```js
isTimedRead &&
  pagesRead > 0 &&
  totalTime / pagesRead < 1000
```

成立时会跳过 `engagementUrl`（通常是进入 quiz 的跳转）。

- 单次点击 `#forward-page` 没有节流；实测 120ms 连点 5 次正常翻页。
- `throttle-click.js` 的 1000ms 节流只作用于带 `[throttle-click]` 的 Back 按钮。
- **服务端还有一层校验**：完成过快时奖励页显示
  `You read this too quickly. Read it again. Make sure you read each word carefully.`
- 实测：补到 1 秒/页仍被服务端拒绝；补到 **10 秒/页** 通过。12 页书用约 123 秒完成，获得 50 星。
- 因此扩展的 `ignoreReadingPace` 默认把 `startTime` 回拨到 10 秒/页；配置项为 `readingSecondsPerPage`（1–60，默认 10）。
- 设置 `window.studentBook.isTimedRead = false` 只会绕过客户端跳转判断，不能绕过服务端；真正生效的是完成时 POST 的 `duration/pages`。
- Read 完成后 quiz 才解锁；未完成 Read 时直接打开 quiz URL 会被重定向回 Reading Room。

### 3.7 Quiz 页面（已实测）

Read 完成后，Quiz delivery 解锁，URL 形式：

```text
/main/Activity/id/<quizId>/collectionId/<collectionId>
```

实测（Baby Animals）：`/main/Activity/id/16058/collectionId/1`。

| 控件/全局 | 说明 |
| --- | --- |
| `#question-tab-<i>` | 第 i+1 题标签（0-based） |
| `#choice-<q>-<c>` | 第 q 题（1-based）的第 c 个选项（1-based） |
| `#done` | 提交按钮；全部题答完后 `doneOff` 类消失 |
| `#forward-page` / `#back-page` | 下一题/上一题 |
| `window.quiz.questions` | 题目数组，含 `correct_answer_id`、`choices[].is_correct` |
| `window.quizInfo` | 活动元数据（title/completionStatus 等） |
| `window.selectAnswer` / `submitAnswers` | 页面自身的选项/提交函数 |

`window.quiz.questions[]` 关键字段：

```json
{
  "question_id": "38913",
  "question": "Which animal is the name of a baby animal?",
  "user_answer_id": 0,
  "correct_answer_id": "146358",
  "choices": [
    { "answer_id": "146358", "answer": "calf", "is_correct": true },
    { "answer_id": "146359", "answer": "cow", "is_correct": false }
  ]
}
```

自动提交方式（已实测 5/5）：

1. 对每道题，确定 `choices.findIndex(c => c.is_correct)`。
2. 点击 `#question-tab-<i>`；
3. 点击 `#choice-<i+1>-<correctIndex+1>`；
4. 全部选完后点击 `#done`；
5. 页面跳到 `/main/ActivityReward/id/<quizId>`，显示
   `You got X out of Y right and earned Z stars!`。

注意：

- 含 `question_format_id` 为开放题/构造题时没有普通选项，不能靠点击自动完成。
- 提交后页面会导航，自动化的 `Runtime.evaluate` 结果可能丢失；用奖励页文本或 storage 状态确认结果。
- 直接打开未解锁的 quiz URL 会跳回 Reading Room，不会显示题目。

---

## 4. 阅读器 / 听力页控件

### 4.1 通用阅读器（`/main/Activity/id/<id>`）

| 控件/全局 | 说明 |
| --- | --- |
| `#forward-page` | 下一页；`div[role=button]`，不是 `<button>` |
| `#forward-page-text` | 文本为 `Next` / `Done` / `Quiz` |
| `#back-page` | 上一页 |
| `#book-page` | 当前页容器 |
| `#book-title` | 书名 + 页码文本 |
| `#theImage` | 当前页图片 |
| `window.studentBook` | `Book` 实例 |
| `window.readCompletion` | 阅读是否已记录完成 |
| `window.listenCompletion` | 听力是否已记录完成 |

`window.studentBook` 常用字段：

| 字段 | 说明 |
| --- | --- |
| `isTimedRead` | 是否启用阅读时长判定 |
| `startTime` | 开始时间戳；用于计算 `totalTime` |
| `totalTime` | 累计阅读时长（完成时计算） |
| `totalPages` | 总页数 |
| `bookmarkedPage` | 书签页 |
| `curPageIndex` | 当前页索引 |
| `engagementUrl` | 完成后的 quiz/engagement 跳转；空字符串表示没有 |
| `onCompletedUrl` | 完成后的奖励页 |
| `readCompleted` | 服务端记录是否已完成 |
| `activityId` / `bookId` | 活动/书 ID |

- `#back-page` 初始可能是透明/不可点；翻到第 2 页后才可用。
- 页面 keyup 绑定方向键/PageDown 等；自动化时直接点 `#forward-page` 更稳。

### 4.2 听力页

听力页同样走 `/main/Activity/id/<listenDeploymentId>`，但页面结构偏“听 + 翻页”：

| 控件/全局 | 说明 |
| --- | --- |
| `#book-player` | `<audio>`；初始 `src` 为空，点击播放后由播放器加载 |
| `#audio-play-pause` | 主播放按钮（`<a>`，文本 `Play Button`） |
| `#hidden-audio-play-pause` | 无障碍隐藏播放按钮 |
| `#forward-page` / `#back-page` | 翻页 |
| `window.listenInfo` | 听力活动元数据：`completionStatus`、`href`、`licenseDeliveryId`、`resourceDeploymentId`、`title` |
| `window.listenCompletion` | 听力完成标志 |
| `window.AudioState` | `{ none:0, play:1, pause:2, stop:3 }` |
| `window.AUDIO_WAIT_TIME` | 音频加载等待时间，当前 `1500` ms |
| `window.startAudio()` | 触发 `#book-player` 的 `animationReady` 事件 |

隐藏输入：

| ID | 说明 |
| --- | --- |
| `#listenResourceDeploymentId` | 听力活动 ID（示例 68286） |
| `#readResourceDeploymentId` | 关联阅读活动 ID |
| `#quizResourceDeploymentId` | 关联 quiz ID；空字符串表示没有 |
| `#currentBookPageId` | 当前听力页 ID |
| `#studentAssignmentId` | 作业 ID；自学为空 |
| `#assignmentAddedAt` / `#activityAddedAt` | 作业/活动时间戳 |
| `#pageNumber` | 当前页号 |

实测：点击 `#audio-play-pause` 会播放当前页音频（示例页约 7.98s），结束后暂停；`listenCompletion` 仍为 `false`，需要继续翻页。**听力完成接口尚未验证**，实现一键完成时优先通过页面自身的播放/翻页逻辑触发。

### 4.3 Quiz 页（待验证）

- 进入方式、DOM 选择器和提交接口尚未在实际 quiz 页面确认。
- 阅读/听力页的 `#quizResourceDeploymentId` 非空时，表示存在关联 quiz；可据此判断是否配置了 quiz 步骤。
- 现有扩展已能拦截 `get_quiz_info` 并把答案写入 `chrome.storage.local.quizAnswers`；自动提交逻辑需要等实际 quiz 页面再补。

---

## 5. Level Up / Reading Room 页面控件

### 5.1 Level Up（`/ng/student-portal/reading/self-paced-assignment`）

- `app-resource`：一本书的卡片。
- `.card__title`：书名。
- `app-activity`：活动（Listen / Read）；内部有 `.activity` 和视觉隐藏文本 `"Read not started for <book>"`。
- 点击活动会打开 `mat-dialog-container` 书目详情，链接文本为 `Listen Activity...` / `Read Activity...`。
- 卡片的 `app-activity` 本身不一定是 `<a>`；点击命中区域后再从弹窗进入活动更稳。

### 5.2 Reading Room（`/main/ReadingBookRoom`）

- 旧版 AngularJS；无 iframe。
- 书卡：`.card_container`.
- 活动入口：`.activity_link`（`Listen Activity...` / `Read Activity...` / `Quiz ...`）。
- 分类导航：`.collectionNav_link`；级别筛选：`#level-<level>`，例如 `/main/ReadingBookRoom#!/collectionId/1?level=A`。
- 顶部返回：`a.backBtn` → `/main/ReadingStudent`。
- 活动 ID 可以从卡片控制器拿：

```js
const ctrl = angular.element(card).scope().$ctrl;
const resource = ctrl.resource;
// resource.title / resource.level / resource.collection_id
// resource.deliveries: [
//   { name: 'listen' | 'read' | 'quiz',
//     resourceDeploymentId: 67667,
//     status: { isCompleted, isBookmarked, isPassed, isDisabled, isLocked } }
// ]
```

- 活动 URL（弹窗内的链接）：
  - `/main/Activity/id/<id>/collectionId/<collectionId>`
  - 例：Baby Animals listen 67658、read 16057、quiz 16058。
- Quiz 在 Read 完成前 `status.isDisabled=true`，弹窗显示 “Quiz locked”；Read 完成后解锁。
- 书详情弹窗：`.resourceModal` / `.js-modalWindow`；控制器 `$ctrl.resource` 同样包含 `deliveries`。

---

## 6. 扩展内部协议与存储

### 6.1 postMessage

主世界 `inject.js` ↔ 隔离世界 `content.js`：

```js
// 测验数据
{ source: 'kidsaz-answer-helper', type: 'quiz-data', payload: <get_quiz_info JSON> }

// 阅读速度设置
{
  source: 'kidsaz-answer-helper',
  type: 'reading-settings',
  payload: { ignoreReadingPace: true }
}
```

- `source` / `type` 是字符串约定，双端必须同步改，否则静默失效。
- `reading-settings` 由 `content.js` 在读取 storage 和开关变化时发送。

### 6.2 `chrome.storage.local` 键

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；关闭后所有功能暂停 |
| `quizAnswersEnabled` | `true` | 自动获取测验答案 |
| `highlightEnabled` | `false` | 页面高亮正确选项 |
| `ignoreReadingPace` | `true` | 解除阅读速度限制 |
| `readingSecondsPerPage` | `10` | 补足阅读时长（秒/页），服务端校验用 |
| `autoCompleteEnabled` | `true` | 一键完成总开关 |
| `autoCompleteCardEnabled` | `true` | 书卡“一键完成”按钮 |
| `autoCompletePopupEnabled` | `true` | 答案弹窗里的书目入口 |
| `autoCompleteRead` | `true` | 一键完成执行 Read |
| `autoCompleteQuiz` | `true` | 一键完成执行 Quiz |
| `autoCompleteListen` | `false` | 一键完成执行 Listen |
| `autoCompleteTask` | `null` | 后台当前任务（含 book/steps/currentStep/tabId） |
| `autoCompleteStatus` | `null` | 后台状态（running/step/message/success） |
| `downloadEnabled` | `true` | 下载总开关 |
| `downloadCardEnabled` | `true` | 书卡“下载”按钮 |
| `downloadPopupEnabled` | `true` | 弹窗下载面板 |
| `downloadImages` | `true` | 每页 JPG |
| `downloadZip` | `false` | 页图 ZIP |
| `downloadPdf` | `false` | 页图 PDF |
| `downloadAudio` | `false` | 朗读音频 |
| `downloadAudioMerge` | `true` | 合并为 WAV；关闭则逐段 MP3 |
| `audioSilenceSeconds` | `0` | 合并时段间静音秒数 |
| `downloadBundle` | `true` | PDF + 合并音频打包为 ZIP |
| `downloadSinglePageEnabled` | `true` | 活动页“下载本页”按钮 |
| `downloadTask` | `null` | 后台下载任务 |
| `autoLoginEnabled` | `false` | 学生自动登录 |
| `teacherUsername` | `""` | 老师用户名（可选） |
| `studentName` | `""` | 学生名字 |
| `studentPassword` | `""` | 学生密码（本地明文） |
| `quizAnswers` | `null` | 解析后的答案数组；每次页面加载清空 |

`quizAnswers` 单项：

```json
{
  "questionId": "...",
  "question": "题干",
  "choices": [{ "id": "...", "text": "...", "isCorrect": true }],
  "correctIndex": 1,
  "correctLetter": "B",
  "correctAnswer": "...",
  "correctAnswerId": "..."
}
```

### 6.3 设置页

- `options_ui.open_in_tab: true`，独立标签页。
- 总开关 + 分类：答题助手 / 阅读 / 学生自动登录。
- 控件 ID：`toggleEnabled`、`toggleQuizAnswers`、`toggleHighlight`、`toggleIgnoreReadingPace`、`toggleAutoLogin`、`teacherUsername`、`studentName`、`studentPassword`、`saveAutoLogin`、`clearAutoLogin`。

---

## 7. 一键完成（已实现）

目标：用户选定一本书，按配置的步骤（听 / 读 / 做 quiz）自动完成。默认“读 + 题”。

### 7.0 实现结构

- `background.js`：服务 worker，读取步骤配置，按顺序 `chrome.tabs.create` 打开活动页，接收内容脚本的 stepDone，负责状态机。
- `auto-complete.js`：内容脚本，负责：
  - Level Up / Reading Room 书卡按钮注入；
  - 弹窗 `getAutoCompleteBooks` 书目接口；
  - Quiz 页面自动选择 + 提交；
  - 将 Read/Listen 任务 postMessage 给主世界；
  - 把主世界的完成消息转发给后台。
- `inject.js`：主世界执行 Read/Listen：
  - Read：设置 `studentBook.startTime` 为 10 秒/页，点击 `#forward-page` 直到结束；
  - Listen：播放每页音频（16x）并翻页（完成判定仍待验证）。
- 后台在 Read 完成后等待 3.5 秒再打开 Quiz，避免服务端完成记录尚未落库。

**实测记录（2026-11-22）**

- 《Baby Animals》：手动 Read 用 10 秒/页通过，50 星；Quiz 选择全部正确选项后 5/5，150 星。
- 《All Kinds of Buttons》：从 Reading Room 书卡点击“一键完成”，后台按 Read → Quiz 执行；Read 奖励页 50 星，Quiz 奖励页 5/5、150 星；`autoCompleteStatus.success=true`；刷新书目页后 Read 为 done、Quiz 为 perfect。
- 1 秒/页会被服务端拒绝；10 秒/页通过。`readingSecondsPerPage` 不要随意调低。
- 书卡按钮和弹窗书目会过滤已完成的步骤；完成一本书后刷新书目页再判断状态。

书对象字段：

```json
{
  "title": "Baby Animals",
  "level": "A",
  "collectionId": 1,
  "listenId": 67658,
  "readId": 16057,
  "quizId": 16058,
  "listenCompleted": false,
  "readCompleted": false,
  "quizCompleted": false
}
```

### 7.1 数据来源

- Level Up：`GET /ng/api/kids/student/reading/assignment/self-paced`，直接拿 `activities[].resourceDeploymentId`。
- Reading Room：从 `.card_container` 的 `angular.element(card).scope().$ctrl.resource.deliveries` 读取。
- 活动页隐藏字段可交叉校验：`#listenResourceDeploymentId`、`#readResourceDeploymentId`、`#quizResourceDeploymentId`。

### 7.2 建议流程

1. **Read**
   - 打开 `/main/Activity/id/<readId>`（Reading Room 再拼 `/collectionId/<collectionId>`）。
   - 等待 `window.studentBook`。
   - 设置 `isTimedRead=false`，`startTime = now - pages * readingSecondsPerPage * 1000`（默认 10 秒/页）。
   - 循环点击 `#forward-page`，直到 `curPageIndex >= totalPages` 或 URL 跳到奖励页。
   - 完成记录由页面自己的 `RecordStudentNonQuizActivityCompletion` 发送。
   - 奖励页成功文本：`You earned 50 stars!`；失败文本：`You read this too quickly.`。

2. **Listen**
   - 打开 `/main/Activity/id/<listenId>`。
   - 播放当前页音频（`#audio-play-pause`，可设 `playbackRate=16`），等待结束/暂停后点击 `#forward-page`。
   - 具体完成触发点和接口仍未验证；一键完成中属于 best-effort，默认不勾选。

3. **Quiz**
   - Read 完成后打开 `/main/Activity/id/<quizId>/collectionId/<collectionId>`。
   - 等待 `window.quiz.questions` 和 `#question-tab-0`。
   - 对每题点击 `#question-tab-<i>`，再点击 `#choice-<i+1>-<correctIndex+1>`。
   - 点击 `#done`；奖励页显示 `You got X out of Y right and earned Z stars!` 即成功。
   - 含开放题（无 `choices`）时无法自动完成。

### 7.3 已知风险

- Listen 完成判定仍是 best-effort，默认不勾选；需要更多书本实测。
- Quiz 含开放题/构造题时无法自动完成，会中止并报告。
- 服务端仍有阅读时长校验；10 秒/页已实测通过，但不同书可能要求不同。
- Quiz 在 Read 完成前锁定；未勾 Read 时后台会自动补上前置 Read。
- Reading Room 的活动 ID 依赖 AngularJS scope；页面改版后需更新。
- 任何自动化都应避免输出/记录学生姓名、Cookie、密码。

---

## 8. 下载

### 8.1 数据来源

- Read 活动页：`window.studentBook.imageData[]`，每页有 `page_number`、`page_image`。
- Listen 活动页：`window.studentBook.playerData[]`，每页有：
  - `page_number`、`page_image`
  - `sections[].section_audio`（该页朗读 MP3）
  - `animation_content.audio_url`（动画页音频，作为无 `section_audio` 时的回退）
- `studentBook.curPageIndex` 是当前页索引；单页下载用它取当前页。
- 页图/音频在 `mi.content.kidsa-z.com`。页面和内容脚本直接 `fetch` 会被 CORS 拒绝，必须由扩展后台凭 host 权限抓取。

### 8.2 实现

- 书卡/弹窗入口把下载任务写入 `downloadTask`，后台打开该书的 Listen 活动页（没有 Listen 则用 Read）。
- `download.js` 从主世界拿到页数据后：
  - 页图：`downloadFetch` 抓取 base64；
  - ZIP：store（不压缩）打包 `page-01.jpg` 等；
  - PDF：JPEG 直接作为 `/DCTDecode` 图片对象，每页一张；
  - 音频：`downloadAudioMerge=false` 时逐段下载 MP3；为 true 时用 Web Audio 解码并合并为 WAV，`audioSilenceSeconds` 在段间插入静音；
  - PDF + 合并音频：`downloadBundle=true` 且同时开启 PDF、音频合并时，生成 `<title>_pdf_audio.zip`，内含 `<title>.pdf` 和 `<title>-audio.wav`，不再单独输出这两个文件；关闭则分别输出。
  - 单页：活动页显示 `#kaz-download-page`，下载当前页 JPG。
- 后台用 `chrome.downloads.download` 写文件。大尺寸 data URL 会丢失 filename，因此注册 `chrome.downloads.onDeterminingFilename` 强制使用书名；Chrome 会把空格替换成下划线。
- 默认只下载每页图片；ZIP/PDF/音频/单页均为独立开关。

### 8.3 配置键

`downloadEnabled`、`downloadCardEnabled`、`downloadPopupEnabled`、`downloadImages`、`downloadZip`、`downloadPdf`、`downloadAudio`、`downloadAudioMerge`、`audioSilenceSeconds`、`downloadBundle`、`downloadSinglePageEnabled`。

### 8.4 实测

- 《Bedtime Counting》：ZIP / PDF / 合并 WAV 全部生成；ZIP 含 10 页 JPG，PDF 为 10 页，WAV 约 69 秒、48kHz 单声道。
- 《Carlos Counts Kittens》：开启 PDF + 音频合并 + `downloadBundle` 后只生成一个 `Carlos Counts Kittens_pdf_audio.zip`；解包后仅含 10 页 PDF 和 52.6 秒 WAV，没有单独的 PDF/WAV。
- 《All Kinds of Faces》《Athletes》：默认页图路径和 ZIP/PDF/WAV 内容均验证；文件名修正后为 `Book Title.zip` / `.pdf` / `-audio.wav`。Chrome 可能把空格替换为下划线，取决于下载来源。
- 页图数量以 `playerData` 实际页数为准；某些动画页可能没有普通 `section_audio`。

---

## 9. 快速排查

- 阅读器：在 Console 输入 `window.studentBook` 查看 `isTimedRead / totalPages / curPageIndex / engagementUrl`。
- 活动类型：看隐藏字段 `#readResourceDeploymentId`、`#listenResourceDeploymentId`、`#quizResourceDeploymentId`。
- Level Up 数据：在页面 Console：

```js
await (await fetch('/ng/api/kids/student/reading/assignment/self-paced')).json()
```

- Reading Room 的 JS 是旧版 AngularJS；选择器优先用 `.card_container`、`.activity_link`；活动 ID 用 `angular.element(card).scope().$ctrl.resource.deliveries`。
- Quiz：`window.quiz.questions`、`#question-tab-<i>`、`#choice-<q>-<c>`、`#done`；结果看 `/main/ActivityReward/id/<quizId>` 的文本。
- 一键完成状态：`chrome.storage.local.get('autoCompleteTask')` 和 `autoCompleteStatus`。
- 下载：Listen 页 `window.studentBook.playerData`、Read 页 `window.studentBook.imageData`；任务在 `downloadTask`，开关在 `download*` / `audioSilenceSeconds`。
- 静态 JS 资产路径含版本 hash（如 `587bfd26c00ba3d7`），升级后会变；不要写死旧 hash。
- 扩展页面打开方式：`chrome-extension://<extension-id>/options.html`；`open_in_tab` 已开启。
