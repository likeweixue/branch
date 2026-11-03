#!/usr/bin/env bash
# ============================================================================
# 发布 GitHub Release
#
#   用法：
#     ./scripts/release.sh v0.0.6          # 为标签 v0.0.6 创建（或更新）一条 Release
#     ./scripts/release.sh v0.0.6 --dry    # 只看正文，不真的发布
#     ./scripts/release.sh --all           # 把所有 CHANGELOG 里的版本一次性补齐
#
#   前置：
#     1. 标签已推到远端（git push origin v0.0.6）
#     2. 二选一：已登录的 gh CLI（推荐，`gh auth login` 一次即可）
#        或环境变量里的 GitHub 令牌（需要 repo 权限）：
#          export GITHUB_TOKEN=ghp_xxxxxxxx
#        令牌只用于调用 API，脚本不会把它写进任何文件。
#     3. 仓库地址可用 ZUPU_REPO 覆盖，默认读取 origin。
#
#   正文来源：CHANGELOG.md 里对应版本的小节（## [0.0.6] … 到下一个 ## 之前）
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
CHANGELOG="CHANGELOG.md"
[[ -f "$CHANGELOG" ]] || { echo "找不到 $CHANGELOG"; exit 1; }

# 仓库 slug（owner/name）
REPO="${ZUPU_REPO:-}"
if [[ -z "$REPO" ]]; then
  url="$(git config --get remote.origin.url || true)"
  REPO="$(printf '%s' "$url" | sed -E 's#(git@|https://)github\.com[:/]##; s#\.git$##')"
fi
[[ -n "$REPO" ]] || { echo "无法确定仓库地址，请设置 ZUPU_REPO=owner/name"; exit 1; }

API="https://api.github.com/repos/${REPO}/releases"

# gh CLI：优先走已登录的 gh（不用管令牌）；找不到就退回 curl + GITHUB_TOKEN
GH_BIN=""
for cand in "${ZUPU_GH:-}" "$(command -v gh 2>/dev/null || true)" "$HOME/bin/gh" /opt/homebrew/bin/gh /usr/local/bin/gh; do
  if [[ -n "$cand" && -x "$cand" ]]; then GH_BIN="$cand"; break; fi
done
if [[ -n "$GH_BIN" ]] && ! "$GH_BIN" auth status >/dev/null 2>&1; then GH_BIN=""; fi

# 每个版本一句话主题，用作 Release 标题
release_title() {
  case "$1" in
    0.0.1) echo "首个版本 · 树杈式族谱与后台" ;;
    0.0.2) echo "无边记式画布编辑器" ;;
    0.0.3) echo "家庭单元布局与一键启动" ;;
    0.0.4) echo "内置真实家族数据" ;;
    0.0.5) echo "家族语录与家族历史" ;;
    0.0.6) echo "成员头像与家族相册" ;;
    0.0.7) echo "相册真实照片，照片墙铺满一屏" ;;
    0.0.8) echo "续谱收集表与刘氏九代世系" ;;
    0.0.9) echo "自定义连线类型、家族土地与坟茔星空" ;;
    0.0.10) echo "离线底图、土地地图切换与全屏星空" ;;
    *)     echo "宗谱更新" ;;
  esac
}

# 取出某个版本的正文（去掉标题行本身）
notes_for() {
  local ver="$1"
  awk -v v="$ver" '
    $0 ~ "^## \\["v"\\]" { inside = 1; next }
    inside && /^## \[/ { exit }
    inside { print }
  ' "$CHANGELOG" | sed -e '/^---$/d' -e '1{/^$/d}'
}

all_versions() {
  grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$CHANGELOG" \
    | sed -E 's/^## \[(.*)\]/\1/' \
    | sort -V
}

# 最新版（用来决定哪条 Release 打 latest 标）
LATEST_TAG="v$(all_versions | tail -1)"

publish_one() {
  local ver="$1" dry="${2:-0}"
  local tag="$ver"
  [[ "$tag" == v* ]] || tag="v$ver"
  local bare="${tag#v}"
  local notes
  notes="$(notes_for "$bare")"
  if [[ -z "${notes//[$' \t\n']/}" ]]; then
    echo "✗ CHANGELOG 里没有 [$bare] 这一节，跳过"
    return 1
  fi

  if [[ "$dry" == "1" ]]; then
    echo "──── $tag ────"
    printf '%s\n\n' "$notes"
    return 0
  fi

  if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "✗ 本地没有标签 $tag（git tag $tag）"
    return 1
  fi
  if ! git ls-remote --tags --exit-code origin "$tag" >/dev/null 2>&1; then
    echo "! 标签 $tag 还没推到远端：git push origin $tag"
    return 1
  fi
  if [[ -z "$GH_BIN" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "✗ 既没有已登录的 gh，也没有 GITHUB_TOKEN"
    echo "  → 任选其一：gh auth login   或   export GITHUB_TOKEN=..."
    return 1
  fi

  local title latest pre
  title="$tag · $(release_title "$bare")"
  latest="false"; [[ "$tag" == "$LATEST_TAG" ]] && latest="true"
  pre="false"; { [[ "$tag" == *-beta ]] || [[ "$tag" == *-beta.* ]]; } && pre="true"

  local notes_file
  notes_file="$(mktemp -t zupu-notes)"
  printf '%s\n' "$notes" >"$notes_file"

  # 优先 gh（复用已登录的凭据，不碰令牌）
  if [[ -n "$GH_BIN" ]]; then
    local out
    if "$GH_BIN" release view "$tag" >/dev/null 2>&1; then
      if out="$("$GH_BIN" release edit "$tag" --title "$title" --notes-file "$notes_file" \
                 --latest="$latest" --prerelease="$pre" 2>&1)"; then
        echo "✓ 已更新 Release $tag"
      else
        echo "✗ 更新 $tag 失败"; echo "$out"; rm -f "$notes_file"; return 1
      fi
    else
      if out="$("$GH_BIN" release create "$tag" --title "$title" --notes-file "$notes_file" \
                 --latest="$latest" --prerelease="$pre" 2>&1)"; then
        echo "✓ 已发布 Release $tag"
        printf '  %s\n' "$(printf '%s' "$out" | grep -Eo 'https://[^ ]+' | tail -1)"
      else
        echo "✗ 发布 $tag 失败"; echo "$out"; rm -f "$notes_file"; return 1
      fi
    fi
    rm -f "$notes_file"
    return 0
  fi

  local tmp
  tmp="$(mktemp -t zupu-release)"
  python3 - "$tag" "$title" "$notes" >"$tmp" <<'PY'
import json, sys
tag, title, notes = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "tag_name": tag,
    "name": title,
    "body": notes,
    "draft": False,
    "prerelease": tag.endswith("-beta") or "-beta." in tag,
}, ensure_ascii=False))
PY

  # 已存在就更新，否则新建
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$API/tags/$tag")"
  if [[ "$code" == "200" ]]; then
    local id
    id="$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$API/tags/$tag" \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
    code="$(curl -s -o /tmp/zupu-release.out -w '%{http_code}' -X PATCH \
      -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" --data-binary @"$tmp" "$API/$id")"
    [[ "$code" == "200" ]] && echo "✓ 已更新 Release $tag" || { echo "✗ 更新失败 HTTP $code"; cat /tmp/zupu-release.out; rm -f "$tmp"; return 1; }
  else
    code="$(curl -s -o /tmp/zupu-release.out -w '%{http_code}' -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" --data-binary @"$tmp" "$API")"
    if [[ "$code" == "201" ]]; then
      echo "✓ 已发布 Release $tag"
      python3 -c 'import json;print("  ", json.load(open("/tmp/zupu-release.out"))["html_url"])'
    else
      echo "✗ 发布失败 HTTP $code"; cat /tmp/zupu-release.out; rm -f "$tmp"; return 1
    fi
  fi
  rm -f "$tmp"
}

main() {
  local first="${1:-}"
  case "$first" in
    ""|-h|--help)
      sed -n '2,20p' "$0" | sed -E 's/^# ?//'
      exit 0
      ;;
    --all)
      local dry=0; [[ "${2:-}" == "--dry" ]] && dry=1
      local fail=0
      while read -r v; do
        publish_one "v$v" "$dry" || fail=1
      done < <(all_versions)
      exit "$fail"
      ;;
    *)
      local dry=0; [[ "${2:-}" == "--dry" ]] && dry=1
      publish_one "$first" "$dry"
      ;;
  esac
}

main "$@"
