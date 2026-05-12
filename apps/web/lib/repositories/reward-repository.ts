import type {
  EarnedTitleAward,
  InventoryItem,
  RewardGrantResult,
  RewardLedgerEntry,
  RewardRank,
  RewardSource,
  UserTitleRecord,
  UserInventoryItem,
  WalletSummary,
} from '@spcg/shared/types'
import { getEarnedTitlePoolKeyForRank, pickEarnedTitleFromPool } from '@spcg/shared/earned-titles'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'
import { deterministicEarnedTitleSeed, generateTitle, getRankForCoins, getRankLabel } from '@/lib/reward-rules'

type WalletRow = {
  user_id: string
  coin_total: number
  garlic_balance: number
  rank: RewardRank
  title: string
  updated_at: Date | string
}

type LedgerRow = {
  id: string
  user_id: string
  source: RewardSource
  source_ref: string
  coin_delta: number
  garlic_delta: number
  item_id: string | null
  item_quantity: number
  metadata: Record<string, unknown>
  created_at: Date | string
}

type InventoryRow = {
  item_id: string
  name: string
  description: string
  algorithm_tag: string
  rarity: InventoryItem['rarity']
  icon: string | null
  stackable: boolean
  quantity: number
  first_acquired_at: Date | string
  last_acquired_at: Date | string
}

type KnowledgeInventoryRow = {
  tag_id: string
  zh_name: string
  en_name: string
  domain: string
  band_or_level: string
  usage_count: number
  first_used_at: Date | string
  last_used_at: Date | string
}

type UserTitleRecordRow = {
  user_id: string
  title_key: string
  title_label: string
  rank_at_award: RewardRank
  pool_key: string
  source: 'level_first_ac' | 'rank_reached'
  source_ref: string
  level_id: string | null
  submission_id: string | null
  metadata: Record<string, unknown>
  awarded_at: Date | string
}

export type GrantRewardInput = {
  userId: string
  source: RewardSource
  sourceRef: string
  coinDelta?: number
  garlicDelta?: number
  itemId?: string | null
  itemQuantity?: number
  metadata?: Record<string, unknown>
}

export async function getWallet(userId: string): Promise<WalletSummary> {
  const row = await ensureWallet(userId)
  return mapWalletRow(row)
}

export async function listRewardLedger(userId: string, limit = 50): Promise<RewardLedgerEntry[]> {
  const rows = await query<LedgerRow>(
    `
    SELECT id, user_id, source, source_ref, coin_delta, garlic_delta, item_id, item_quantity, metadata, created_at
    FROM reward_ledger
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, limit],
  )

  return rows.map(mapLedgerRow)
}

export async function listLedgerBySourceRef(userId: string, sourceRef: string): Promise<RewardLedgerEntry[]> {
  const rows = await query<LedgerRow>(
    `
    SELECT id, user_id, source, source_ref, coin_delta, garlic_delta, item_id, item_quantity, metadata, created_at
    FROM reward_ledger
    WHERE user_id = $1 AND source_ref = $2
    ORDER BY created_at ASC
    `,
    [userId, sourceRef],
  )

  return rows.map(mapLedgerRow)
}

export async function listLedgerBySubmissionId(userId: string, submissionId: string): Promise<RewardLedgerEntry[]> {
  const rows = await query<LedgerRow>(
    `
    SELECT id, user_id, source, source_ref, coin_delta, garlic_delta, item_id, item_quantity, metadata, created_at
    FROM reward_ledger
    WHERE user_id = $1 AND metadata->>'submissionId' = $2
    ORDER BY created_at ASC
    `,
    [userId, submissionId],
  )

  return rows.map(mapLedgerRow)
}

export async function listUserInventory(userId: string): Promise<UserInventoryItem[]> {
  const knowledgeRows = await query<KnowledgeInventoryRow>(
    `
    SELECT
      tag_id,
      zh_name,
      en_name,
      domain,
      band_or_level,
      usage_count,
      first_used_at,
      last_used_at
    FROM user_knowledge_usage
    WHERE user_id = $1
      AND classification = '编程算法'
      AND usage_count > 0
    ORDER BY last_used_at DESC, usage_count DESC, zh_name ASC
    `,
    [userId],
  )

  if (knowledgeRows.length > 0) {
    return knowledgeRows.map((row) => ({
      item: {
        id: row.tag_id,
        name: row.zh_name,
        description: buildKnowledgeInventoryDescription(row),
        algorithmTag: row.domain,
        rarity: getKnowledgeInventoryRarity(row.domain),
        icon: getKnowledgeInventoryIcon(row.domain),
        stackable: true,
      },
      quantity: row.usage_count,
      firstAcquiredAt: toIsoString(row.first_used_at),
      lastAcquiredAt: toIsoString(row.last_used_at),
    }))
  }

  const rows = await query<InventoryRow>(
    `
    SELECT
      i.id AS item_id,
      i.name,
      i.description,
      i.algorithm_tag,
      i.rarity,
      i.icon,
      i.stackable,
      ui.quantity,
      ui.first_acquired_at,
      ui.last_acquired_at
    FROM user_inventory ui
    JOIN inventory_items i ON i.id = ui.item_id
    WHERE ui.user_id = $1 AND ui.quantity > 0
    ORDER BY ui.last_acquired_at DESC, i.rarity DESC, i.name ASC
    `,
    [userId],
  )

  return rows.map((row) => ({
    item: {
      id: row.item_id,
      name: row.name,
      description: row.description,
      algorithmTag: row.algorithm_tag,
      rarity: row.rarity,
      icon: row.icon,
      stackable: row.stackable,
    },
    quantity: row.quantity,
    firstAcquiredAt: toIsoString(row.first_acquired_at),
    lastAcquiredAt: toIsoString(row.last_acquired_at),
  }))
}

function buildKnowledgeInventoryDescription(row: KnowledgeInventoryRow): string {
  const parts = [row.band_or_level, row.en_name].map((value) => value.trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '记录这个算法知识点在通关中的使用次数。'
}

function getKnowledgeInventoryIcon(domain: string): string {
  const iconByDomain: Record<string, string> = {
    algorithm: '/assets/art/ui/knowledge-tree/svg/sort.svg',
    'data-structure': '/assets/art/ui/knowledge-tree/svg/array.svg',
    math: '/assets/art/ui/knowledge-tree/svg/number-chain.svg',
    'control-flow': '/assets/art/ui/knowledge-tree/svg/flag.svg',
    syntax: '/assets/art/ui/knowledge-tree/svg/book.svg',
    engineering: '/assets/art/ui/knowledge-tree/svg/crest-cpp.svg',
  }
  return iconByDomain[domain] ?? '/assets/art/ui/knowledge-tree/svg/crest-cpp.svg'
}

function getKnowledgeInventoryRarity(domain: string): InventoryItem['rarity'] {
  if (domain === 'algorithm') return 'rare'
  if (domain === 'data-structure' || domain === 'math') return 'epic'
  return 'common'
}

export async function listUserTitleRecords(userId: string, limit = 100): Promise<UserTitleRecord[]> {
  const rows = await query<UserTitleRecordRow>(
    `
    SELECT
      user_id,
      title_key,
      title_label,
      rank_at_award,
      pool_key,
      source,
      source_ref,
      level_id,
      submission_id,
      metadata,
      awarded_at
    FROM user_title_records
    WHERE user_id = $1
    ORDER BY awarded_at DESC
    LIMIT $2
    `,
    [userId, limit],
  )

  return rows.map(mapUserTitleRecordRow)
}

export async function getUserTitleRecordBySubmissionId(
  userId: string,
  submissionId: string,
): Promise<UserTitleRecord | null> {
  const row = await queryOne<UserTitleRecordRow>(
    `
    SELECT
      user_id,
      title_key,
      title_label,
      rank_at_award,
      pool_key,
      source,
      source_ref,
      level_id,
      submission_id,
      metadata,
      awarded_at
    FROM user_title_records
    WHERE user_id = $1 AND submission_id = $2
    `,
    [userId, submissionId],
  )

  return row ? mapUserTitleRecordRow(row) : null
}

export async function grantRewards(inputs: GrantRewardInput[]): Promise<RewardGrantResult> {
  if (inputs.length === 0) {
    return emptyGrantResult('scrap_iron', 'scrap_iron', generateTitle({ garlicBalance: 0, rank: 'scrap_iron' }), null)
  }

  return withTransaction(async (client) => {
    const userId = inputs[0]!.userId
    const beforeWallet = await ensureWalletForClient(client, userId)
    const rankBefore = beforeWallet.rank
    const ledgerIds: string[] = []
    const items: RewardGrantResult['items'] = []
    let firstAcTitleInput: GrantRewardInput | null = null
    let coinDelta = 0
    let garlicDelta = 0

    for (const input of inputs) {
      if (input.userId !== userId) throw new Error('Cannot grant rewards to multiple users in one transaction')
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO reward_ledger
          (user_id, source, source_ref, coin_delta, garlic_delta, item_id, item_quantity, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, source, source_ref) DO NOTHING
        RETURNING id
        `,
        [
          input.userId,
          input.source,
          input.sourceRef,
          input.coinDelta ?? 0,
          input.garlicDelta ?? 0,
          input.itemId ?? null,
          input.itemQuantity ?? 0,
          input.metadata ?? {},
        ],
      )

      if (!result.rows[0]) continue
      ledgerIds.push(result.rows[0].id)
      if (input.source === 'level_first_ac') firstAcTitleInput = input
      coinDelta += input.coinDelta ?? 0
      garlicDelta += input.garlicDelta ?? 0

      if (input.itemId && (input.itemQuantity ?? 0) > 0) {
        await client.query(
          `
          INSERT INTO user_inventory (user_id, item_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, item_id)
          DO UPDATE SET
            quantity = user_inventory.quantity + EXCLUDED.quantity,
            last_acquired_at = NOW()
          `,
          [input.userId, input.itemId, input.itemQuantity],
        )

        const item = await client.query<{ name: string }>('SELECT name FROM inventory_items WHERE id = $1', [input.itemId])
        items.push({
          itemId: input.itemId,
          name: item.rows[0]?.name ?? input.itemId,
          quantity: input.itemQuantity ?? 0,
        })
      }
    }

    const nextCoinTotal = beforeWallet.coin_total + coinDelta
    const nextGarlicBalance = beforeWallet.garlic_balance + garlicDelta
    const rankAfter = getRankForCoins(nextCoinTotal).rank
    const generatedTitle = generateTitle({ garlicBalance: nextGarlicBalance, rank: rankAfter })
    const titleAward = ledgerIds.length
      ? await awardEarnedTitleForRankOnce(client, {
          userId,
          rankAfter,
          levelId: firstAcTitleInput?.sourceRef ?? null,
          submissionId: firstAcTitleInput ? readMetadataString(firstAcTitleInput.metadata, 'submissionId') : null,
        })
      : null
    const title = titleAward?.titleLabel ?? (await getLatestEarnedTitleLabelForClient(client, userId)) ?? generatedTitle

    if (ledgerIds.length > 0) {
      await client.query(
        `
        UPDATE user_wallets
        SET coin_total = $2, garlic_balance = $3, rank = $4, title = $5
        WHERE user_id = $1
        `,
        [userId, nextCoinTotal, nextGarlicBalance, rankAfter, title],
      )

      await client.query(
        `
        UPDATE reward_ledger
        SET metadata = metadata || $2::jsonb
        WHERE id = ANY($1::uuid[])
        `,
        [
          ledgerIds,
          {
            rankBefore,
            rankAfter,
            title,
            titleAward,
          },
        ],
      )
    }

    return {
      coinDelta,
      garlicDelta,
      items,
      rankBefore,
      rankAfter,
      title,
      titleAward,
      ledgerIds,
    }
  })
}

async function ensureWallet(userId: string): Promise<WalletRow> {
  const row = await queryOne<WalletRow>(
    `
    INSERT INTO user_wallets (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, coin_total, garlic_balance, rank, title, updated_at
    `,
    [userId],
  )

  if (row) return row

  const existing = await queryOne<WalletRow>(
    `
    SELECT user_id, coin_total, garlic_balance, rank, title, updated_at
    FROM user_wallets
    WHERE user_id = $1
    `,
    [userId],
  )

  if (!existing) throw new Error('Wallet was not created')
  return existing
}

async function ensureWalletForClient(
  client: PoolClient,
  userId: string,
): Promise<WalletRow> {
  const inserted = await client.query<WalletRow>(
    `
    INSERT INTO user_wallets (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, coin_total, garlic_balance, rank, title, updated_at
    `,
    [userId],
  )

  if (inserted.rows[0]) return inserted.rows[0]

  const existing = await client.query<WalletRow>(
    `
    SELECT user_id, coin_total, garlic_balance, rank, title, updated_at
    FROM user_wallets
    WHERE user_id = $1
    FOR UPDATE
    `,
    [userId],
  )

  if (!existing.rows[0]) throw new Error('Wallet was not created')
  return existing.rows[0]
}

function mapWalletRow(row: WalletRow): WalletSummary {
  return {
    userId: row.user_id,
    coinTotal: row.coin_total,
    garlicBalance: row.garlic_balance,
    rank: row.rank,
    rankLabel: getRankLabel(row.rank),
    title: row.title,
    updatedAt: toIsoString(row.updated_at),
  }
}

function mapUserTitleRecordRow(row: UserTitleRecordRow): UserTitleRecord {
  return {
    userId: row.user_id,
    titleKey: row.title_key,
    titleLabel: row.title_label,
    rankAtAward: row.rank_at_award,
    poolKey: row.pool_key,
    source: row.source,
    sourceRef: row.source_ref,
    levelId: row.level_id,
    submissionId: row.submission_id,
    metadata: row.metadata,
    awardedAt: toIsoString(row.awarded_at),
  }
}

function mapLedgerRow(row: LedgerRow): RewardLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    sourceRef: row.source_ref,
    coinDelta: row.coin_delta,
    garlicDelta: row.garlic_delta,
    itemId: row.item_id,
    itemQuantity: row.item_quantity,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at),
  }
}

function emptyGrantResult(
  rankBefore: RewardRank,
  rankAfter: RewardRank,
  title: string,
  titleAward: EarnedTitleAward | null,
): RewardGrantResult {
  return {
    coinDelta: 0,
    garlicDelta: 0,
    items: [],
    rankBefore,
    rankAfter,
    title,
    titleAward,
    ledgerIds: [],
  }
}

async function awardEarnedTitleForRankOnce(
  client: PoolClient,
  input: {
    userId: string
    levelId: string | null
    submissionId: string | null
    rankAfter: RewardRank
  },
): Promise<EarnedTitleAward | null> {
  const existing = await client.query<{ title_key: string }>(
    `
    SELECT title_key
    FROM user_title_records
    WHERE user_id = $1 AND rank_at_award = $2
    LIMIT 1
    `,
    [input.userId, input.rankAfter],
  )
  if (existing.rows[0]) return null

  const poolKey = getEarnedTitlePoolKeyForRank(input.rankAfter)
  const usedRows = await client.query<{ title_label: string }>(
    `
    SELECT title_label
    FROM user_title_records
    WHERE user_id = $1 AND pool_key = $2
    `,
    [input.userId, poolKey],
  )
  const seed = deterministicEarnedTitleSeed({
    userId: input.userId,
    levelId: input.levelId ?? input.rankAfter,
    submissionId: input.submissionId ?? input.rankAfter,
  })
  const title = pickEarnedTitleFromPool({
    poolKey,
    seed,
    usedLabels: usedRows.rows.map((row) => row.title_label),
  })
  const inserted = await client.query<UserTitleRecordRow>(
    `
    INSERT INTO user_title_records
      (user_id, title_key, title_label, rank_at_award, pool_key, source, source_ref, level_id, submission_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (user_id, rank_at_award) DO NOTHING
    RETURNING
      user_id,
      title_key,
      title_label,
      rank_at_award,
      pool_key,
      source,
      source_ref,
      level_id,
      submission_id,
      metadata,
      awarded_at
    `,
    [
      input.userId,
      title.key,
      title.label,
      input.rankAfter,
      poolKey,
      input.levelId ? 'level_first_ac' : 'rank_reached',
      input.levelId ?? input.rankAfter,
      input.levelId,
      input.submissionId,
      {
        titleIndex: title.index,
        seed,
        reason: 'rank_reached',
      },
    ],
  )

  const row = inserted.rows[0]
  return row ? titleAwardFromRecord(mapUserTitleRecordRow(row)) : null
}

async function getLatestEarnedTitleLabelForClient(client: PoolClient, userId: string): Promise<string | null> {
  const result = await client.query<{ title_label: string }>(
    `
    SELECT title_label
    FROM user_title_records
    WHERE user_id = $1
    ORDER BY awarded_at DESC
    LIMIT 1
    `,
    [userId],
  )
  return result.rows[0]?.title_label ?? null
}

function titleAwardFromRecord(record: UserTitleRecord): EarnedTitleAward {
  return {
    titleKey: record.titleKey,
    titleLabel: record.titleLabel,
    rankAtAward: record.rankAtAward,
    poolKey: record.poolKey,
    levelId: record.levelId,
    submissionId: record.submissionId,
    awardedAt: record.awardedAt,
  }
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value ? value : null
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
