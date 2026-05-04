# Supabase Edge Functions

## submit-code

`submit-code` 是前端提交 C++ 代码的唯一入口。

开发期默认使用 mock 判题：

```text
JUDGE0_MODE=mock
```

接入 Judge0 后使用：

```text
JUDGE0_MODE=judge0
JUDGE0_KEY=...
JUDGE0_HOST=judge0-ce.p.rapidapi.com
```

必需 Supabase 环境变量：

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

前端调用示例见：

```text
docs/api/level-api.md
```
