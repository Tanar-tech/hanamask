#!/usr/bin/env bash
# main へのブランチ保護を当てる。
#
# public化してから保護が効くまでの間、リポジトリは「誰でもforkできるのに保護が無い」
# 状態になる。この窓をできるだけ短くするため、public化の直後に一撃で実行できる形にしてある。
#
# 注意: privateかつ無料プランではブランチ保護APIが403を返す。public化の「あと」に実行すること。
set -euo pipefail

REPO="${1:-Tanar-tech/hanamask}"

# 管理者(enforce_admins)は除外する。個人開発で他に管理者がおらず、CI自体が壊れたときに
# 修復PRをマージできなくなる方が危険なため（2026-08-18 管理者判断）。
#
# 承認数は0にする。単独開発では自分のPRを自分で承認できず、1以上にすると詰む。
gh api -X PUT "repos/${REPO}/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "build-and-test (ubuntu-latest)",
      "build-and-test (windows-latest)",
      "semgrep"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

echo
echo "適用後の設定:"
gh api "repos/${REPO}/branches/main/protection" \
  --jq '"  必須チェック: \(.required_status_checks.contexts | join(", "))
  最新化を要求: \(.required_status_checks.strict)
  管理者にも適用: \(.enforce_admins.enabled)
  必要な承認数: \(.required_pull_request_reviews.required_approving_review_count)
  force push: \(.allow_force_pushes.enabled)
  ブランチ削除: \(.allow_deletions.enabled)"'
