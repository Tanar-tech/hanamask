#!/bin/bash
# docs/*.md（直下のみ。docs/local-llm/ 等の下位ディレクトリはHTML化の対象外）を変えたのに docs/html/*.html を直していないPRを止める。
set -uo pipefail
base="${1:-origin/main}"
stale=0
while read -r f; do
  [ -z "$f" ] && continue
  b=$(basename "$f" .md)
  h="docs/html/$b.html"
  if [ ! -f "$h" ]; then
    echo "HTML版がありません: $f → $h"
    stale=1
    continue
  fi
  if ! git diff --name-only "$base"...HEAD -- "$h" | grep -q .; then
    echo "$f を変更していますが $h が更新されていません"
    stale=1
  fi
done < <(git diff --name-only "$base"...HEAD -- ':(glob)docs/*.md')
[ "$stale" -eq 0 ] && echo "docs と docs/html は同期しています"
exit "$stale"
