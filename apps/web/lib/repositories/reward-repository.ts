import type {
  InventoryItem,
  RewardGrantResult,
  RewardLedgerEntry,
  RewardRank,
  RewardSource,
  UserInventoryItem,
  WalletSummary,
} from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'
import { generateTitle, getRankForCoins, getRankLabel } from '@/lib/reward-rules'

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

export async function grantRewards(inputs: GrantRewardInput[]): Promise<RewardGrantResult> {
  if (inputs.length === 0) {
    return emptyGrantResult('bronze', 'bronze', generateTitle({ garlicBalance: 0, rank: 'bronze' }))
  }

  return withTransaction(async (client) => {
    const userId = inputs[0]!.userId
    const beforeWallet = await ensureWalletForClient(client, userId)
    const rankBefore = beforeWallet.rank
    const ledgerIds: string[] = []
    const items: RewardGrantResult['items'] = []
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
    const title = generateTitle({ garlicBalance: nextGarlicBalance, rank: rankAfter })

    if (ledgerIds.length > 0) {
      await client.query(
        `
        UPDATE user_wallets
        SET coin_total = $2, garlic_balance = $3, rank = $4, title = $5
        WHERE user_id = $1
        `,
        [userId, nextCoinTotal, nextGarlicBalance, rankAfter, title],
      )
    }

    return {
      coinDelta,
      garlicDelta,
      items,
      rankBefore,
      rankAfter,
      title,
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

function emptyGrantResult(rankBefore: RewardRank, rankAfter: RewardRank, title: string): RewardGrantResult {
  return {
    coinDelta: 0,
    garlicDelta: 0,
    items: [],
    rankBefore,
    rankAfter,
    title,
    ledgerIds: [],
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
