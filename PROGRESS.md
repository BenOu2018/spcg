# SPCG v0.1 Progress

> Last updated: 2026-05-08
> Branch: `feature/v0.1-problem-core`
> Current focus: 后台三级题库结构管理与导入归类

## Operating Rule

后续每次推进主线任务，都必须同步更新本文件：

- 更新 `Last updated`
- 更新相关 workstream 状态
- 记录新增/修改的关键文件
- 更新验证命令和结果
- 调整 `Next Actions`

## Current Status

本轮正在落地后台三级题库管理：

- 已新增 PostgreSQL migration `016_curriculum_admin_targets.sql`，为导入批次增加目标 SPCG 级别、目标关卡和默认题目用途；`problem_set_items.metadata.displayMode` 统一支持 `primary / backup / exam-only`
- 已新增后台 `/admin/curriculum`，顶部菜单筛选 SPCG 1-10 级，页面内管理当前级别下的关卡/算法分类和关卡内题目
- 后台导航已新增 `Curriculum`，旧 `/admin/problem-sets` 保留为 legacy 兼容入口
- 关卡/算法分类继续复用 `problem_sets(type=lesson)`，支持创建、编辑、发布、归档、题目加入、移出、排序和用途设置
- `/admin/levels` 已增加 SPCG 级别、关卡、状态筛选，并显示题目当前归属关卡
- `/admin/levels/[id]` 已增加完整题目编辑表单和危险区永久删除；默认仍建议 Archive，硬删除会检查提交、进度、关卡关联和导入引用
- `/admin/imports/[batchId]` 已增加目标关卡选择和单题用途设置；批次标记 imported 时会校验题目难度级别并写入 `problem_set_items`
- `problem-bank` 文档已补充：题目模板只负责内容和难度，后台归属由导入批次选择决定
- 当前验证已通过：`DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate`、`npm run web:typecheck`、`npm run check`、`npm run web:build`、`npm run problem-bank:validate:incoming`
- 一级题库已按地图 12 关整理到后台三级结构：`spcg1-stage01-a` 到 `spcg1-stage12-a`
- `scripts/db-seed.ts` 已升级为幂等整理器：保留 `ch1-mainline` 12 道地图主线题，同时创建/更新 SPCG 1 级 12 个 `lesson` 关卡，并把 `ch1-XX`、`ch1-XX-s1`、`ch1-XX-02` 等同前缀题目挂入对应关卡
- 本地数据库已执行整理：12 个 SPCG 1 级关卡已发布为 student 可见，40 道 `ch1-*` 题已归类；每关基础题 `ch1-XX` 为 `primary`，变体/姐妹题为 `backup`
- 旧 `lesson` 发布校验已调整：关卡/算法分类不再要求 5-10 题才能发布；AI 教案生成仍保留 5-10 题校验
- 当前新增验证已通过：`DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:seed`、`npm run check`、`npm run web:build`
- `/admin/curriculum` 已改为后台工具式双列表：左侧关卡/算法列表显示关卡编号、名称、算法内容、状态；右侧题目列表显示位置、题目、算法/难度、用途、状态
- 关卡列表上方已提供 `新增 / 修改 / 删除` 操作，均使用弹出对话框；删除为归档
- 题目列表上方已提供 `题目导入 / 新增 / 修改 / 删除` 操作；导入是把现有题库题目加入当前关卡，新增会创建 draft 题目并挂入当前关卡，删除为从关卡移出并归档题目
- 选择题目后，下方显示题面预览和完整内容编辑表单，可修改题面、图片 JSON、测试点、Hints、题解、官方代码、starter code、来源、姐妹题和故事字段
- 新增 `AdminModal` 通用后台弹窗组件，以及 `curriculum-service` / `curriculum-repository`，保持 server action 不直接访问数据库
- 当前新增验证已通过：`npm run check`、`npm run web:build`
- 关卡/算法列表上方的 A/B 线筛选已改为单个小切换按钮，并与 `新增 / 修改 / 删除` 放在同一行；按钮显示当前线路，点击后切到另一条线
- 新增关卡弹窗的 ID 改为系统自动生成：`spcg{level}-stage{nn}-{a|b}`，后台按提交的级别、关卡编号和线路生成 ID，不再允许管理员自定义 ID
- 后台弹窗提交表单时会自动关闭；新增/修改保存成功后页面刷新到最新数据
- 已修复地图关卡名不同步问题：地图/首页现在使用 `problem_sets(type=lesson)` 中 A 线 `primary` 关卡标题覆盖主线节点标题；题目详情页和段位赛仍显示具体题目标题
- B 线已改为同 SPCG 1级 A 线一样显示 12 个关卡骨架，默认不挂题；`db:seed` 会创建/保留 `spcg1-stage01-b` 到 `spcg1-stage12-b`
- 后台题目导入已限制为“同级别、同关卡编号”的题目池；B 线可以复用 A 线当前关卡题目，但不能导入其他关卡题目，服务端也会校验防止绕过 UI
- 题目删除已改为只从当前关卡移出，不再把题目全局归档，避免 A/B 共用题目时误伤另一条线路
- 关卡名称已与顺序信息分离：新增 migration `017_clean_curriculum_stage_titles.sql` 清理现有关卡标题里的 `SPCG N级 第M关` 前缀；后台新增关卡和 `db:seed` 后续只保存真实关卡名称
- 已修复后台改关卡名后地图不刷新的链路：同级同关卡 A/B 线标题会同步更新；保存题单/关卡/题目后会 revalidate `/` 和 `/map`；首页与地图页显式 `force-dynamic`，避免关卡标题被页面缓存卡住
- 已修复后台关卡修改保存后列表不变化的问题：`AdminModal` 不再在 submit capture 阶段同步卸载表单，改为延迟关闭；`/admin/curriculum` 的关卡修改改用专用 `updateCurriculumStageAction`，保存后 redirect 回当前关卡并刷新后台/地图路径
- 地图节点 hover 已改为自定义双行提示：显示关卡名称和代表算法；地图数据层同时从后台 `problem_sets.lesson_focus` 覆盖主线 `knowledgePoint`，后台修改算法内容后地图提示会同步
- 后台 `/admin/curriculum` 的关卡列表和题目列表选择链接已设置 `scroll={false}`，选择下方关卡/题目后页面保持当前滚动位置，不再回到顶部
- 地图主线同步已从硬编码 `shared/game-chapters.levelPlan` 改为优先读取后台课程结构：`problem_sets(type=lesson, track=A, visibility=student, status=published)` 中 `primary` 题目会自动成为地图关卡；关卡顺序使用 `stage_no`，名称和算法使用后台关卡字段，解决 2 级题目 ID 与 `ch2-01` 硬编码不一致导致地图不显示的问题
- 编程页题目栏文本选中样式已强化为深灰背景、白色文字；顶部层级显示改为“第N级 章节名” + “第M层 关卡名”，并新增“本层题目”菜单，可在当前层的已发布题目间切换；地图主级别文案已从“主关卡/第N关”调整为“级别/第N级”，层目录显示“第M层”
- 题目栏扩展时 Run / Submit 不再跟随右移后的 IDE 边缘跑出或改变屏幕操作位；`.programming-layout.task-expanded` 下按钮改为 viewport fixed 定位，并按当前调试区高度计算底部位置
- 编程题页面顶部栏已接入轻量 5 题进度：不改变原 IDE 布局和顶部栏高度，去掉圆环结构，改为 1-5 一字排开；前 3 题为必做晋级，当前题放大高亮，4-5 题作为提高/挑战入口
- 轻量 5 题进度已继续调整：在不改变顶部栏高度的前提下，将 1-5 节点和数字放大一倍；右侧摘要改为显示当前层五类题目名称：模版、基础、变式、提高、挑战
- 轻量 5 题进度摘要已改为只显示当前题目，例如 `基础：第一题名称`，避免顶部栏信息过长
- 当前题目标识控件已改为按显示内容自适应宽度，不再占满顶部栏剩余空间
- 轻量 5 题进度条已整体左移并保持节点组居中显示；1-5 节点之间的连接符从短线改为箭头
- 轻量 5 题进度条定位已改为页面居中：第 3 个节点对齐页面水平中心；访问已 AC 题目时会按当前层进度自动跳到第一个未 AC 题目并高亮
- 地图关卡节点下方已改为星星进度：默认显示 5 颗星，若当前层实际只配置 3 题则显示 3 颗；已 AC 题目点亮金色星星，未完成题目显示灰色星星
- 顶部 5 题进度中特殊处理挑战题完成态：第 5 格通过后保留挑战题原标记和数字 `5`，只在标记上方叠加黄金勾，不再替换成普通完成节点
- 顶部 5 题进度已把提高题纳入同样的特殊完成态：第 4、5 格通过后保留原提高/挑战标记和数字，只叠加直接金色勾，不再使用小圆圈勾
- 顶部 5 题进度第 4、5 格完成勾已改用 `icon-golden-check.svg`；前三题完成后标签显示 `已通关，继续挑战难度`，五题完成后显示 `完美通过此关`
- 顶部 5 题进度第 4、5 格完成勾已移动到数字中心覆盖显示
- 编程 IDE 顶部栏显式选题已和“默认进入跳过已 AC 题”拆开：顶部 1-5 进度和“本层题目”菜单可回看已 AC 题，地图/默认入口仍自动进入第一个未 AC 题
- `/exam/spcg-level-1` 段位赛题目菜单已提升为顶部栏独立浮层，展开后不再被下方题目栏或 IDE 主体遮挡
- 关卡题目页进入已 AC 题目时，IDE 调试结果区会直接显示 AC、通过用例、历史运行时间和最近一次 AC 提交的奖励信息，不再显示 `Ready / Submit when done.`
- 本次已 AC 结果区恢复验证已通过：`npm run web:typecheck`、`npm run web:build`
- 编程 IDE 已增强自动缩进：Monaco 开启 advanced auto indent、format on type/paste、固定 4 空格缩进；右上角新增“自动排版代码”按钮，第一版本地轻量整理 C/C++/Python 缩进并写回代码缓存
- 编程 IDE 右上角 6 个工具按钮已统一悬浮提示：重置、恢复、历史提交、自动排版、逻辑画板、展开/收起编辑器均支持鼠标 hover 和键盘 focus 提示
- 本次顶部栏改动验证已通过：`npm run web:typecheck`、`npm run web:build`
- 当前新增验证已通过：`DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate`、`DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:seed`、`npm run web:typecheck`、`npm run check:architecture`、`npm run check`、`npm run web:build`
- v0.2 闭环规则已开始落地：新增 `docs/v0.2-roadmap.md`，每关默认固定 5 题，前 3 题主线必做，4-5 提高题不阻塞地图推进
- `problem_set_items.metadata.displayMode` 已扩展为 `template / basic / variant / advanced / challenge / exam-only`，并保留 `primary / backup` 旧数据兼容
- 后台题单详情已显示 v0.2 完整度：5 题数量、主线必做数、提高题数量；发布和生成教案会按固定 5 题、至少 3 道主线题校验
- 地图和关卡页已开始显示 5 题完成度：地图节点显示 `x/5`，本层题目菜单显示题目角色和通过状态，前 3 题通过后按主线完成处理
- `/me` 前 4 个核心数据已调整为今日目标、段位差距、本周知识点、待修错题；老师学生详情页已补充待修错、修错成功和最近错误类型摘要
- 学生编程页已补齐 v0.2 当场反馈：Submit 判题后 AC 会推荐下一题/提高题/回地图，WA/CE/RE/TLE/MLE 会按错误类型和连续错误次数给修错建议
- 老师学生详情页已增加每关 5 题完成矩阵，展示主线完成数、提高题完成数、掌握状态和待修错数量
- 判题 worker 已增加一次性 `repair_ac` 修错成功小奖励：同题之前有错误尝试、这次 AC 时发放少量金币，并写入 `reward_ledger`
- 已新增 PostgreSQL migration `019_repair_ac_reward_source.sql`，为奖励流水增加 `repair_ac` 来源

本轮已按计划完成核心迁移：

- 移除运行时代码中的 Supabase client / Auth / RPC / Edge Function 调用路径
- 新增普通 PostgreSQL schema：`db/migrations/001_initial_schema.sql`
- 新增本地 DB 连接层：`apps/web/lib/db.ts`
- 登录注册改为 NextAuth Credentials + PostgreSQL `users` + bcrypt
- `level-data`、`admin-data`、后台 actions 改为 `pg` SQL
- Submit 改为写入 `submissions(status='pending')`
- 新增 `scripts/judge-worker.ts`，从 PostgreSQL 队列领取任务并调用本地 Judge0
- 新增 Node 版 Judge0 adapter：`shared/judge0-client.ts`
- 导入脚本、导入批次同步、管理员 bootstrap 已改为 `DATABASE_URL`
- 新增统一 `docker-compose.yml`：业务 PostgreSQL、Web、SPCG judge worker、Judge0 官方服务组
- `.env.example` 已切换为 `DATABASE_URL` / `AUTH_SECRET` / `JUDGE0_BASE_URL`
- 当前 docs 已切换为 PostgreSQL/Judge0 部署说明
- 当前运行代码、scripts、shared、docs 中不再出现 Supabase 依赖关键字
- 当前全仓旧来源字样和旧来源文件名搜索为 0

本轮多语言判题继续推进：

- 编辑器默认策略改为 `Auto · C++14 first`，支持手动选择 `C / C++11 / C++14 / C++17 / C++20 / C++23 / Python3`
- `Auto` 只做轻量语言识别：明显 Python 使用 Python3，明显 C 使用 C，其余使用 C++14；语言选错或标准不兼容直接返回 `CE`，不做 fallback
- Run/Submit 已增加 `languageMode`，提交入库保存用户选择的 `language` 和实际判题的 `resolved_language`
- 新增 migration `db/migrations/002_submission_languages.sql`，为历史提交补齐 `resolved_language` 并把旧 `language=cpp` 迁为 `cpp14`
- Judge0 adapter 和 Web Run adapter 已按 resolved language 设置 `language_id` 与 C++ `-std=... -pedantic-errors`
- 编程 IDE 顶部新增语言选择菜单，Monaco 按 C / C++ / Python 切换语言，代码缓存按 `levelId + languageMode` 分开保存
- 历史提交已显示用户选择语言、实际运行语言、判题结果和历史代码
- problem-bank 模板、schema、README、STRUCTURE、AGENT_BRIEF 已更新为默认 `defaultLanguage: cpp14`；官方代码使用其他语言时需要 `officialCodeLanguage`
- 现有 content 与 problem-bank incoming 题目文件已从旧 `language: cpp` 机械迁移为 `defaultLanguage: cpp14`
- `.env.example`、`apps/web/.env.local`、`docker-compose.yml` 已新增 C / C++ / Python3 Judge0 language id 配置
- 本地数据库已执行 `002_submission_languages.sql`，当前 migration 状态正常
- 真实 Judge0 探测通过：`cpp14` AC、手动 `cpp14` 跑 C++17 语法返回 `CE`、手动 `cpp17` AC、Auto 识别 C/Python3 均 AC
- 验证已通过：`npm run check`、`npm run web:build`、`npm run problem-bank:validate:incoming`
- ch1-06 调试结论已确认：题目要求第一行固定输出 `Ready`，`r >= 60` 时再额外输出 `Umbrella`；用户给出的 `if/else` 二选一代码在 hidden case `60` 输出少了 `Ready`，真实 Judge0 返回 `WA 1/20`。正确单分支写法已验证 `AC 20/20`
- 题目图片预览已调整为 IDE 右上角单层细边框相框，边框色跟随 IDE/题目面板金色系，宽度 44%，不遮挡工具栏；不再定时隐藏，用户点击/聚焦编程框时立即向上滑走；切换编译语言不重新触发图片预览
- IDE 输出区已拆分：stdout 只显示程序真实输出，不再显示运行状态、语言或占位提示；语言、状态、提交号、用例和奖励等调试信息移到左侧结果栏；Run 和 Submit 都会展开底部调试栏，点击编辑器恢复高度

本轮本地环境继续推进：

- Docker Desktop 已启动
- `postgres:16` 首次拉取遇到 `tls: bad record MAC`，单独重试 `docker pull postgres:16` 后成功
- `docker compose up -d spcg-postgres` 已成功，容器 `spcg-spcg-postgres-1` 运行并 healthy
- `DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate` 已成功
- `problem-bank:import:incoming` 首次发现 JSONB 数组写入问题，已修复导入脚本显式 `JSON.stringify`
- incoming 43 题已导入本地 PostgreSQL
- `npm run db:seed` 已成功，默认第一章题单已写入
- `npm run problem-bank:sync-import-batch` 已成功，43 条导入批次明细已写入
- 已创建本地测试管理员 `admin-local@spcg.local`，并通过 `admin:bootstrap` 写入 owner 角色
- `apps/web/.env.local` 已切换到本地 PostgreSQL / NextAuth / Judge0 配置，`SPCG_ADMIN_PREVIEW=false`
- Next dev server 已重启，运行在 `http://localhost:3000`
- Judge0 官方镜像已在 M1 Mac 上以 `linux/amd64` 方式启动成功，`http://localhost:2358/languages` 可返回语言列表
- `docker-compose.yml` 已为 `judge0-server` / `judge0-worker` 显式设置 `platform: linux/amd64`，避免 Apple Silicon platform warning
- 本地 Judge0 在 Docker Desktop / Mac M1 下需要兼容参数：`JUDGE0_DISABLE_CGROUPS=true`、`JUDGE0_MIN_MEMORY_LIMIT_KB=512000`
- Judge0 adapter 已改为 `base64_encoded=true`，支持中文代码/输出和题目样例
- 已执行真实 `submit -> judge-worker -> Judge0 -> progress`：`ch1-01` 官方代码通过 `AC 20/20`
- `progress` 已写入通过记录：`passed=true`、`attempt_count=3`、`best_runtime_ms=41`
- 已通过 headless Chrome 登录并点击前端 Submit，页面创建 submission `d0b60a39-6306-4f63-a7dd-835b392dd7d9`
- 前端 Submit 创建的 starter code submission 已由 worker 判成 `WA 0/20`，确认 `submitCodeAction -> submissions -> judge-worker -> Judge0 -> verdict` 路径可用
- 已核对本地 Judge0 `/statuses`：Judge0 原始状态共 14 种，SPCG 当前业务层归并为 `AC / WA / CE / TLE / RE`
- 已新增 `Judge Error` verdict，并把 Judge0 `Internal Error(status=13)` 从 `RE` 拆出
- 编译器 stdout 输出区已支持轮询实时显示：`pending -> AC/WA/TLE/CE/RE/Judge Error`
- 已用 `ch1-02` 真实 20 个测试点验证编译器/Judge0：语法错误代码返回 `CE`；`cout << 13 << endl << coins;` 返回 `AC 20/20`
- `ch1-02` 数据库队列链路验证通过：submission `44036e5f-a70f-4ef9-8e91-bb25eb05126c` 经 worker 返回 `AC 20/20`，progress 写入 `passed=true`
- 已定位并修复前端 `Submit` 误显示 `3/20` 的根因：远程不可用/未登录/超时时会退回本地 mock hidden 判题；现在 `Submit` 不再 mock hidden 测试点，远程不可用统一显示 `Judge Error`
- 前端远程轮询从约 26 秒延长到约 147 秒，避免本地 Judge0 跑 20 个测试点较慢时提前超时
- 已修复“Submit 显示当前未登录，无法远程判题”的入口问题：`/`、`/map`、`/me`、`/level/[id]` 现在都会要求登录，未登录直接跳 `/auth/sign-in?next=...`
- 已定位并处理 `Submit` 后长时间 `pending`：原因是 SPCG `judge-worker` 未运行；已启动本机后台持续 worker，当前 pending 队列已清空
- submission `f28fe082-0af6-4cd8-81a4-a28cda33fa0f` 已处理为 `WA 0/20`；数据库里实际提交的是 ch1-02 starter code，未包含用户期望的 `cin/cout`
- 尝试启动 Docker 后台 `judge-worker` 时拉取 `node:22-bookworm` 再次遇到 `tls: bad record MAC`；当前先使用本机 `npm run judge:worker` 持续处理
- 已修复 Submit 依赖常驻 worker 的问题：`submitCodeAction` 写入 pending 后会自动后台唤醒一次 `judge-worker --once`
- 新增 `apps/web/lib/judge-worker-autostart.ts`，负责解析仓库根目录并启动一次性 worker；本地 `.env.local` 显式设置 `JUDGE_WORKER_AUTOSTART=true`
- 自动唤醒验证通过：无常驻 worker 时插入 ch1-02 pending，调用 wake 后 submission `bec6f975-f790-4c9b-bdfa-92081e980306` 自动变为 `AC 20/20`
- 已恢复本地 Web dev server：`http://localhost:3000` 重新监听，`/auth/sign-in` 返回 200；未登录访问首页会跳登录页
- 已新增登录后可访问的 SPCG 段位赛页：`/exam/spcg-level-1`
- 新手村地图已在最后一关之后增加永远可点击的段位赛节点，入口不受普通关卡进度锁定
- 段位赛页复用主线 12 关、`TaskCard`、`CodeWorkspace`、Run/Submit、历史提交和代码缓存；Submit 继续走现有普通判题链路
- 已明确一级新手村主线只显示 `ch1-mist-town` 的 `order 1..12`；level-2、level-8 和第一章备用题继续保留在题库/后台/未来段位赛题池，不进入地图和一级默认段位赛题目列表
- 段位赛顶部栏已按 `exam-ui-kit` 设计资产接入 SPCG 牌匾、段位赛标题、题号列表、倒计时、Camera On、Recording、安全预览和 Finish Match
- 段位赛顶部栏已二次重整：移除冲突的安全预览小窗和整图 Finish Match，标题改为 CSS 木质牌匾，题号/计时合并为稳定状态 rail，监控状态和 Finish Match 保持紧凑独立
- 段位赛顶部栏已三次重整：顶栏不再使用 `exam-ui-kit` 的 SVG 组件或旧按钮，改为纯 CSS 木质横梁、SPCG 品牌牌匾、标题徽章、题目列表菜单、计时器、监控状态点和 Finish Match 操作
- 题目列表菜单已升级为可查看题号、题目名、知识点和当前题状态的下拉菜单
- 段位赛页已删除底部 `Next Question`，跳题只保留题目列表菜单；左上 SPCG 品牌牌匾已移除；顶栏按钮字号、间距和列宽已收紧，避免文字显示不完整
- 题目详情前端已防御性剥离 Markdown 正文里的 `提示 / 题解 / 解题 / 参考代码 / 官方代码` 段落，提示只在 Hints 折叠区显示，题解只在 Solution 折叠区显示
- 题目详情公开样例已改为洛谷式完整代码框：每个样例显示 `样例输入 #n` 和 `样例输出 #n`，完整保留换行和空白，不再拆成左右零散文本
- 题面 Markdown 正文里的样例块已补齐代码框规则：`输入/输出` 或 `样例 1` 后的裸文本样例会渲染为 fenced code block，新导入题目会拒绝裸写样例数据
- 题目下方可判题 Samples 区已恢复左右显示：左侧 Input、右侧 Expected；Run/Submit 后样例状态显示 Running、AC 对勾或错误叉号
- 新手村地图 12 个普通关卡已按石板小路重新排布，路线从左下沿路走到中上方；`Me/登录` HUD 保持原位，段位赛节点移到 HUD 下方
- 已修复编程页 Submit 后 `SubmissionHistoryItem is not defined`：server action 不再 re-export 类型，客户端改用 action 返回值推导历史提交类型，避免类型名进入运行时代码
- 已修复 `ch1-03` AC 代码点击 Run 后 stdout 为空、公开样例误判 WA 的问题：本地 mock 执行器新增 `scanf/printf` 支持，并为单变量 `cin/cout` 原样输出补回归测试
- 已补齐 AC 后题解即时解锁链路：Submit 返回 AC 后普通编程页和段位赛页会调用 server action 读取当前用户已解锁的 `solution/officialCode/solutionVideoUrl`，无需刷新页面即可展开 Solution
- 已完成后台运营 SQL smoke：发布/下架题目、题单发布、导入批次审核、用户状态调整、重置用户进度均可写入 `admin_audit_logs`
- 已完成真实 Judge0 状态 smoke：`AC / WA / CE / TLE / RE` 均可从本地 Judge0 返回并被 SPCG verdict 正确归并；Judge0 内部错误保留为 `Judge Error`
- 已将 Judge0 单次提交测试点并发默认从 1 调整为 4，Compose、`.env.example` 和部署文档同步更新，用于降低 20 个测试点 AC 的等待时间
- Docker Compose 后台 `judge-worker` 已切换为 `node:22-alpine`，避免 Mac 拉取 `node:22-bookworm` 失败；Compose worker 已实际处理 submission 并返回 `AC 20/20`
- 已补齐 level-2 两个新增题目的题面图片资产：生成原图 PNG，并压缩为模板引用的 `statement-main.webp`
- 已完成 43 题空库端到端 smoke：临时 PostgreSQL 数据库从零迁移、导入 43 题、seed 题单、同步导入批次、bootstrap 管理员、插入 pending submission、`judge-worker --once -> Judge0 -> progress` 返回 `AC 20/20`，并删除临时库
- 已再次清理新导入题目和生成脚本里的旧来源等级字样：全仓搜索为 0，数据库 `levels` 内容搜索为 0
- 题库导入脚本已新增校验：Markdown 正文禁止包含 `提示1/提示2/提示3`、`## 提示`、`## 题解`、`## 参考代码` 等生成提示/题解内容
- 现有 `problem-bank/incoming` 题目文件已批量清理正文末尾重复的 `## 提示 / ## 题解 / ## 参考代码` 段落
- 题库模板、结构文档、题目生成 agent brief 已补充规则：提示必须放 `hints`，题解必须放 `solution`，官方代码必须放 `officialCode`
- Finish Match 第一版只显示完成弹层和返回新手村入口，不新增独立段位赛成绩表
- `supabase/README.md` 已标记该目录为 legacy reference，运行时代码不依赖
- 全项目主角称谓已统一为“犬虎”；题库导入脚本和导入规则会拒绝“犬虎小狗/小狗”称谓进入题面、提示、题解或元数据
- 旧等级测评/模拟测评可见文案已统一为“段位赛”；地图入口、段位赛页顶部栏、完成弹层、奖励来源、数据库 session 和 UI kit 文档均已同步
- 改编自洛谷/Codeforces 的 37 道 incoming 题已补充 `source.originalPublicSamples`，当前公开样例已从隐藏测试点重新轮换，避免复刻原题公开样例
- 导入脚本已新增改编题公开样例校验：Luogu/Codeforces 改编题必须声明原题公开样例，当前 `public` 输入+输出不得与原题公开样例完全一致
- 已重新导入本地 PostgreSQL 43 题，并同步 `incoming-2026-04-29` 导入批次；数据库检查确认旧称谓/旧段位赛命名为 0，公开样例重复为 0
- 后台 `/admin/users` 已补齐用户创建入口，可创建普通学生、测试账号和可选后台角色
- 后台 `/admin/users/[id]` 已补齐用户编辑、密码重置、状态/测试账号切换、进度重置和硬删除操作
- 用户创建、编辑、删除均写入 `admin_audit_logs`；删除会阻止管理员删除自己，并保留至少 1 个 active owner
- 后台权限检查已同步读取 `user_admin_states.account_status`，suspended/deleted 管理员即使有旧 session 也不能继续进入后台
- 已创建 4 个本地测试账户：`toby@spcg.local`、`raymond@spcg.local`、`answer@spcg.local`、`hope@spcg.local`，密码统一为 `Abcd@1234`，均为 active test account
- 已完成 SPCG 10级 × 5层难度体系：`spcgLevel` 固定为 1..10，`stars` 固定为 1..5，`levelLabel` 必须匹配 `SPCG N级`
- 已新增共享难度工具：`difficultyCoefficient = spcgLevel * stars`，普通题首次 AC 金币奖励等于该系数
- Web reward service 和 `judge-worker` 已统一使用同一套奖励计算；AC 奖励 metadata 写入 `spcgLevel / stars / difficultyCoefficient`
- PostgreSQL 已新增 `009_difficulty_level_label.sql`，现有 `levels.difficulty` 已批量补齐 `levelLabel`，新 CHECK 会拒绝 0、11、缺失或不匹配的难度结构
- `problem-bank` 模板、schema、导入文档、agent brief、生成脚本和现有 incoming 题目已全部补齐 `difficulty.levelLabel`
- 当前本地 PostgreSQL 题库已重新导入 46 题，数据库检查：46/46 有 `levelLabel`，等级范围 1..9，层级最大 5，标签不匹配 0
- 已用 `toby@spcg.local` 做一次真实 level-2 官方代码 smoke：submission `1591e059-9996-42ba-b0bf-1dcb57a7c19d` 经 Compose `judge-worker -> Judge0` 返回 `AC 20/20`，奖励账本写入 `coin_delta=6`、`spcgLevel=2`、`stars=3`、`difficultyCoefficient=6`
- Compose 后台 `judge-worker` 已重启到当前代码，当前 submissions 队列无 pending/judging
- 已研究 Ivan Jobs KMP 动画、WilliamFiset Tarjan SCC 和 HeadEasyLabs Tarjan SCC 三类算法演示风格，并沉淀为 SPCG lesson 长片规则
- 已新增 `lesson/manim_lesson_rule.md`，用于算法教学长片、最小生成树模板题教学、代码同步、镜头和验收规则
- 已更新 `problem-bank/manim_rule.md`，明确题解短片与 lesson 长片边界，并补充图算法镜头、辅助视图和长片验收入口
- 已更新 `DOCS_INDEX.md`，加入长片教学演示规则入口
- 已按 `lesson/manim_lesson_rule.md` 生成最小生成树模板题 ManimCE 试制片素材，输出到 `lesson/mst-template/`
- 已渲染 720p30 静音草稿 `lesson/mst-template/lesson-mst-template-draft.mp4`，时长 `00:03:37.83`，并生成预览图 `lesson/mst-template/assets/main-graph.png`
- 当前本机缺少 `latex/dvisvgm`，试制片公式先用 `Text` 渲染；正式长片应安装 LaTeX 后切换 `MathTex`，并按 `narration_tts.txt` 合成 TTS
- 课程题单已复用 `problem_sets` 并扩展为 `type='lesson'`，新增 `spcg_level / stage_no / track / lesson_focus` 显式课程字段
- 已新增 `lesson_plans` 教案快照表，每次 AI 生成或人工编辑都创建 Markdown 新版本
- 题目导入链路已支持 `teacher_notes`：题包读取 `statement_teacher.md`，旧 Markdown 题可选读取 `teacherNotes`
- 后台 `/admin/problem-sets` 已支持创建 A/B 线课程题单、维护题目、发布校验 5-10 题、生成 AI 教案草稿、编辑 Markdown 并查看版本历史
- AI 教案生成使用 OpenAI-compatible Chat Completions HTTP 接口，环境变量为 `LESSON_PLAN_AI_BASE_URL / LESSON_PLAN_AI_API_KEY / LESSON_PLAN_AI_MODEL`

## Workstream Progress

| Workstream | 状态 | 当前完成 | 下一步 |
|---|---:|---|---|
| 01 前端主界面 | Final validation | 游戏式登录、地图、编程页、Monaco、stdin/stdout、样例反馈、视频区域、段位赛页、历史提交、代码缓存、题解即时解锁均已完成 | 跑最终 build/typecheck 后封版 |
| 02 中间层 / API | Final validation | Server actions 不再调用托管后端；Submit 写入本地 PostgreSQL 队列；Auth 用 NextAuth session；轮询可读本地 verdict；AC 后题解即时解锁已补齐 | 跑最终全仓检查 |
| 03 数据库 | Final validation | PostgreSQL migration 已落地；空库迁移、题库导入、题单、导入批次、管理员、submissions/progress 已通过 smoke；当前本地库 46 题；难度 JSONB CHECK 已升级到 SPCG 1-10 级 × 5 层 | 保留 `supabase/` 为 legacy reference |
| 04 OJ 判题 | Final validation | Node Judge0 adapter + `judge-worker` 已跑通真实 Judge0；AC/WA/CE/TLE/RE/Judge Error 映射完成；Compose 后台 worker 可处理队列；单提交测试点并发默认 4 | 跑最终 worker/compose 检查 |
| 05 内容生产 | Final validation | incoming 46 题校验通过并导入 PostgreSQL；37 道改编题已记录原题公开样例并重写当前公开样例；默认题单已 seed；导入批次已同步；难度模板已补齐 `levelLabel` | 上线后按同一格式统一导入正式 problem-bank 批次 |
| 06 后台运营管理 | Final validation | Admin auth/data/actions 改为 NextAuth + PostgreSQL；本地 owner 管理员已 bootstrap；用户 CRUD、测试账号、后台关键写操作审计日志 smoke 通过；后台三级题库结构 `/admin/curriculum` 已改为双列表 + 弹窗操作 + 下方题目详情编辑；一级 12 个地图关卡已归类到 `lesson` 关卡并通过 check/build | 后台页面浏览器 smoke 后封版 |

## Implemented Files

| 路径 | 对应 workstream | 说明 |
|---|---|---|
| `db/migrations/001_initial_schema.sql` | 03 DB | 本地 PostgreSQL schema，包含 users、levels、submissions、progress、admin、problem sets、import batches |
| `db/migrations/009_difficulty_level_label.sql` | 03 DB / 05 | 补齐 `difficulty.levelLabel`，并把题目难度 CHECK 升级为 SPCG 1-10 级 × 5 层 |
| `shared/difficulty.ts` | 02 / 03 / 04 / 05 | 统一 `levelLabel`、`difficultyCoefficient=spcgLevel*stars` 和普通题首次 AC 金币奖励计算 |
| `apps/web/auth.ts` | 02 Auth | NextAuth Credentials 配置，JWT session 写入 user id |
| `apps/web/app/api/auth/[...nextauth]/route.ts` | 02 Auth | NextAuth App Router endpoint |
| `apps/web/app/auth/actions.ts` | 01 / 02 | 注册、登录、登出 server actions，写入 PostgreSQL 用户 |
| `apps/web/lib/auth-guard.ts` | 01 / 02 | 主线页面登录保护，未登录跳转登录页并保留 next |
| `apps/web/app/page.tsx` / `apps/web/app/map/page.tsx` / `apps/web/app/me/page.tsx` / `apps/web/app/level/[id]/page.tsx` | 01 / 02 | 游戏主页、地图、进度、关卡页要求登录 |
| `apps/web/lib/db.ts` | 02 / 03 | `pg Pool`、query、transaction helper |
| `apps/web/lib/admin-auth.ts` | 06 | `requireAdmin()` 改为 NextAuth session + `admin_roles`，并拒绝 suspended/deleted 管理员旧会话 |
| `apps/web/lib/level-data.ts` | 01 / 03 | 读取 `levels_public` 和当前用户 `progress`；仅对已 AC 题目服务端补充题解/官方代码 |
| `apps/web/lib/services/level-service.ts` | 01 / 05 | `getMainlineLevelsForUser` 明确只返回一级新手村 12 个主线关卡，隐藏备用题和其他等级题 |
| `apps/web/lib/admin-data.ts` | 06 / 03 | 后台 Users / Levels / Problem Sets / Imports / Audit Logs SQL 数据层 |
| `apps/web/lib/reward-rules.ts` / `apps/web/lib/services/reward-service.ts` | 02 / 04 | 普通题首次 AC 金币奖励改为难度系数，reward metadata 写入 `spcgLevel / stars / difficultyCoefficient` |
| `apps/web/app/admin/*/actions.ts` | 06 | 发布、审核、用户运营操作改为 SQL transaction + audit log；用户创建、编辑、删除、状态、测试账号、进度重置均走审计日志 |
| `apps/web/app/admin/users/page.tsx` / `apps/web/app/admin/users/[id]/page.tsx` | 06 | 后台用户列表、创建表单、详情编辑表单、删除入口和运营动作 |
| `apps/web/app/level/actions.ts` | 04 | Submit 插入本地 `submissions` 队列，轮询 verdict，读取当前题目历史提交；新增 AC 后读取已解锁题解的 server action；远程不可用文案改为无法远程判题 |
| `apps/web/lib/judge-worker-autostart.ts` | 04 | Submit 后自动后台启动 `judge-worker --once`，避免 pending 无人领取 |
| `shared/judge0-client.ts` | 04 | 本地 Judge0 HTTP adapter，支持 auth token、language id、base64、首测失败快速返回、可选 batch/并发参数和 Mac Docker 兼容参数 |
| `shared/judge.ts` | 04 | Judge0 verdict 聚合，支持 message/errorDetail 回传，并映射 `Internal Error` 为 `Judge Error` |
| `scripts/judge-worker.ts` | 04 | PostgreSQL 队列 worker，判题后更新 submission/progress，并按共享难度系数发放首次 AC 奖励 |
| `apps/web/components/CodeWorkspace.tsx` | 01 / 04 | 编译器 stdout 输出区实时显示 pending/judging/final verdict；Submit 后输出区加高，点击 Monaco 编辑区自动收回；题目图片以 IDE 上方 80% 宽浮动相框显示并向上滑走；支持历史提交抽屉和题目代码本地缓存；历史提交类型改为从 action 返回值推导，避免 server action type export 运行时错误；Submit AC 后通知父组件刷新题解解锁状态；Submit 不再本地 mock hidden 测试点 |
| `apps/web/components/ProgrammingLevel.tsx` | 01 | 关卡页管理题目阅读栏展开状态，并在展开/收起时触发布局刷新；AC 后即时合并已解锁题解和官方代码 |
| `apps/web/app/exam/spcg-level-1/page.tsx` | 01 / 02 | SPCG 段位赛路由，登录后可访问，不检查普通关卡进度 |
| `apps/web/components/ExamLevel.tsx` | 01 / 04 | 段位赛客户端页面，复用主线题目、题目栏、Monaco 编程区、Run/Submit、题号切换、计时和 Finish Match 完成弹层；段位赛提交 AC 后同步当前题的题解解锁状态 |
| `apps/web/components/LevelMap.tsx` / `apps/web/components/GameVillage.tsx` | 01 | 新手村最后一关之后新增永远可点击的段位赛节点，链接 `/exam/spcg-level-1` |
| `apps/web/lib/mock-data.ts` | 01 | 更新新手村 12 关地图坐标，避开右上角 HUD 并贴合背景石板小路；同步 mock fallback 里的 `ch1-03` 公开样例为当前题库的单变量原样输出 |
| `shared/judge.ts` | 04 | 本地 Run mock 执行器支持 `cin/cout`、`scanf/printf` 常见初学写法，修复 AC 代码本地空输出误判 |
| `scripts/check-judge.ts` | 04 | 新增 `ch1-03` 单变量 `cin/cout` 和 `scanf/printf` Run 回归测试 |
| `scripts/check-reward-rules.ts` | 02 / 04 | 覆盖 SPCG 1×1、2×5、10×5 的难度系数与金币奖励 |
| `scripts/check-import-difficulty-validation.ts` | 05 | 覆盖 `spcgLevel 0/11`、缺 `levelLabel`、`levelLabel` 不匹配和 `stars 6` 的导入失败用例 |
| `apps/web/components/TestResults.tsx` | 01 / 04 | 支持 `Judge Error` 结果样式 class |
| `apps/web/components/TaskCard.tsx` | 01 / 04 | 题目栏顶部只保留 Goal；右上角小尺寸放大/橙色缩小按钮；题面正文防御性剥离误混入的提示/题解段落；可判题 Samples 区恢复左右 Input/Expected 布局，并显示 Running、AC 对勾或错误叉号；Hints/Solution 折叠到底部；样例状态支持 `Judge Error` 标签 |
| `apps/web/app/globals.css` | 01 | 更新 Samples 左右布局、状态胶囊、运行中旋转图标、判题颜色和行级对错高亮 |
| `apps/web/components/StatementMarkdown.tsx` | 01 / 05 | 支持在题目栏正文隐藏 Markdown 图片，避免浮动相框和正文重复显示；题面正文里的裸文本样例会规范化为 fenced code block 显示 |
| `scripts/db-migrate.ts` | 03 | 顺序执行 `db/migrations/*.sql` |
| `scripts/db-seed.ts` | 05 / 06 | 生成默认第一章题单；`ch1-mainline` 固定只挂 `ch1-mist-town` 的 `order 1..12`；同步创建 SPCG 1 级 12 个地图关卡并归类同前缀备用题 |
| `scripts/import-levels.ts` | 05 / 03 | 题目导入改为 PostgreSQL upsert；只校验 `levels/` 目录题目 Markdown；拒绝题面正文混入提示、题解、官方代码段落、裸写样例数据、错误主角称谓和改编题公开样例复刻 |
| `scripts/sync-import-report.ts` | 05 / 06 | incoming 校验报告同步到 PostgreSQL 导入批次表 |
| `scripts/bootstrap-admin.ts` | 06 | 本地用户写入 `admin_roles` |
| `docker-compose.yml` | Deploy | 统一启动 Web、业务 PostgreSQL、Judge0、judge worker；Web/worker 镜像改为 `node:22-alpine`，Judge0 测试点并发默认 4 |
| `infra/judge0/judge0.conf` | Deploy / 04 | Judge0 官方镜像本地配置 |
| `.env.example` | Deploy | 本地 PostgreSQL / NextAuth / Judge0 环境变量 |
| `docs/database-postgres.md` | 03 | PostgreSQL 迁移和导入说明 |
| `docs/deploy-checklist.md` | Deploy | 本地部署和 smoke test 清单 |
| `docs/api/level-api.md` | 02 / 04 | levels、submit、Judge0、段位赛奖励契约说明 |
| `problem-bank/README.md` / `problem-bank/STRUCTURE.md` / `problem-bank/AGENT_BRIEF.md` / `problem-bank/templates/spcg-level-v0.1.md` / `problem-bank/schema/level.schema.json` | 05 | 补充一级 12 关固定规则、备用题 order 归属规则、犬虎命名规则、改编题原公开样例记录、公开样例重写规则，以及 SPCG 1-10 级 × 5 层难度结构 |
| `problem-bank/manim_rule.md` / `lesson/manim_lesson_rule.md` | 05 | 区分题解短片与算法教学长片；新增 MST 模板题 lesson 结构、图算法辅助视图、代码同步和镜头规则 |
| `lesson/mst-template/*` | 05 | 最小生成树模板题教学试制片：分镜、旁白、同步点、ManimCE 脚本、预览图和静音 MP4 草稿 |
| `db/migrations/010_lesson_problem_sets.sql` / `db/migrations/011_lesson_problem_sets_constraints.sql` | 03 / 05 / 06 | 课程题单字段、`levels.teacher_notes`、`lesson_plans` 教案快照表和 lesson 字段约束 |
| `db/migrations/016_curriculum_admin_targets.sql` | 03 / 06 | 导入批次目标 SPCG 级别、目标关卡、默认题目用途；关卡内题目 `displayMode` 约束 |
| `apps/web/lib/repositories/problem-set-repository.ts` / `apps/web/lib/repositories/lesson-plan-repository.ts` | 02 / 03 / 06 | 课程题单、题目列表、教案快照 SQL 与审计日志写入 |
| `apps/web/lib/services/problem-set-service.ts` / `apps/web/lib/services/lesson-plan-service.ts` / `apps/web/lib/services/ai-lesson-plan-client.ts` | 02 / 06 | 课程题单校验、AI 教案 prompt 生成、Markdown 版本保存 |
| `apps/web/app/admin/problem-sets/*` | 06 | 后台课程题单创建、字段编辑、题目维护、AI 教案生成与版本查看 |
| `apps/web/app/admin/curriculum/page.tsx` | 06 | 后台三级题库结构入口：顶部 SPCG 1-10 级筛选、关卡/算法分类管理、题目加入/移出/排序/用途设置 |
| `apps/web/app/admin/curriculum/actions.ts` / `apps/web/lib/services/curriculum-service.ts` / `apps/web/lib/repositories/curriculum-repository.ts` | 06 / 03 | Curriculum 专用题目草稿创建、题目摘要修改、从关卡移出并归档，所有写操作写审计日志 |
| `apps/web/app/admin/components/AdminModal.tsx` | 06 | 后台通用弹窗，用于关卡和题目新增/修改/删除 |
| `apps/web/app/admin/levels/page.tsx` / `apps/web/app/admin/levels/[id]/page.tsx` / `apps/web/app/admin/levels/actions.ts` | 06 / 05 | 题目列表筛选、完整题目编辑、归档优先和安全硬删除 |
| `apps/web/app/admin/imports/*` | 06 / 05 | 导入批次目标关卡选择、单题用途设置、标记 imported 时挂入关卡 |
| `docs/admin-lesson-plans.md` | Docs | 后台课程题单与 AI 教案生成说明 |
| `DOCS_INDEX.md` | Docs | 根目录重要文档索引，补充长片教学演示规则入口 |
| `supabase/README.md` | Legacy | 标记旧 Supabase 目录仅作历史参考，不参与运行 |

## Verification

最近一次验证通过：

```bash
npm run check
npm run reward:check
npm run import-validation:check
npm run web:build
npm run web:typecheck
npm run problem-bank:validate:incoming
DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate
DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run problem-bank:import:incoming
DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run problem-bank:sync-import-batch
npm audit --omit=dev
docker compose config
git diff --check
改编题公开样例复查 -> 37 external adapted files, duplicatePublicSamples=[]
数据库复查 -> levels old terms 0, assessment title SPCG 段位赛, reward item algorithm_tag 段位赛, duplicatePublicSamples=[]
段位赛旧文案复查 -> old ranked labels -> 0 matches in apps/db/docs/assets/problem-bank/PROGRESS
犬虎称谓复查 -> 题库和数据库题目内容旧称谓为 0；旧称谓只保留在导入规则和校验错误文案中
admin user CRUD build check -> npm run check passed
admin user CRUD build check -> npm run web:build passed
test users seed -> toby/raymond/answer/hope active test accounts, bcrypt password check true
curl -sS http://localhost:2358/languages
curl -sS http://localhost:2358/statuses
DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg JUDGE0_BASE_URL=http://localhost:2358 JUDGE0_CPP_LANGUAGE_ID=54 JUDGE0_DISABLE_CGROUPS=true JUDGE0_MIN_MEMORY_LIMIT_KB=512000 npm run judge:worker -- --once
ch1-02 direct Judge0 validation for CE and AC snippets
Headless Chrome login + /level/ch1-01 Submit
Submit fallback grep -> CodeWorkspace no mockJudgeSubmission/buildMockJudgeCases
curl -I http://localhost:3000/level/ch1-02
curl -I http://localhost:3000/map
curl -I 'http://localhost:3000/auth/sign-in?next=%2Flevel%2Fch1-02'
curl -I http://localhost:3000/auth/sign-in
npm run web:dev -- --hostname 0.0.0.0
screen -dmS spcg-web zsh -lc 'cd /Users/BenOu/Documents/Claude/Projects/spcg && npm run web:dev -- --hostname 0.0.0.0'
screen -dmS spcg-judge-worker zsh -lc 'cd /Users/BenOu/Documents/Claude/Projects/spcg && ... npm run judge:worker -- --poll-ms 100'
screen -ls
curl -I http://localhost:3000/auth/sign-in
npm run web:typecheck
npm run web:build
git diff --check
CodeWorkspace submit output expansion
CodeWorkspace editor click collapses expanded output dock
CodeWorkspace localStorage code cache by level id
CodeWorkspace submission history drawer from local PostgreSQL submissions
in-app browser -> http://localhost:3000/ redirects to /auth/sign-in?next=%2F
docker compose ps
docker compose exec -T judge0-redis redis-cli ... LLEN resque:queue:1.13.1
ch1-02 DB queue CE timing after persistent worker
ch1-02 DB queue AC timing after persistent worker
pgrep -fl 'tsx scripts/judge-worker|scripts/judge-worker|judge-worker'
submission f28fe082-0af6-4cd8-81a4-a28cda33fa0f status query
JUDGE_WORKER_AUTOSTART=true wakeJudgeWorker integration test
rg -n -o '[gG][eE][sS][pP]' . --glob '!node_modules' --glob '!apps/web/.next' --glob '!package-lock.json' --glob '!.git'
find . \( -path './node_modules' -o -path './apps/web/.next' -o -path './.git' \) -prune -o -iname '*[gG][eE][sS][pP]*' -print
rg -n "Supabase|supabase|SUPABASE|@supabase|functions\\.invoke|\\.rpc\\(" apps scripts shared docs package.json .env.example
```

当前结果：

```text
npm run check -> passed
npm run problem-bank:validate:incoming -> 41 level files passed
npm audit --omit=dev -> 0 vulnerabilities
docker compose config -> passed
git diff --check -> passed
npm run web:build -> passed after judge response updates
programming task panel expand/collapse layout -> implemented; left panel expands to 50vw and shifts IDE right
programming task expand toggle -> web:typecheck passed
programming task expand toggle -> web:build passed
localhost sign-in route -> 200 after UI update
submit output dock expansion -> implemented with workbench.output-expanded
submit output dock auto-collapse -> Monaco focus/mouse down resets outputExpanded
submission history -> getSubmissionHistoryAction returns current user's latest 20 submissions for the current level
history drawer -> list verdict/status/time/id, preview code, Load historical code into Monaco
editor code cache -> localStorage key spcg:code:<levelId>, survives route changes and returns
history/cache/output update -> web:typecheck passed
history/cache/output update -> web:build passed
output auto-collapse update -> web:typecheck passed
output auto-collapse update -> web:build passed
task header cleanup -> removed Task label and kept Goal as the only statement header
task expand button -> 30% smaller, switches to orange minimize icon when expanded
hints/solution -> collapsed below task content; solution loads only for AC-unlocked levels
task foldout update -> web:typecheck passed
task foldout update -> web:build passed
statement image floating frame -> first statement asset is rendered as a floating IDE overlay
statement image auto-hide -> waits 3000 ms, then slides upward and unmounts
statement markdown images -> hidden in task body when floating preview is used
statement floating frame update -> web:typecheck passed
statement floating frame update -> web:build passed
IDE statement frame -> width 80% of editor shell and floats above Monaco
IDE statement frame ratio -> image uses natural aspect ratio with width 100% of frame
IDE statement frame cache rule -> hidden when cached code for level differs from starter code
IDE statement frame relocation -> web:typecheck passed
IDE statement frame relocation -> web:build passed
IDE statement frame cache rule -> web:typecheck passed
IDE statement frame cache rule -> web:build passed
SPCG exam page -> /exam/spcg-level-1 route added to Next build output
SPCG exam page -> web:typecheck passed
SPCG exam page -> web:build passed
SPCG exam page -> git diff --check passed
unauthenticated /exam/spcg-level-1 -> 307 /auth/sign-in?next=%2Fexam%2Fspcg-level-1
SPCG exam topbar cleanup -> removed conflicting exam-title-badge / camera-preview / image finish button usage
SPCG exam topbar cleanup -> web:typecheck passed
SPCG exam topbar cleanup -> web:build passed
SPCG exam topbar cleanup -> git diff --check passed
SPCG exam topbar CSS redesign -> removed topbar SVG asset references and old SVG buttons
SPCG exam topbar CSS redesign -> question list menu shows index/title/knowledge point
SPCG exam topbar CSS redesign -> web:typecheck passed
SPCG exam topbar CSS redesign -> web:build passed
SPCG exam topbar CSS redesign -> git diff --check passed
SPCG exam compact topbar -> removed left logo and Next Question
SPCG exam compact topbar -> navigation only through question menu
SPCG exam compact topbar -> web:typecheck passed
SPCG exam compact topbar -> web:build passed
SPCG exam compact topbar -> git diff --check passed
statement private sections -> frontend strips duplicated hints/solution/code sections from level.description
problem import statement policy -> rejects markdown body hints/solution/code sections
problem-bank incoming cleanup -> removed duplicated ## 提示 / ## 题解 / ## 参考代码 sections from existing incoming level files
problem-bank incoming private-section search -> 0 matches
problem-bank import validation -> incoming 27 level files passed
problem-bank example validation -> 1 level file passed
statement private-section update -> web:typecheck passed
statement private-section update -> web:build passed
sample display -> public cases render as full Luogu-style input/output code blocks
sample display -> web:typecheck passed
sample display -> web:build passed
sample display -> git diff --check passed
statement markdown samples -> raw sample data after 输入/输出/样例标题 renders as fenced code block
problem import sample fence policy -> rejects new Markdown samples without fenced code block
problem-bank sample fence policy -> templates and structure docs updated
statement markdown sample update -> web:typecheck passed
statement markdown sample update -> web:build passed
statement markdown sample update -> problem-bank:validate passed
statement markdown sample update -> problem-bank:validate:incoming passed
statement markdown sample update -> validate:levels passed
statement markdown sample update -> git diff --check passed
sample judging panel -> restored left/right Input/Expected layout
sample judging panel -> status badge and row color show idle/running/AC/error with icons
sample judging panel -> web:typecheck passed
sample judging panel -> web:build passed
village map route -> 12 mainline level nodes repositioned along the background road
village map route -> exam node moved below the Me/account HUD
village map route -> web:typecheck passed
village map route -> web:build passed
submit history runtime fix -> removed type re-export from level server actions
submit history runtime fix -> CodeWorkspace derives SubmissionHistoryItem from getSubmissionHistoryAction return type
submit history runtime fix -> web:typecheck passed
submit history runtime fix -> web:build passed
submit history runtime fix -> git diff --check passed
ch1-03 Run fix -> mock single cin/cout echo returns stdout 7 newline
ch1-03 Run fix -> mock scanf/printf echo returns stdout 12 newline
ch1-03 Run fix -> public sample judging AC 2/2 for scanf/printf code
ch1-03 Run fix -> npm run judge:check passed
ch1-03 Run fix -> web:typecheck passed
ch1-03 Run fix -> web:build passed
ch1-03 Run fix -> git diff --check passed
solution unlock -> getUnlockedLevelSolutionAction added
solution unlock -> normal programming page updates Solution after AC without page refresh
solution unlock -> exam page updates current question Solution after AC without page refresh
solution unlock -> web:typecheck passed
solution unlock -> web:build passed
旧来源字样搜索 -> 0 matches
旧来源文件名搜索 -> 0 matches
运行代码/docs Supabase 依赖搜索 -> 0 matches
local dev routes: /auth/sign-in, /map, /admin -> 200
Judge0 languages -> OK, C++ id 54 available
Judge0 statuses -> 14 statuses
direct official-code queue -> judge-worker -> Judge0 -> progress -> AC 20/20
frontend Submit action -> submissions -> judge-worker -> Judge0 -> verdict -> WA 0/20
Judge checks -> Judge0 internal error maps to Judge Error
ch1-02 syntax-error snippet -> CE
ch1-02 literal-13 + coins snippet -> AC 20/20
ch1-02 worker submission 44036e5f-a70f-4ef9-8e91-bb25eb05126c -> AC 20/20
frontend Submit mock hidden fallback -> removed
unauthenticated /level/ch1-02 -> 307 /auth/sign-in?next=%2Flevel%2Fch1-02
unauthenticated /map -> 307 /auth/sign-in?next=%2Fmap
sign-in page -> 200
web dev server -> detached screen session spcg-web, localhost:3000 listening on 0.0.0.0, PID 58427
in-app browser -> login page loaded at http://localhost:3000/auth/sign-in?next=%2F
docker compose ps -> spcg-postgres healthy, Judge0 server/db/redis/worker running
local background judge-worker -> detached screen session spcg-judge-worker, poll-ms 100
JUDGE_WORKER_AUTOSTART -> false in apps/web/.env.local, avoids per-submit npm worker startup
JUDGE0_CASE_CONCURRENCY -> default 4 for local first-phase responsiveness
Judge0 Redis queue -> 0 queued jobs after worker restart
pending submissions -> 0
f28fe082-0af6-4cd8-81a4-a28cda33fa0f -> WA 0/20, submitted code was starter code
wakeJudgeWorker integration -> bec6f975-f790-4c9b-bdfa-92081e980306 AC 20/20
ch1-02 CE DB queue -> 43783802-d92a-4854-a553-db2419d15b43 done CE in 4540 ms
ch1-02 AC DB queue -> 82e763f4-b74b-476b-91d7-20a2085d4ff0 done AC 20/20 in 41055 ms
frontend compiler output -> pending changes to judging after worker claims submission
all submissions -> done, pending 0
admin audit smoke -> level.set_status, problem_set.set_status, import_batch.review, user.set_status, user.reset_progress all write admin_audit_logs inside rollback transaction
Judge0 status smoke -> AC/WA/CE/TLE/RE returned correctly from local Judge0
compose judge-worker -> node:22-alpine container running and processed c4077de4-cc65-4e40-b068-4a113eff22af as AC 20/20
problem-bank incoming -> 41 level files validated
problem-bank import -> 41 levels imported into PostgreSQL
problem-bank sync import batch -> incoming-2026-04-28 synced with 41 items
empty DB smoke -> migrations from zero applied, 41 levels imported, seed completed, owner admin bootstrapped, one AC submission judged through Judge0, progress updated, temp DB dropped
level-2 statement images -> generated PNG originals and compressed statement-main.webp for level2-b4357-power-lantern and level2-b4357-power-lantern-s1
problem-bank incoming -> 43 level files validated after image assets landed
problem-bank import -> 43 levels imported into PostgreSQL
problem-bank sync import batch -> incoming-2026-04-28 synced with 43 items
empty DB smoke -> migrations from zero applied, 43 levels imported, seed completed, owner admin bootstrapped, one AC submission judged through Judge0, progress passed=true, temp DB dropped
旧来源字样复查 -> 0 matches after level-2 import cleanup
database level content 旧来源字样复查 -> 0 matches
npm run check -> passed after cleanup
npm run web:build -> passed after cleanup
SPCG difficulty reward check -> 1级1层=1 coin, 2级5层=10 coins, 10级5层=50 coins
SPCG difficulty import failure check -> spcgLevel 0/11, missing levelLabel, mismatched levelLabel, stars 6 all rejected
SPCG difficulty migration -> 009_difficulty_level_label.sql applied to local PostgreSQL
SPCG difficulty DB check -> 46 total, 46 with levelLabel, min level 1, max level 9, max stars 5, label mismatch 0
SPCG difficulty problem-bank -> 46 incoming level files validated and imported
SPCG difficulty import batch -> incoming-2026-04-29 synced with 46 items
SPCG difficulty worker reward smoke -> level2-b4357-power-lantern AC 20/20, coin_delta 6, metadata spcgLevel=2 stars=3 difficultyCoefficient=6
npm run check -> passed after SPCG difficulty update
npm run web:build -> passed after SPCG difficulty update
MST lesson render -> python3 -m py_compile lesson/mst-template/lesson_scene.py passed
MST lesson render -> python3 -m manim -qm lesson/mst-template/lesson_scene.py MSTTemplateLesson --media_dir lesson/mst-template/media passed
MST lesson output -> lesson/mst-template/lesson-mst-template-draft.mp4, 720p30, 00:03:37.83, 9.5M
lesson plans -> npm run typecheck passed
lesson plans -> npm run check:architecture passed
lesson plans -> npm run web:typecheck passed
lesson plans -> npm run check passed
lesson plans -> npm run web:build passed
lesson plans -> npm run problem-bank:validate:incoming passed, 53 level files
lesson plans -> problem package dry-run passed for 8 level-6 packages with statement_teacher.md
lesson plans -> local db:migrate applied 010_lesson_problem_sets.sql and 011_lesson_problem_sets_constraints.sql
lesson plans -> DB smoke confirmed lesson missing fields rejected and active duplicate SPCG/stage/track rejected
lesson plans -> ch1-v2 package dry-run remains blocked by existing package-local solutionVideo paths, unrelated to teacher_notes import
ch1-04 Run fix -> mock C++ executor now infers assigned numeric variables like `int s1 = h1 * 60 + m1`
ch1-04 Run fix -> provided code outputs 35 for input 6/45/7/20
ch1-04 Run fix -> public samples AC 3/3 in `npm run judge:check`
ch1-04 Run fix -> npm run typecheck passed
ch1-04 Run fix -> npm run web:typecheck passed
ch1-04 Run fix -> npm run web:build passed
ch1-04 Run fix -> git diff --check passed
ch1-06 Run if/else fix -> root cause confirmed: frontend Run mock collected both `if` and `else` branch outputs
ch1-06 Run if/else fix -> mock C++ executor now evaluates simple `if / else` conditions before collecting `cout` / `printf`
ch1-06 Run if/else fix -> user snippet with input 60 now returns `Umbrella`, not `UmbrellaReady`
ch1-06 Run if/else fix -> official code returns `Ready\\nUmbrella\\n`; user snippet remains WA against problem statement because it omits fixed first-line `Ready`
ch1-06 compiler check -> local clang++ outputs `Umbrella`; Judge0 C++ id 54 / GCC 9.2.0 outputs `Umbrella`
ch1-06 Run if/else fix -> npm run judge:check passed
ch1-06 Run if/else fix -> npm run typecheck passed
docker compose config -> passed final
docker compose ps -> spcg-postgres healthy, Judge0 server/db/redis/worker up, spcg judge-worker up
final route guard -> /auth/sign-in 200, /map 307 sign-in, /admin 307 sign-in
git diff --check -> passed final
level-one mainline rule -> database has 43 levels, but ch1 visible mainline candidates are exactly ch1-01..ch1-12
level-one mainline rule -> ch1-mainline problem_set_items count is 12 after db:seed
reserve problems -> ch1 reserve levels count 28, kept out of mainline display
level-one mainline rule -> npm run web:typecheck passed
level-one mainline rule -> npm run check passed
level-one mainline rule -> npm run web:build passed
level-one mainline rule -> git diff --check passed
旧来源字样复查 -> 0 matches after mainline rule update
test page typography -> removed bold appearance on `/test` page controls and progress labels; normal font weight enforced in scoped CSS
test page typography -> npm run web:build passed
test page typography -> npm run web:typecheck passed
programming image preview -> IDE image now waits 4s, then slides left toward the task panel while shrinking and fading
programming image preview -> editor focus still collapses output, but no longer dismisses the image before the timed attention guide
programming image preview -> npm run web:typecheck passed
programming image preview -> npm run web:build passed
debug dock manual resize -> added independent up/down toggle inside IDE debug area; maximized mode uses 50% workbench height without changing Run/Submit expansion logic
debug dock manual resize -> npm run web:typecheck passed
debug dock manual resize -> npm run web:build passed
debug dock toggle placement -> moved resize toggle into the AC/WA/Test Results title row and removed extra right-side padding reservation
debug dock toggle placement -> npm run web:typecheck passed
debug dock toggle placement -> npm run web:build passed
compiler error display -> CE/RE/Judge Error detail block now expands up to 30 lines before scrolling instead of being capped to a small 64px area
global typography weight -> maps, levels, programming pages, admin, test, and profile pages now force non-button text to normal font weight while preserving button font weights
MiniMax error analysis -> added `submission_error_analyses` table linked to submissions for persisted AI explanations of CE/WA/RE/TLE/Judge Error submissions
MiniMax error analysis -> server action now reads code/verdict/level from database by submissionId; frontend no longer sends code/verdict to AI analysis
MiniMax error analysis -> programming page and history panel show AI analysis buttons for non-AC submitted code; Run-only errors instruct users to Submit first
MiniMax error analysis -> npm run db:migrate passed with DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg
MiniMax error analysis -> npm run web:typecheck, npm run typecheck, npm run check:architecture, npm run web:build passed
MiniMax settings -> added `system_settings` table for runtime configuration with encrypted stored API key and redacted admin audit logs
MiniMax settings -> added `/admin/settings` for admin-level MiniMax enabled/baseUrl/model/timeout/API key management
MiniMax settings -> switched default code-help API to Anthropic-compatible Coding Plan endpoint `https://api.minimaxi.com/anthropic/v1/messages`, model `MiniMax-M2.7`
MiniMax settings -> `DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate` applied `013_system_settings.sql`
MiniMax settings -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run check`, `npm run web:build`, `docker compose config` passed
Admin submissions -> added `/admin/submissions` for recent student submission review across all levels
Admin submissions -> user detail now shows that student's recent submissions with code viewer and saved/generatable AI analysis
Admin submissions -> level detail now shows recent submissions for that problem; problem-set items link into level detail
Admin submissions -> admin AI analysis uses the same persisted `submission_error_analyses` table and reads code/verdict/level from DB by submissionId
Admin submissions -> local DB currently has 63 submissions, 41 non-AC, 0 active pending/judging
Admin submissions -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run check`, `npm run web:build` passed
Admin AI analysis once -> added DB migration `014_submission_error_analysis_once.sql` so each non-AC submission can have only one MiniMax analysis per provider
Admin AI analysis once -> backend now returns the saved analysis by submissionId before calling MiniMax, preventing repeat generation even if model/prompt changes
Admin AI analysis once -> admin submission table shows `已分析` for analyzed WA/CE/RE/TLE/Judge Error rows instead of another generate button
Admin AI analysis once -> local DB migration applied; `submission_error_analyses_once_idx` exists and duplicate analysis count is 0
Admin AI analysis once -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run check`, `npm run web:build` passed
Admin level detail -> `/admin/levels/level9-bfs-03-beacon-wave` now shows explicit AI Analysis status for recent submissions; local DB has 5 submissions for this level, 4 non-AC pending analysis
Admin level detail -> Statement Preview now renders Markdown with `StatementMarkdown` instead of showing raw markdown source
Admin level detail -> added dark admin-specific Markdown preview styles for headings, inline code, fenced sample blocks, links, and KaTeX
Admin level detail -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run web:build` passed
Admin AI button visibility -> moved AI analysis action into the selected submission detail header so admins can trigger analysis even when the table actions column is offscreen
Admin AI button visibility -> admin submission tables now allow horizontal scroll and keep the actions column available for wide level/user pages
Admin AI button visibility -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run web:build` passed
Admin submission switching -> recent submissions rows are now directly selectable with active highlighting, so older submissions can switch the code detail panel
Admin submission switching -> code detail panel keeps the AI analysis action visible and submission code no longer has a vertical max-height limit
Admin submission switching -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run web:build` passed
AI analysis format -> upgraded error-analysis prompt to v2 with strict Simplified Chinese JSON output and no Markdown/code-fence response
AI analysis format -> added `whereWrong` and `reasonList` fields so generated analysis first highlights the exact mistake, then lists causes
AI analysis format -> student and admin analysis panels now render `错在哪里`, `原因分析`, `定位提示`, `下一步`, and `知识点` as structured sections/lists
AI analysis format -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run web:build` passed
System bug reports -> added `system_bugs` table for logged-in user bug reports with URL, description, current IDE code context, browser context, status, and admin notes
System bug reports -> added global left-bottom Bug Report widget, root layout switch, and CodeWorkspace current IDE context exposure
System bug reports -> added `/admin/settings` Bug Report Debug Tool switch; default is enabled, disabled state hides UI and blocks server writes
System bug reports -> added `/admin/system-bugs` list and `/admin/system-bugs/[id]` detail page with status/admin note updates and audit logs
System bug reports -> `DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg npm run db:migrate` applied `015_system_bugs.sql`; local table exists with 0 records
System bug reports -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run check`, `npm run web:build` passed
Judge progress display -> started IDE debug area real-time test progress; added `judge_progress` migration and shared `JudgeProgress` type
Judge progress display -> Judge0 worker now writes queued/running/completed snapshots without disabling batch/parallel execution
Judge progress display -> frontend polling now shows `Test Case 1 / 20` or `Test Cases 2-20 Completed n/20`
Judge progress display -> Run public samples now execute through a two-sample loop so the debug area can show `Public Sample 1 / 2`
Judge progress display -> `npm run web:typecheck`, `npm run typecheck`, `npm run check:architecture`, `npm run check`, `npm run web:build`, `git diff --check` passed
Judge progress display -> local `db:migrate` and real Submit E2E blocked because Docker daemon/PostgreSQL are not running (`localhost:5432` connection refused)
Judge progress display fix -> actual Web DB uses `apps/web/.env.local` port `127.0.0.1:15432`; applied `022_submission_judge_progress.sql` there and confirmed `submissions.judge_progress JSONB` exists
Judge progress display fix -> `npm run web:typecheck` passed after migration confirmation
SPCG 2 ranked match -> added shared ranked assessment rule source at `shared/ranked-assessment.ts` and tracked human-readable rule doc at `RANKED_ASSESSMENT_RULES.md`
SPCG 2 ranked match -> added `/exam/spcg-level-2`; `ExamLevel` now accepts `spcgLevel` and uses the same daily 6-problem generation rule as level 1
SPCG 2 ranked match -> map exam node is now level-aware: SPCG 1 links to `/exam/spcg-level-1`, SPCG 2 links to `/exam/spcg-level-2`
SPCG 2 ranked match -> verified local DB has enough SPCG 2 candidates: 12 basic, 12 variant, at least 3 exam-only; unauthenticated `/exam/spcg-level-2` redirects to sign-in
SPCG 2 ranked match -> `npm run web:typecheck`, `npm run typecheck`, `npm run check`, `npm run web:build`, `git diff --check` passed
Programming task header -> shrank the task panel `Goal` pill and expand button to about 70%, moved the header row upward, and increased title spacing below it
Programming task header -> restored `Goal` pill and expand button to original size; moved the problem title into the same top row immediately after `Goal`
Programming task header -> moved the difficulty/meta tag row down by 5px to avoid overlap with the sticky title row
SPCG 3 ranked match -> enabled SPCG 3 in `shared/ranked-assessment.ts` and added `/exam/spcg-level-3` using the same daily 6-problem ranked assessment rule as SPCG 1-2
SPCG 3 ranked match -> updated `RANKED_ASSESSMENT_RULES.md`; the persistent rule source remains `shared/ranked-assessment.ts`, with the root markdown file as the human-readable rule record
SPCG 3 ranked match -> verified local DB candidate pool before enabling: 12 lesson basic, 12 lesson variant, 6 exam-only candidates for SPCG 3
SPCG 3 ranked match -> `npm run web:typecheck`, `npm run typecheck`, `npm run check`, `npm run web:build` passed; production route table includes `/exam/spcg-level-3`
```

Docker / DB 当前状态：

```text
spcg-postgres -> running, healthy, localhost:5432
levels -> 46
problem_sets -> 1
level_import_items -> 107
latest import batch -> incoming-2026-04-29, 46 valid items
local admin -> admin-local@spcg.local / spcg-local-admin
test users -> toby@spcg.local, raymond@spcg.local, answer@spcg.local, hope@spcg.local / Abcd@1234
Judge0 -> running, localhost:2358/languages OK
last real AC submission -> 1591e059-9996-42ba-b0bf-1dcb57a7c19d
last frontend Submit submission -> d0b60a39-6306-4f63-a7dd-835b392dd7d9
progress for admin-local@spcg.local/ch1-01 -> passed=true, attempt_count=5, best_runtime_ms=41
reward smoke -> toby@spcg.local / level2-b4357-power-lantern / coin_delta=6 / coefficient=6
```

## Next Actions

1. 完成 1-3级 A 线主线题单和题目质量验收：每关 5 题，前 3 题必做，官方代码通过全部测试点
2. 实现学生当前关卡访问控制：学生默认从 1级第1关开始，完成前 3 题后推进，未来关卡 URL 需服务端拦截
3. 实现老师后台设置学生当前关卡：老师可自由预览任意级别关卡，并可为自己学生设置当前关卡
4. 完成阿里云 Web 部署和正式网址 smoke test：连接云端 PostgreSQL、Judge0 和 judge-worker，验证登录、地图、IDE、Submit、Me 页、老师后台
5. 继续按 v0.2 闭环验证奖励与成长：金币、段位、修错奖励、待修错题、做过题目和老师完成矩阵

## Product Roadmap Priority

后续产品路线按依赖顺序推进：v0.2 优先做学生体验闭环；然后固定课程和叙事底座，再做地图、成长、考试、教练，最后做证书、商城和 AI 分析。

1. v0.2 学生体验闭环：每关 5 题、前 3 题主线通关、WA 修错、AC 成长反馈、老师干预
2. 所有算法关卡固定
3. 关卡 A/B 线设计：A 线简单主线，B 线挑战拔高
4. 故事小说确定，角色人物定位生成
5. 支持导入角色、剧情的编程设计：主线固定，分支可扩展
6. 九大关卡地图
7. 健康游戏化投入系统与防沉迷设计
8. 段位升级系统、考试机制
9. 称谓系统
10. 教练系统
11. 防抄袭 AI 监控与代码行为分析
12. IP 信息、用户行为数据库等基础采集
13. 三大高校与登记证书设计
14. 积分商城
15. AI 用户学习标签系统

路线记录：

- 健康游戏化系统不以“沉迷”为目标，优先提升学习质量，并设置时间提醒、休息提醒和未成年人保护边界。
- 后续实施健康投入系统时，先做 5 个最小闭环：今日学习目标、修错奖励、A/B 线推荐、`/me` 成长反馈、30/60 分钟健康提醒。
- AI 标签不建议自动推断男女、智力、EQ 等敏感或不可靠标签；优先改成学习行为标签，例如：循环薄弱、递归强、调试慢、审题快、考试稳定。
- 证书必须排在考试机制和防抄袭之后，否则公信力不足。
- 商城必须排在金币、蒜粒、段位、称谓稳定之后，否则容易破坏经济平衡。
