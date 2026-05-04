type VerdictResult = 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'

const messages: Record<VerdictResult, string[]> = {
  AC: [
    '通过啦！这段代码已经帮犬虎完成任务了。',
    '答案正确。犬虎把这一步稳稳走过去了。',
  ],
  WA: [
    '差一点点。再仔细看看输出格式和边界情况。',
    '有些测试点还没答对，先对照公开样例检查一下。',
  ],
  TLE: [
    '方向可能对了，但走得有点慢。试试减少重复计算。',
    '代码跑太久了，可以想想有没有更直接的做法。',
  ],
  RE: [
    '代码跑到一半停住了，检查一下除以 0、越界或输入读取。',
    '程序运行时遇到意外了，先从变量范围和输入格式查起。',
  ],
  CE: [
    '代码还没编译通过，看看括号、分号或变量名有没有写错。',
    '编译器还没看懂这段代码，先检查语法细节。',
  ],
}

export function pickChildFriendlyMessage(result: VerdictResult): string {
  const pool = messages[result]
  return pool[Math.floor(Math.random() * pool.length)] ?? messages.WA[0]
}
