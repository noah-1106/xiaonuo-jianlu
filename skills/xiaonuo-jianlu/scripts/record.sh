#!/bin/bash
# 小诺简录：自然语言记录/整理入口
set -euo pipefail
HUB="${XIAONUO_HUB_URL:-http://localhost:3000}"
MSG="${1:?用法: record.sh <自然语言>}"

curl -sf -X POST "$HUB/api/chat/send" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"message": sys.argv[1]}))' "$MSG")" \
| python3 -c '
import json, sys
d = json.load(sys.stdin)
print(d.get("reply", ""))
records = [t["result"]["record"] for t in d.get("toolCalls", []) if t.get("result", {}).get("record")]
for r in records:
    tags = ",".join(r["tags"])
    print("--- [%s] %s | %s | %s | tags=%s" % (r["id"], r["type"], r["status"], r["title"], tags))
'
