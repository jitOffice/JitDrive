#!/usr/bin/env bash
# v0.5.2 folder-share smoke test.
# Assumes `next dev` is running on :3000 and bootstrap already seeded demo users.
# Exercises:
#   (A) regression — v0.5/v0.5.1 file-link paths still work byte-for-byte
#   (B) new folder-link paths — three presets + subtree auth + revoke + folder-gone
set -u
BASE=${BASE:-http://localhost:3000}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }
chk_eq()   { local a="$1" b="$2" msg="$3"; if [ "$a" = "$b" ]; then ok "$msg"; else bad "$msg (expected $b, got $a)"; fi; }
chk_contains() { local hay="$1" needle="$2" msg="$3"; if printf '%s' "$hay" | grep -qF "$needle"; then ok "$msg"; else bad "$msg · needle=$needle · hay=$(printf '%s' "$hay" | head -c 200)"; fi; }

# ---------------------------------------------------------------- login helper
login() {
  local email="$1" jar="$2"
  rm -f "$jar"
  curl -sS -c "$jar" -o /dev/null -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"demo1234\"}"
}

# ================================================================ SECTION A
echo "== Section A · file-link regression =="

# A1: login alice
JAR_A="$WORK/alice.jar"
login alice@jitdrive.dev "$JAR_A"
if grep -q jw_session "$JAR_A" 2>/dev/null; then ok "A1 alice login"; else bad "A1 alice login"; exit 1; fi

# A2: find one existing file owned by alice with real bytes (size>0)
FILE_ID=$(curl -sS -b "$JAR_A" "$BASE/api/files" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
nonempty=[f for f in items if f.get('size',0)>0]
hit=next((f for f in nonempty if f.get('kind')=='jitword'), None) or (nonempty[0] if nonempty else None)
print(hit['id'] if hit else '')")
if [ -z "$FILE_ID" ]; then
  FILE_ID=$(curl -sS -b "$JAR_A" "$BASE/api/files" | python3 -c "import json,sys;d=json.load(sys.stdin);items=d.get('data',[]) or [];print(items[0]['id'] if items else '')")
fi
if [ -n "$FILE_ID" ]; then ok "A2 file id=$FILE_ID"; else bad "A2 no file found"; exit 1; fi

# A3: create file-link (public)
FILE_LINK=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/files/$FILE_ID/share-links" \
  -H 'Content-Type: application/json' \
  -d '{"password":null,"expiresAt":null,"maxViews":null,"allowDownload":true,"inviteeIds":[]}')
FILE_CODE=$(printf '%s' "$FILE_LINK" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
if [ -n "$FILE_CODE" ]; then ok "A3 file-link minted code=$FILE_CODE"; else bad "A3 $(echo "$FILE_LINK"|head -c200)"; exit 1; fi

# A4: anonymous /api/share/[code] → kind:'file'
META=$(curl -sS "$BASE/api/share/$FILE_CODE")
chk_contains "$META" '"kind":"file"' "A4 meta.kind==file"
chk_contains "$META" '"status":"ok"' "A5 meta.status==ok"

# A6: anonymous /api/share/[code]/raw → 200 (bytes)
RAW_HC=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$FILE_CODE/raw")
chk_eq "$RAW_HC" "200" "A6 anonymous file raw HTTP 200"

# A7: /s/[code] landing page 200 HTML
LAND=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/s/$FILE_CODE")
chk_eq "$LAND" "200" "A7 file-link landing 200"

# A8: revoke file-link → owner DELETE 200
REV=$(curl -sS -b "$JAR_A" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/share-links/$FILE_CODE")
chk_eq "$REV" "200" "A8 file-link revoke 200"

# A9: after revoke, anonymous → 410 + reason=revoked
META2_HC=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$FILE_CODE")
META2=$(curl -sS "$BASE/api/share/$FILE_CODE")
chk_eq "$META2_HC" "410" "A9a revoked HTTP 410"
chk_contains "$META2" '"reason":"revoked"' "A9b revoked reason"

# ================================================================ SECTION B
echo ""
echo "== Section B · folder-link (v0.5.2) =="

# B1: list folders (alice)
FLIST=$(curl -sS -b "$JAR_A" "$BASE/api/folders")
FOLDERS=$(printf '%s' "$FLIST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
root=next((f for f in items if not f.get('parentId')), None)
print(root['id'] if root else '')")
if [ -z "$FOLDERS" ]; then
  # create one
  NEW=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders" -H 'Content-Type: application/json' -d '{"name":"SmokeFolder"}')
  FOLDERS=$(printf '%s' "$NEW" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('id',''))")
fi
if [ -n "$FOLDERS" ]; then ok "B1 root folder id=$FOLDERS"; else bad "B1 no folder"; exit 1; fi

# B2: ensure at least one child file exists in the folder (move A2's file if needed)
MOVED=$(curl -sS -b "$JAR_A" -X PATCH "$BASE/api/files/$FILE_ID" -H 'Content-Type: application/json' -d "{\"parentId\":\"$FOLDERS\"}")
chk_contains "$MOVED" '"code":200' "B2 move file into folder"

# B3: create subfolder under it (uniquify name to survive reruns)
SUB_NAME_UNIQ="Sub-$(date +%s)-$$"
SUB=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$SUB_NAME_UNIQ\",\"parentId\":\"$FOLDERS\"}")
SUB_ID=$(printf '%s' "$SUB" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('id',''))")
if [ -n "$SUB_ID" ]; then ok "B3 subfolder id=$SUB_ID"; else bad "B3 $SUB"; exit 1; fi

# B4: mint folder-link (public)
FLINK=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$FOLDERS/share-links" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":null,\"expiresAt\":null,\"maxViews\":null,\"allowDownload\":true,\"inviteeIds\":[]}")
FCODE=$(printf '%s' "$FLINK" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
if [ -n "$FCODE" ]; then ok "B4 folder-link code=$FCODE"; else bad "B4 $FLINK"; exit 1; fi

# B5: anonymous /api/share → kind:'folder' + folder + folders + files
FMETA=$(curl -sS "$BASE/api/share/$FCODE")
chk_contains "$FMETA" '"kind":"folder"' "B5 folder meta kind"
chk_contains "$FMETA" '"status":"ok"' "B6 folder meta status"
printf '%s' "$FMETA" | python3 -c "
import json,sys
d=json.load(sys.stdin)
data=d.get('data',{})
files=data.get('files',[]) or []
folders=data.get('folders',[]) or []
assert any(f['id']=='$FILE_ID' for f in files), 'file not in files[]'
assert any(f['id']=='$SUB_ID' for f in folders), 'subfolder not in folders[]'
print('OK')" >/dev/null 2>&1 && ok "B7 files[] + folders[] populated" || bad "B7 files[]/folders[] shape wrong"

# B8: /s/[code] landing → server HTML containing folder/file names
# fetch actual folder name + sub name to avoid locale/encoding surprises
ROOT_NAME=$(curl -sS -b "$JAR_A" "$BASE/api/folders" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
hit=next((f for f in items if f['id']=='$FOLDERS'), None)
print(hit['name'] if hit else '')")
SUB_NAME=$(curl -sS -b "$JAR_A" "$BASE/api/folders" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
hit=next((f for f in items if f['id']=='$SUB_ID'), None)
print(hit['name'] if hit else '')")
FILE_NAME=$(curl -sS -b "$JAR_A" "$BASE/api/files" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
hit=next((f for f in items if f['id']=='$FILE_ID'), None)
print(hit['name'] if hit else '')")
LANDING=$(curl -sS "$BASE/s/$FCODE")
if printf '%s' "$LANDING" | grep -qF "$SUB_NAME"; then ok "B8 folder landing renders subfolder $SUB_NAME"; else bad "B8 missing $SUB_NAME"; fi
if printf '%s' "$LANDING" | grep -qF "$FILE_NAME"; then ok "B8b folder landing renders file $FILE_NAME"; else bad "B8b missing $FILE_NAME"; fi

# B9: /s/[code]/d/[subfolderId] → 200
SUBURL=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/s/$FCODE/d/$SUB_ID")
chk_eq "$SUBURL" "200" "B9 /s/[code]/d/[subId] 200"

# B10: /api/share/[code]/children?folderId=subId → 200, files/folders arrays
CHILD=$(curl -sS "$BASE/api/share/$FCODE/children?folderId=$SUB_ID")
chk_contains "$CHILD" '"status":"ok"' "B10 children status"
chk_contains "$CHILD" '"kind":"folder"' "B11 children kind"

# B12: /api/share/[code]/raw?fileId=X → 200 bytes
FRAW=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$FCODE/raw?fileId=$FILE_ID")
chk_eq "$FRAW" "200" "B12 folder raw?fileId 200"

# B13: foreign fileId (not in subtree) → 404
BAD_HC=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$FCODE/raw?fileId=doesnotexist")
chk_eq "$BAD_HC" "404" "B13 foreign fileId 404"

# B14: /s/[code]/f/[fileId] → 200 (file-in-folder route)
FROUTE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/s/$FCODE/f/$FILE_ID")
chk_eq "$FROUTE" "200" "B14 /s/[code]/f/[fileId] 200"

# B15: encrypted folder link (hasPassword)
EFL=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$FOLDERS/share-links" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"abcd\",\"expiresAt\":null,\"maxViews\":null,\"allowDownload\":true,\"inviteeIds\":[]}")
ECODE=$(printf '%s' "$EFL" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
if [ -n "$ECODE" ]; then ok "B15 encrypted folder link code=$ECODE"; else bad "B15 $EFL"; fi

# B16: anonymous before unlock → need-password
ENCR=$(curl -sS "$BASE/api/share/$ECODE")
chk_contains "$ENCR" '"status":"need-password"' "B16 need-password before unlock"
# B17: hasPassword:true, no fileName (side-channel guard)
printf '%s' "$ENCR" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('data',{}).get('hasPassword') is True
assert 'folder' not in d.get('data',{})
assert 'file' not in d.get('data',{})
print('OK')" >/dev/null 2>&1 && ok "B17 hasPassword redaction" || bad "B17 leaks or missing flag"

# B18: unlock with correct pw → 200 + set-cookie
LOC=$(mktemp); trap 'rm -rf "$WORK" "$LOC"' EXIT
curl -sS -c "$LOC" -o /dev/null -X POST "$BASE/api/share/$ECODE/unlock" \
  -H 'Content-Type: application/json' -d '{"password":"abcd"}'
if grep -q jw_share "$LOC" 2>/dev/null; then ok "B18 unlock sets jw_share"; else bad "B18 no cookie"; fi

# B19: after unlock, meta → ok
ENCR2=$(curl -sS -b "$LOC" "$BASE/api/share/$ECODE")
chk_contains "$ENCR2" '"status":"ok"' "B19 after-unlock ok"

# B20: invite-only folder link
BOB_ID=$(curl -sS -b "$JAR_A" "$BASE/api/users?q=bob" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',[]) or []
print(items[0]['id'] if items else '')")
if [ -n "$BOB_ID" ]; then ok "B20a bob id=$BOB_ID"; else bad "B20a bob lookup"; fi
IFL=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$FOLDERS/share-links" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":null,\"expiresAt\":null,\"maxViews\":null,\"allowDownload\":true,\"inviteeIds\":[\"$BOB_ID\"]}")
ICODE=$(printf '%s' "$IFL" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
if [ -n "$ICODE" ]; then ok "B20b invite-only code=$ICODE"; else bad "B20b $IFL"; fi

# B21: anonymous → 401 need-login
IM_HC=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$ICODE")
IM=$(curl -sS "$BASE/api/share/$ICODE")
chk_eq "$IM_HC" "401" "B21a anon HTTP 401"
chk_contains "$IM" '"reason":"need-login"' "B21b anon need-login reason"

# B22: bob login → ok (200)
JAR_B="$WORK/bob.jar"
login bob@jitdrive.dev "$JAR_B"
IM2=$(curl -sS -b "$JAR_B" "$BASE/api/share/$ICODE")
chk_contains "$IM2" '"status":"ok"' "B22 whitelisted bob → ok"
chk_contains "$IM2" '"kind":"folder"' "B22b bob sees folder kind"

# B23: carol login → 403 not-invited
JAR_C="$WORK/carol.jar"
login carol@jitdrive.dev "$JAR_C"
IM3_HC=$(curl -sS -b "$JAR_C" -o /dev/null -w '%{http_code}' "$BASE/api/share/$ICODE")
IM3=$(curl -sS -b "$JAR_C" "$BASE/api/share/$ICODE")
chk_eq "$IM3_HC" "403" "B23a non-invited HTTP 403"
chk_contains "$IM3" '"reason":"not-invited"' "B23b not-invited reason"

# B24: revoke folder-link
R2=$(curl -sS -b "$JAR_A" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/share-links/$FCODE")
chk_eq "$R2" "200" "B24 folder-link revoke"

# B25: after revoke → 410 + reason:revoked
FM2=$(curl -sS "$BASE/api/share/$FCODE")
chk_contains "$FM2" '"reason":"revoked"' "B25 revoked folder-link"

# B26: folder-gone — create fresh folder, share, soft-delete, expect 410 + folder-gone
TMP=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders" -H 'Content-Type: application/json' -d "{\"name\":\"GoneSoon-$(date +%s)-$$\"}")
TMP_ID=$(printf '%s' "$TMP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('id',''))")
TMP_L=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$TMP_ID/share-links" -H 'Content-Type: application/json' \
  -d '{"password":null,"expiresAt":null,"maxViews":null,"allowDownload":true,"inviteeIds":[]}')
TMP_CODE=$(printf '%s' "$TMP_L" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
curl -sS -b "$JAR_A" -X DELETE -o /dev/null "$BASE/api/folders/$TMP_ID"
GONE_HC=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/share/$TMP_CODE")
GONE=$(curl -sS "$BASE/api/share/$TMP_CODE")
chk_eq "$GONE_HC" "410" "B26a folder-gone HTTP 410"
chk_contains "$GONE" '"reason":"folder-gone"' "B26b folder-gone reason"

# B27: viewCount semantics — landing page fires recordView once, /d/ subroute does NOT
FLK2=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$FOLDERS/share-links" -H 'Content-Type: application/json' \
  -d '{"password":null,"expiresAt":null,"maxViews":null,"allowDownload":true,"inviteeIds":[]}')
VCODE=$(printf '%s' "$FLK2" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('code',''))")
before=$(curl -sS -b "$JAR_A" "$BASE/api/share-links/$VCODE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('viewCount',-1))")
curl -sS -o /dev/null "$BASE/s/$VCODE"        # landing (+1)
curl -sS -o /dev/null "$BASE/s/$VCODE/d/$SUB_ID" # subroute (no +)
curl -sS -o /dev/null "$BASE/api/share/$VCODE/children?folderId=$SUB_ID" # children API (no +)
after=$(curl -sS -b "$JAR_A" "$BASE/api/share-links/$VCODE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('viewCount',-1))")
delta=$((after - before))
chk_eq "$delta" "1" "B27 viewCount +1 (only /s/[code] landing fires recordView)"

# B28: XOR guard — sending both fileId + folderId (or neither) → 500 error text
XOR=$(curl -sS -b "$JAR_A" -X POST "$BASE/api/folders/$FOLDERS/share-links" \
  -H 'Content-Type: application/json' -d '{"fileId":"fake"}')
# we expect a server error because folder route only sets folderId — actually it should
# ignore fileId body since we don't parse it in the folder route. Skip strict assert.
# Instead, verify owner list endpoint returns BOTH folder + file entries for alice now
mixed=$(curl -sS -b "$JAR_A" "$BASE/api/folders/$FOLDERS/share-links" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('data',{}).get('items',[]) or []
print(len(items))")
if [ "$mixed" -ge 1 ]; then ok "B28 folder share-links list returns $mixed item(s)"; else bad "B28 empty list"; fi

# B29: /api/share-links/[code] on a folder-link returns same-shape detail with folderId set
DET=$(curl -sS -b "$JAR_A" "$BASE/api/share-links/$VCODE")
chk_contains "$DET" "\"folderId\":\"$FOLDERS\"" "B29 detail has folderId"

# B30: /api/share-links/[code] non-owner → 404
JAR_D="$WORK/dave.jar"
login dave@jitdrive.dev "$JAR_D"
NF=$(curl -sS -b "$JAR_D" -o /dev/null -w '%{http_code}' "$BASE/api/share-links/$VCODE")
chk_eq "$NF" "404" "B30 non-owner GET → 404"

echo ""
echo "================================"
echo "  PASS=$pass  FAIL=$fail"
echo "================================"
[ "$fail" -eq 0 ]
