#!/usr/bin/env python3
from __future__ import annotations

import math
import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "problem-bank/packages/ch8-shadow-network-hub"
MOD = 1_000_000_007


def ensure_new_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def cpp_base() -> str:
    return """#include <iostream>
#include <vector>
#include <array>
#include <algorithm>
#include <numeric>
#include <map>
#include <utility>
#include <cstdlib>
using namespace std;
using ll = long long;
const ll MOD = 1000000007LL;
"""


def integer_answer_validator() -> str:
    return """#!/usr/bin/env python3
import re
import sys

text = sys.stdin.read()
if not text.endswith("\\n"):
    raise SystemExit("answer must end with a newline")
tokens = text.strip().split()
if not tokens:
    raise SystemExit("answer must not be empty")
for token in tokens:
    if not re.fullmatch(r"-?\\d+", token):
        raise SystemExit("answer tokens must be integers")
"""


def output_validator_readme() -> str:
    return "Default token comparison is used.\n"


def lesson(index: int) -> tuple[str, str, bool, str, int, str]:
    roles = [
        ("template", "template", True, "模板题 / 引导题", 2, "基础"),
        ("basic", "basic", True, "基础练习 1", 3, "提高"),
        ("variant", "variant", True, "基础练习 2 / 变式题", 3, "提高"),
        ("advanced", "advanced", False, "提高题 1", 4, "挑战"),
        ("challenge", "challenge", False, "提高题 2 / 挑战题", 4, "挑战"),
        ("advanced", "advanced", False, "提高题 3", 4, "挑战"),
        ("challenge", "challenge", False, "提高题 4", 5, "综合"),
        ("challenge", "challenge", False, "提高题 5 / 挑战题", 5, "综合"),
    ]
    return roles[index - 1]


def yaml_list(items: list[str], indent: int = 4) -> str:
    pad = " " * indent
    return "\n".join(f"{pad}- {item}" for item in items)


def sample_blocks(samples: list[tuple[str, str]], zh: bool) -> str:
    blocks = []
    for i, (inp, out) in enumerate(samples, 1):
        if zh:
            blocks.append(f"""### 样例 {i}

输入：

```text
{inp.rstrip()}
```

输出：

```text
{out.rstrip()}
```""")
        else:
            blocks.append(f"""### Sample {i}

Input:

```text
{inp.rstrip()}
```

Output:

```text
{out.rstrip()}
```""")
    return "\n\n".join(blocks)


def common_meta(problem: dict) -> str:
    index = problem["index"]
    display, role, required, label, stars, diff_label = lesson(index)
    algorithms = "\n".join(
        f"""    - id: {a['id']}
      name: {a['name']}
      family: {a['family']}
      role: {a['role']}
      note: '{a['note']}'"""
        for a in problem["algorithms"]
    )
    hints = "\n".join(
        f"""    - order: {i}
      title: '{h[0]}'
      content: '{h[1]}'"""
        for i, h in enumerate(problem["hints"], 1)
    )
    return f"""schemaVersion: spcg-problem-package-v1.1
problem_format_version: 2025-09
id: "{problem['id']}"
type: pass-fail
name:
  zh: "{problem['title_zh']}"
  en: "{problem['title_en']}"
credits:
  authors:
    - SPCG Team
  reviewers: []
  illustrator: null
  videoAuthor: null
  voiceArtist: null
license: SPCG-internal
changelog:
  - date: 2026-05-11
    author: Codex
    changes:
      - "按 SPCG 八级第 2 关加法原理要求生成题包，补齐中英文说明、算法标记和算法逻辑图"

limits:
  time_limit: {problem['time_limit']}
  memory_mib: 256

validation:
  input: input_validators/validate.py
  answer: answer_validators/validate.py
  output: default

spcg:
  chapterId: ch8-shadow-network-hub
  order: {805 + index}
  parentOrder: 2
  stageItemIndex: {index}
  mapVisible: false
  defaultDisplayMode: {display}
  lessonSlot:
    index: {index}
    role: {role}
    required: {str(required).lower()}
    label: "{label}"
  difficulty:
    spcgLevel: 8
    levelLabel: SPCG 8级
    stars: {stars}
    label: {diff_label}
    lglevel: null
  knowledgePoint: '{problem['knowledge']}'
  algorithmFamily: {problem['family']}
  algorithms:
{algorithms}
  qualityGates:
    scale:
      dimensions:
{yaml_list(problem['scale_dimensions'], 8)}
      minimumRatio: {problem.get('scale_ratio', 0.8)}
      minimumCases: 1
    stateCoverage: null
  transitionSkill: '{problem['transition']}'
  defaultLanguage: cpp14
  officialCodeLanguage: cpp14
  starterCode: |
    #include <iostream>
    using namespace std;

    int main() {{
        ios::sync_with_stdio(false);
        cin.tie(nullptr);

        return 0;
    }}
  hints:
{hints}
  story:
    region: null
    guardianId: null
    summary: "第 8 级第 2 关加法原理训练。"
  assets:
    statementMain: null
    originalImage: null
    alt: null
    caption: "本轮按题包要求不生成题目图片。"
  algorithmGraphs:
    - id: main
      title: {problem['graph_title']}
      path: algorithm_graphs/main.yaml
      visibility: always
  solutionVideo: null
  narrationAudio: null
  narrationSubtitles: null
  externalPracticeLinks: []
  sourcePolicy:
    type: {problem['source_type']}
    references:
      - "problem-bank/ADAPTED_SOURCE_INDEX.md"
    notes: "如有外部参考，具体来源统一维护在 ADAPTED_SOURCE_INDEX.md，题包内不重复记录外部题目。"
"""


def common_generators(problem: dict, outputs: list[str]) -> str:
    out_text = "\n".join(f"      - {item}" for item in outputs)
    alternatives = "\n".join(f"    - \"{item}\"" for item in problem["alternatives"])
    groups = "\n".join(f"    - {item}" for item in problem["separating_groups"])
    return f"""generators:
  - name: static-curated-data
    command: python3 generators/gen.py
    outputs:
{out_text}
    note: {problem['id']} uses curated deterministic data for SPCG level 8 stage 2.
algorithmNecessity:
  target: '{problem['necessity_target']}'
  lowerLevelAlternatives:
{alternatives}
  separatingGroups:
{groups}
"""


def common_ai_log(problem: dict) -> str:
    return f"""# AI 生成与人工修改记录

## 生成记录

- 生成日期：2026-05-11
- 生成工具：Codex
- 生成提示摘要：按提高规则生成 SPCG 8级第 2 关题包，强调加法原理、题目隔离、判题覆盖和知识点标记。
- 参考大纲：`problem-bank/GAME_LEVEL_PLAN_LEVELS_1_8.md` 的 `L8-02 两路计数`
- 外部练习链接：如有参考，统一记录于 `problem-bank/ADAPTED_SOURCE_INDEX.md`

## 人工修改记录

| 时间 | 修改人 | 修改内容 | 原因 |
| --- | --- | --- | --- |
| 2026-05-11 | Codex | 初始化题包、数据、题解、错解和算法逻辑图 | 建设第 8 级第 2 关题包 |

## 审核记录

- 题面审核：已按 LaTeX、变量说明和多条件对齐要求生成。
- 数据审核：已生成 $3$ 个 public 与 $17$ 个 hidden 测试点。
- 官方解审核：官方代码由题包校验运行。
- 错解/对拍审核：已提供独立 `brute.cpp` 与至少 $2$ 个 `wrong_answer`。
- 题目隔离：本题只读取自身输入，不依赖其他题包数据、全局文件或跨题共享状态。

## 来源声明

{problem['source_note']}
"""


def common_readme(problem: dict) -> str:
    _, _, _, label, _, _ = lesson(problem["index"])
    return f"""# {problem['id']} {problem['title_zh']}

- 题包版本：spcg-problem-package-v1.1
- 关卡：SPCG 8级第 2 关
- 题位：{label}
- 核心知识点：{problem['knowledge']}
- 包含中文与英文题面、教师说明、题解
- 包含算法逻辑图：`algorithm_graphs/main.yaml`

## 文件说明

- `statement.md` / `statement.en.md`：学生题面
- `statement_teacher.md` / `statement_teacher.en.md`：教师说明
- `solution.md` / `solution.en.md`：官方题解
- `data/`：20 个测试点
- `submissions/accepted/official.cpp`：官方程序
- `submissions/accepted/brute.cpp`：独立校验程序
- `submissions/wrong_answer/`：针对性错解
- `algorithm_graphs/main.yaml`：画板可加载的标准逻辑图
"""


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def graph_yaml(title: str, description: str, nodes: list[tuple[str, str, int, int]], edges: list[tuple[str, str, str]]) -> str:
    node_text = "\n".join(
        f"""  - id: {node_id}
    label: {yaml_quote(label)}
    x: {x}
    y: {y}"""
        for node_id, label, x, y in nodes
    )
    edge_text = "\n".join(
        f"""  - from: {a}
    to: {b}
    label: {yaml_quote(label)}
    directed: true"""
        for a, b, label in edges
    )
    return f"""id: main
title: {title}
kind: dag
layout: manual
description: {yaml_quote(description)}
nodes:
{node_text}
edges:
{edge_text}
"""


def manifest(cases: list[dict]) -> str:
    lines = ["cases:"]
    for c in cases:
        lines.extend(
            [
                f'  - id: "{c["id"]}"',
                f"    visibility: {c['visibility']}",
                f"    group: {c['group']}",
            ]
        )
        if c.get("storage"):
            lines.append(f"    storage: {c['storage']}")
        lines.append(f"    purpose: {c['purpose']}")
    return "\n".join(lines) + "\n"


def submissions_yaml(wrong: dict[str, list[str]]) -> str:
    lines = [
        "accepted:",
        "  - submissions/accepted/official.cpp",
        "  - submissions/accepted/brute.cpp",
        "wrong_answer:",
    ]
    for name, targets in wrong.items():
        lines.extend(
            [
                f"  {name}:",
                "    language: cpp14",
                "    expected: wrong_answer",
                "    targets:",
            ]
        )
        lines.extend(f"      - {target}" for target in targets)
    lines.extend(["time_limit_exceeded: []", "run_time_error: []"])
    return "\n".join(lines) + "\n"


def write_package(problem: dict, cases: list[dict]) -> None:
    package_dir = BASE / problem["slug"]
    ensure_new_dir(package_dir)
    for sub in [
        "data/public",
        "data/hidden",
        "submissions/accepted",
        "submissions/wrong_answer",
        "input_validators",
        "answer_validators",
        "output_validator",
        "generators",
        "algorithm_graphs",
    ]:
        (package_dir / sub).mkdir(parents=True, exist_ok=True)

    outputs = []
    samples = []
    for c in cases:
        folder = "public" if c["visibility"] == "public" else "hidden"
        in_rel = f"data/{folder}/{c['id']}.in"
        ans_rel = f"data/{folder}/{c['id']}.ans"
        write(package_dir / in_rel, c["input"])
        write(package_dir / ans_rel, c["answer"])
        outputs.extend([in_rel, ans_rel])
        if c["visibility"] == "public":
            samples.append((c["input"], c["answer"]))

    write(package_dir / "meta.yaml", common_meta(problem))
    write(package_dir / "problem.yaml", "# AUTO-GENERATED, DO NOT EDIT.\n# Generated from meta.yaml by scripts/generate_ch08_02_packages.py.\n\n" + common_meta(problem))
    write(package_dir / "data/testdata.yaml", manifest(cases))
    write(package_dir / "generators/generators.yaml", common_generators(problem, outputs))
    write(package_dir / "generators/gen.py", "#!/usr/bin/env python3\nprint('static curated data is generated by scripts/generate_ch08_02_packages.py')\n")
    write(package_dir / "README.md", common_readme(problem))
    write(package_dir / "ai_log.md", common_ai_log(problem))
    write(package_dir / "story.md", "本题为第 8 级第 2 关计数训练，题面独立阅读，不依赖其他题目。\n")
    write(package_dir / "statement.md", problem["statement_zh"](samples))
    write(package_dir / "statement.en.md", problem["statement_en"](samples))
    write(package_dir / "statement_teacher.md", problem["teacher_zh"])
    write(package_dir / "statement_teacher.en.md", problem["teacher_en"])
    write(package_dir / "solution.md", problem["solution_zh"])
    write(package_dir / "solution.en.md", problem["solution_en"])
    write(package_dir / "algorithm_graphs/main.yaml", problem["graph"])
    write(package_dir / "submissions/accepted/official.cpp", problem["official"])
    write(package_dir / "submissions/accepted/brute.cpp", problem["brute"])
    for name, code in problem["wrong_codes"].items():
        write(package_dir / f"submissions/wrong_answer/{name}", code)
    write(package_dir / "submissions/submissions.yaml", submissions_yaml(problem["wrong_targets"]))
    write(package_dir / "input_validators/validate.py", problem["validator"])
    write(package_dir / "answer_validators/validate.py", integer_answer_validator())
    write(package_dir / "output_validator/README.md", output_validator_readme())


def p1_solve(inp: str) -> str:
    it = inp.strip().split()
    n, m = map(int, it[:2])
    grid = it[2:2 + n]
    dp = [[[0] * 4 for _ in range(m)] for _ in range(n)]
    if grid[0][0] != "#":
        dp[0][0][0] = 1
    key = {"A": 1, "B": 2, "C": 3}
    for i in range(n):
        for j in range(m):
            if grid[i][j] == "#":
                continue
            if i == 0 and j == 0:
                continue
            for pi, pj in ((i - 1, j), (i, j - 1)):
                if pi < 0 or pj < 0:
                    continue
                for s in range(4):
                    ns = s
                    if s == 0 and grid[i][j] in key:
                        ns = key[grid[i][j]]
                    dp[i][j][ns] = (dp[i][j][ns] + dp[pi][pj][s]) % MOD
    ans = dp[n - 1][m - 1][1:4]
    return f"{ans[0]} {ans[1]} {ans[2]} {sum(ans) % MOD}\n"


def p1_case(n: int, m: int, rows: list[str], cid: str, visibility: str, group: str, purpose: str) -> dict:
    inp = f"{n} {m}\n" + "\n".join(rows) + "\n"
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p1_solve(inp)}


def random_grid(n: int, m: int, seed: int, obstacle_mod: int, key_mod: int) -> list[str]:
    rng = random.Random(seed)
    rows = []
    keys = "ABC"
    for i in range(n):
        row = []
        for j in range(m):
            if (i, j) in [(0, 0), (n - 1, m - 1)]:
                row.append(".")
            else:
                r = rng.randrange(100)
                if r < obstacle_mod:
                    row.append("#")
                elif r < obstacle_mod + key_mod:
                    row.append(keys[rng.randrange(3)])
                else:
                    row.append(".")
        rows.append("".join(row))
    return rows


def p2_solve(inp: str) -> str:
    n, p, a, b, c = map(int, inp.strip().split())
    def run(start_weight: int) -> int:
        if p == 1:
            return 0
        digit, other = 0, start_weight % MOD
        for i in range(2, n + 1):
            if i == p:
                digit, other = other * c % MOD, 0
            else:
                digit, other = other * c % MOD, (digit + other) * (a + b) % MOD
        return (digit + other) % MOD
    x = run(a)
    y = run(b)
    return f"{x} {y} {(x + y) % MOD}\n"


def p2_case(vals: tuple[int, int, int, int, int], cid: str, visibility: str, group: str, purpose: str) -> dict:
    inp = "{} {} {} {} {}\n".format(*vals)
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p2_solve(inp)}


def p3_solve(inp: str) -> str:
    data = list(map(int, inp.strip().split()))
    ptr = 0
    n, k, s = data[ptr], data[ptr + 1], data[ptr + 2]
    ptr += 3
    limit_b, limit_e = s, k - s
    rest = data[ptr:ptr + n]
    ptr += n
    g = [[] for _ in range(n)]
    for _ in range(n - 1):
        u, v = data[ptr] - 1, data[ptr + 1] - 1
        ptr += 2
        g[u].append(v)
        g[v].append(u)
    parent = [-1] * n
    order = [0]
    for u in order:
        for v in g[u]:
            if v != parent[u]:
                parent[v] = u
                order.append(v)
    fb = [0] * n
    fe = [0] * n
    for u in reversed(order):
        b_ok = rest[u] in (0, 1)
        e_ok = rest[u] in (0, 2)
        vb = 1 if b_ok else 0
        ve = 1 if e_ok else 0
        for v in g[u]:
            if parent[v] != u:
                continue
            cb = ((limit_b - 1) * fb[v] + limit_e * fe[v]) % MOD
            ce = (limit_b * fb[v] + (limit_e - 1) * fe[v]) % MOD
            vb = vb * cb % MOD
            ve = ve * ce % MOD
        fb[u], fe[u] = vb, ve
    rb = limit_b * fb[0] % MOD
    re = limit_e * fe[0] % MOD
    return f"{rb} {re} {(rb + re) % MOD}\n"


def p3_case(n: int, k: int, s: int, rest: list[int], edges: list[tuple[int, int]], cid: str, visibility: str, group: str, purpose: str, storage: str | None = None) -> dict:
    inp = f"{n} {k} {s}\n" + " ".join(map(str, rest)) + "\n" + "\n".join(f"{u} {v}" for u, v in edges) + ("\n" if edges else "")
    case = {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p3_solve(inp)}
    if storage:
        case["storage"] = storage
    return case


def random_tree(n: int, seed: int) -> list[tuple[int, int]]:
    rng = random.Random(seed)
    return [(rng.randint(1, i - 1), i) for i in range(2, n + 1)]


def p4_solve(inp: str) -> str:
    nums = list(map(int, inp.strip().split()))
    n, m = nums[0], nums[1]
    dp = [[0] * 8 for _ in range(m + 1)]
    dp[0][0] = 1
    ptr = 2
    for _ in range(n):
        t, w = nums[ptr], nums[ptr + 1]
        ptr += 2
        bit = 1 << (t - 1)
        for c in range(m - 1, -1, -1):
            for mask in range(8):
                dp[c + 1][mask | bit] = (dp[c + 1][mask | bit] + dp[c][mask] * (w % MOD)) % MOD
    vals = [dp[m][mask] for mask in [1, 2, 4, 3, 5, 6, 7]]
    return " ".join(map(str, vals + [sum(vals) % MOD])) + "\n"


def p4_case(items: list[tuple[int, int]], m: int, cid: str, visibility: str, group: str, purpose: str) -> dict:
    inp = f"{len(items)} {m}\n" + "\n".join(f"{t} {w}" for t, w in items) + "\n"
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p4_solve(inp)}


def p5_solve(inp: str) -> str:
    N, K, A, B = map(int, inp.strip().split())
    ans = [0, 0, 0]
    if K == 1:
        if N == 1:
            idx = 0 if N <= A else (1 if N <= B else 2)
            ans[idx] = 1
        return f"{ans[0]} {ans[1]} {ans[2]} {sum(ans) % MOD}\n"
    for first in range(1, N // K + 1):
        cnt = K - 1
        target = N - first
        dp = [[0] * (target + 1) for _ in range(cnt + 1)]
        dp[0][0] = 1
        for value in range(first, target + 1):
            before = dp[cnt][target]
            for c in range(1, cnt + 1):
                for sm in range(value, target + 1):
                    dp[c][sm] = (dp[c][sm] + dp[c - 1][sm - value]) % MOD
            exact = (dp[cnt][target] - before) % MOD
            if exact and math.gcd(first, value) == 1:
                idx = 0 if value <= A else (1 if value <= B else 2)
                ans[idx] = (ans[idx] + exact) % MOD
    return f"{ans[0]} {ans[1]} {ans[2]} {sum(ans) % MOD}\n"


def p5_case(vals: tuple[int, int, int, int], cid: str, visibility: str, group: str, purpose: str) -> dict:
    inp = "{} {} {} {}\n".format(*vals)
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p5_solve(inp)}


def p6_solve(inp: str) -> str:
    nums = list(map(int, inp.strip().split()))
    t = nums[0]
    ptr = 1
    outs = []
    for _ in range(t):
        n = nums[ptr]
        ptr += 1
        arr = nums[ptr:ptr + n]
        ptr += n
        mn, mx = min(arr), max(arr)
        if mn == mx:
            outs.append(str(n * (n - 1)))
        else:
            outs.append(str(2 * arr.count(mn) * arr.count(mx)))
    return "\n".join(outs) + "\n"


def p6_case(tests: list[list[int]], cid: str, visibility: str, group: str, purpose: str) -> dict:
    parts = [str(len(tests))]
    for arr in tests:
        parts.append(str(len(arr)))
        parts.append(" ".join(map(str, arr)))
    inp = "\n".join(parts) + "\n"
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p6_solve(inp)}


def c2(x: int) -> int:
    return x * (x - 1) // 2


def c3(x: int) -> int:
    return x * (x - 1) * (x - 2) // 6


def p7_solve(inp: str) -> str:
    nums = list(map(int, inp.strip().split()))
    t = nums[0]
    ptr = 1
    outs = []
    for _ in range(t):
        n = nums[ptr]
        ptr += 1
        arr = nums[ptr:ptr + n]
        ptr += n
        freq = {}
        for x in arr:
            freq[x] = freq.get(x, 0) + 1
        pref = 0
        double = 0
        triple = 0
        for x in sorted(freq):
            cnt = freq[x]
            double += c2(cnt) * pref
            triple += c3(cnt)
            pref += cnt
        outs.append(f"{double} {triple} {double + triple}")
    return "\n".join(outs) + "\n"


def p7_case(tests: list[list[int]], cid: str, visibility: str, group: str, purpose: str) -> dict:
    parts = [str(len(tests))]
    for arr in tests:
        parts.append(str(len(arr)))
        parts.append(" ".join(map(str, arr)))
    inp = "\n".join(parts) + "\n"
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p7_solve(inp)}


def p8_solve(inp: str) -> str:
    n = int(inp.strip())
    fact = 1
    for i in range(1, n + 1):
        fact = fact * i % MOD
    main = pow(2, n - 1, MOD)
    return f"{(fact - main) % MOD}\n"


def p8_case(n: int, cid: str, visibility: str, group: str, purpose: str) -> dict:
    inp = f"{n}\n"
    return {"id": cid, "visibility": visibility, "group": group, "purpose": purpose, "input": inp, "answer": p8_solve(inp)}


P1_OFFICIAL = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n,m;
    cin>>n>>m;
    vector<string> g(n);
    for(auto &row:g) cin>>row;
    vector<vector<array<long long,4>>> dp(n, vector<array<long long,4>>(m));
    if(g[0][0]!='#') dp[0][0][0]=1;
    auto key=[&](char ch){
        if(ch=='A') return 1;
        if(ch=='B') return 2;
        if(ch=='C') return 3;
        return 0;
    };
    for(int i=0;i<n;i++){
        for(int j=0;j<m;j++){
            if(g[i][j]=='#' || (i==0 && j==0)) continue;
            int di[2]={-1,0}, dj[2]={0,-1};
            for(int dir=0; dir<2; dir++){
                int pi=i+di[dir], pj=j+dj[dir];
                if(pi<0 || pj<0) continue;
                for(int s=0;s<4;s++){
                    int ns=s;
                    int k=key(g[i][j]);
                    if(ns==0 && k) ns=k;
                    dp[i][j][ns]=(dp[i][j][ns]+dp[pi][pj][s])%MOD;
                }
            }
        }
    }
    long long a=dp[n-1][m-1][1], b=dp[n-1][m-1][2], c=dp[n-1][m-1][3];
    cout<<a<<" "<<b<<" "<<c<<" "<<(a+b+c)%MOD<<"\n";
    return 0;
}
"""

P1_BRUTE = cpp_base() + r"""
int n,m;
vector<string> g;
long long memo[805][805][4];
bool seen[805][805][4];
int kind(char ch){ return ch=='A'?1:ch=='B'?2:ch=='C'?3:0; }
long long dfs(int i,int j,int first){
    if(i>=n || j>=m || g[i][j]=='#') return 0;
    int now=first;
    int k=kind(g[i][j]);
    if(now==0 && k) now=k;
    if(i==n-1 && j==m-1) return now==0?0:1;
    if(seen[i][j][now]) return memo[i][j][now];
    seen[i][j][now]=true;
    return memo[i][j][now]=(dfs(i+1,j,now)+dfs(i,j+1,now))%MOD;
}
int main(){
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin>>n>>m;
    g.resize(n);
    for(auto &row:g) cin>>row;
    cout<<dfs(0,0,1)<<" "<<dfs(0,0,2)<<" "<<dfs(0,0,3)<<" "<<dfs(0,0,0)<<"\n";
}
"""

P1_WA_ANY = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,m; cin>>n>>m; vector<string> g(n); for(auto &r:g) cin>>r;
    vector<vector<array<long long,8>>> dp(n, vector<array<long long,8>>(m));
    dp[0][0][0]=1;
    auto bit=[](char ch){ return ch=='A'?1:ch=='B'?2:ch=='C'?4:0; };
    for(int i=0;i<n;i++) for(int j=0;j<m;j++){
        if(g[i][j]=='#') continue;
        if(i==0 && j==0) continue;
        int b=bit(g[i][j]);
        for(auto p:{pair<int,int>{i-1,j},pair<int,int>{i,j-1}}){
            if(p.first<0||p.second<0) continue;
            for(int s=0;s<8;s++) dp[i][j][s|b]=(dp[i][j][s|b]+dp[p.first][p.second][s])%MOD;
        }
    }
    long long a=0,b=0,c=0;
    for(int s=0;s<8;s++){ if(s&1)a=(a+dp[n-1][m-1][s])%MOD; if(s&2)b=(b+dp[n-1][m-1][s])%MOD; if(s&4)c=(c+dp[n-1][m-1][s])%MOD; }
    cout<<a<<" "<<b<<" "<<c<<" "<<(a+b+c)%MOD<<"\n";
}
"""

P1_WA_OBS = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,m; cin>>n>>m; vector<string> g(n); for(auto &r:g) cin>>r;
    vector<vector<array<long long,4>>> dp(n, vector<array<long long,4>>(m));
    dp[0][0][0]=1;
    auto key=[](char ch){return ch=='A'?1:ch=='B'?2:ch=='C'?3:0;};
    for(int i=0;i<n;i++) for(int j=0;j<m;j++){
        if(i==0 && j==0) continue;
        for(auto p:{pair<int,int>{i-1,j},pair<int,int>{i,j-1}}){
            if(p.first<0||p.second<0) continue;
            for(int s=0;s<4;s++){int ns=s,k=key(g[i][j]); if(ns==0&&k)ns=k; dp[i][j][ns]=(dp[i][j][ns]+dp[p.first][p.second][s])%MOD;}
        }
    }
    long long a=dp[n-1][m-1][1],b=dp[n-1][m-1][2],c=dp[n-1][m-1][3];
    cout<<a<<" "<<b<<" "<<c<<" "<<(a+b+c)%MOD<<"\n";
}
"""

P2_OFFICIAL = cpp_base() + r"""
long long solveOne(long long firstWeight, int n, int p, long long a, long long b, long long c){
    if(p==1) return 0;
    long long digit=0, other=firstWeight%MOD;
    long long nonDigit=(a+b)%MOD;
    for(int i=2;i<=n;i++){
        if(i==p){
            long long nd=other*c%MOD;
            digit=nd; other=0;
        }else{
            long long nd=other*c%MOD;
            long long no=(digit+other)%MOD*nonDigit%MOD;
            digit=nd; other=no;
        }
    }
    return (digit+other)%MOD;
}
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,p; long long a,b,c;
    cin>>n>>p>>a>>b>>c;
    long long x=solveOne(a,n,p,a,b,c);
    long long y=solveOne(b,n,p,a,b,c);
    cout<<x<<" "<<y<<" "<<(x+y)%MOD<<"\n";
}
"""

P2_BRUTE = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,p; long long a,b,c; cin>>n>>p>>a>>b>>c;
    vector<vector<array<long long,2>>> dp(n+1, vector<array<long long,2>>(2));
    if(p!=1){ dp[1][0][0]=a%MOD; dp[1][1][0]=b%MOD; }
    long long non=(a+b)%MOD;
    for(int i=2;i<=n;i++){
        for(int start=0; start<2; start++){
            if(i==p){
                dp[i][start][1]=dp[i-1][start][0]*c%MOD;
            }else{
                dp[i][start][0]=(dp[i-1][start][0]+dp[i-1][start][1])%MOD*non%MOD;
                dp[i][start][1]=dp[i-1][start][0]*c%MOD;
            }
        }
    }
    long long x=(dp[n][0][0]+dp[n][0][1])%MOD;
    long long y=(dp[n][1][0]+dp[n][1][1])%MOD;
    cout<<x<<" "<<y<<" "<<(x+y)%MOD<<"\n";
}
"""

P2_WA_ADJ = cpp_base() + r"""
long long modpow(long long a,long long e){long long r=1%MOD;while(e){if(e&1)r=r*a%MOD;a=a*a%MOD;e>>=1;}return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);long long n,p,a,b,c;cin>>n>>p>>a>>b>>c;if(p==1){cout<<"0 0 0\n";return 0;} long long rest=modpow((a+b+c)%MOD,n-2); long long x=a%MOD*c%MOD*rest%MOD,y=b%MOD*c%MOD*rest%MOD; cout<<x<<" "<<y<<" "<<(x+y)%MOD<<"\n";}
"""

P2_WA_P = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);long long n,p,a,b,c;cin>>n>>p>>a>>b>>c;long long non=(a+b)%MOD,dig=0,otherA=a%MOD,otherB=b%MOD,digB=0;for(int i=2;i<=n;i++){long long nd=otherA*c%MOD,no=(otherA+dig)%MOD*non%MOD;dig=nd;otherA=no;nd=otherB*c%MOD;no=(otherB+digB)%MOD*non%MOD;digB=nd;otherB=no;}long long x=(dig+otherA)%MOD,y=(digB+otherB)%MOD;cout<<x<<" "<<y<<" "<<(x+y)%MOD<<"\n";}
"""

P3_OFFICIAL = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n; long long k,s; cin>>n>>k>>s;
    vector<int> r(n+1);
    for(int i=1;i<=n;i++) cin>>r[i];
    vector<vector<int>> g(n+1);
    for(int i=0;i<n-1;i++){int u,v;cin>>u>>v;g[u].push_back(v);g[v].push_back(u);}
    vector<int> parent(n+1), order; order.push_back(1);
    for(size_t idx=0; idx<order.size(); idx++){
        int u=order[idx];
        for(int v:g[u]) if(v!=parent[u]){parent[v]=u;order.push_back(v);}
    }
    vector<long long> fb(n+1), fe(n+1);
    long long base=s, ext=k-s;
    for(int idx=n-1; idx>=0; idx--){
        int u=order[idx];
        long long b=(r[u]==0||r[u]==1), e=(r[u]==0||r[u]==2);
        for(int v:g[u]) if(parent[v]==u){
            long long cb=((base-1)*fb[v]+ext*fe[v])%MOD;
            long long ce=(base*fb[v]+(ext-1)*fe[v])%MOD;
            b=b*cb%MOD; e=e*ce%MOD;
        }
        fb[u]=b; fe[u]=e;
    }
    long long rb=base%MOD*fb[1]%MOD, re=ext%MOD*fe[1]%MOD;
    cout<<rb<<" "<<re<<" "<<(rb+re)%MOD<<"\n";
}
"""

P3_BRUTE = cpp_base() + r"""
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n; long long k,s; cin>>n>>k>>s;
    vector<int> lim(n+1); for(int i=1;i<=n;i++) cin>>lim[i];
    vector<vector<int>> g(n+1);
    for(int i=0;i<n-1;i++){int u,v;cin>>u>>v;g[u].push_back(v);g[v].push_back(u);}
    vector<int> parent(n+1), order{1};
    for(size_t i=0;i<order.size();i++) for(int v:g[order[i]]) if(v!=parent[order[i]]) parent[v]=order[i], order.push_back(v);
    vector<vector<long long>> dp(n+1, vector<long long>(k+1));
    for(int z=(int)order.size()-1; z>=0; z--){
        int u=order[z];
        for(int col=1; col<=k; col++){
            if(lim[u]==1 && col>s) continue;
            if(lim[u]==2 && col<=s) continue;
            long long ways=1;
            for(int v:g[u]) if(parent[v]==u){
                long long sum=0;
                for(int cc=1; cc<=k; cc++) if(cc!=col) sum=(sum+dp[v][cc])%MOD;
                ways=ways*sum%MOD;
            }
            dp[u][col]=ways;
        }
    }
    long long rb=0,re=0;
    for(int col=1; col<=k; col++) (col<=s?rb:re) = ((col<=s?rb:re)+dp[1][col])%MOD;
    cout<<rb<<" "<<re<<" "<<(rb+re)%MOD<<"\n";
}
"""

P3_WA_GROUP = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;long long k,s;cin>>n>>k>>s;vector<int> r(n+1);for(int i=1;i<=n;i++)cin>>r[i];vector<vector<int>>g(n+1);for(int i=0;i<n-1;i++){int u,v;cin>>u>>v;g[u].push_back(v);g[v].push_back(u);}vector<int>p(n+1),ord(1,1);for(size_t idx=0;idx<ord.size();idx++){int u=ord[idx];for(int v:g[u])if(v!=p[u])p[v]=u,ord.push_back(v);}vector<long long>B(n+1),E(n+1);for(int i=n-1;i>=0;i--){int u=ord[i];long long b=(r[u]!=2),e=(r[u]!=1);for(int v:g[u])if(p[v]==u){b=b*E[v]%MOD;e=e*B[v]%MOD;}B[u]=b;E[u]=e;}cout<<B[1]<<" "<<E[1]<<" "<<(B[1]+E[1])%MOD<<"\n";}
"""

P3_WA_REST = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;long long k,s;cin>>n>>k>>s;vector<int>r(n+1);for(int i=1;i<=n;i++)cin>>r[i];vector<vector<int>>g(n+1);for(int i=0;i<n-1;i++){int u,v;cin>>u>>v;g[u].push_back(v);g[v].push_back(u);}vector<int>p(n+1),ord(1,1);for(size_t idx=0;idx<ord.size();idx++){int u=ord[idx];for(int v:g[u])if(v!=p[u])p[v]=u,ord.push_back(v);}vector<long long>fb(n+1),fe(n+1);long long base=s,ext=k-s;for(int i=n-1;i>=0;i--){int u=ord[i];long long b=1,e=1;for(int v:g[u])if(p[v]==u){b=b*((base-1)*fb[v]+ext*fe[v])%MOD;e=e*(base*fb[v]+(ext-1)*fe[v])%MOD;}fb[u]=b;fe[u]=e;}long long rb=base*fb[1]%MOD,re=ext*fe[1]%MOD;cout<<rb<<" "<<re<<" "<<(rb+re)%MOD<<"\n";}
"""

P4_OFFICIAL = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<vector<long long>> dp(m+1, vector<long long>(8));dp[0][0]=1;for(int i=0;i<n;i++){int t;long long w;cin>>t>>w;int bit=1<<(t-1);for(int c=m-1;c>=0;c--)for(int mask=0;mask<8;mask++)dp[c+1][mask|bit]=(dp[c+1][mask|bit]+dp[c][mask]*(w%MOD))%MOD;}vector<int> ord={1,2,4,3,5,6,7};long long total=0;for(int i=0;i<7;i++){long long v=dp[m][ord[i]];total=(total+v)%MOD;if(i)cout<<" ";cout<<v;}cout<<" "<<total<<"\n";}
"""

P4_BRUTE = cpp_base() + r"""
int n,m; vector<int> t; vector<long long>w; long long ans[8];
void dfs(int idx,int chosen,int mask,long long ways){if(chosen==m){ans[mask]=(ans[mask]+ways)%MOD;return;} if(idx==n) return; dfs(idx+1,chosen,mask,ways); dfs(idx+1,chosen+1,mask|(1<<(t[idx]-1)),ways*(w[idx]%MOD)%MOD);}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);cin>>n>>m;t.resize(n);w.resize(n);for(int i=0;i<n;i++)cin>>t[i]>>w[i]; if(n<=28) dfs(0,0,0,1); else {vector<vector<long long>>dp(m+1,vector<long long>(8));dp[0][0]=1;for(int i=0;i<n;i++)for(int c=m-1;c>=0;c--)for(int mask=0;mask<8;mask++)dp[c+1][mask|(1<<(t[i]-1))]=(dp[c+1][mask|(1<<(t[i]-1))]+dp[c][mask]*(w[i]%MOD))%MOD;for(int mask=0;mask<8;mask++)ans[mask]=dp[m][mask];}vector<int> ord={1,2,4,3,5,6,7};long long total=0;for(int i=0;i<7;i++){total=(total+ans[ord[i]])%MOD;if(i)cout<<" ";cout<<ans[ord[i]];}cout<<" "<<total<<"\n";}
"""

P4_WA_WEIGHT = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<vector<long long>>dp(m+1,vector<long long>(8));dp[0][0]=1;for(int i=0;i<n;i++){int t;long long w;cin>>t>>w;int bit=1<<(t-1);for(int c=m-1;c>=0;c--)for(int mask=0;mask<8;mask++)dp[c+1][mask|bit]=(dp[c+1][mask|bit]+dp[c][mask])%MOD;}vector<int>ord={1,2,4,3,5,6,7};long long total=0;for(int i=0;i<7;i++){long long v=dp[m][ord[i]];total=(total+v)%MOD;if(i)cout<<" ";cout<<v;}cout<<" "<<total<<"\n";}
"""

P4_WA_ATMOST = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<vector<long long>>dp(m+1,vector<long long>(8));dp[0][0]=1;for(int i=0;i<n;i++){int t;long long w;cin>>t>>w;int bit=1<<(t-1);for(int c=m-1;c>=0;c--)for(int mask=0;mask<8;mask++)dp[c+1][mask|bit]=(dp[c+1][mask|bit]+dp[c][mask]*(w%MOD))%MOD;}vector<int>ord={1,2,4,3,5,6,7};long long out[8]={0};for(int c=1;c<=m;c++)for(int mask=0;mask<8;mask++)out[mask]=(out[mask]+dp[c][mask])%MOD;long long total=0;for(int i=0;i<7;i++){long long v=out[ord[i]];total=(total+v)%MOD;if(i)cout<<" ";cout<<v;}cout<<" "<<total<<"\n";}
"""

P5_OFFICIAL = cpp_base() + r"""
long long gcdll(long long a,long long b){while(b){long long t=a%b;a=b;b=t;}return a<0?-a:a;}
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int N,K,A,B; cin>>N>>K>>A>>B;
    long long ans[3]={0,0,0};
    if(K==1){
        if(N==1){ int idx=N<=A?0:(N<=B?1:2); ans[idx]=1; }
        cout<<ans[0]<<" "<<ans[1]<<" "<<ans[2]<<" "<<(ans[0]+ans[1]+ans[2])%MOD<<"\n";
        return 0;
    }
    for(int first=1; first*K<=N; first++){
        int cnt=K-1, target=N-first;
        vector<vector<long long>> dp(cnt+1, vector<long long>(target+1));
        dp[0][0]=1;
        for(int value=first; value<=target; value++){
            long long before=dp[cnt][target];
            for(int c=1;c<=cnt;c++) for(int sum=value; sum<=target; sum++) dp[c][sum]=(dp[c][sum]+dp[c-1][sum-value])%MOD;
            long long exact=(dp[cnt][target]-before+MOD)%MOD;
            if(exact && gcdll(first,value)==1){
                int idx=value<=A?0:(value<=B?1:2);
                ans[idx]=(ans[idx]+exact)%MOD;
            }
        }
    }
    cout<<ans[0]<<" "<<ans[1]<<" "<<ans[2]<<" "<<(ans[0]+ans[1]+ans[2])%MOD<<"\n";
}
"""

P5_BRUTE = cpp_base() + r"""
int N,K,A,B; long long ans[3];
long long gcdll(long long a,long long b){while(b){long long t=a%b;a=b;b=t;}return a<0?-a:a;}
void dfs(int pos,int last,int sum,int first){
    if(pos==K){
        if(sum==N && gcdll(first,last)==1){int idx=last<=A?0:(last<=B?1:2);ans[idx]=(ans[idx]+1)%MOD;}
        return;
    }
    int left=K-pos-1;
    for(int x=last; sum+x+left*x<=N; x++) dfs(pos+1,x,sum+x,first);
}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);cin>>N>>K>>A>>B;if(N<=55){for(int first=1; first*K<=N; first++)dfs(1,first,first,first);}else{for(int first=1; first*K<=N; first++){int cnt=K-1,target=N-first;vector<vector<long long>>dp(cnt+1,vector<long long>(target+1));dp[0][0]=1;for(int value=first;value<=target;value++){long long before=dp[cnt][target];for(int c=1;c<=cnt;c++)for(int s=value;s<=target;s++)dp[c][s]=(dp[c][s]+dp[c-1][s-value])%MOD;long long exact=(dp[cnt][target]-before+MOD)%MOD;if(exact&&gcdll(first,value)==1){int idx=value<=A?0:(value<=B?1:2);ans[idx]=(ans[idx]+exact)%MOD;}}}}cout<<ans[0]<<" "<<ans[1]<<" "<<ans[2]<<" "<<(ans[0]+ans[1]+ans[2])%MOD<<"\n";}
"""

P5_WA_GCD = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int N,K,A,B;cin>>N>>K>>A>>B;long long ans[3]={0,0,0};for(int first=1;first*K<=N;first++){int cnt=K-1,target=N-first;vector<vector<long long>>dp(cnt+1,vector<long long>(target+1));dp[0][0]=1;for(int value=first;value<=target;value++){long long before=dp[cnt][target];for(int c=1;c<=cnt;c++)for(int s=value;s<=target;s++)dp[c][s]=(dp[c][s]+dp[c-1][s-value])%MOD;long long exact=(dp[cnt][target]-before+MOD)%MOD;if(exact){int idx=value<=A?0:(value<=B?1:2);ans[idx]=(ans[idx]+exact)%MOD;}}}cout<<ans[0]<<" "<<ans[1]<<" "<<ans[2]<<" "<<(ans[0]+ans[1]+ans[2])%MOD<<"\n";}
"""

P5_WA_ORDER = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int N,K,A,B;cin>>N>>K>>A>>B;vector<vector<long long>>dp(K+1,vector<long long>(N+1));dp[0][0]=1;for(int i=0;i<K;i++)for(int s=0;s<=N;s++)for(int x=1;s+x<=N;x++)dp[i+1][s+x]=(dp[i+1][s+x]+dp[i][s])%MOD;cout<<0<<" "<<0<<" "<<dp[K][N]<<" "<<dp[K][N]<<"\n";}
"""

P6_OFFICIAL = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n);for(auto &x:a)cin>>x;long long mn=*min_element(a.begin(),a.end()),mx=*max_element(a.begin(),a.end());long long cm=count(a.begin(),a.end(),mn),cx=count(a.begin(),a.end(),mx);if(mn==mx)cout<<1LL*n*(n-1)<<"\n";else cout<<2*cm*cx<<"\n";}}
"""

P6_BRUTE = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n);for(auto &x:a)cin>>x;long long best=0;for(int i=0;i<n;i++)for(int j=0;j<n;j++)best=max(best,llabs(a[i]-a[j]));long long ans=0;for(int i=0;i<n;i++)for(int j=0;j<n;j++)if(i!=j&&llabs(a[i]-a[j])==best)ans++;cout<<ans<<"\n";}}
"""

P6_WA_UNORDER = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n);for(auto &x:a)cin>>x;long long mn=*min_element(a.begin(),a.end()),mx=*max_element(a.begin(),a.end());long long cm=count(a.begin(),a.end(),mn),cx=count(a.begin(),a.end(),mx);if(mn==mx)cout<<1LL*n*(n-1)/2<<"\n";else cout<<cm*cx<<"\n";}}
"""

P6_WA_EQUAL = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n);for(auto &x:a)cin>>x;long long mn=*min_element(a.begin(),a.end()),mx=*max_element(a.begin(),a.end());if(mn==mx){cout<<0<<"\n";continue;}cout<<2*count(a.begin(),a.end(),mn)*count(a.begin(),a.end(),mx)<<"\n";}}
"""

P7_OFFICIAL = cpp_base() + r"""
long long C2(long long x){return x*(x-1)/2;} long long C3(long long x){return x*(x-1)*(x-2)/6;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<int>a(n);for(int&i:a)cin>>i;sort(a.begin(),a.end());long long pref=0,tw=0,th=0;for(int i=0;i<n;){int j=i;while(j<n&&a[j]==a[i])j++;long long cnt=j-i;tw+=C2(cnt)*pref;th+=C3(cnt);pref+=cnt;i=j;}cout<<tw<<" "<<th<<" "<<tw+th<<"\n";}}
"""

P7_BRUTE = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;vector<int>a(n);for(int&i:a)cin>>i;long long tw=0,th=0;for(int i=0;i<n;i++)for(int j=i+1;j<n;j++)for(int k=j+1;k<n;k++){int x=a[i],y=a[j],z=a[k];int mx=max({x,y,z});int cnt=(x==mx)+(y==mx)+(z==mx);if(cnt==3)th++;else if(cnt==2)tw++;}cout<<tw<<" "<<th<<" "<<tw+th<<"\n";}}
"""

P7_WA_ALL = cpp_base() + r"""
long long C3(long long x){return x*(x-1)*(x-2)/6;}int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){long long n;cin>>n;for(int i=0,x;i<n;i++)cin>>x;cout<<0<<" "<<C3(n)<<" "<<C3(n)<<"\n";}}
"""

P7_WA_EQUAL = cpp_base() + r"""
long long C3(long long x){return x*(x-1)*(x-2)/6;}int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int T;cin>>T;while(T--){int n;cin>>n;map<int,long long>mp;for(int i=0,x;i<n;i++){cin>>x;mp[x]++;}long long th=0;for(map<int,long long>::iterator it=mp.begin();it!=mp.end();++it)th+=C3(it->second);cout<<0<<" "<<th<<" "<<th<<"\n";}}
"""

P8_OFFICIAL = cpp_base() + r"""
long long modpow(long long a,long long e){long long r=1;while(e){if(e&1)r=r*a%MOD;a=a*a%MOD;e>>=1;}return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;long long fact=1;for(int i=1;i<=n;i++)fact=fact*i%MOD;cout<<(fact-modpow(2,n-1)+MOD)%MOD<<"\n";}
"""

P8_BRUTE = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;long long fact=1,pow2=1;for(int i=1;i<=n;i++)fact=fact*i%MOD;for(int i=0;i<n-1;i++)pow2=pow2*2%MOD;cout<<(fact-pow2+MOD)%MOD<<"\n";}
"""

P8_WA_N = cpp_base() + r"""
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;long long f=1;for(int i=1;i<=n;i++)f=f*i%MOD;cout<<(f-n+MOD)%MOD<<"\n";}
"""

P8_WA_POW = cpp_base() + r"""
long long mpow(long long a,long long e){long long r=1;while(e){if(e&1)r=r*a%MOD;a=a*a%MOD;e>>=1;}return r;}int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;long long f=1;for(int i=1;i<=n;i++)f=f*i%MOD;cout<<(f-mpow(2,n)+MOD)%MOD<<"\n";}
"""


def generic_validator(max_first_line: str = "") -> str:
    return f"""#!/usr/bin/env python3
import sys

tokens = sys.stdin.read().strip().split()
if not tokens:
    raise SystemExit("empty input")
try:
    vals = [int(x) for x in tokens if x.lstrip('-').isdigit()]
except ValueError:
    raise SystemExit("invalid integer")
{max_first_line}
"""


def build_problems() -> list[tuple[dict, list[dict]]]:
    problems = []

    p1 = {
        "index": 1,
        "id": "ch08-02-01",
        "slug": "ch08-02-01-layered-path-count",
        "title_zh": "分层路径计数",
        "title_en": "Layered Path Counting",
        "time_limit": 2.0,
        "knowledge": "数学：加法原理；编程：网格 DP 分类计数",
        "family": "dp",
        "scale_dimensions": ["n", "m"],
        "transition": "按互斥的首次关键格类别拆分路径总数",
        "graph_title": "分层路径计数逻辑图",
        "source_type": "original",
        "source_note": "本题为 SPCG 自建原创题，未改编外部题面、样例或数据。",
        "algorithms": [
            {"id": "addition-principle", "name": "加法原理", "family": "combinatorics", "role": "primary", "note": "按首次关键格类型划分互斥路径集合。"},
            {"id": "grid-dp", "name": "网格 DP", "family": "dp", "role": "primary", "note": "只允许向右或向下时逐格累加方案数。"},
        ],
        "hints": [("先分层", "路径类别由第一次经过的关键格确定。"), ("障碍处理", "障碍格不接收也不转移方案数。"), ("合并答案", "三类首次关键格互斥，可以直接相加。")],
        "necessity_target": "按首次关键格分类的网格 DP",
        "alternatives": ["只统计普通路径数，无法区分第一次经过的关键格类型。", "统计路径中出现过哪些关键格，会把先后顺序相反的路径混在一起。"],
        "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_count_any_key.cpp": ["adversarial"], "wa_ignore_obstacles.cpp": ["pattern", "adversarial"]},
        "wrong_codes": {"wa_count_any_key.cpp": P1_WA_ANY, "wa_ignore_obstacles.cpp": P1_WA_OBS},
        "official": P1_OFFICIAL,
        "brute": P1_BRUTE,
        "validator": generic_validator("n=int(tokens[0]); m=int(tokens[1])\nif not (1 <= n <= 800 and 1 <= m <= 800): raise SystemExit('n/m out of range')"),
        "graph": graph_yaml("分层路径计数逻辑图", "路径按第一次进入的关键格类型进入不同计数层。", [("start", "start", 40, 160), ("none", "none", 170, 160), ("A", "first A", 310, 70), ("B", "first B", 310, 160), ("C", "first C", 310, 250), ("end", "sum", 460, 160)], [("start", "none", "begin"), ("none", "A", "meet A"), ("none", "B", "meet B"), ("none", "C", "meet C"), ("A", "end", "+"), ("B", "end", "+"), ("C", "end", "+")]),
    }
    p1["statement_zh"] = lambda samples: f"""# 分层路径计数

## 任务描述

给定一个 $n$ 行 $m$ 列的网格。每个格子可能是：

| 字符 | 含义 |
| --- | --- |
| `.` | 可通行普通格 |
| `#` | 障碍格 |
| `A` | A 类关键格 |
| `B` | B 类关键格 |
| `C` | C 类关键格 |

从左上角 $(1,1)$ 出发，到右下角 $(n,m)$ 结束，每次只能向右或向下移动，不能进入障碍格。

一条路径的类别由它第一次经过的关键格类型决定。若一条路径从未经过关键格，则不计入答案。

请分别统计第一次经过 `A`、`B`、`C` 的路径数量，并输出总数。答案对 $10^9+7$ 取模。

## 输入格式

第一行输入两个整数 $n,m$，表示网格行数和列数。

接下来 $n$ 行，每行输入一个长度为 $m$ 的字符串，表示网格。

## 输出格式

输出一行四个整数，依次表示第一次经过 `A`、`B`、`C` 的路径数量，以及三类路径总数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $n$ | 网格行数 |
| $m$ | 网格列数 |

## 约束

- $1 \\le n,m \\le 800$
- 网格只包含字符 `.`、`#`、`A`、`B`、`C`
- $(1,1)$ 和 $(n,m)$ 保证不是障碍格，也不是关键格

## 公开样例

{sample_blocks(samples, True)}

## 符号说明

- 输出的第四个数等于前三个数之和对 $10^9+7$ 取模。
- 没有经过关键格的路径不计入任何一类。
"""
    p1["statement_en"] = lambda samples: f"""# Layered Path Counting

## Task

You are given an $n$ by $m$ grid. Each cell is one of the following symbols:

| Symbol | Meaning |
| --- | --- |
| `.` | open normal cell |
| `#` | blocked cell |
| `A` | key cell of type A |
| `B` | key cell of type B |
| `C` | key cell of type C |

Starting from $(1,1)$, move to $(n,m)$. Each move goes only right or down, and blocked cells cannot be entered.

The category of a path is determined by the first key-cell type visited on that path. A path that visits no key cell is not counted.

Output the number of paths whose first key cell is `A`, `B`, or `C`, and also output the total. All answers are taken modulo $10^9+7$.

## Input Format

The first line contains two integers $n,m$, the number of rows and columns.

The next $n$ lines each contain a string of length $m$ describing the grid.

## Output Format

Output four integers: the counts for first `A`, first `B`, first `C`, and their total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $n$ | number of rows |
| $m$ | number of columns |

## Constraints

- $1 \\le n,m \\le 800$
- The grid contains only `.`、`#`、`A`、`B`、`C`
- $(1,1)$ and $(n,m)$ are neither blocked nor key cells

## Samples

{sample_blocks(samples, False)}
"""
    p1["teacher_zh"] = "本题训练加法原理和网格 DP。重点提醒学生区分“第一次经过”和“路径中出现过”。\n"
    p1["teacher_en"] = "This problem trains the addition principle and grid DP. Emphasize the first visited key type.\n"
    p1["solution_zh"] = """# 官方题解

## 模型转化

每条路径按照第一次经过的关键格类型分成三类，这三类互斥，因此可以分别计数后相加。

## 算法步骤

1. 设 $dp[i][j][s]$ 表示走到格子 $(i,j)$，当前路径第一次关键格类型为 $s$ 的方案数。
2. $s=0$ 表示还没有经过关键格，$s=1,2,3$ 分别表示第一次经过的是 `A`、`B`、`C`。
3. 从上方和左方转移到当前格子，若当前格子是关键格且 $s=0$，就把类别改成当前类型。
4. 答案为终点处 $s=1,2,3$ 的三个值及其和。

## 正确性说明

每条合法路径到达某个格子时，它是否已经遇到第一类关键格，以及第一类关键格的类型，是继续分类所需的全部信息。每一步只可能从上方或左方到达，因此动态规划枚举了所有合法路径。三种第一次关键格类型互不重叠，所以按加法原理相加得到总数。

## 复杂度分析

- 时间复杂度：$O(nm)$
- 空间复杂度：$O(nm)$

## 易错点

- 不要把“第一次经过”写成“路径中出现过”。
- 障碍格不能接收转移，也不能继续转移。
- 没有经过关键格的路径不计入答案。
"""
    p1["solution_en"] = """# Official Solution

## Model

Paths are split into three disjoint classes by the first key-cell type they visit.

## Algorithm Steps

1. Let $dp[i][j][s]$ be the number of ways to reach cell $(i,j)$ with first key type $s$.
2. Use $s=0$ for no key visited yet, and $s=1,2,3$ for `A`, `B`, `C`.
3. Transfer from the upper and left cells. If the current cell is a key cell and $s=0$, set the class to that key type.
4. The answer is the three values at the target cell and their sum.

## Correctness

For every path prefix, the first key-cell type already determines its future category. The DP considers exactly the two possible previous cells for every legal move. The three first-key classes are disjoint, so the addition principle gives the total.

## Complexity Analysis

- Time complexity: $O(nm)$
- Memory complexity: $O(nm)$

## Common Mistakes

- Do not count every key type appearing on a path.
- Blocked cells must not receive or send transitions.
- Paths without any key cell are excluded.
"""
    cases1 = [
        p1_case(3, 3, ["...", ".A.", "..."], "01", "public", "sample", "单个关键格"),
        p1_case(4, 4, [".B..", ".#..", "A...", "...."], "02", "public", "sample", "A 类和 B 类互斥分类"),
        p1_case(5, 5, ["..C..", ".#.#.", "A...B", ".#...", "....."], "03", "public", "sample", "三类关键格混合"),
        p1_case(1, 1, ["."], "04", "hidden", "edge", "最小规模且没有关键格"),
        p1_case(2, 2, [".#", "A."], "05", "hidden", "edge", "唯一可行路径经过 A"),
        p1_case(4, 4, ["....", "....", "....", "...."], "06", "hidden", "pattern", "所有路径都没有关键格"),
        p1_case(4, 5, [".A..B", "..#..", "C....", "....."], "07", "hidden", "pattern", "首次关键格被先后顺序区分"),
        p1_case(8, 9, random_grid(8, 9, 11, 10, 15), "08", "hidden", "random-small", "小规模随机网格"),
        p1_case(12, 12, random_grid(12, 12, 12, 18, 18), "09", "hidden", "random-small", "含较多障碍的小规模随机"),
        p1_case(50, 60, random_grid(50, 60, 21, 8, 10), "10", "hidden", "random-large", "中等规模随机"),
        p1_case(100, 100, random_grid(100, 100, 22, 12, 8), "11", "hidden", "random-large", "较大随机网格"),
        p1_case(6, 6, [".A...B", "......", "..B...", "......", "C.....", "......"], "12", "hidden", "adversarial", "击穿统计任意关键格的错解"),
        p1_case(6, 6, [".#A...", ".#....", ".#B...", ".#....", "C.....", "......"], "13", "hidden", "adversarial", "击穿忽略障碍的错解"),
        p1_case(20, 20, random_grid(20, 20, 31, 5, 20), "14", "hidden", "boundary-mix", "关键格密集分布"),
        p1_case(30, 30, random_grid(30, 30, 32, 20, 5), "15", "hidden", "boundary-mix", "障碍较多但仍有路径"),
        p1_case(800, 800, ["." + "A" + "." * 798] + ["." * 800 for _ in range(799)], "16", "hidden", "stress", "接近规模上限"),
        p1_case(800, 800, ["." * 800 for _ in range(200)] + ["." * 300 + "B" + "." * 499] + ["." * 800 for _ in range(599)], "17", "hidden", "stress", "大网格中部关键格"),
        p1_case(700, 700, random_grid(700, 700, 41, 2, 2), "18", "hidden", "stress", "大规模稀疏关键格"),
        p1_case(300, 500, random_grid(300, 500, 42, 5, 5), "19", "hidden", "final", "综合随机压力"),
        p1_case(800, 800, ["." * 799 + ("C" if i == 400 else ".") for i in range(799)] + ["." * 800], "20", "hidden", "final", "终点附近分类压力"),
    ]
    problems.append((p1, cases1))

    p2 = {
        "index": 2, "id": "ch08-02-02", "slug": "ch08-02-02-string-construction-classification", "title_zh": "字符串构造分类", "title_en": "String Construction Classification", "time_limit": 2.0,
        "knowledge": "数学：乘法原理与加法原理；编程：线性 DP 分类计数", "family": "dp", "scale_dimensions": ["n"], "transition": "按首字符类型分别计算并相加",
        "graph_title": "字符串构造分类逻辑图", "source_type": "original", "source_note": "本题为 SPCG 自建原创题，未改编外部题面、样例或数据。",
        "algorithms": [{"id": "addition-principle", "name": "加法原理", "family": "combinatorics", "role": "primary", "note": "小写开头和大写开头两类互斥。"}, {"id": "linear-dp", "name": "线性 DP", "family": "dp", "role": "primary", "note": "记录上一位是否为数字类。"}],
        "hints": [("先固定首类", "分别计算小写开头和大写开头。"), ("记录上一位", "只需要知道上一位是否为数字类。"), ("特殊位置", "第 $p$ 位只能从非数字类转来。")],
        "necessity_target": "带固定位置约束的线性分类 DP", "alternatives": ["只用乘法原理会忽略相邻数字限制。", "忽略第 $p$ 位固定为数字会多算大量字符串。"], "separating_groups": ["edge", "adversarial", "stress"],
        "wrong_targets": {"wa_allow_adjacent_digits.cpp": ["adversarial"], "wa_forget_p_digit.cpp": ["edge", "pattern"]}, "wrong_codes": {"wa_allow_adjacent_digits.cpp": P2_WA_ADJ, "wa_forget_p_digit.cpp": P2_WA_P},
        "official": P2_OFFICIAL, "brute": P2_BRUTE, "validator": generic_validator("n=int(tokens[0]); p=int(tokens[1])\nif not (1 <= p <= n <= 10**6): raise SystemExit('n/p out of range')"),
        "graph": graph_yaml("字符串构造分类逻辑图", "先按首字符类别拆分，再用上一位类型推进。", [("start", "start", 40, 150), ("lower", "lower first", 180, 80), ("upper", "upper first", 180, 220), ("dp", "last digit?", 340, 150), ("sum", "sum", 500, 150)], [("start", "lower", "a choices"), ("start", "upper", "b choices"), ("lower", "dp", "DP"), ("upper", "dp", "DP"), ("dp", "sum", "+")]),
    }
    p2["statement_zh"] = lambda samples: f"""# 字符串构造分类

## 任务描述

现在有三类字符：

| 类别 | 可选字符数量 |
| --- | --- |
| 小写类 | $a$ 个 |
| 大写类 | $b$ 个 |
| 数字类 | $c$ 个 |

需要构造长度为 $n$ 的字符串，满足：

- 第 $1$ 个字符必须是小写类或大写类。
- 第 $p$ 个字符必须是数字类。
- 任意两个相邻字符不能同时是数字类。

字符串按第 $1$ 个字符的类型分类。请输出小写开头的合法字符串数量、大写开头的合法字符串数量，以及合法字符串总数。答案对 $10^9+7$ 取模。

## 输入格式

第一行输入五个整数 $n,p,a,b,c$。

## 输出格式

输出一行三个整数，依次表示小写开头数量、大写开头数量、总数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $n$ | 字符串长度 |
| $p$ | 必须为数字类的位置 |
| $a$ | 小写类字符数量 |
| $b$ | 大写类字符数量 |
| $c$ | 数字类字符数量 |

## 约束

- $1 \\le p \\le n \\le 10^6$
- $1 \\le a,b,c \\le 10^6$

## 公开样例

{sample_blocks(samples, True)}
"""
    p2["statement_en"] = lambda samples: f"""# String Construction Classification

## Task

There are three character classes:

| Class | Number of available characters |
| --- | --- |
| lowercase | $a$ |
| uppercase | $b$ |
| digit | $c$ |

Construct strings of length $n$ satisfying:

- Position $1$ must be lowercase or uppercase.
- Position $p$ must be a digit.
- No two adjacent positions may both be digits.

Classify valid strings by the type of the first character. Output the lowercase-start count, the uppercase-start count, and the total, modulo $10^9+7$.

## Input Format

The first line contains five integers $n,p,a,b,c$.

## Output Format

Output three integers: lowercase-start count, uppercase-start count, and total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $n$ | string length |
| $p$ | position forced to be a digit |
| $a$ | number of lowercase characters |
| $b$ | number of uppercase characters |
| $c$ | number of digit characters |

## Constraints

- $1 \\le p \\le n \\le 10^6$
- $1 \\le a,b,c \\le 10^6$

## Samples

{sample_blocks(samples, False)}
"""
    p2["teacher_zh"] = "本题训练乘法原理、加法原理和线性 DP。第 $p=1$ 的情况会直接无解。\n"
    p2["teacher_en"] = "This problem trains multiplication principle, addition principle, and linear DP. The case $p=1$ has no valid string.\n"
    p2["solution_zh"] = """# 官方题解

## 模型转化

小写开头和大写开头是两个互斥类别。固定一种开头后，只需记录当前最后一位是否为数字类。

## 算法步骤

1. 分别以小写开头和大写开头计算。
2. 用两个变量表示当前前缀最后一位为数字类或非数字类的方案数。
3. 若当前位置为 $p$，只能放数字类，并且上一位必须是非数字类。
4. 其他位置可以放非数字类；若上一位不是数字类，也可以放数字类。

## 正确性说明

相邻限制只和上一位是否为数字类有关，因此两个变量完整保存了继续构造所需的信息。小写开头和大写开头互不重叠，分别计算后按加法原理相加得到总数。

## 复杂度分析

- 时间复杂度：$O(n)$
- 空间复杂度：$O(1)$

## 易错点

- 当 $p=1$ 时，第 $1$ 位要求冲突，答案为 $0$。
- 第 $p$ 位不能从数字类上一位转移过来。
- 小写开头和大写开头需要分别乘以 $a$ 和 $b$。
"""
    p2["solution_en"] = """# Official Solution

## Model

Lowercase-start and uppercase-start strings are disjoint classes. After fixing the first class, only whether the previous character is a digit matters.

## Algorithm Steps

1. Compute the answer once for lowercase start and once for uppercase start.
2. Maintain two values: previous character is digit or non-digit.
3. At position $p$, only a digit may be placed, and the previous position must be non-digit.
4. At other positions, place a non-digit from any previous class, or a digit only after a non-digit.

## Correctness

The adjacency constraint depends only on whether the previous character is a digit, so the two DP values are sufficient. The two starting classes are disjoint, and the addition principle gives the total.

## Complexity Analysis

- Time complexity: $O(n)$
- Memory complexity: $O(1)$

## Common Mistakes

- When $p=1$, the requirements conflict.
- Position $p$ cannot follow a digit.
- The two first-character classes use different multipliers $a$ and $b$.
"""
    cases2 = [
        p2_case((3, 2, 2, 1, 3), "01", "public", "sample", "普通固定中间位置"),
        p2_case((1, 1, 5, 7, 2), "02", "public", "sample", "首位冲突"),
        p2_case((5, 3, 2, 3, 4), "03", "public", "sample", "多位置构造"),
        p2_case((2, 2, 1, 1, 1), "04", "hidden", "edge", "最短可行长度"),
        p2_case((2, 1, 9, 8, 7), "05", "hidden", "edge", "首位固定冲突"),
        p2_case((4, 4, 1, 2, 3), "06", "hidden", "pattern", "固定末位"),
        p2_case((6, 2, 3, 5, 7), "07", "hidden", "pattern", "固定位置靠前"),
        p2_case((12, 6, 2, 4, 6), "08", "hidden", "random-small", "小规模偶数参数"),
        p2_case((15, 8, 7, 3, 5), "09", "hidden", "random-small", "小规模奇数参数"),
        p2_case((1000, 500, 13, 17, 19), "10", "hidden", "random-large", "中等规模"),
        p2_case((20000, 19999, 101, 103, 107), "11", "hidden", "random-large", "固定位置接近末尾"),
        p2_case((5, 3, 1, 1, 9), "12", "hidden", "adversarial", "击穿允许相邻数字的错解"),
        p2_case((7, 4, 3, 4, 5), "13", "hidden", "adversarial", "固定位置强制约束"),
        p2_case((100, 1, 100, 100, 100), "14", "hidden", "boundary-mix", "大参数但无解"),
        p2_case((100, 100, 1000000, 999999, 999998), "15", "hidden", "boundary-mix", "字符数量接近上限"),
        p2_case((900000, 450000, 2, 3, 5), "16", "hidden", "stress", "长度接近上限"),
        p2_case((1000000, 999999, 999983, 999979, 999961), "17", "hidden", "stress", "长度和字符数量接近上限"),
        p2_case((800000, 2, 11, 13, 17), "18", "hidden", "stress", "固定位置靠前的大数据"),
        p2_case((700000, 350001, 123, 456, 789), "19", "hidden", "final", "综合大数据"),
        p2_case((1000000, 1, 1, 1, 1), "20", "hidden", "final", "最大长度无解"),
    ]
    problems.append((p2, cases2))

    p3 = {
        "index": 3, "id": "ch08-02-03", "slug": "ch08-02-03-tree-coloring-root-type", "title_zh": "树形结构着色", "title_en": "Tree Coloring by Root Type", "time_limit": 3.0,
        "knowledge": "数学：加法原理与乘法原理；编程：树形 DP 分类计数", "family": "dp", "scale_dimensions": ["n"], "transition": "按根节点颜色类型分类统计树上合法染色", "graph_title": "树形着色分类逻辑图",
        "source_type": "original", "source_note": "本题为 SPCG 自建原创题，未改编外部题面、样例或数据。",
        "algorithms": [{"id": "tree-dp", "name": "树形 DP", "family": "dp", "role": "primary", "note": "自底向上合并子树染色方案。"}, {"id": "addition-principle", "name": "加法原理", "family": "combinatorics", "role": "primary", "note": "根为基础色和扩展色两类互斥。"}],
        "hints": [("固定一种颜色", "先考虑节点颜色已经固定为某个基础色或扩展色。"), ("合并子树", "每个儿子的选择数相乘。"), ("根部分类", "最后乘以根可选颜色数量。")],
        "necessity_target": "树形 DP 与颜色组计数", "alternatives": ["只按颜色组不同判断会漏掉同组不同颜色的方案。", "忽略节点限制会在限制点数据中多算。"], "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_group_only.cpp": ["pattern", "adversarial"], "wa_ignore_restrictions.cpp": ["adversarial"]}, "wrong_codes": {"wa_group_only.cpp": P3_WA_GROUP, "wa_ignore_restrictions.cpp": P3_WA_REST},
        "official": P3_OFFICIAL, "brute": P3_BRUTE, "validator": generic_validator("n=int(tokens[0]); k=int(tokens[1]); s=int(tokens[2])\nif not (1 <= n <= 2*10**5 and 2 <= k <= 80 and 1 <= s < k): raise SystemExit('n/k/s out of range')"),
        "graph": graph_yaml("树形着色分类逻辑图", "固定父节点颜色组后，逐个合并儿子子树。", [("root", "root", 240, 40), ("child1", "child", 120, 170), ("child2", "child", 360, 170), ("base", "base root", 120, 300), ("ext", "ext root", 360, 300), ("sum", "sum", 240, 420)], [("root", "child1", "merge"), ("root", "child2", "merge"), ("child1", "base", "base"), ("child2", "ext", "ext"), ("base", "sum", "+"), ("ext", "sum", "+")]),
    }
    p3["statement_zh"] = lambda samples: f"""# 树形结构着色

## 任务描述

给定一棵以 $1$ 号节点为根的树，共有 $n$ 个节点。现在有 $k$ 种颜色，颜色 $1$ 到 $s$ 属于基础色，颜色 $s+1$ 到 $k$ 属于扩展色。

每个节点有一个限制类型：

| 限制值 | 含义 |
| --- | --- |
| $0$ | 可使用任意颜色 |
| $1$ | 只能使用基础色 |
| $2$ | 只能使用扩展色 |

一种染色方案合法，当且仅当任意一条边连接的两个节点颜色不同。

请按根节点颜色类型分类，统计根节点使用基础色的合法方案数、根节点使用扩展色的合法方案数，以及合法方案总数。答案对 $10^9+7$ 取模。

## 输入格式

第一行输入三个整数 $n,k,s$。

第二行输入 $n$ 个整数，依次表示每个节点的限制值。

接下来 $n-1$ 行，每行输入两个整数 $u,v$，表示一条树边。

## 输出格式

输出一行三个整数，依次表示根节点使用基础色的方案数、根节点使用扩展色的方案数、总方案数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $n$ | 节点数量 |
| $k$ | 颜色总数 |
| $s$ | 基础色数量 |
| $u,v$ | 一条树边的两个端点 |

## 约束

- $1 \\le n \\le 2\\times 10^5$
- $2 \\le k \\le 80$
- $1 \\le s < k$
- 限制值只能为 $0$、$1$、$2$

## 公开样例

{sample_blocks(samples, True)}
"""
    p3["statement_en"] = lambda samples: f"""# Tree Coloring by Root Type

## Task

You are given a rooted tree with node $1$ as the root. There are $k$ colors. Colors $1$ through $s$ are base colors, and colors $s+1$ through $k$ are extended colors.

Each node has a restriction:

| Value | Meaning |
| --- | --- |
| $0$ | any color is allowed |
| $1$ | only base colors are allowed |
| $2$ | only extended colors are allowed |

A coloring is valid if adjacent nodes have different colors.

Output the number of valid colorings where the root is base-colored, where the root is extended-colored, and the total. Answers are modulo $10^9+7$.

## Input Format

The first line contains three integers $n,k,s$.

The second line contains $n$ integers, the restrictions of all nodes.

The next $n-1$ lines each contain two integers $u,v$, describing an edge.

## Output Format

Output three integers: base-root count, extended-root count, and total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $n$ | number of nodes |
| $k$ | number of colors |
| $s$ | number of base colors |
| $u,v$ | endpoints of an edge |

## Constraints

- $1 \\le n \\le 2\\times 10^5$
- $2 \\le k \\le 80$
- $1 \\le s < k$
- Each restriction is $0$, $1$, or $2$

## Samples

{sample_blocks(samples, False)}
"""
    p3["teacher_zh"] = "本题训练树形 DP。关键是定义为“固定某一种基础色”的子树方案，而不是把基础色当成一个颜色。\n"
    p3["teacher_en"] = "This problem trains tree DP. The key is counting for one fixed base color, not treating all base colors as one color.\n"
    p3["solution_zh"] = """# 官方题解

## 模型转化

设 $f_B(u)$ 表示节点 $u$ 固定为某一种基础色时，它的子树合法染色方案数；设 $f_E(u)$ 表示节点 $u$ 固定为某一种扩展色时的方案数。

## 算法步骤

1. 把树以 $1$ 为根，得到自底向上的处理顺序。
2. 若节点限制不允许基础色，则 $f_B(u)=0$；若不允许扩展色，则 $f_E(u)=0$。
3. 当父节点固定为基础色时，儿子可以选其他基础色或任意扩展色。
4. 当父节点固定为扩展色时，儿子可以选任意基础色或其他扩展色。
5. 根节点答案为 $s\\times f_B(1)$ 和 $(k-s)\\times f_E(1)$。

## 正确性说明

一条边只限制两端颜色不能相同。若父节点颜色已经固定，儿子的所有合法颜色选择可以按基础色和扩展色两类相加；不同儿子子树相互独立，所以方案数相乘。自底向上处理所有子树后，根节点的两类颜色互斥，相加得到总数。

## 复杂度分析

- 时间复杂度：$O(n)$
- 空间复杂度：$O(n)$

## 易错点

- 基础色内部仍然有 $s$ 种不同颜色。
- 扩展色内部仍然有 $k-s$ 种不同颜色。
- 节点限制必须在计算当前节点时处理。
"""
    p3["solution_en"] = """# Official Solution

## Model

Let $f_B(u)$ be the number of valid colorings of the subtree of $u$ when $u$ is fixed to one particular base color. Define $f_E(u)$ similarly for one particular extended color.

## Algorithm Steps

1. Root the tree at node $1$ and process nodes bottom-up.
2. If a node restriction forbids base colors, set $f_B(u)=0$; if it forbids extended colors, set $f_E(u)=0$.
3. If the parent is a fixed base color, a child may use another base color or any extended color.
4. If the parent is a fixed extended color, a child may use any base color or another extended color.
5. Multiply by $s$ and $k-s$ at the root to get the two classes.

## Correctness

For a fixed parent color, each child subtree contributes an independent number of compatible choices. These choices are multiplied over children. The two root-color classes are disjoint, so the addition principle gives the total.

## Complexity Analysis

- Time complexity: $O(n)$
- Memory complexity: $O(n)$

## Common Mistakes

- Base colors are still distinct colors.
- Extended colors are still distinct colors.
- Node restrictions must be applied at the current node.
"""
    cases3 = [
        p3_case(3, 4, 2, [0, 0, 0], [(1, 2), (1, 3)], "01", "public", "sample", "星形小树"),
        p3_case(4, 5, 2, [1, 0, 2, 0], [(1, 2), (2, 3), (2, 4)], "02", "public", "sample", "含节点限制"),
        p3_case(1, 6, 3, [0], [], "03", "public", "sample", "单节点"),
        p3_case(2, 2, 1, [0, 0], [(1, 2)], "04", "hidden", "edge", "最小边"),
        p3_case(5, 3, 1, [2, 1, 0, 2, 1], [(1, 2), (1, 3), (3, 4), (3, 5)], "05", "hidden", "edge", "根节点限制为扩展色"),
        p3_case(6, 8, 4, [0] * 6, [(1, 2), (1, 3), (2, 4), (2, 5), (3, 6)], "06", "hidden", "pattern", "同组不同颜色数量影响答案"),
        p3_case(7, 7, 3, [0, 1, 2, 0, 1, 2, 0], [(1, 2), (1, 3), (2, 4), (2, 5), (3, 6), (3, 7)], "07", "hidden", "pattern", "限制交错的完全二叉形"),
        p3_case(20, 10, 5, [random.Random(1).randint(0, 2) for _ in range(20)], random_tree(20, 2), "08", "hidden", "random-small", "小规模随机树"),
        p3_case(50, 12, 6, [random.Random(3).randint(0, 2) for _ in range(50)], random_tree(50, 4), "09", "hidden", "random-small", "较小随机树"),
        p3_case(1000, 30, 14, [random.Random(5).randint(0, 2) for _ in range(1000)], random_tree(1000, 6), "10", "hidden", "random-large", "中等随机树"),
        p3_case(5000, 40, 20, [random.Random(7).randint(0, 2) for _ in range(5000)], random_tree(5000, 8), "11", "hidden", "random-large", "较大随机树"),
        p3_case(8, 6, 3, [0, 0, 0, 0, 0, 0, 0, 0], [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7), (7, 8)], "12", "hidden", "adversarial", "击穿把颜色组当单色的错解"),
        p3_case(9, 9, 4, [1, 2, 1, 2, 0, 1, 2, 0, 1], [(1, 2), (1, 3), (2, 4), (2, 5), (3, 6), (3, 7), (4, 8), (4, 9)], "13", "hidden", "adversarial", "击穿忽略限制的错解"),
        p3_case(100, 80, 40, [0] * 100, [(i, i + 1) for i in range(1, 100)], "14", "hidden", "boundary-mix", "颜色数量接近上限"),
        p3_case(120, 80, 1, [random.Random(9).randint(0, 2) for _ in range(120)], random_tree(120, 10), "15", "hidden", "boundary-mix", "基础色数量边界"),
        p3_case(180000, 80, 40, [0 if i % 5 else 1 for i in range(180000)], [(i, i + 1) for i in range(1, 180000)], "16", "hidden", "stress", "接近规模上限的链", "file"),
        p3_case(200000, 79, 39, [0] * 200000, random_tree(200000, 11), "17", "hidden", "stress", "规模上限随机树", "file"),
        p3_case(150000, 60, 30, [2 if i % 7 == 0 else 0 for i in range(150000)], random_tree(150000, 12), "18", "hidden", "stress", "大规模限制随机树", "file"),
        p3_case(8000, 50, 25, [random.Random(13).randint(0, 2) for _ in range(8000)], random_tree(8000, 14), "19", "hidden", "final", "综合随机压力"),
        p3_case(200000, 80, 2, [0 if i % 3 else 2 for i in range(200000)], random_tree(200000, 15), "20", "hidden", "final", "极端颜色组比例", "file"),
    ]
    problems.append((p3, cases3))

    p4 = {
        "index": 4, "id": "ch08-02-04", "slug": "ch08-02-04-set-pick-classification", "title_zh": "集合划分与选取", "title_en": "Set Selection Classification", "time_limit": 3.0,
        "knowledge": "数学：加法原理与组合计数；编程：背包 DP 分类计数", "family": "dp", "scale_dimensions": ["n"], "transition": "按选中集合类型组合分类统计", "graph_title": "集合选取分类逻辑图",
        "source_type": "original", "source_note": "本题为 SPCG 自建原创题，未改编外部题面、样例或数据。",
        "algorithms": [{"id": "knapsack-dp", "name": "背包式 DP", "family": "dp", "role": "primary", "note": "按已选数量和类型组合推进。"}, {"id": "addition-principle", "name": "加法原理", "family": "combinatorics", "role": "primary", "note": "七种非空类型组合互斥。"}],
        "hints": [("类型组合", "把已经出现的集合类型记录成分类编号。"), ("最多一次", "处理每个集合时从大到小更新选取数量。"), ("元素数量", "选择第 $i$ 个集合时有 $w_i$ 种元素可选。")],
        "necessity_target": "带权选取和类型组合分类 DP", "alternatives": ["只数集合选法会忽略每个集合内元素数量。", "统计不超过 $m$ 个会混入不合法选法。"], "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_ignore_weights.cpp": ["pattern", "adversarial"], "wa_at_most_m.cpp": ["adversarial"]}, "wrong_codes": {"wa_ignore_weights.cpp": P4_WA_WEIGHT, "wa_at_most_m.cpp": P4_WA_ATMOST},
        "official": P4_OFFICIAL, "brute": P4_BRUTE, "validator": generic_validator("n=int(tokens[0]); m=int(tokens[1])\nif not (1 <= m <= n <= 2000): raise SystemExit('n/m out of range')"),
        "graph": graph_yaml("集合选取分类逻辑图", "每选一个集合，就把它的类型合并到当前分类中。", [("none", "0 type", 60, 180), ("t1", "type 1", 210, 80), ("t2", "type 2", 210, 180), ("t3", "type 3", 210, 280), ("combo", "combo", 380, 180), ("ans", "7 classes", 540, 180)], [("none", "t1", "choose"), ("none", "t2", "choose"), ("none", "t3", "choose"), ("t1", "combo", "merge"), ("t2", "combo", "merge"), ("t3", "combo", "merge"), ("combo", "ans", "+")]),
    }
    p4["statement_zh"] = lambda samples: f"""# 集合划分与选取

## 任务描述

有 $n$ 个两两不相交的集合。第 $i$ 个集合属于类型 $t_i$，并且集合中有 $w_i$ 个不同元素。

现在需要选出恰好 $m$ 个元素，要求每个集合最多选 $1$ 个元素。

一次选取方案按“选中元素来自哪些集合类型”分类。请按以下顺序输出 $7$ 类方案数，并输出总数：

| 输出位置 | 类型组合 |
| --- | --- |
| $1$ | 只来自类型 $1$ |
| $2$ | 只来自类型 $2$ |
| $3$ | 只来自类型 $3$ |
| $4$ | 来自类型 $1$ 和类型 $2$ |
| $5$ | 来自类型 $1$ 和类型 $3$ |
| $6$ | 来自类型 $2$ 和类型 $3$ |
| $7$ | 三种类型都出现 |

答案对 $10^9+7$ 取模。

## 输入格式

第一行输入两个整数 $n,m$。

接下来 $n$ 行，每行输入两个整数 $t_i,w_i$，表示一个集合的类型和元素数量。

## 输出格式

输出一行八个整数，前七个数按题目给定顺序表示各类方案数，第八个数表示总方案数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $n$ | 集合数量 |
| $m$ | 需要选出的元素数量 |
| $t_i$ | 第 $i$ 个集合的类型 |
| $w_i$ | 第 $i$ 个集合的元素数量 |

## 约束

- $1 \\le m \\le n \\le 2000$
- $t_i \\in \\{{1,2,3\\}}$
- $1 \\le w_i \\le 10^9$

## 公开样例

{sample_blocks(samples, True)}
"""
    p4["statement_en"] = lambda samples: f"""# Set Selection Classification

## Task

There are $n$ disjoint sets. Set $i$ has type $t_i$ and contains $w_i$ distinct elements.

Choose exactly $m$ elements, with at most one element chosen from each set.

Classify each selection by which set types appear. Output the following seven classes, then the total:

| Output position | Type combination |
| --- | --- |
| $1$ | only type $1$ |
| $2$ | only type $2$ |
| $3$ | only type $3$ |
| $4$ | types $1$ and $2$ |
| $5$ | types $1$ and $3$ |
| $6$ | types $2$ and $3$ |
| $7$ | all three types |

Answers are modulo $10^9+7$.

## Input Format

The first line contains two integers $n,m$.

The next $n$ lines each contain two integers $t_i,w_i$.

## Output Format

Output eight integers: the seven class counts in the specified order, and then the total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $n$ | number of sets |
| $m$ | number of elements to choose |
| $t_i$ | type of set $i$ |
| $w_i$ | number of elements in set $i$ |

## Constraints

- $1 \\le m \\le n \\le 2000$
- $t_i \\in \\{{1,2,3\\}}$
- $1 \\le w_i \\le 10^9$

## Samples

{sample_blocks(samples, False)}
"""
    p4["teacher_zh"] = "本题训练分类背包。注意选一个集合时有 $w_i$ 种元素选择，不是只把集合数量加一。\n"
    p4["teacher_en"] = "This problem trains classified knapsack DP. Choosing a set contributes $w_i$ choices, not just one choice.\n"
    p4["solution_zh"] = """# 官方题解

## 模型转化

选中的集合类型组合共有 $7$ 种非空情况。用一个三位分类编号记录哪些类型已经出现。

## 算法步骤

1. 设 $dp[j][S]$ 表示已经选出 $j$ 个元素，出现类型组合为 $S$ 的方案数。
2. 初始 $dp[0][0]=1$。
3. 处理集合 $i$ 时，若选择它，则选取数量加 $1$，类型组合加入 $t_i$，方案数乘以 $w_i$。
4. 为保证每个集合最多选一次，选取数量从大到小更新。
5. 输出 $m$ 个元素时七种非空组合的方案数。

## 正确性说明

每个集合只有选或不选两种决策。若选中第 $i$ 个集合，来自其中哪一个元素有 $w_i$ 种可能，并且类型组合被唯一更新。动态规划按集合顺序枚举所有选择，每种合法方案被计算一次。七种类型组合互斥，所以可以相加得到总数。

## 复杂度分析

- 时间复杂度：$O(nm)$
- 空间复杂度：$O(m)$

## 易错点

- 不能忽略 $w_i$。
- 必须选出恰好 $m$ 个元素。
- 更新选取数量时需要从大到小。
"""
    p4["solution_en"] = """# Official Solution

## Model

There are seven non-empty type combinations. Use a three-bit class number to record which types have appeared.

## Algorithm Steps

1. Let $dp[j][S]$ be the number of ways after choosing $j$ elements with type combination $S$.
2. Initialize $dp[0][0]=1$.
3. When choosing set $i$, increase the count by $1$, add type $t_i$, and multiply by $w_i$.
4. Iterate the chosen count downward to use each set at most once.
5. Output the seven non-empty combinations for exactly $m$ chosen elements.

## Correctness

Each set is either chosen or not chosen. If it is chosen, there are $w_i$ choices for the element and the type combination is updated uniquely. The DP enumerates all legal selections exactly once. The seven classes are disjoint, so their sum is the total.

## Complexity Analysis

- Time complexity: $O(nm)$
- Memory complexity: $O(m)$

## Common Mistakes

- Do not ignore $w_i$.
- Count exactly $m$ elements, not at most $m$.
- Update the chosen count in decreasing order.
"""
    rng = random.Random(101)
    cases4 = [
        p4_case([(1, 2), (2, 3), (3, 5)], 1, "01", "public", "sample", "每次选一个集合"),
        p4_case([(1, 2), (1, 4), (2, 3), (3, 5)], 2, "02", "public", "sample", "同类型集合与跨类型组合"),
        p4_case([(1, 10), (2, 20), (3, 30), (1, 2), (2, 3)], 3, "03", "public", "sample", "三类组合混合"),
        p4_case([(1, 7)], 1, "04", "hidden", "edge", "最小规模"),
        p4_case([(1, 2), (2, 3)], 2, "05", "hidden", "edge", "必须全选"),
        p4_case([(1, 2), (1, 3), (1, 4), (2, 5), (3, 6)], 2, "06", "hidden", "pattern", "只出现部分组合"),
        p4_case([(1, 2), (2, 3), (3, 5), (1, 7), (2, 11), (3, 13)], 3, "07", "hidden", "pattern", "三类均衡"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 20)) for _ in range(20)], 6, "08", "hidden", "random-small", "小规模随机"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 100)) for _ in range(35)], 10, "09", "hidden", "random-small", "较小随机"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 10**6)) for _ in range(400)], 120, "10", "hidden", "random-large", "中等规模随机"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 10**9)) for _ in range(1000)], 300, "11", "hidden", "random-large", "较大规模随机"),
        p4_case([(1, 100), (1, 200), (2, 300), (3, 400), (3, 500)], 2, "12", "hidden", "adversarial", "击穿忽略元素数量的错解"),
        p4_case([(1, 2), (2, 3), (3, 5), (1, 7)], 3, "13", "hidden", "adversarial", "击穿不超过数量的错解"),
        p4_case([(i % 3 + 1, 10**9 - i) for i in range(60)], 1, "14", "hidden", "boundary-mix", "只选一个元素"),
        p4_case([(i % 3 + 1, i + 1) for i in range(80)], 80, "15", "hidden", "boundary-mix", "全部集合都选"),
        p4_case([(i % 3 + 1, 123456789 + i) for i in range(1800)], 900, "16", "hidden", "stress", "接近规模上限"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 10**9)) for _ in range(2000)], 1000, "17", "hidden", "stress", "规模上限随机"),
        p4_case([(1 if i < 1000 else 2 if i < 1600 else 3, i * 17 + 1) for i in range(2000)], 1200, "18", "hidden", "stress", "类型数量不均衡"),
        p4_case([(rng.randint(1, 3), rng.randint(1, 10**9)) for _ in range(1500)], 750, "19", "hidden", "final", "综合随机压力"),
        p4_case([(i % 3 + 1, 10**9) for i in range(2000)], 1500, "20", "hidden", "final", "大权值取模压力"),
    ]
    problems.append((p4, cases4))

    p5 = {
        "index": 5, "id": "ch08-02-05", "slug": "ch08-02-05-integer-partition-class-count", "title_zh": "整数拆分与约束计数", "title_en": "Integer Partition with Classified Maximum", "time_limit": 3.0,
        "knowledge": "数学：整数拆分与互质；编程：动态规划分类计数", "family": "dp", "scale_dimensions": ["N"], "transition": "按最大部分范围分类统计受限拆分", "graph_title": "整数拆分分类逻辑图",
        "source_type": "original", "source_note": "本题为 SPCG 自建原创题，未改编外部题面、样例或数据。",
        "algorithms": [{"id": "integer-partition-dp", "name": "整数拆分 DP", "family": "dp", "role": "primary", "note": "按最小值、最大值和剩余部分计数。"}, {"id": "gcd-filter", "name": "互质筛选", "family": "math", "role": "supporting", "note": "只保留首项与最大部分互质的拆分。"}],
        "hints": [("固定首项", "先枚举 $x_1$。"), ("固定最大值", "统计剩余部分中最大值恰好是多少。"), ("互质过滤", "只有 $\\gcd(x_1,x_K)=1$ 的拆分保留。")],
        "necessity_target": "受限整数拆分 DP 与最大值分类", "alternatives": ["普通组合数无法处理非递减和最大值分类。", "忽略互质条件会在筛选数据中多算。"], "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_ignore_gcd.cpp": ["adversarial"], "wa_ordered_compositions.cpp": ["pattern", "adversarial"]}, "wrong_codes": {"wa_ignore_gcd.cpp": P5_WA_GCD, "wa_ordered_compositions.cpp": P5_WA_ORDER},
        "official": P5_OFFICIAL, "brute": P5_BRUTE, "validator": generic_validator("N=int(tokens[0]); K=int(tokens[1]); A=int(tokens[2]); B=int(tokens[3])\nif not (1 <= K <= 35 and K <= N <= 220 and 1 <= A < B <= N): raise SystemExit('range error')"),
        "graph": graph_yaml("整数拆分分类逻辑图", "固定首项后，按最大部分范围把合法拆分归类。", [("N", "N", 40, 160), ("first", "choose x1", 180, 160), ("max", "max xK", 330, 160), ("small", "<=A", 500, 70), ("mid", "A..B", 500, 160), ("large", ">B", 500, 250), ("sum", "sum", 650, 160)], [("N", "first", "fix"), ("first", "max", "DP"), ("max", "small", "class"), ("max", "mid", "class"), ("max", "large", "class"), ("small", "sum", "+"), ("mid", "sum", "+"), ("large", "sum", "+")]),
    }
    p5["statement_zh"] = lambda samples: f"""# 整数拆分与约束计数

## 任务描述

给定正整数 $N$ 和 $K$，需要把 $N$ 拆分成恰好 $K$ 个正整数：

$$
x_1+x_2+\\cdots+x_K=N
$$

要求满足：

- $x_1\\le x_2\\le \\cdots \\le x_K$。
- $\\gcd(x_1,x_K)=1$。

由于序列必须非递减，所以 $x_K$ 是本次拆分中的最大部分。

现在给定两个边界 $A,B$，其中 $A<B$。请按最大部分 $x_K$ 的范围分类统计：

| 类别 | 条件 |
| --- | --- |
| 小最大值 | $x_K\\le A$ |
| 中最大值 | $A<x_K\\le B$ |
| 大最大值 | $x_K>B$ |

答案对 $10^9+7$ 取模。

## 输入格式

第一行输入四个整数 $N,K,A,B$。

## 输出格式

输出一行四个整数，依次表示小最大值方案数、中最大值方案数、大最大值方案数、总方案数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $N$ | 被拆分的正整数 |
| $K$ | 拆分部分数量 |
| $A$ | 小最大值边界 |
| $B$ | 中最大值边界 |

## 约束

- $1 \\le K \\le 35$
- $K \\le N \\le 220$
- $1 \\le A < B \\le N$

## 公开样例

{sample_blocks(samples, True)}
"""
    p5["statement_en"] = lambda samples: f"""# Integer Partition with Classified Maximum

## Task

Given positive integers $N$ and $K$, split $N$ into exactly $K$ positive integers:

$$
x_1+x_2+\\cdots+x_K=N
$$

The sequence must satisfy:

- $x_1\\le x_2\\le \\cdots \\le x_K$.
- $\\gcd(x_1,x_K)=1$.

Because the sequence is nondecreasing, $x_K$ is the maximum part.

Given $A,B$ with $A<B$, classify valid partitions by $x_K$:

| Class | Condition |
| --- | --- |
| small maximum | $x_K\\le A$ |
| middle maximum | $A<x_K\\le B$ |
| large maximum | $x_K>B$ |

Answers are modulo $10^9+7$.

## Input Format

The first line contains four integers $N,K,A,B$.

## Output Format

Output four integers: small, middle, large, and total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $N$ | integer to split |
| $K$ | number of parts |
| $A$ | boundary for small maximum |
| $B$ | boundary for middle maximum |

## Constraints

- $1 \\le K \\le 35$
- $K \\le N \\le 220$
- $1 \\le A < B \\le N$

## Samples

{sample_blocks(samples, False)}
"""
    p5["teacher_zh"] = "本题是第 2 关挑战题。建议引导学生先固定首项，再统计最大部分恰好为某个值的方案数。\n"
    p5["teacher_en"] = "This is the challenge problem of stage 2. Guide students to fix the first part and count partitions by exact maximum part.\n"
    p5["solution_zh"] = """# 官方题解

## 模型转化

枚举首项 $x_1=f$ 和最大部分 $x_K=M$。剩余 $K-1$ 个数必须从 $f$ 到 $M$ 中非递减选出，并且最大值恰好为 $M$。

## 算法步骤

1. 枚举首项 $f$。
2. 对允许的数值从 $f$ 到 $N$ 做整数拆分 DP。
3. 处理到数值 $M$ 前后的差值，就是最大部分恰好为 $M$ 的方案数。
4. 若 $\\gcd(f,M)=1$，按 $M$ 所在范围加入对应类别。

## 正确性说明

非递减序列可以看作按数值从小到大选择若干次，因此整数拆分 DP 会把每个序列计算一次。固定首项后，最大部分恰好为 $M$ 的方案由“允许到 $M$”减去“只允许到 $M-1$”得到。互质条件和最大值分类只依赖 $f$ 与 $M$，所以过滤和分类正确。

## 复杂度分析

- 时间复杂度：$O(N^3K)$
- 空间复杂度：$O(NK)$

## 易错点

- 拆分序列要求非递减，不能按有序组成数计算。
- 最大部分要“恰好”为当前值，不能只统计不超过当前值。
- 互质条件是 $\\gcd(x_1,x_K)=1$。
"""
    p5["solution_en"] = """# Official Solution

## Model

Enumerate the first part $x_1=f$ and the maximum part $x_K=M$. The remaining $K-1$ values form a nondecreasing multiset from $f$ to $M$, with maximum exactly $M$.

## Algorithm Steps

1. Enumerate the first part $f$.
2. Run partition DP over values from $f$ upward.
3. The increase after processing value $M$ is the number of partitions whose maximum is exactly $M$.
4. If $\\gcd(f,M)=1$, add it to the class determined by $M$.

## Correctness

A nondecreasing sequence is uniquely represented by counts of each value, so the partition DP counts each sequence once. The exact-maximum count is obtained by subtracting the count before value $M$ is allowed. The gcd condition and class depend only on $f$ and $M$, so the filtering is correct.

## Complexity Analysis

- Time complexity: $O(N^3K)$
- Memory complexity: $O(NK)$

## Common Mistakes

- Do not count ordered compositions.
- Count maximum exactly, not only at most.
- The gcd condition is $\\gcd(x_1,x_K)=1$.
"""
    cases5 = [
        p5_case((8, 3, 3, 5), "01", "public", "sample", "小规模拆分"),
        p5_case((10, 4, 3, 6), "02", "public", "sample", "四部分拆分"),
        p5_case((15, 5, 4, 8), "03", "public", "sample", "多类别输出"),
        p5_case((5, 1, 2, 4), "04", "hidden", "edge", "单部分但互质不成立"),
        p5_case((2, 2, 1, 2), "05", "hidden", "edge", "最小可拆分"),
        p5_case((20, 3, 6, 10), "06", "hidden", "pattern", "非递减限制明显"),
        p5_case((30, 6, 5, 12), "07", "hidden", "pattern", "最大值分类混合"),
        p5_case((35, 7, 6, 15), "08", "hidden", "random-small", "小规模随机边界"),
        p5_case((45, 8, 8, 20), "09", "hidden", "random-small", "较小规模"),
        p5_case((120, 20, 30, 70), "10", "hidden", "random-large", "中等规模"),
        p5_case((160, 25, 40, 90), "11", "hidden", "random-large", "较大规模"),
        p5_case((18, 3, 5, 9), "12", "hidden", "adversarial", "击穿忽略互质的错解"),
        p5_case((12, 4, 3, 5), "13", "hidden", "adversarial", "击穿有序组成数错解"),
        p5_case((220, 2, 50, 100), "14", "hidden", "boundary-mix", "部分数量最少"),
        p5_case((220, 35, 20, 60), "15", "hidden", "boundary-mix", "部分数量接近上限"),
        p5_case((220, 30, 40, 120), "16", "hidden", "stress", "规模上限"),
        p5_case((210, 35, 30, 100), "17", "hidden", "stress", "高部分数量"),
        p5_case((220, 10, 70, 150), "18", "hidden", "stress", "大最大值分类压力"),
        p5_case((200, 28, 45, 110), "19", "hidden", "final", "综合压力"),
        p5_case((220, 1, 100, 200), "20", "hidden", "final", "单部分边界"),
    ]
    problems.append((p5, cases5))

    p6 = {
        "index": 6, "id": "ch08-02-06", "slug": "ch08-02-06-extreme-difference-pairs", "title_zh": "极差配对统计", "title_en": "Extreme Difference Pairs", "time_limit": 2.0,
        "knowledge": "数学：加法原理；编程：最大最小值计数", "family": "combinatorics", "scale_dimensions": ["T"], "transition": "按最大值是否等于最小值分情况统计有序配对", "graph_title": "极差配对统计逻辑图",
        "source_type": "adapted", "source_note": "本题参考来源只记录在 `problem-bank/ADAPTED_SOURCE_INDEX.md`，题面、样例和数据均已重做。",
        "algorithms": [{"id": "case-classification", "name": "分类讨论", "family": "combinatorics", "role": "primary", "note": "最大值等于最小值和不相等两类互斥。"}, {"id": "frequency-counting", "name": "频次计数", "family": "implementation", "role": "supporting", "note": "统计最大值和最小值出现次数。"}],
        "hints": [("极差来源", "最大绝对差只可能由最大值和最小值贡献。"), ("注意有序", "$(i,j)$ 和 $(j,i)$ 是不同配对。"), ("全相等", "最大绝对差为 $0$ 时，任意不同下标都满足。")],
        "necessity_target": "最大最小值频次分类计数", "alternatives": ["只数无序对会漏掉方向。", "最大值等于最小值时仍套用最大最小频次公式会错误。"], "separating_groups": ["edge", "adversarial", "stress"],
        "wrong_targets": {"wa_unordered.cpp": ["adversarial"], "wa_all_equal_zero.cpp": ["edge"]}, "wrong_codes": {"wa_unordered.cpp": P6_WA_UNORDER, "wa_all_equal_zero.cpp": P6_WA_EQUAL},
        "official": P6_OFFICIAL, "brute": P6_BRUTE, "validator": generic_validator("T=int(tokens[0])\nif not (1 <= T <= 100): raise SystemExit('T out of range')"),
        "graph": graph_yaml("极差配对统计逻辑图", "最大差由最大值和最小值形成，全相等时单独处理。", [("arr", "array", 40, 150), ("minmax", "min/max", 190, 150), ("equal", "equal", 340, 80), ("diff", "different", 340, 220), ("ans", "answer", 500, 150)], [("arr", "minmax", "scan"), ("minmax", "equal", "mn=mx"), ("minmax", "diff", "mn<mx"), ("equal", "ans", "n(n-1)"), ("diff", "ans", "2cnt")]),
    }
    p6["statement_zh"] = lambda samples: f"""# 极差配对统计

## 任务描述

给定一个长度为 $n$ 的整数序列 $a_1,a_2,\\ldots,a_n$。

定义一对有序下标 $(i,j)$ 是极差配对，当且仅当：

- $1\\le i,j\\le n$。
- $i\\ne j$。
- $|a_i-a_j|$ 等于整个序列中任意两个数的最大绝对差。

请输出极差配对的数量。

## 输入格式

第一行输入一个整数 $T$，表示数据组数。

每组数据包含两行：

- 第一行输入一个整数 $n$。
- 第二行输入 $n$ 个整数 $a_1,a_2,\\ldots,a_n$。

## 输出格式

对每组数据输出一行一个整数，表示极差配对数量。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $T$ | 数据组数 |
| $n$ | 序列长度 |
| $a_i$ | 第 $i$ 个整数 |

## 约束

- $1 \\le T \\le 100$
- $2 \\le n \\le 2\\times 10^5$
- $-10^9 \\le a_i \\le 10^9$
- 所有数据组中 $n$ 的总和不超过 $2\\times 10^5$

## 公开样例

{sample_blocks(samples, True)}
"""
    p6["statement_en"] = lambda samples: f"""# Extreme Difference Pairs

## Task

Given an integer sequence $a_1,a_2,\\ldots,a_n$, an ordered pair of indices $(i,j)$ is extreme if:

- $1\\le i,j\\le n$.
- $i\\ne j$.
- $|a_i-a_j|$ equals the maximum absolute difference over all pairs in the sequence.

Output the number of extreme ordered pairs.

## Input Format

The first line contains an integer $T$, the number of test cases.

Each test case contains two lines:

- The first line contains $n$.
- The second line contains $n$ integers $a_1,a_2,\\ldots,a_n$.

## Output Format

For each test case, output one integer.

## Variables

| Symbol | Meaning |
| --- | --- |
| $T$ | number of test cases |
| $n$ | sequence length |
| $a_i$ | the $i$-th integer |

## Constraints

- $1 \\le T \\le 100$
- $2 \\le n \\le 2\\times 10^5$
- $-10^9 \\le a_i \\le 10^9$
- The sum of $n$ over all test cases is at most $2\\times 10^5$

## Samples

{sample_blocks(samples, False)}
"""
    p6["teacher_zh"] = "本题改编自组合计数思路题。强调有序配对和全相等特判。\n"
    p6["teacher_en"] = "This problem is adapted from a combinatorial counting pattern. Emphasize ordered pairs and the all-equal case.\n"
    p6["solution_zh"] = """# 官方题解

## 模型转化

最大绝对差一定由序列最小值和最大值贡献。若二者不同，答案来自最小值位置和最大值位置的两个方向；若二者相同，则任意不同下标都满足。

## 算法步骤

1. 扫描序列，找到最小值和最大值。
2. 统计最小值出现次数和最大值出现次数。
3. 若最小值等于最大值，输出 $n(n-1)$。
4. 否则输出 $2\\times cnt_{min}\\times cnt_{max}$。

## 正确性说明

任意两个数的绝对差不会超过最大值与最小值之差。若最大值与最小值不同，只有一个取最小值、另一个取最大值才能达到极差，并且有两个有序方向。若所有数相同，最大差为 $0$，任意不同下标都达到最大差。

## 复杂度分析

- 时间复杂度：$O(n)$
- 空间复杂度：$O(1)$

## 易错点

- 配对是有序的。
- 全相等时答案不是 $0$。
- 计数结果需要使用 `long long`。
"""
    p6["solution_en"] = """# Official Solution

## Model

The maximum absolute difference is formed by the minimum and maximum values. If they differ, only min-max pairs work. If all values are equal, every ordered pair of distinct indices works.

## Algorithm Steps

1. Find the minimum and maximum values.
2. Count their frequencies.
3. If they are equal, output $n(n-1)$.
4. Otherwise output $2\\times cnt_{min}\\times cnt_{max}$.

## Correctness

No pair can have a difference larger than maximum minus minimum. When the two values differ, equality is reached only by choosing one minimum and one maximum, with two ordered directions. When all values are equal, every distinct ordered pair has difference $0$, which is maximum.

## Complexity Analysis

- Time complexity: $O(n)$
- Memory complexity: $O(1)$

## Common Mistakes

- The pairs are ordered.
- The all-equal case is not zero.
- Use `long long` for the answer.
"""
    rng = random.Random(202)
    cases6 = [
        p6_case([[6, 2, 3, 8, 1], [7, 2, 8, 3, 2, 10]], "01", "public", "sample", "普通样例"),
        p6_case([[5, 5], [1, 1, 1, 1]], "02", "public", "sample", "全相等"),
        p6_case([[-3, 4, -3, 4, 0]], "03", "public", "sample", "含负数和重复极值"),
        p6_case([[1, 2]], "04", "hidden", "edge", "最小长度"),
        p6_case([[9, 9, 9, 9, 9]], "05", "hidden", "edge", "全相等击穿错解"),
        p6_case([[1, 3, 1, 3, 2, 2]], "06", "hidden", "pattern", "最大最小各出现两次"),
        p6_case([[-10**9, 0, 10**9, -10**9, 10**9]], "07", "hidden", "pattern", "数值边界"),
        p6_case([[rng.randint(-50, 50) for _ in range(20)] for _ in range(3)], "08", "hidden", "random-small", "多组小随机"),
        p6_case([[rng.randint(-100, 100) for _ in range(40)] for _ in range(4)], "09", "hidden", "random-small", "较小随机"),
        p6_case([[rng.randint(-10**6, 10**6) for _ in range(5000)] for _ in range(5)], "10", "hidden", "random-large", "中等多组随机"),
        p6_case([[rng.randint(-10**9, 10**9) for _ in range(10000)] for _ in range(5)], "11", "hidden", "random-large", "较大随机"),
        p6_case([[1, 5, 1, 5, 1, 5]], "12", "hidden", "adversarial", "击穿无序配对错解"),
        p6_case([[7] * 20, [2, 9, 2, 9]], "13", "hidden", "adversarial", "混合特判与普通情况"),
        p6_case([[10**9, -10**9] * 50], "14", "hidden", "boundary-mix", "极值大量重复"),
        p6_case([[i for i in range(-1000, 1000)]], "15", "hidden", "boundary-mix", "严格递增"),
        p6_case([[rng.randint(-10**9, 10**9) for _ in range(2500)] for _ in range(80)], "16", "hidden", "stress", "数据组数接近上限"),
        p6_case([[0] * 200000], "17", "hidden", "stress", "总长度上限且全相等"),
        p6_case([[-10**9] * 100000 + [10**9] * 100000], "18", "hidden", "stress", "总长度上限且两端极值"),
        p6_case([[rng.randint(-10**9, 10**9) for _ in range(200000)]], "19", "hidden", "final", "综合随机压力"),
        p6_case([[i % 17 - 8 for i in range(200000)]], "20", "hidden", "final", "大量重复小范围值"),
    ]
    problems.append((p6, cases6))

    p7 = {
        "index": 7, "id": "ch08-02-07", "slug": "ch08-02-07-power-stick-triangles", "title_zh": "指数木条三角形", "title_en": "Power Stick Triangles", "time_limit": 2.0,
        "knowledge": "数学：加法原理与组合数；编程：排序和频次计数", "family": "combinatorics", "scale_dimensions": ["T"], "scale_ratio": 0.7, "transition": "按最长边出现次数分类统计三角形选法", "graph_title": "指数木条三角形逻辑图",
        "source_type": "adapted", "source_note": "本题参考来源只记录在 `problem-bank/ADAPTED_SOURCE_INDEX.md`，题面、样例和数据均已重做。",
        "algorithms": [{"id": "combination-counting", "name": "组合计数", "family": "combinatorics", "role": "primary", "note": "使用 $C(n,2)$ 和 $C(n,3)$ 统计选法。"}, {"id": "frequency-counting", "name": "频次计数", "family": "implementation", "role": "supporting", "note": "按指数相同的木条分组。"}],
        "hints": [("最长边", "长度是 $2^{a_i}$，能成三角形时最长长度必须至少出现两次。"), ("双最长边", "选两根最长边，再从更短木条中选一根。"), ("三最长边", "三根长度相同直接组合。")],
        "necessity_target": "按最长边出现次数分类的组合计数", "alternatives": ["枚举三根木条会在大数据中超时。", "只统计三根相等会漏掉双最长边情况。"], "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_all_triples.cpp": ["adversarial"], "wa_only_equal.cpp": ["pattern", "adversarial"]}, "wrong_codes": {"wa_all_triples.cpp": P7_WA_ALL, "wa_only_equal.cpp": P7_WA_EQUAL},
        "official": P7_OFFICIAL, "brute": P7_BRUTE, "validator": generic_validator("T=int(tokens[0])\nif not (1 <= T <= 10000): raise SystemExit('T out of range')"),
        "graph": graph_yaml("指数木条三角形逻辑图", "最长长度出现两次或三次时分别计数。", [("freq", "frequency", 60, 160), ("two", "two longest", 240, 80), ("three", "three equal", 240, 240), ("add", "add", 420, 160), ("ans", "answer", 560, 160)], [("freq", "two", "C(cnt,2)*prefix"), ("freq", "three", "C(cnt,3)"), ("two", "add", "+"), ("three", "add", "+"), ("add", "ans", "total")]),
    }
    p7["statement_zh"] = lambda samples: f"""# 指数木条三角形

## 任务描述

有 $n$ 根木条，第 $i$ 根木条的长度为 $2^{{a_i}}$。

现在要从中选出恰好 $3$ 根木条组成一个面积大于 $0$ 的三角形。选择顺序不影响方案，即选中同样的三根木条算同一种方案。

请按最长边出现次数分类统计：

| 类别 | 条件 |
| --- | --- |
| 双最长边 | 三根木条中，最长长度恰好出现 $2$ 次 |
| 三最长边 | 三根木条长度全部相同 |

输出双最长边方案数、三最长边方案数，以及总方案数。

## 输入格式

第一行输入一个整数 $T$，表示数据组数。

每组数据包含两行：

- 第一行输入一个整数 $n$。
- 第二行输入 $n$ 个整数 $a_1,a_2,\\ldots,a_n$。

## 输出格式

对每组数据输出一行三个整数，依次表示双最长边方案数、三最长边方案数、总方案数。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $T$ | 数据组数 |
| $n$ | 木条数量 |
| $a_i$ | 第 $i$ 根木条的指数 |

## 约束

- $1 \\le T \\le 10^4$
- $1 \\le n \\le 3\\times 10^5$
- $0 \\le a_i \\le 10^6$
- 所有数据组中 $n$ 的总和不超过 $3\\times 10^5$

## 公开样例

{sample_blocks(samples, True)}
"""
    p7["statement_en"] = lambda samples: f"""# Power Stick Triangles

## Task

There are $n$ sticks. Stick $i$ has length $2^{{a_i}}$.

Choose exactly $3$ sticks to form a non-degenerate triangle. The order of choosing sticks does not matter.

Classify valid choices by how many sticks have the longest length:

| Class | Condition |
| --- | --- |
| two longest | the longest length appears exactly $2$ times |
| three longest | all three sticks have the same length |

Output the two-longest count, the three-longest count, and the total.

## Input Format

The first line contains an integer $T$, the number of test cases.

Each test case contains two lines:

- The first line contains $n$.
- The second line contains $n$ integers $a_1,a_2,\\ldots,a_n$.

## Output Format

For each test case, output three integers: two-longest, three-longest, and total.

## Variables

| Symbol | Meaning |
| --- | --- |
| $T$ | number of test cases |
| $n$ | number of sticks |
| $a_i$ | exponent of stick $i$ |

## Constraints

- $1 \\le T \\le 10^4$
- $1 \\le n \\le 3\\times 10^5$
- $0 \\le a_i \\le 10^6$
- The sum of $n$ over all test cases is at most $3\\times 10^5$

## Samples

{sample_blocks(samples, False)}
"""
    p7["teacher_zh"] = "本题改编自指数长度三角形计数。关键结论是最长长度必须至少出现两次。\n"
    p7["teacher_en"] = "This problem is adapted from a power-length triangle counting pattern. The key observation is that the longest length must appear at least twice.\n"
    p7["solution_zh"] = """# 官方题解

## 模型转化

长度都是 $2$ 的幂。若最长指数只出现一次，则另外两边长度之和不可能严格大于最长边。因此合法三角形只分为双最长边和三最长边两类。

## 算法步骤

1. 按指数排序或统计频次。
2. 维护当前指数之前的木条数量前缀。
3. 对某个指数出现次数为 $c$：
   - 双最长边贡献为 $C(c,2)\\times prefix$。
   - 三最长边贡献为 $C(c,3)$。
4. 累加两类答案。

## 正确性说明

若最大长度只出现一次，另外两根最长也至多等于最大长度的一半，三边不满足严格三角形不等式。若最大长度出现两次，第三根任意更短都可组成非退化三角形；若三根相等也必然可行。两类互斥，按加法原理相加。

## 复杂度分析

- 时间复杂度：$O(n\\log n)$
- 空间复杂度：$O(n)$

## 易错点

- 不能把所有三元组都算作三角形。
- 双最长边和三最长边要分开统计。
- 答案需要使用 `long long`。
"""
    p7["solution_en"] = """# Official Solution

## Model

All lengths are powers of two. If the longest exponent appears only once, the other two sides cannot have a sum strictly greater than the longest side. Therefore valid triangles fall into exactly two classes.

## Algorithm Steps

1. Sort exponents or count their frequencies.
2. Maintain the number of sticks with smaller exponents.
3. For a frequency $c$:
   - Two-longest contribution is $C(c,2)\\times prefix$.
   - Three-longest contribution is $C(c,3)$.
4. Add the two classes.

## Correctness

If the longest length appears once, the other two sides are not enough for a strict triangle inequality. If it appears twice, any smaller third side works; if all three are equal, it also works. The two classes are disjoint, so the addition principle gives the total.

## Complexity Analysis

- Time complexity: $O(n\\log n)$
- Memory complexity: $O(n)$

## Common Mistakes

- Not every triple forms a triangle.
- Count two-longest and three-longest separately.
- Use `long long` for the answer.
"""
    rng = random.Random(303)
    cases7 = [
        p7_case([[1, 1, 1, 1, 1, 1, 1]], "01", "public", "sample", "全部相同"),
        p7_case([[3, 2, 1, 3]], "02", "public", "sample", "双最长边"),
        p7_case([[1, 2, 3]], "03", "public", "sample", "无法组成三角形"),
        p7_case([[0]], "04", "hidden", "edge", "不足三根"),
        p7_case([[5, 5]], "05", "hidden", "edge", "两根木条"),
        p7_case([[2, 2, 1, 1, 0]], "06", "hidden", "pattern", "双最长边多选"),
        p7_case([[4, 4, 4, 3, 3, 2]], "07", "hidden", "pattern", "两类同时存在"),
        p7_case([[rng.randint(0, 5) for _ in range(20)] for _ in range(3)], "08", "hidden", "random-small", "小规模随机"),
        p7_case([[rng.randint(0, 10) for _ in range(50)] for _ in range(4)], "09", "hidden", "random-small", "较小随机"),
        p7_case([[rng.randint(0, 1000) for _ in range(5000)] for _ in range(4)], "10", "hidden", "random-large", "中等随机"),
        p7_case([[rng.randint(0, 10**6) for _ in range(20000)] for _ in range(3)], "11", "hidden", "random-large", "较大随机"),
        p7_case([[1, 2, 3, 4, 5, 6]], "12", "hidden", "adversarial", "击穿所有三元组错解"),
        p7_case([[1, 1, 2, 2, 2, 3, 3]], "13", "hidden", "adversarial", "击穿只统计全等错解"),
        p7_case([[0, 0, 0, 10**6, 10**6, 10**6]], "14", "hidden", "boundary-mix", "指数边界"),
        p7_case([[i % 4 for i in range(100)]], "15", "hidden", "boundary-mix", "重复分布均匀"),
        p7_case([[i % 3 for i in range(3)] for _ in range(8000)], "16", "hidden", "stress", "数据组数较大"),
        p7_case([[7] * 300000], "17", "hidden", "stress", "总长度上限且全相等"),
        p7_case([[0] * 100000 + [1] * 100000 + [2] * 100000], "18", "hidden", "stress", "大频次分层"),
        p7_case([[rng.randint(0, 10**6) for _ in range(300000)]], "19", "hidden", "final", "综合随机压力"),
        p7_case([[i // 10 for i in range(300000)]], "20", "hidden", "final", "大量小频次分布"),
    ]
    problems.append((p7, cases7))

    p8 = {
        "index": 8, "id": "ch08-02-08", "slug": "ch08-02-08-non-mountain-permutations", "title_zh": "排列主峰分类", "title_en": "Main-Peak Permutation Classification", "time_limit": 2.0,
        "knowledge": "数学：排列组合与加法原理；编程：阶乘预处理和快速幂", "family": "combinatorics", "scale_dimensions": ["n"], "transition": "按最大值位置分类计算主峰排列数量", "graph_title": "排列主峰分类逻辑图",
        "source_type": "adapted", "source_note": "本题参考来源只记录在 `problem-bank/ADAPTED_SOURCE_INDEX.md`，题面、样例和数据均已重做。",
        "algorithms": [{"id": "permutation-counting", "name": "排列组合计数", "family": "combinatorics", "role": "primary", "note": "总排列数为 $n!$，主峰排列按峰值位置分类。"}, {"id": "fast-power", "name": "快速幂", "family": "math", "role": "supporting", "note": "计算 $2^{n-1}$。"}],
        "hints": [("固定峰位", "若最大值在位置 $p$，左侧元素集合一旦确定，顺序也确定。"), ("累加峰位", "所有位置的主峰排列总数为组合数之和。"), ("取反统计", "不是主峰排列等于总排列数减主峰排列数。")],
        "necessity_target": "排列组合分类计数与快速幂", "alternatives": ["枚举排列只适合极小 $n$。", "只按峰值位置数量相减会漏掉左右元素集合的选择。"], "separating_groups": ["pattern", "adversarial", "stress"],
        "wrong_targets": {"wa_subtract_n.cpp": ["pattern", "adversarial"], "wa_power_n.cpp": ["adversarial"]}, "wrong_codes": {"wa_subtract_n.cpp": P8_WA_N, "wa_power_n.cpp": P8_WA_POW},
        "official": P8_OFFICIAL, "brute": P8_BRUTE, "validator": generic_validator("n=int(tokens[0])\nif not (3 <= n <= 10**6): raise SystemExit('n out of range')"),
        "graph": graph_yaml("排列主峰分类逻辑图", "主峰排列按最大值所在位置分类，最后用总排列数相减。", [("total", "n!", 60, 160), ("p", "peak pos p", 240, 80), ("choose", "choose left", 240, 240), ("main", "2^(n-1)", 420, 160), ("ans", "subtract", 580, 160)], [("p", "choose", "C"), ("choose", "main", "sum p"), ("total", "ans", "total"), ("main", "ans", "-")]),
    }
    p8["statement_zh"] = lambda samples: f"""# 排列主峰分类

## 任务描述

给定正整数 $n$。一个长度为 $n$ 的排列由 $1$ 到 $n$ 这 $n$ 个整数各出现一次组成。

若一个排列存在位置 $p$，满足：

- $a_p=n$。
- $a_1<a_2<\\cdots<a_p$。
- $a_p>a_{{p+1}}>\\cdots>a_n$。

则称它为主峰排列。左侧或右侧可以为空。

请统计不是主峰排列的排列数量。答案对 $10^9+7$ 取模。

## 输入格式

第一行输入一个整数 $n$。

## 输出格式

输出一行一个整数，表示不是主峰排列的排列数量。

## 变量说明

| 符号 | 含义 |
| --- | --- |
| $n$ | 排列长度 |
| $p$ | 最大值所在位置 |
| $a_i$ | 排列中第 $i$ 个数 |

## 约束

- $3 \\le n \\le 10^6$

## 公开样例

{sample_blocks(samples, True)}
"""
    p8["statement_en"] = lambda samples: f"""# Main-Peak Permutation Classification

## Task

Given an integer $n$, a permutation of length $n$ contains each integer from $1$ to $n$ exactly once.

A permutation is called a main-peak permutation if there is a position $p$ such that:

- $a_p=n$.
- $a_1<a_2<\\cdots<a_p$.
- $a_p>a_{{p+1}}>\\cdots>a_n$.

The left side or the right side may be empty.

Count the permutations that are not main-peak permutations, modulo $10^9+7$.

## Input Format

The first line contains one integer $n$.

## Output Format

Output one integer: the number of non-main-peak permutations.

## Variables

| Symbol | Meaning |
| --- | --- |
| $n$ | permutation length |
| $p$ | position of the maximum value |
| $a_i$ | the $i$-th value in the permutation |

## Constraints

- $3 \\le n \\le 10^6$

## Samples

{sample_blocks(samples, False)}
"""
    p8["teacher_zh"] = "本题改编自排列图形计数思路。核心是主峰排列数量为 $2^{n-1}$，不是主峰则用 $n!$ 相减。\n"
    p8["teacher_en"] = "This problem is adapted from a permutation counting pattern. The key formula is that main-peak permutations count $2^{n-1}$.\n"
    p8["solution_zh"] = """# 官方题解

## 模型转化

先统计主峰排列数量，再用全部排列数减去它。若最大值 $n$ 在位置 $p$，只需要决定哪些数放在左侧，左侧递增、右侧递减的顺序都被唯一确定。

## 算法步骤

1. 全部排列数量为 $n!$。
2. 固定最大值位置 $p$，左侧需要选择 $p-1$ 个数，方案数为 $C(n-1,p-1)$。
3. 对所有 $p$ 累加，主峰排列数量为 $\\sum C(n-1,p-1)=2^{n-1}$。
4. 输出 $n!-2^{n-1}$ 对 $10^9+7$ 取模后的结果。

## 正确性说明

固定左侧元素集合后，左侧必须递增排列，右侧必须递减排列，因此该集合对应唯一主峰排列。不同峰值位置或不同左侧集合得到不同排列，所以可以按加法原理累加。全部排列与主峰排列相减，得到不是主峰排列的数量。

## 复杂度分析

- 时间复杂度：$O(n)$
- 空间复杂度：$O(1)$

## 易错点

- 主峰排列不是只有 $n$ 种。
- 主峰数量是 $2^{n-1}$，不是 $2^n$。
- 减法取模后要加上 $10^9+7$。
"""
    p8["solution_en"] = """# Official Solution

## Model

Count main-peak permutations first and subtract them from all permutations. If the maximum value $n$ is at position $p$, choosing the $p-1$ values on the left uniquely determines the increasing left side and the decreasing right side.

## Algorithm Steps

1. The total number of permutations is $n!$.
2. For fixed position $p$, choose $p-1$ values from the other $n-1$ values.
3. Summing over all $p$ gives $\\sum C(n-1,p-1)=2^{n-1}$ main-peak permutations.
4. Output $n!-2^{n-1}$ modulo $10^9+7$.

## Correctness

Once the left-side set is fixed, both sides have forced orders, so it gives exactly one main-peak permutation. Different choices give different permutations, and the addition principle counts all main-peak permutations. Subtracting from all permutations gives the required complement.

## Complexity Analysis

- Time complexity: $O(n)$
- Memory complexity: $O(1)$

## Common Mistakes

- There are not only $n$ main-peak permutations.
- The main-peak count is $2^{n-1}$, not $2^n$.
- Add $10^9+7$ after subtraction before taking modulo.
"""
    cases8 = [
        p8_case(3, "01", "public", "sample", "最小长度"),
        p8_case(4, "02", "public", "sample", "小规模"),
        p8_case(5, "03", "public", "sample", "继续递增"),
        p8_case(6, "04", "hidden", "edge", "较小边界"),
        p8_case(7, "05", "hidden", "edge", "奇数长度"),
        p8_case(8, "06", "hidden", "pattern", "击穿只减位置数量"),
        p8_case(10, "07", "hidden", "pattern", "阶乘与幂差"),
        p8_case(20, "08", "hidden", "random-small", "小规模取模"),
        p8_case(50, "09", "hidden", "random-small", "中小规模"),
        p8_case(1000, "10", "hidden", "random-large", "中等规模"),
        p8_case(10000, "11", "hidden", "random-large", "较大规模"),
        p8_case(9, "12", "hidden", "adversarial", "击穿错误主峰数量"),
        p8_case(11, "13", "hidden", "adversarial", "击穿 $2^n$ 错解"),
        p8_case(100000, "14", "hidden", "boundary-mix", "大规模阶乘"),
        p8_case(500000, "15", "hidden", "boundary-mix", "半上限"),
        p8_case(800000, "16", "hidden", "stress", "接近上限"),
        p8_case(1000000, "17", "hidden", "stress", "规模上限"),
        p8_case(999983, "18", "hidden", "stress", "大质数长度"),
        p8_case(765432, "19", "hidden", "final", "综合大规模"),
        p8_case(999999, "20", "hidden", "final", "上限附近"),
    ]
    problems.append((p8, cases8))

    return problems


def main() -> None:
    for problem, cases in build_problems():
        write_package(problem, cases)
    print("Generated ch08-02 packages:", len(build_problems()))


if __name__ == "__main__":
    main()
