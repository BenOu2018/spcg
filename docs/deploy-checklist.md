# SPCG v0.1 Local Deploy Checklist

## 1. Start Stack

```bash
docker compose up -d spcg-postgres judge0-db judge0-redis judge0-server judge0-worker
npm run db:migrate
```

本地开发也可以直接运行：

```bash
docker compose up
```

Compose 会启动 Web、业务 PostgreSQL、Judge0 官方服务组和 SPCG 判题 worker。

## 2. Environment

Web / worker 使用：

```text
DATABASE_URL
DATABASE_POOL_MAX
AUTH_SECRET
AUTH_URL
NEXTAUTH_URL
SUBMISSION_RATE_LIMIT_SECONDS
REWARD_SALT
JUDGE0_BASE_URL
JUDGE0_AUTH_TOKEN
SPCG_DEFAULT_LANGUAGE
SPCG_DEFAULT_CPP_STANDARD
JUDGE0_C_LANGUAGE_ID
JUDGE0_CPP_LANGUAGE_ID
JUDGE0_PYTHON3_LANGUAGE_ID
JUDGE0_DISABLE_CGROUPS
JUDGE0_MIN_MEMORY_LIMIT_KB
JUDGE_WORKER_CONCURRENCY
```

本地默认：

```text
DATABASE_URL=postgres://spcg:spcg@localhost:5432/spcg
DATABASE_POOL_MAX=10
SUBMISSION_RATE_LIMIT_SECONDS=3
REWARD_SALT=change-me-reward-salt
JUDGE0_BASE_URL=http://localhost:2358
SPCG_DEFAULT_LANGUAGE=auto
SPCG_DEFAULT_CPP_STANDARD=c++14
JUDGE0_C_LANGUAGE_ID=50
JUDGE0_CPP_LANGUAGE_ID=54
JUDGE0_PYTHON3_LANGUAGE_ID=71
JUDGE0_CASE_CONCURRENCY=4
JUDGE0_DISABLE_CGROUPS=true
JUDGE0_MIN_MEMORY_LIMIT_KB=512000
JUDGE_WORKER_CONCURRENCY=1
```

For Docker Desktop on Mac, keep `JUDGE0_DISABLE_CGROUPS=true` and `JUDGE0_MIN_MEMORY_LIMIT_KB=512000`; the official Judge0 CE image otherwise expects cgroup behavior that may not be available in the local VM. For production Linux, verify a real `submit -> judge-worker -> Judge0 -> progress` run before changing these values.

SPCG 编辑器默认 `Auto · C++14 first`，支持 C、C++11/14/17/20/23、Python3。判题只使用解析出的单一语言；语言选错返回 CE，不做 fallback。

## 3. Capacity Defaults

1000 人目标优先指同时在线浏览、做题和间歇提交。生产环境建议：

- Web 可水平扩容为多实例；每个实例用 `DATABASE_POOL_MAX=10` 起步，根据 Postgres 连接上限和实例数调整。
- 提交入口保留 `SUBMISSION_RATE_LIMIT_SECONDS=3`，避免课堂场景中重复点击把判题队列打满。
- `judge-worker` 可以启动多个容器实例；单实例内用 `JUDGE_WORKER_CONCURRENCY` 控制同时处理的 submission 数。
- `JUDGE0_CASE_CONCURRENCY` 控制单次提交内部测试点并发，本地默认 4；如果 Mac Docker 资源吃紧，可以降到 1。
- 静态资源生产环境建议放 CDN 或对象存储，避免 Web 实例承担大量图片流量。

待办记录：

- 对 Judge0 做压测，记录单台机器每分钟稳定处理的提交数、P95 等待时间和失败率。
- 必要时将 Judge0 独立部署到更强 Linux 主机或多机池。

## 4. Content

```bash
npm run problem-bank:validate:incoming
npm run problem-bank:import:incoming
npm run db:seed
```

如需后台审核导入批次：

```bash
npm run problem-bank:sync-import-batch
```

## 5. Admin Bootstrap

先通过 `/auth/sign-up` 创建管理员账号，再执行：

```bash
npm run admin:bootstrap -- --email admin@example.com --role owner --display-name "SPCG Owner"
```

确认 `/auth/sign-in` 登录后可访问 `/admin`，并且 `SPCG_ADMIN_PREVIEW=false`。

## 6. Web Build

```bash
npm run check
npm run web:build
npm audit --omit=dev
```

## 7. Smoke Test

```text
/auth/sign-up
/auth/sign-in
/
/map
/level/ch1-01
/admin
/admin/users
/admin/imports
/api/mobile/levels
/api/mobile/me/progress
/api/mobile/admin/judge-queue
```

提交代码时：

- Web 创建 `submissions(status='pending')`
- `judge-worker` 领取 pending submission
- worker 调用本地 Judge0
- worker 写回 verdict 并更新 `progress`

移动端/外部端 API 当前与 Web 共用登录 session 和 service 层；未来需要 App 原生 token 时，只替换 API 鉴权层，不改核心 service。
