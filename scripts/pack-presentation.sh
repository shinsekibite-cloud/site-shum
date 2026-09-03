#!/usr/bin/env bash
# Seed slides.json from TS defaults, rebuild HTML/videos, pack downloads.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npx --yes tsx -e "
import { writeDeck } from './src/lib/presentation-store.ts';
import { defaultFullDeck, defaultNecessaryDeck } from './src/lib/presentation-defaults.ts';
import { existsSync } from 'fs';
import { slidesPath } from './src/lib/presentation-store.ts';
for (const [slug, factory] of [['full', defaultFullDeck], ['necessary', defaultNecessaryDeck]] as const) {
  // Keep admin edits if slides.json already customized unless FORCE_SEED=1
  if (process.env.FORCE_SEED === '1' || !existsSync(slidesPath(slug))) {
    writeDeck(factory());
    console.log('seeded', slug);
  } else {
    console.log('keep', slug);
  }
}
"
python3 "$ROOT/scripts/build-presentation-assets.py"
STAMP="${STAMP:-$(date -u +%Y%m%d-%H%M%S)}"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/full" "$STAGE/necessary" "$ROOT/public/downloads"
cp -a "$ROOT/public/presentation/deck" "$STAGE/full/youngportal-presentation-full/"
cp -a "$ROOT/public/presentation/necessary" "$STAGE/necessary/youngportal-presentation-necessary/"
cp "$ROOT/docs/PRESENTATION.md" "$STAGE/full/youngportal-presentation-full/" 2>/dev/null || true
cp "$ROOT/docs/PRESENTATION.md" "$STAGE/necessary/youngportal-presentation-necessary/" 2>/dev/null || true
OUT_FULL="youngportal-presentation-full-${STAMP}.tgz"
OUT_NEED="youngportal-presentation-necessary-${STAMP}.tgz"
tar -C "$STAGE/full" -czf "$ROOT/public/downloads/$OUT_FULL" youngportal-presentation-full
tar -C "$STAGE/necessary" -czf "$ROOT/public/downloads/$OUT_NEED" youngportal-presentation-necessary
ln -sfn "$OUT_FULL" "$ROOT/public/downloads/youngportal-presentation-full-latest.tgz"
ln -sfn "$OUT_NEED" "$ROOT/public/downloads/youngportal-presentation-necessary-latest.tgz"
ln -sfn "$OUT_FULL" "$ROOT/public/downloads/youngportal-presentation-latest.tgz"
echo "Wrote $OUT_FULL and $OUT_NEED"
