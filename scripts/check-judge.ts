import { aggregateJudgeResults, mockExecuteCpp, mockJudgeSubmission } from '../shared/judge.js'
import { getCompilerOptions, getJudge0LanguageId, resolveLanguageMode } from '../shared/language-config.js'
import type { TestCase, Verdict } from '../shared/types.js'

const cases: TestCase[] = [
  {
    id: 'case-01',
    visibility: 'public',
    input: '',
    expectedOutput: '早安雾镇！\n',
  },
  {
    id: 'case-02',
    visibility: 'hidden',
    input: '',
    expectedOutput: '早安雾镇！',
  },
]

const message = (result: Verdict['result']) => `message:${result}`

const checks: Array<[string, () => void]> = [
  [
    'mock AC',
    () => {
      const verdict = mockJudgeSubmission({
        code: '#include <iostream>\nint main(){ std::cout << "早安雾镇！"; }',
        cases,
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'AC', 2, null)
    },
  ],
  [
    'mock WA',
    () => {
      const verdict = mockJudgeSubmission({
        code: '#include <iostream>\nint main(){ std::cout << "早上好"; }',
        cases,
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'WA', 0, 0)
    },
  ],
  [
    'mock CE',
    () => {
      const verdict = mockJudgeSubmission({
        code: 'int main(){ cout << ; }',
        cases,
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'CE', 0, 0)
    },
  ],
  [
    'mock RE',
    () => {
      const verdict = mockJudgeSubmission({
        code: 'int main(){ int x = 1 / 0; }',
        cases,
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'RE', 0, 0)
    },
  ],
  [
    'mock TLE',
    () => {
      const verdict = mockJudgeSubmission({
        code: 'int main(){ while(true){} }',
        cases,
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'TLE', 0, 0)
    },
  ],
  [
    'mock cin run output',
    () => {
      const execution = mockExecuteCpp(
        '#include <iostream>\nusing namespace std;\nint main(){ int a,b; cin >> a >> b; cout << a + b; }',
        '3 4',
      )

      if (execution.result !== 'AC') throw new Error(`expected mock execution AC, got ${execution.result}`)
      if (execution.stdout !== '7') throw new Error(`expected stdout 7, got ${execution.stdout}`)
    },
  ],
  [
    'mock single cin cout echo output',
    () => {
      const execution = mockExecuteCpp(
        '#include <iostream>\nusing namespace std;\nint main(){ int n; cin >> n; cout << n << endl; return 0; }',
        '7\n',
      )

      if (execution.result !== 'AC') throw new Error(`expected mock execution AC, got ${execution.result}`)
      if (execution.stdout !== '7\n') throw new Error(`expected stdout 7 newline, got ${JSON.stringify(execution.stdout)}`)
    },
  ],
  [
    'mock scanf printf echo output',
    () => {
      const execution = mockExecuteCpp(
        '#include <cstdio>\nint main(){ int n; scanf("%d", &n); printf("%d\\n", n); return 0; }',
        '12\n',
      )

      if (execution.result !== 'AC') throw new Error(`expected mock execution AC, got ${execution.result}`)
      if (execution.stdout !== '12\n') throw new Error(`expected stdout 12 newline, got ${JSON.stringify(execution.stdout)}`)
    },
  ],
  [
    'mock ch1-04 time difference with assigned variables',
    () => {
      const execution = mockExecuteCpp(
        [
          '#include <iostream>',
          'using namespace std;',
          'int main() {',
          '  int h1, m1, h2, m2;',
          '  cin >> h1 >> m1 >> h2 >> m2;',
          '  int s1 = h1 * 60 + m1;',
          '  int s2 = h2 * 60 + m2;',
          '  cout << s2 - s1;',
          '  return 0;',
          '}',
        ].join('\n'),
        '6\n45\n7\n20\n',
      )

      if (execution.result !== 'AC') throw new Error(`expected mock execution AC, got ${execution.result}`)
      if (execution.stdout !== '35') throw new Error(`expected stdout 35, got ${JSON.stringify(execution.stdout)}`)
    },
  ],
  [
    'mock ch1-04 public samples AC',
    () => {
      const verdict = mockJudgeSubmission({
        code: [
          '#include <iostream>',
          'using namespace std;',
          'int main() {',
          '  int h1, m1, h2, m2;',
          '  cin >> h1 >> m1 >> h2 >> m2;',
          '  int s1 = h1 * 60 + m1;',
          '  int s2 = h2 * 60 + m2;',
          '  cout << s2 - s1;',
          '  return 0;',
          '}',
        ].join('\n'),
        cases: [
          { id: 'case-01', visibility: 'public', input: '0\n0\n0\n1\n', expectedOutput: '1\n' },
          { id: 'case-02', visibility: 'public', input: '0\n5\n1\n5\n', expectedOutput: '60\n' },
          { id: 'case-03', visibility: 'public', input: '3\n59\n4\n0\n', expectedOutput: '1\n' },
        ],
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'AC', 3, null)
    },
  ],
  [
    'mock if else only executes one branch',
    () => {
      const code = [
        '#include <iostream>',
        'using namespace std;',
        'int main() {',
        '  int r;',
        '  cin >> r;',
        '  if (r >= 60)',
        '    cout << "Umbrella";',
        '  else',
        '    cout << "Ready";',
        '  return 0;',
        '}',
      ].join('\n')

      const rainy = mockExecuteCpp(code, '60\n')
      const clear = mockExecuteCpp(code, '30\n')

      if (rainy.stdout !== 'Umbrella') throw new Error(`expected Umbrella, got ${JSON.stringify(rainy.stdout)}`)
      if (clear.stdout !== 'Ready') throw new Error(`expected Ready, got ${JSON.stringify(clear.stdout)}`)
    },
  ],
  [
    'mock ch1-06 official single if output',
    () => {
      const code = [
        '#include <iostream>',
        'using namespace std;',
        'int main() {',
        '  int r;',
        '  cin >> r;',
        '  cout << "Ready" << endl;',
        '  if (r >= 60) {',
        '    cout << "Umbrella" << endl;',
        '  }',
        '  return 0;',
        '}',
      ].join('\n')

      const rainy = mockExecuteCpp(code, '60\n')
      const clear = mockExecuteCpp(code, '30\n')

      if (rainy.stdout !== 'Ready\nUmbrella\n') {
        throw new Error(`expected Ready/Umbrella, got ${JSON.stringify(rainy.stdout)}`)
      }
      if (clear.stdout !== 'Ready\n') throw new Error(`expected Ready newline, got ${JSON.stringify(clear.stdout)}`)
    },
  ],
  [
    'mock ch1-06 wrong answer remains WA',
    () => {
      const verdict = mockJudgeSubmission({
        code: [
          '#include <iostream>',
          'using namespace std;',
          'int main() {',
          '  int r;',
          '  cin >> r;',
          '  if (r >= 60)',
          '    cout << "Umbrella";',
          '  else',
          '    cout << "Ready";',
          '  return 0;',
          '}',
        ].join('\n'),
        cases: [{ id: 'case-01', visibility: 'public', input: '60\n', expectedOutput: 'Ready\nUmbrella\n' }],
        timeLimitMs: 1000,
        childMessage: message,
      })
      assertVerdict(verdict, 'WA', 0, 0)
    },
  ],
  [
    'language auto defaults to C++14',
    () => {
      const language = resolveLanguageMode('auto', '#include <iostream>\nint main(){ std::cout << 1; }')
      if (language !== 'cpp14') throw new Error(`expected cpp14, got ${language}`)
      if (getCompilerOptions(language) !== '-std=c++14 -pedantic-errors') {
        throw new Error(`expected strict C++14 compiler options, got ${getCompilerOptions(language)}`)
      }
    },
  ],
  [
    'language auto detects C',
    () => {
      const language = resolveLanguageMode('auto', '#include <stdio.h>\nint main(void){ printf("1"); }')
      if (language !== 'c') throw new Error(`expected c, got ${language}`)
      if (getJudge0LanguageId(language) !== 50) throw new Error('expected Judge0 C language id 50')
    },
  ],
  [
    'language auto detects Python3',
    () => {
      const language = resolveLanguageMode('auto', 'import sys\nprint(sys.stdin.readline().strip())')
      if (language !== 'python3') throw new Error(`expected python3, got ${language}`)
      if (getJudge0LanguageId(language) !== 71) throw new Error('expected Judge0 Python3 language id 71')
    },
  ],
  [
    'language manual choice does not fallback',
    () => {
      const language = resolveLanguageMode('cpp14', 'print(1)')
      if (language !== 'cpp14') throw new Error(`expected manual cpp14, got ${language}`)
    },
  ],
  [
    'aggregate trims output and stops on WA',
    () => {
      const verdict = aggregateJudgeResults(
        [
          { status: { id: 3 }, time: '0.010', stdout: '早安雾镇！\n' },
          { status: { id: 3 }, time: '0.020', stdout: '错了' },
        ],
        cases,
        1000,
        message,
      )
      assertVerdict(verdict, 'WA', 1, 1)
      if (verdict.maxRuntimeMs !== 20) throw new Error(`expected maxRuntimeMs 20, got ${verdict.maxRuntimeMs}`)
    },
  ],
  [
    'aggregate Judge0 WA status',
    () => {
      const verdict = aggregateJudgeResults(
        [{ status: { id: 4, description: 'Wrong Answer' }, time: '0.010', stdout: '' }],
        cases,
        1000,
        message,
      )
      assertVerdict(verdict, 'WA', 0, 0)
    },
  ],
  [
    'aggregate CE has errorDetail',
    () => {
      const verdict = aggregateJudgeResults(
        [{ status: { id: 6 }, time: '0', stdout: null, compile_output: 'missing semicolon' }],
        cases,
        1000,
        message,
      )
      assertVerdict(verdict, 'CE', 0, 0)
      if (!verdict.errorDetail?.includes('semicolon')) throw new Error('expected CE errorDetail')
    },
  ],
  [
    'aggregate Judge0 internal error status',
    () => {
      const verdict = aggregateJudgeResults(
        [{ status: { id: 13, description: 'Internal Error' }, time: '0', message: 'sandbox unavailable' }],
        cases,
        1000,
        message,
      )
      assertVerdict(verdict, 'Judge Error', 0, 0)
      if (!verdict.errorDetail?.includes('sandbox')) throw new Error('expected Judge Error detail')
    },
  ],
]

for (const [name, check] of checks) {
  check()
  console.log(`ok - ${name}`)
}

console.log(`Judge checks passed: ${checks.length}`)

function assertVerdict(
  verdict: Verdict,
  result: Verdict['result'],
  passedCases: number,
  failedCaseIndex: number | null,
) {
  if (verdict.result !== result) throw new Error(`expected ${result}, got ${verdict.result}`)
  if (verdict.passedCases !== passedCases) {
    throw new Error(`expected passedCases ${passedCases}, got ${verdict.passedCases}`)
  }
  if (verdict.failedCaseIndex !== failedCaseIndex) {
    throw new Error(`expected failedCaseIndex ${failedCaseIndex}, got ${verdict.failedCaseIndex}`)
  }
  if (verdict.childFriendlyMessage !== `message:${result}`) {
    throw new Error(`unexpected childFriendlyMessage: ${verdict.childFriendlyMessage}`)
  }
}
