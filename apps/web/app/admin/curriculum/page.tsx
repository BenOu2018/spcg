import Link from 'next/link'
import { LESSON_ROLE_SUMMARIES, V02_REQUIRED_ITEM_COUNT } from '@spcg/shared/curriculum'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import type { Difficulty } from '@spcg/shared/types'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { getAdminLevel } from '@/lib/admin-data'
import {
  getAdminProblemSetDetail,
  listAdminProblemSetLevelCandidates,
  listAdminProblemSets,
} from '@/lib/services/problem-set-service'
import { AdminModal } from '../components/AdminModal'
import { updateLevelDetails } from '../levels/actions'
import { setProblemSetStatus } from '../problem-sets/actions'
import {
  addCurriculumStageProblemAction,
  archiveCurriculumProblemAction,
  createCurriculumDraftLevelAction,
  createCurriculumStageAction,
  updateCurriculumStageAction,
  updateCurriculumProblemSummaryAction,
} from './actions'

type AdminCurriculumPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const spcgLevels = Array.from({ length: 10 }, (_, index) => index + 1)
const difficultyLabels = ['入门', '基础', '提高', '挑战', '综合'] as const

export default async function AdminCurriculumPage({ searchParams }: AdminCurriculumPageProps) {
  const resolvedSearchParams = await searchParams
  const selectedLevel = readSelectedLevel(resolvedSearchParams?.level)
  const selectedTrack = readSelectedTrack(resolvedSearchParams?.track)
  const selectedSetId = readStringParam(resolvedSearchParams?.set)
  const requestedProblemId = readStringParam(resolvedSearchParams?.problem)
  const [sets, candidates] = await Promise.all([listAdminProblemSets(), listAdminProblemSetLevelCandidates()])
  const allLevelLessonSets = sets.filter((set) => set.type === 'lesson' && set.spcgLevel === selectedLevel)
  const lessonSets = allLevelLessonSets.filter((set) => set.track === selectedTrack)
  const selectedSetSummary = lessonSets.find((set) => set.id === selectedSetId) ?? lessonSets[0] ?? null
  const selectedSet = selectedSetSummary ? await getAdminProblemSetDetail(selectedSetSummary.id) : null
  const stagePoolSets = selectedSetSummary?.stageNo
    ? await Promise.all(
        allLevelLessonSets
          .filter((set) => set.stageNo === selectedSetSummary.stageNo && set.status !== 'archived')
          .map((set) => getAdminProblemSetDetail(set.id)),
      )
    : []
  const stagePoolItemIds = new Set(
    stagePoolSets.flatMap((set) => set?.items.map((item) => item.levelId) ?? []),
  )
  const selectedItem =
    selectedSet?.items.find((item) => item.levelId === requestedProblemId) ?? selectedSet?.items[0] ?? null
  const selectedProblem = selectedItem ? await getAdminLevel(selectedItem.levelId) : null
  const selectedItemIds = new Set(selectedSet?.items.map((item) => item.levelId) ?? [])
  const importCandidates = candidates.filter(
    (level) =>
      level.difficulty.spcgLevel === selectedLevel && stagePoolItemIds.has(level.id) && !selectedItemIds.has(level.id),
  )
  const nextStageNo = Math.max(0, ...lessonSets.map((set) => set.stageNo ?? 0)) + 1
  const generatedStageId = buildStageId(selectedLevel, nextStageNo, selectedTrack)
  const nextTrack = selectedTrack === 'A' ? 'B' : 'A'

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Curriculum</span>
          <h1>题库结构</h1>
        </div>
        <span className="admin-count">
          SPCG {selectedLevel}级 · {selectedTrack}线 · {lessonSets.length} 个关卡
        </span>
      </header>

      <nav className="admin-level-tabs" aria-label="SPCG level filter">
        {spcgLevels.map((level) => (
          <Link
            className={level === selectedLevel ? 'active' : ''}
            href={`/admin/curriculum?level=${level}&track=${selectedTrack}`}
            key={level}
          >
            SPCG {level}级
          </Link>
        ))}
      </nav>

      <section className="admin-curriculum-workbench">
        <article className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>关卡 / 算法列表</h2>
              <span className="admin-count">名称和算法内容</span>
            </div>
            <div className="admin-row-actions">
              <Link
                className="admin-small-button admin-track-toggle"
                href={`/admin/curriculum?level=${selectedLevel}&track=${nextTrack}`}
              >
                {selectedTrack}线
              </Link>
              <StageCreateModal
                generatedStageId={generatedStageId}
                nextStageNo={nextStageNo}
                selectedLevel={selectedLevel}
                selectedTrack={selectedTrack}
              />
              <StageEditModal selectedLevel={selectedLevel} selectedSet={selectedSet} />
              <StageArchiveModal selectedSet={selectedSet} />
            </div>
          </div>
          <div className="admin-plain-list admin-stage-plain-list">
            <div className="admin-plain-list-head">
              <span>关卡</span>
              <span>名称</span>
              <span>算法内容</span>
              <span>状态</span>
            </div>
            {lessonSets.map((set) => (
              <Link
                className={selectedSet?.id === set.id ? 'admin-plain-list-row active' : 'admin-plain-list-row'}
                href={`/admin/curriculum?level=${selectedLevel}&track=${selectedTrack}&set=${set.id}`}
                key={set.id}
                scroll={false}
              >
                <span>
                  第{set.stageNo}关
                  <small>{set.track}线</small>
                </span>
                <span>
                  {set.title}
                  <small>{set.id}</small>
                </span>
                <span>{set.lessonFocus ?? set.description ?? '-'}</span>
                <em className={`admin-status admin-status-${set.status}`}>{set.status}</em>
              </Link>
            ))}
            {lessonSets.length === 0 ? <p className="admin-empty">当前 SPCG 级别还没有关卡。</p> : null}
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>题目列表</h2>
              <span className="admin-count">{selectedSet ? selectedSet.title : '请选择关卡'}</span>
            </div>
            <div className="admin-row-actions">
              <ProblemImportModal
                candidates={importCandidates}
                selectedLevel={selectedLevel}
                selectedSet={selectedSet}
                selectedTrack={selectedTrack}
              />
              <ProblemCreateModal selectedLevel={selectedLevel} selectedSet={selectedSet} selectedTrack={selectedTrack} />
              <ProblemSummaryEditModal
                selectedItem={selectedItem}
                selectedProblem={selectedProblem}
                selectedSet={selectedSet}
                selectedTrack={selectedTrack}
              />
              <ProblemArchiveModal
                selectedItem={selectedItem}
                selectedLevel={selectedLevel}
                selectedSet={selectedSet}
                selectedTrack={selectedTrack}
              />
            </div>
          </div>
          <div className="admin-plain-list admin-problem-plain-list">
            <div className="admin-plain-list-head">
              <span>位置</span>
              <span>题目</span>
              <span>算法 / 难度</span>
              <span>用途</span>
              <span>状态</span>
            </div>
            {selectedSet?.items.map((item) => (
              <Link
                className={selectedItem?.levelId === item.levelId ? 'admin-plain-list-row active' : 'admin-plain-list-row'}
                href={`/admin/curriculum?level=${selectedLevel}&track=${selectedTrack}&set=${selectedSet.id}&problem=${item.levelId}`}
                key={item.levelId}
                scroll={false}
              >
                <span>#{item.position}</span>
                <span>
                  {item.title}
                  <small>{item.levelId}</small>
                </span>
                <span>
                  {item.knowledgePoint ?? '-'}
                  <small>{item.difficulty ? difficultyLabel(item.difficulty) : '-'}</small>
                </span>
                <span>{item.displayMode}</span>
                <em className={`admin-status admin-status-${item.status ?? 'draft'}`}>{item.status ?? '-'}</em>
              </Link>
            ))}
            {selectedSet && selectedSet.items.length === 0 ? <p className="admin-empty">当前关卡还没有题目。</p> : null}
            {!selectedSet ? <p className="admin-empty">先在左侧选择或新增一个关卡。</p> : null}
          </div>
        </article>
      </section>

      {selectedProblem ? (
        <section className="admin-stack" id="problem-detail">
          <header className="admin-page-head">
            <div>
              <span className="admin-eyebrow">Problem Detail</span>
              <h1>{selectedProblem.title}</h1>
            </div>
            <Link className="admin-secondary-link" href={`/admin/levels/${selectedProblem.id}`}>
              Open level detail
            </Link>
          </header>
          <article className="admin-panel">
            <h2>题面预览</h2>
            <div className="admin-statement-preview">
              <StatementMarkdown markdown={selectedProblem.description} assets={selectedProblem.statementAssets} />
            </div>
          </article>
          <LevelContentEditor level={selectedProblem} />
        </section>
      ) : (
        <article className="admin-panel">
          <h2>题目内容详情</h2>
          <p className="admin-help-text">选择右侧题目后，会在这里显示完整题面、测试点、提示、题解和代码编辑区。</p>
        </article>
      )}
    </section>
  )
}

function StageCreateModal({
  generatedStageId,
  nextStageNo,
  selectedLevel,
  selectedTrack,
}: {
  generatedStageId: string
  nextStageNo: number
  selectedLevel: number
  selectedTrack: 'A' | 'B'
}) {
  return (
    <AdminModal title="新增关卡 / 算法分类" triggerLabel="新增">
      <form action={createCurriculumStageAction} className="admin-form-grid admin-form-grid-curriculum-stage">
        <label>
          <span>ID 自动生成</span>
          <input readOnly value={generatedStageId} />
        </label>
        <label>
          <span>名称</span>
          <input name="title" placeholder={nextStageNo === 5 ? '切苹果A' : '填写关卡名称'} required />
        </label>
        <label>
          <span>SPCG Level</span>
          <input name="spcgLevel" min={1} max={10} readOnly type="number" value={selectedLevel} />
        </label>
        <label>
          <span>关卡编号</span>
          <input name="stageNo" min={1} type="number" defaultValue={nextStageNo} required />
        </label>
        <label>
          <span>线路</span>
          <select name="track" defaultValue={selectedTrack} required>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label>
          <span>Visibility</span>
          <select name="visibility" defaultValue="admin" required>
            <option value="admin">admin</option>
            <option value="student">student</option>
          </select>
        </label>
        <label className="admin-form-span-2">
          <span>算法内容</span>
          <input name="lessonFocus" placeholder="枚举、排序、BFS、动态规划" required />
        </label>
        <label className="admin-form-span-2">
          <span>说明</span>
          <textarea name="description" rows={3} />
        </label>
        <button className="admin-button" type="submit">
          Create
        </button>
      </form>
    </AdminModal>
  )
}

function StageEditModal({
  selectedLevel,
  selectedSet,
}: {
  selectedLevel: number
  selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>>
}) {
  return (
    <AdminModal disabled={!selectedSet} title="修改关卡 / 算法分类" triggerLabel="修改">
      {selectedSet ? (
        <form action={updateCurriculumStageAction} className="admin-form-grid admin-form-grid-curriculum-stage">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <label>
            <span>名称</span>
            <input name="title" defaultValue={selectedSet.title} required />
          </label>
          <label>
            <span>Visibility</span>
            <select name="visibility" defaultValue={selectedSet.visibility}>
              <option value="admin">admin</option>
              <option value="student">student</option>
            </select>
          </label>
          <label>
            <span>SPCG Level</span>
            <input name="spcgLevel" min={1} max={10} type="number" defaultValue={selectedSet.spcgLevel ?? selectedLevel} />
          </label>
          <label>
            <span>关卡编号</span>
            <input name="stageNo" min={1} type="number" defaultValue={selectedSet.stageNo ?? 1} />
          </label>
          <label>
            <span>线路</span>
            <select name="track" defaultValue={selectedSet.track ?? 'A'}>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label className="admin-form-span-2">
            <span>算法内容</span>
            <input name="lessonFocus" defaultValue={selectedSet.lessonFocus ?? ''} required />
          </label>
          <label className="admin-form-span-2">
            <span>说明</span>
            <textarea name="description" defaultValue={selectedSet.description ?? ''} rows={3} />
          </label>
          <button className="admin-button" type="submit">
            Save
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function StageArchiveModal({ selectedSet }: { selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>> }) {
  return (
    <AdminModal danger disabled={!selectedSet} title="删除关卡" triggerLabel="删除">
      {selectedSet ? (
        <form action={setProblemSetStatus} className="admin-form-grid">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <input name="status" type="hidden" value="archived" />
          <p className="admin-help-text admin-form-span-2">第一版删除采用归档。归档后保留题目、提交、进度和审计记录。</p>
          <button className="admin-button admin-danger-button" type="submit" disabled={selectedSet.status === 'archived'}>
            Archive Stage
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function ProblemImportModal({
  candidates,
  selectedLevel,
  selectedSet,
  selectedTrack,
}: {
  candidates: Awaited<ReturnType<typeof listAdminProblemSetLevelCandidates>>
  selectedLevel: number
  selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>>
  selectedTrack: 'A' | 'B'
}) {
  return (
    <AdminModal disabled={!selectedSet} title="题目导入到当前关卡" triggerLabel="题目导入">
      {selectedSet ? (
        <form action={addCurriculumStageProblemAction} className="admin-form-grid">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <input name="spcgLevel" type="hidden" value={selectedLevel} />
          <input name="track" type="hidden" value={selectedTrack} />
          <label className="admin-form-span-2">
            <span>题目</span>
            <select name="levelId" required defaultValue="">
              <option value="" disabled>
                只能选择第{selectedSet.stageNo}关题目池
              </option>
              {candidates.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.id} / {level.title} / {level.knowledgePoint}
                </option>
              ))}
            </select>
            {candidates.length === 0 ? <small>当前关卡没有可导入题目，或题目已全部加入本线路。</small> : null}
          </label>
          <label>
            <span>Position</span>
            <input name="position" type="number" min={1} defaultValue={selectedSet.itemCount + 1} required />
          </label>
          <label>
            <span>Display Mode</span>
            <select name="displayMode" defaultValue="template" required>
              <DisplayModeOptions />
            </select>
          </label>
          <label>
            <span>Label</span>
            <input name="label" placeholder="模板题 / 基础题 / 提高题" />
          </label>
          <label className="admin-checkbox">
            <input name="required" type="checkbox" defaultChecked={selectedSet.itemCount < V02_REQUIRED_ITEM_COUNT} />
            <span>Required</span>
          </label>
          <button className="admin-button" type="submit" disabled={candidates.length === 0}>
            Import
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function ProblemCreateModal({
  selectedLevel,
  selectedSet,
  selectedTrack,
}: {
  selectedLevel: number
  selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>>
  selectedTrack: 'A' | 'B'
}) {
  const defaultStage = selectedSet?.stageNo ?? 1
  const defaultId = `spcg${selectedLevel}-stage${String(defaultStage).padStart(2, '0')}-draft`
  return (
    <AdminModal disabled={!selectedSet} title="新增题目草稿" triggerLabel="新增">
      {selectedSet ? (
        <form action={createCurriculumDraftLevelAction} className="admin-form-grid admin-form-grid-curriculum-stage">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <input name="spcgLevel" type="hidden" value={selectedLevel} />
          <input name="track" type="hidden" value={selectedTrack} />
          <label>
            <span>Level ID</span>
            <input name="levelId" defaultValue={defaultId} required />
          </label>
          <label>
            <span>Title</span>
            <input name="title" placeholder="新题目标题" required />
          </label>
          <label>
            <span>Chapter ID</span>
            <input name="chapterId" defaultValue={selectedLevel === 1 ? 'ch1-mist-town' : `spcg-level-${selectedLevel}`} required />
          </label>
          <label>
            <span>Order</span>
            <input name="order" type="number" defaultValue={(selectedSet.stageNo ?? 1) * 100 + selectedSet.itemCount + 1} required />
          </label>
          <label>
            <span>Knowledge</span>
            <input name="knowledgePoint" defaultValue={selectedSet.lessonFocus ?? ''} required />
          </label>
          <label>
            <span>Layer</span>
            <input name="stars" type="number" min={1} max={5} defaultValue={1} required />
          </label>
          <label>
            <span>Layer Label</span>
            <select name="difficultyLabel" defaultValue="入门">
              {difficultyLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>lglevel</span>
            <input name="lglevel" />
          </label>
          <label>
            <span>Position</span>
            <input name="position" type="number" min={1} defaultValue={selectedSet.itemCount + 1} required />
          </label>
          <label>
            <span>Display Mode</span>
            <select name="displayMode" defaultValue="advanced">
              <DisplayModeOptions />
            </select>
          </label>
          <label className="admin-form-span-2">
            <span>Item Label</span>
            <input name="itemLabel" placeholder="草稿 / 备用" />
          </label>
          <button className="admin-button" type="submit">
            Create Draft
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function ProblemSummaryEditModal({
  selectedItem,
  selectedProblem,
  selectedSet,
  selectedTrack,
}: {
  selectedItem: NonNullable<Awaited<ReturnType<typeof getAdminProblemSetDetail>>>['items'][number] | null
  selectedProblem: Awaited<ReturnType<typeof getAdminLevel>>
  selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>>
  selectedTrack: 'A' | 'B'
}) {
  return (
    <AdminModal disabled={!selectedSet || !selectedItem || !selectedProblem} title="修改题目摘要" triggerLabel="修改">
      {selectedSet && selectedItem && selectedProblem ? (
        <form action={updateCurriculumProblemSummaryAction} className="admin-form-grid">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <input name="levelId" type="hidden" value={selectedProblem.id} />
          <input name="track" type="hidden" value={selectedTrack} />
          <label>
            <span>Title</span>
            <input name="title" defaultValue={selectedProblem.title} required />
          </label>
          <label>
            <span>Knowledge</span>
            <input name="knowledgePoint" defaultValue={selectedProblem.knowledgePoint} required />
          </label>
          <label>
            <span>SPCG Level</span>
            <input name="spcgLevel" type="number" min={1} max={10} defaultValue={selectedProblem.difficulty.spcgLevel} required />
          </label>
          <label>
            <span>Layer</span>
            <input name="stars" type="number" min={1} max={5} defaultValue={selectedProblem.difficulty.stars} required />
          </label>
          <label>
            <span>Layer Label</span>
            <select name="difficultyLabel" defaultValue={selectedProblem.difficulty.label}>
              {difficultyLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>lglevel</span>
            <input name="lglevel" defaultValue={selectedProblem.difficulty.lglevel ?? ''} />
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={selectedProblem.status}>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label>
            <span>Position</span>
            <input name="position" type="number" min={1} defaultValue={selectedItem.position} required />
          </label>
          <label>
            <span>Display Mode</span>
            <select name="displayMode" defaultValue={selectedItem.displayMode}>
              <DisplayModeOptions />
            </select>
          </label>
          <label>
            <span>Item Label</span>
            <input name="itemLabel" defaultValue={selectedItem.label ?? ''} />
          </label>
          <label className="admin-checkbox">
            <input name="required" type="checkbox" defaultChecked={selectedItem.required} />
            <span>Required</span>
          </label>
          <button className="admin-button" type="submit">
            Save
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function ProblemArchiveModal({
  selectedItem,
  selectedLevel,
  selectedSet,
  selectedTrack,
}: {
  selectedItem: NonNullable<Awaited<ReturnType<typeof getAdminProblemSetDetail>>>['items'][number] | null
  selectedLevel: number
  selectedSet: Awaited<ReturnType<typeof getAdminProblemSetDetail>>
  selectedTrack: 'A' | 'B'
}) {
  return (
    <AdminModal danger disabled={!selectedSet || !selectedItem} title="删除题目" triggerLabel="删除">
      {selectedSet && selectedItem ? (
        <form action={archiveCurriculumProblemAction} className="admin-form-grid">
          <input name="problemSetId" type="hidden" value={selectedSet.id} />
          <input name="levelId" type="hidden" value={selectedItem.levelId} />
          <input name="spcgLevel" type="hidden" value={selectedLevel} />
          <input name="track" type="hidden" value={selectedTrack} />
          <p className="admin-help-text admin-form-span-2">
            删除只会把题目从当前关卡移出，不会归档题目本身；同一题仍可继续被 A/B 线共用。
          </p>
          <button className="admin-button admin-danger-button" type="submit">
            Remove From Stage
          </button>
        </form>
      ) : null}
    </AdminModal>
  )
}

function LevelContentEditor({ level }: { level: NonNullable<Awaited<ReturnType<typeof getAdminLevel>>> }) {
  return (
    <article className="admin-panel">
      <div className="admin-panel-head">
        <h2>题目内容详情</h2>
        <span className="admin-count">题面、测试点、提示、题解、代码</span>
      </div>
      <form action={updateLevelDetails} className="admin-form-grid admin-form-grid-level-edit">
        <input name="levelId" type="hidden" value={level.id} />
        <label>
          <span>Title</span>
          <input name="title" defaultValue={level.title} required />
        </label>
        <label>
          <span>Chapter ID</span>
          <input name="chapterId" defaultValue={level.chapterId} required />
        </label>
        <label>
          <span>Order</span>
          <input name="order" type="number" defaultValue={level.order} required />
        </label>
        <label>
          <span>Knowledge Point</span>
          <input name="knowledgePoint" defaultValue={level.knowledgePoint} required />
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={level.status}>
            <option value="draft">draft</option>
            <option value="review">review</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>
          <span>SPCG Level</span>
          <input name="spcgLevel" type="number" min={1} max={10} defaultValue={level.difficulty.spcgLevel} required />
        </label>
        <label>
          <span>Layer</span>
          <input name="stars" type="number" min={1} max={5} defaultValue={level.difficulty.stars} required />
        </label>
        <label>
          <span>Layer Label</span>
          <select name="difficultyLabel" defaultValue={level.difficulty.label}>
            {difficultyLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>lglevel</span>
          <input name="lglevel" defaultValue={level.difficulty.lglevel ?? ''} />
        </label>
        <label>
          <span>Time Limit MS</span>
          <input name="timeLimitMs" type="number" min={100} defaultValue={level.timeLimitMs} required />
        </label>
        <label>
          <span>Memory MB</span>
          <input name="memoryLimitMb" type="number" min={16} defaultValue={level.memoryLimitMb} required />
        </label>
        <label className="admin-form-span-2">
          <span>Solution Video URL</span>
          <input name="solutionVideoUrl" defaultValue={level.solutionVideoUrl ?? ''} />
        </label>
        <label className="admin-form-span-2">
          <span>Input Format</span>
          <textarea name="inputFormat" defaultValue={level.inputFormat} rows={3} required />
        </label>
        <label className="admin-form-span-2">
          <span>Output Format</span>
          <textarea name="outputFormat" defaultValue={level.outputFormat} rows={3} required />
        </label>
        <label className="admin-form-full">
          <span>Statement Markdown</span>
          <textarea name="description" defaultValue={level.description} rows={12} required />
        </label>
        <label className="admin-form-full">
          <span>Statement Assets JSON</span>
          <textarea className="admin-json-textarea" name="statementAssetsJson" defaultValue={json(level.statementAssets)} rows={8} required />
        </label>
        <label className="admin-form-full">
          <span>Test Cases JSON</span>
          <textarea className="admin-json-textarea" name="testCasesJson" defaultValue={json(level.testCases)} rows={18} required />
        </label>
        <label className="admin-form-full">
          <span>Hints JSON</span>
          <textarea className="admin-json-textarea" name="hintsJson" defaultValue={json(level.hints)} rows={10} required />
        </label>
        <label className="admin-form-full">
          <span>Solution JSON</span>
          <textarea className="admin-json-textarea" name="solutionJson" defaultValue={json(level.solution)} rows={10} required />
        </label>
        <label className="admin-form-full">
          <span>Official Code</span>
          <textarea className="admin-code-textarea" name="officialCode" defaultValue={level.officialCode} rows={16} required />
        </label>
        <label className="admin-form-full">
          <span>Starter Code</span>
          <textarea className="admin-code-textarea" name="starterCode" defaultValue={level.starterCode} rows={12} required />
        </label>
        <label className="admin-form-full">
          <span>Source JSON</span>
          <textarea className="admin-json-textarea" name="sourceJson" defaultValue={json(level.source)} rows={8} required />
        </label>
        <label className="admin-form-full">
          <span>Sister Problem JSON</span>
          <textarea className="admin-json-textarea" name="sisterProblemJson" defaultValue={level.sisterProblem ? json(level.sisterProblem) : ''} rows={6} />
        </label>
        <label className="admin-form-full">
          <span>Import Meta JSON</span>
          <textarea className="admin-json-textarea" name="importMetaJson" defaultValue={json(level.importMeta)} rows={8} required />
        </label>
        <label className="admin-form-full">
          <span>Teacher Notes</span>
          <textarea name="teacherNotes" defaultValue={level.teacherNotes ?? ''} rows={5} />
        </label>
        <label>
          <span>Guardian ID</span>
          <input name="guardianId" defaultValue={level.guardianId ?? ''} />
        </label>
        <label>
          <span>Pass Out Problem ID</span>
          <input name="passOutProblemId" defaultValue={level.passOutProblemId ?? ''} />
        </label>
        <label className="admin-form-full">
          <span>Story</span>
          <textarea name="story" defaultValue={level.story ?? ''} rows={5} />
        </label>
        <button className="admin-button" type="submit">
          Save Problem Detail
        </button>
      </form>
    </article>
  )
}

function readSelectedLevel(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw ?? 1)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 1
}

function readSelectedTrack(value: string | string[] | undefined): 'A' | 'B' {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'B' ? 'B' : 'A'
}

function readStringParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || null
}

function difficultyLabel(difficulty: Difficulty) {
  return `${difficulty.levelLabel} · ${difficulty.stars}层 · 系数 ${getDifficultyCoefficient(difficulty)} · ${difficulty.label}`
}

function buildStageId(spcgLevel: number, stageNo: number, track: 'A' | 'B') {
  return `spcg${spcgLevel}-stage${String(stageNo).padStart(2, '0')}-${track.toLowerCase()}`
}

function DisplayModeOptions() {
  return (
    <>
      {LESSON_ROLE_SUMMARIES.map((role) => (
        <option key={role.mode} value={role.mode}>
          {role.mode} · {role.label}
        </option>
      ))}
    </>
  )
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}
