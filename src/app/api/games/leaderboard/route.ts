import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isGameId, type GameId } from '@/lib/games'
import {
  parseGameMeta,
  type CheckersDifficulty,
  CHECKERS_DIFFICULTIES,
  type LeaderRow,
} from '@/lib/game-meta'
import { fairyTaleDisplayName } from '@/lib/privacy-alias'

function publicName(user: {
  id: string
  name: string | null
  profileVisibility?: string | null
}) {
  if (user.profileVisibility === 'PRIVATE' || user.profileVisibility === 'FRIENDS') {
    return fairyTaleDisplayName(user.id)
  }
  return user.name || 'Игрок'
}

/** Expose userId only for the viewer themself (for «is me / leader» UI). */
function maybeSelfId(rowUserId: string, me: string | undefined) {
  return me && rowUserId === me ? rowUserId : ''
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const game = searchParams.get('game') || ''
  if (!isGameId(game)) {
    return NextResponse.json({ message: 'Unknown game' }, { status: 400 })
  }

  const difficulty = (searchParams.get('difficulty') || 'medium') as CheckersDifficulty
  const limit = Math.min(100, Math.max(3, Number(searchParams.get('limit') || 10) || 10))

  const session = await getServerSession(authOptions)
  const me = session?.user?.id

  let leaders: LeaderRow[] = []

  if (game === 'checkers') {
    const validDiff = CHECKERS_DIFFICULTIES.some((d) => d.id === difficulty) ? difficulty : 'medium'
    // Times live in JSON meta — pull a bounded candidate set, then rank in memory
    const rows = await prisma.gameScore.findMany({
      where: { game, score: { gt: 0 } },
      include: {
        user: { select: { id: true, name: true, profileVisibility: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })
    const withTime = rows
      .map((row) => {
        const meta = parseGameMeta(row.meta)
        const durationMs = meta.bestTimes?.[validDiff]
        if (!durationMs || durationMs <= 0) return null
        return {
          userId: maybeSelfId(row.userId, me),
          name: publicName(row.user),
          score: row.score,
          durationMs,
          difficulty: validDiff,
        }
      })
      .filter(Boolean) as Omit<LeaderRow, 'rank'>[]

    withTime.sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0))
    leaders = withTime.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }))
  } else {
    // Uses @@index([game, score])
    const rows = await prisma.gameScore.findMany({
      where: { game, score: { gt: 0 } },
      include: {
        user: { select: { id: true, name: true, profileVisibility: true } },
      },
      orderBy: { score: 'desc' },
      take: limit,
    })
    leaders = rows.map((row, i) => ({
      rank: i + 1,
      userId: maybeSelfId(row.userId, me),
      name: publicName(row.user),
      score: row.score,
    }))
  }

  return NextResponse.json({
    game: game as GameId,
    difficulty: game === 'checkers' ? difficulty : undefined,
    leaders,
  })
}
