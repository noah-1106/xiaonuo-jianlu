#!/bin/bash
# 小诺简录：改状态（默认标记完成）
set -euo pipefail
HUB="${XIAONUO_HUB_URL:-http://localhost:3000}"
ID="${1:?用法: done.sh <id> [status]}"
STATUS="${2:-completed}"

if ! RESP="$(curl -sf -X PUT "$HUB/api/records/$ID" -H 'Content-Type: application/json' -d "{\"status\": \"$STATUS\"}")"; then
  echo "操作失败：中枢不可达（$HUB）或简录 $ID 不存在。" >&2
  exit 1
fi

echo "$RESP" | python3 -c '
import json, sys
r = json.load(sys.stdin)["record"]
print("[%s] %s → %s" % (r["id"], r["title"], r["status"]))
'
