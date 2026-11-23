> **已上线**：手机打开 https://lluxingzhe7.github.io/lottery-radar/ （iOS Safari 里「分享 → 添加到主屏幕」可当 App 用）。
> 投稿入口同页面右上角「＋ 投递」，中奖/参与状态在 issue 里评论 `/中奖 编号` 即可回写台账。
> 仓库：https://github.com/lluxingzhe7/lottery-radar （public，Pages 免费版要求公开）。

# 抽奖情报台 radar

半自动的小红书 / 抖音送福利台账。**它帮你记、帮你判、帮你盯，最后那一下你自己点。**

不登录你的账号，不拿你的密码，不替你发评论、不替你关注。
原因写在这里，不是免责声明，是工程事实：平台没有个人号可用的接口，模拟操作会被风控识别，账号一封，之前中的奖全作废。

两种用法，同一套数据：**手机网页版**（推荐，部署一次以后不用开这台电脑）和**本机命令行**（部署前试用、或者批量录入用）。

## 手机版：部署一次，手机浏览器打开就能用

整套东西放在你自己的 GitHub 仓库里，GitHub 免费替它跑：

- **网页**（GitHub Pages）：手机上打开就是卡片列表。点「打开原帖」直接跳小红书/抖音 App，点「复制评论」拿现成文案，「标记已参与」存手机本地。
- **投递**：网页右上角「＋ 投递」→ GitHub 投稿表单，贴链接 + 正文，几十秒后自动入库、打分、出现在网页上。
- **改状态**：在 issue 里评论 `/参与 编号`、`/中奖 编号`、`/领奖 编号`、`/跳过 编号`，机器人改台账，网页跟着更新。
- **提醒**：每天早上 09:00 自动开一条 issue 并 @你，分三块：刚中的奖 / N 天内开奖还没参加的 / 等着开奖的。

### 部署（一次性，约 10 分钟）

1. 在 GitHub 新建仓库，名字随意（`lottery-radar` 就行），**必须 Public**（私有仓库的 Pages 要付费）。
2. 把这个文件夹推上去：
   ```bash
   cd lottery-radar
   git init -b main
   git add .
   git commit -m "init lottery radar"
   git remote add origin https://github.com/<你的用户名>/lottery-radar.git
   git push -u origin main
   ```
   不用命令行的：GitHub 网页 → Add file → Upload files，把文件夹内容拖进去。**注意把 `.github` 隐藏目录也带上**，不然投稿和提醒不会跑。
3. 打开 `site.config.json`，把 `repo` 改成 `你的用户名/lottery-radar` 并提交。不改的话网页上的「投递」按钮点不动。
4. 开 Pages：仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
5. 开写权限：Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**。
6. 等 Actions 里「构建手机端站点」跑完，地址是 `https://<你的用户名>.github.io/lottery-radar/`。手机 Safari 打开 → 分享 → **添加到主屏幕**，就是个 App 图标。

### 第一次验证

1. 网页右上角「＋ 投递」，随便贴一条试。
2. 去 Actions 看「投稿入库」变绿，issue 自动关掉，网页刷新就有这张卡。
3. 网页上那条「【示例数据】」是给你看格式的，点进卡片按编号 `/删除 xhs-20261123-01` 删掉，或者本机跑 `radar.cmd remove xhs-20261123-01 --yes`。

### 自动任务的时刻表（北京时间）

| 什么时候 | 干什么 |
| --- | --- |
| 每天 09:00 | 「每日抽奖提醒」开一条 issue @你 |
| 每 5 分钟 | 自动发现活动（B站、微博），真有新活动才重建网页 |
| 每天 09:20 | 重建网页，刷新"还有几天开奖" |
| 你投递/评论之后 | 立刻入库、改状态、重建网页 |

GitHub 的定时任务偶尔晚十几分钟，正常。

### 提醒怎么真的到手机上

装 GitHub 手机 App → 登录 → 进入这个仓库 → Watch → **All Activity**。新 issue 会推送，记得允许 iOS 通知。

> **中奖只能你自己发现。** 博主在评论区置顶、或者私信你，这些工具都读不到（读私信 = 要你的账号，不干）。所以流程是：你看到中奖 → 在对应 issue 评论 `/中奖 编号` → 之后每天的提醒里它排第一，直到你 `/领奖`。

## 自动发现（每 5 分钟自动跑）

GitHub Actions 每 5 分钟跑一次 `scripts/discover.mjs`：

- 抓 **B站**（公开搜索接口，实测可用）和 **微博**（部分网络下会被限流，能通就抓，不通就跳过）。
- 只留标题/正文里带「抽奖、送福利、宠粉、试用、免单」的活动帖；命中「教程、攻略、代抽、招聘、骗局、爆率、换购」这类词直接丢。
- 自动去重（同一链接只录一次）、自动打分、自动生成参与清单。打分低的也会留着，卡片上带「自动发现」标，你自己扫一眼再决定。
- **每天最多自动入库 20 条**（`config/discover.json` 的 `dailyCap`），避免刷屏。
- 只有真的抓到新活动才提交并重建网页，平时不会空转部署。

想改关键词、黑名单、条数上限、开关，全在 `config/discover.json`：

```json
{ "enabled": true, "maxNewPerRun": 4, "dailyCap": 20, "keywords": { "bilibili": ["抽奖 送福利"], "weibo": ["抽奖 送福利"] }, "sources": { "bilibili": true, "weibo": true } }
```

> **小红书、抖音抓不了（不是没做，是做不到）**：这两家没有对外开放的搜索接口，网页端要带上你登录后的 Cookie（a1 / web_session）再算 `x-s`、`a_bogus` 一类签名才给数据；服务器 IP 一访问基本就是风控拦截，硬来还有账号被限流、封号的风险。所以这两个平台继续走「你刷到 → 复制链接 → 投递 30 秒 → 5 分钟内上页」，判真假、参与清单、倒计时、提醒全自动。

## 本机命令行（部署前试用、批量录入）

本机 PATH 里没有 node，用自带的 `radar.cmd`（自动找内置 node）：

```bat
cd lottery-radar
radar.cmd help
radar.cmd add "https://www.xiaohongshu.com/explore/xxxx" --desc "关注+点赞+收藏，评论区抽3位，12月8日开奖，包邮"
radar.cmd list
```

生成的网页在 `_site/index.html`，双击就能在电脑上看效果。

## 一次完整的流程

1. **录入**：刷到送福利的帖子，把链接 + 帖子正文/要求贴进来（手机上是投递表单，本机是命令行）。
   ```bat
   radar.cmd add "<链接>" --desc "帖子写了什么要求" --prize "奖品" --author "博主"
   ```
   也可以把"链接一行 + 正文若干行"存成 txt：`radar.cmd capture 帖子.txt`
2. **看判定**：自动打分，命中红线的直接标"可疑"，并告诉你为什么。
3. **参与**：`radar.cmd copy <编号>` 出参与清单 + 可直接粘贴的评论文案。照着做，回来 `done` 勾掉。
4. **盯开奖**：每天 09:00 的提醒会催你；`radar.cmd due` 看最近要开奖的。
5. **中了**：评论或命令 `/中奖 编号`，它会给你领奖话术和防骗提醒；领到货 `/领奖 编号`。

## 命令表

| 命令 | 作用 |
| --- | --- |
| `add <链接> [--desc 正文]...` | 录入一条，自动判平台、抓开奖日、打分、拆要求 |
| `capture <txt>` | 从文件批量录入（第一行链接，其余正文） |
| `list` | 台账总览，可按 `--status` `--level` `--platform` `--search` 过滤 |
| `show <编号>` | 判定依据、参与清单、动态记录 |
| `copy <编号>` | 参与清单 + 评论文案 + 领奖私信 |
| `done/undone <编号> <key>` | 勾选/取消一项要求（key 如 follow、like、comment） |
| `set <编号> <状态>` | pending / joined / awaiting / won / lost / claimed / skipped |
| `due [--days 7]` | 最近要开奖的 |
| `remind [--out 文件]` | 每日摘要，可写文件给任务计划用 |
| `stats` | 参与数、中奖率 |
| `rescore [--all]` | 改过规则后重新打分 |
| `edit <编号> ...` | 改标题/正文/开奖日/备注，正文改动会自动重打分 |
| `remove <编号> --yes` | 删除 |
| `export --csv 文件` | 导出 Excel 能直接打开的 CSV（带 BOM） |
| `config` | 打印配置路径和内容 |

任何命令加 `--json` 输出机器可读格式（方便接别的脚本）。

## 判定规则怎么调

全部在 `config/settings.json`，改完 `radar.cmd rescore --all` 生效（手机版会自动重建）。

- `scoring.vetoes`：**红线**。命中直接压到 25 分以下，判"可疑"。
  默认几条最要命的：要你加微信/进群、要你付邮费/运费、要你先付款/交押金，还有刷单任务、引导私下交易。
- `scoring.risks`：扣分项。第三方小程序抽奖、要下载 APP、开奖没固定日期、要填身份证/银行卡。
- `scoring.bonuses`：加分项。官方/旗舰店、往期中奖公示、平台内评论区抽奖、写明开奖日期、包邮。
- `scoring.thresholds`：多少分算"可信"（默认 75）、多少分算"存疑"（默认 50）。
- `requirements`：要求识别。加一条 `{ "key": "xxx", "label": "显示名", "pattern": "正则" }` 就能识别新要求。
- `templates.comment`：评论文案池，按平台分。`templates.dm`：领奖私信模板。
- `platforms`：加新平台就是加一段 `{ "label": ..., "prefix": "缩写", "hosts": ["域名"] }`。

> 默认把"邮费到付"当红线处理。如果你觉得这不算坑（有些博主确实这么寄），把 `vetoes` 里那条删掉再 rescore。

## 以后想薅别的羊毛

机制是通用的，不用改代码：

- `--kind coupon` 记优惠券/满减，`--kind seat` 记试用名额。类型在配置 `kinds` 里加。
- 优惠券类的要求通常不是关注评论，而是"限时""限新用户""满 99 减 20"，照样写进正文，规则会打分并拆要求项。
- 一个活动多账号/多次参与，就录多条（`--force` 允许同链接重复录入）。
- 固定套路存成模板：改 `config/settings.json` 的 `templates`。

## 每天自动提醒（不用 GitHub 的备选）

1. **本机 Windows 任务计划程序**：每天 09:00 跑 `radar.cmd remind --out "%USERPROFILE%\Desktop\radar-今天.txt"`。
2. **DSH 定时任务**：让我在会话里加一条每日任务，到点把 `remind` 的结果发给你。

摘要里分三块：该盯开奖了 / 还没参加（可疑的标"建议跳过"）/ 已中奖待领。

## 数据在哪

- 台账：`data/activities.json`（每次写入自动留 `activities.json.bak`）
- 规则：`config/settings.json`
- 网页产物：`_site/`（构建生成，不提交）
- 环境变量 `RADAR_HOME` 可以换数据目录（测试/多套台账用）

## 目录结构

```
radar.mjs              CLI 主程序
lib/                   规则引擎（打分、要求识别、文案、存储）
web/                   手机网页模板（CSS/JS/HTML）
scripts/build-site.mjs 生成 _site/index.html（数据内嵌，无需后端）
scripts/issue-*.mjs    GitHub issue 投稿 / 命令 / 提醒
.github/workflows/     Pages 构建、投稿入库、状态命令、每日提醒
config/settings.json   全部判定规则和文案
data/activities.json   台账
```

## 奖品筛选（便宜 / 入口上身 / 限定红包）

每条记录入库时会自动打一个 **筛选结论**，网页上有「推荐」「已筛掉」两个筛选项，命令行里是「奖品筛选」列：

- **推荐**：奖品算贵（≥150 元或数码家电、正装这类高价值品类），来源像官方。
- **待判断**：价值不明（没写价格、也不是明显贵/便宜的东西），需要你自己看一眼。
- **筛掉**：命中了三条红线之一 —— 太便宜（<50 元，或小样/试用装/贴纸/代金券这类）、入口或上身的东西来源不明（吃的喝的、护肤彩妆、保健品，没看到官方/旗舰店/质检字样）、限定使用的红包或券（满减门槛、仅限指定店铺、限品类）。

档位和关键词都在 `config/settings.json` 的 `prize` 段里，想放宽或者加品类直接改：

```json
"prize": {
  "minAmount": 50,
  "highAmount": 150,
  "highValueKeywords": ["手机", "耳机", "空气炸锅"],
  "lowValueKeywords": ["小样", "试用装", "代金券"],
  "categories": [{ "key": "beauty", "pattern": "护肤|彩妆|口红", "risk": true }],
  "officialHints": ["官方", "旗舰店", "质检"]
}
```

改完跑一次 `node radar.mjs rescore --all`，再重新构建网页即可。

## 支持的平台

按链接域名自动识别，识别到哪个平台，编号前缀和评论文案模板就用哪个：

| 平台 | 编号前缀 | 参与方式（模板按这个走） |
|---|---|---|
| 小红书 | xhs | 关注 / 点赞 / 收藏 / 评论 |
| 抖音 | dy | 关注 / 点赞 / 评论 |
| 微博 | wb | 关注 / 转发 |
| B站 | bili | 关注 / 三连 / 评论 |
| 快手 | ks | 关注 / 点赞 / 评论 |
| 淘宝天猫 | tb | 关注店铺 / 收藏 / 评论 |
| 京东 | jd | 关注店铺 / 评论 |
| 得物 | dw | 关注 / 评论晒单 |
| 公众号 / 视频号 | wx | 关注 / 在看 |
| 知乎 | zh | 关注 / 赞同 |
| 其他 | oth | 通用模板 |

加新平台只改 `config/settings.json` 的 `platforms` 段（key、label、prefix、hosts），再在 `templates.comment` 里补几条文案即可，不用改代码。

## 已知限制（别指望它替你解决）

- **小红书/抖音只能靠你投递链接**（B站、微博可以自动抓）。这两家对非登录请求基本返回壳页面，抓取要你的 Cookie + 签名，服务器 IP 一访问就被风控，所以链接和正文得你贴（手机上投递表单粘一段，30 秒）。
- **不知道你有没有中奖**。中奖信息在私信和评论回复里，只能你去看；工具负责到点提醒你去看，以及在你标记之后盯着你去领。
- **打分是规则不是真理**。它擅长抓"要钱、要微信、要身份证"这类硬特征；博主靠不靠谱，还得你点进主页看一眼。
- **平台规则**：以抽奖为名的诱导关注、导流是平台明令限制的，脚本操作账号更是。这个工具不碰账号，风险只剩"你手动参与得有点勤"，这个度自己把握。

## 三条保命线

1. 任何要你先付钱、付邮费、交押金的"中奖"，都是诈骗。
2. 加微信领奖 = 脱离平台 = 投诉无门。
3. 身份证、银行卡、验证码，任何"领奖"都不需要。
