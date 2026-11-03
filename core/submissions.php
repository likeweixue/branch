<?php
/**
 * 「续谱」收集表：外部提交的新增/修改申请。
 *
 * 存放于 data/submissions.json，是一条条待审的「改动提案」：
 *   type=new  新增一位家人（payload 即成员字段）
 *   type=edit 修改某位现有成员（target_id + payload 中被改动的字段）
 *
 * 管理员在后台逐条批准（合并进 members.json）或驳回。整个流程类似 GitHub 的
 * 「提交修改 → 审核 → 合并」，只是把 diff 换成了人看得懂的字段对照。
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

/** 字符串长度（兼容未装 mbstring 的静态 PHP） */
function zp_len($s) {
    $s = (string) $s;
    if (function_exists('mb_strlen')) return mb_strlen($s, 'UTF-8');
    return (int) preg_match_all('/./us', $s);
}

function zp_subs_load() {
    $rows = zp_load_json(SUBMISSIONS_FILE, []);
    return is_array($rows) ? $rows : [];
}

function zp_subs_save($rows) {
    return zp_save_json(SUBMISSIONS_FILE, array_values($rows));
}

function zp_subs_next_id($rows) {
    $max = 0;
    foreach ($rows as $r) {
        $n = (int) preg_replace('/\D/', '', (string) ($r['id'] ?? ''));
        if ($n > $max) $max = $n;
    }
    return 's' . ($max + 1);
}

/** 待审条数（后台导航角标用） */
function zp_subs_pending_count($rows = null) {
    if ($rows === null) $rows = zp_subs_load();
    $n = 0;
    foreach ($rows as $r) { if (($r['status'] ?? 'pending') === 'pending') $n++; }
    return $n;
}

/** 逐个字段的长度上限（超出即拒绝，避免有人拿表单塞垃圾） */
function zp_sub_limits() {
    return [
        'name' => 24, 'zi_bei' => 4, 'birth' => 20, 'death' => 20,
        'bio' => 800, 'avatar' => 1200,
        'submitter_name' => 24, 'submitter_contact' => 60, 'note' => 600,
    ];
}

/**
 * 校验并规整一条提交。
 * @return array [payload, submitter, error]  error 为空串表示通过
 */
function zp_sub_clean($in, $members) {
    $lim = zp_sub_limits();
    $type = (($in['type'] ?? 'new') === 'edit') ? 'edit' : 'new';
    $err = '';

    $name = trim((string) ($in['name'] ?? ''));
    $zi   = trim((string) ($in['zi_bei'] ?? ''));
    $gender = (($in['gender'] ?? 'male') === 'female') ? 'female' : 'male';
    $birth = trim((string) ($in['birth'] ?? ''));
    $death = trim((string) ($in['death'] ?? ''));
    $bio   = trim((string) ($in['bio'] ?? ''));
    $avatar = zp_clean_url($in['avatar'] ?? '');
    $father = trim((string) ($in['father_id'] ?? ''));
    $mother = trim((string) ($in['mother_id'] ?? ''));
    $target = trim((string) ($in['target_id'] ?? ''));

    // 成员索引
    $ids = [];
    foreach ($members as $m) $ids[$m['id']] = $m;

    // 修正模式下没填姓名，就沿用它现在的名字
    if ($type === 'edit' && $name === '' && isset($ids[$target])) {
        $name = (string) $ids[$target]['name'];
    }

    if ($name === '') {
        $err = '请填写姓名';
    } elseif (zp_len($name) > $lim['name']) {
        $err = '姓名太长了';
    } elseif (zp_len($zi) > $lim['zi_bei']) {
        $err = '字辈最多 4 个字';
    } elseif (zp_len($birth) > $lim['birth'] || zp_len($death) > $lim['death']) {
        $err = '生卒日期太长了';
    } elseif (!empty($in['avatar']) && $avatar === '') {
        $err = '头像链接无效（只支持 http/https 图床直链，或站内 photos/ 路径）';
    } elseif (zp_len($bio) > $lim['bio']) {
        $err = '简介太长了（800 字以内）';
    } elseif ($father !== '' && !isset($ids[$father])) {
        $err = '父亲未在谱中找到';
    } elseif ($mother !== '' && !isset($ids[$mother])) {
        $err = '母亲未在谱中找到';
    } elseif ($type === 'edit' && !isset($ids[$target])) {
        $err = '要修改的成员不存在';
    }

    // 配偶：只保留真实存在的成员，去重，最多 4 位
    $spouse = [];
    $raw = $in['spouse_ids'] ?? [];
    if (is_array($raw)) {
        foreach ($raw as $sid) {
            $sid = trim((string) $sid);
            if ($sid !== '' && isset($ids[$sid]) && $sid !== $target && !in_array($sid, $spouse, true)) $spouse[] = $sid;
        }
    }
    $spouse = array_slice($spouse, 0, 4);

    $subName = trim((string) ($in['submitter_name'] ?? ''));
    $subContact = trim((string) ($in['submitter_contact'] ?? ''));
    $note = trim((string) ($in['note'] ?? ''));
    if ($err === '' && zp_len($subName) > $lim['submitter_name']) $err = '提交人称呼太长了';
    if ($err === '' && zp_len($subContact) > $lim['submitter_contact']) $err = '联系方式太长了';
    if ($err === '' && zp_len($note) > $lim['note']) $err = '说明太长了（600 字以内）';

    $payload = [
        'name'       => $name,
        'zi_bei'     => $zi,
        'gender'     => $gender,
        'birth'      => $birth,
        'death'      => $death,
        'bio'        => $bio,
        'avatar'     => $avatar,
        'father_id'  => ($father !== '' && isset($ids[$father])) ? $father : null,
        'mother_id'  => ($mother !== '' && isset($ids[$mother])) ? $mother : null,
        'spouse_ids' => $spouse,
        'order'      => max(0, (int) ($in['order'] ?? 0)),   // 0 = 交给合并时按兄弟姐妹算
    ];

    // 「修正」时只认真正提交上来的字段：没带的（比如用接口改个简介）不要顺手清空父母、配偶
    if ($type === 'edit') {
        $keep = [];
        foreach ($payload as $k => $v) {
            if (array_key_exists($k, $in)) $keep[$k] = $v;
        }
        $keep['name'] = $name;
        $payload = $keep;
    }

    $submitter = ['name' => $subName, 'contact' => $subContact];
    $meta = ['note' => $note, 'type' => $type, 'target_id' => ($type === 'edit' ? $target : null)];

    return [$payload, $submitter, $meta, $err];
}

/**
 * 写入一条待审申请。
 * @return array ['ok'=>bool, 'msg'=>string, 'id'=>string]
 */
function zp_sub_add($in) {
    $members = zp_load_json(MEMBERS_FILE, []);
    $rows = zp_subs_load();
    $pending = zp_subs_pending_count($rows);
    if ($pending >= 400) {
        return ['ok' => false, 'msg' => '待审的提交太多了，请先让管理员处理一批'];
    }

    list($payload, $submitter, $meta, $err) = zp_sub_clean($in, $members);
    if ($err !== '') return ['ok' => false, 'msg' => $err];

    // 同一个人十分钟内重复提交同一份内容，直接当成同一条（防止连点）
    foreach ($rows as $r) {
        if (($r['status'] ?? '') !== 'pending') continue;
        if (($r['type'] ?? '') !== $meta['type']) continue;
        if (($r['target_id'] ?? null) !== $meta['target_id']) continue;
        if (($r['payload']['name'] ?? '') !== $payload['name']) continue;
        if (strtotime($r['submitted'] ?? '') > time() - 600) {
            return ['ok' => true, 'id' => $r['id'], 'msg' => '这条刚才已经提交过了，正在等审核'];
        }
    }

    $id = zp_subs_next_id($rows);
    $rows[] = [
        'id'        => $id,
        'type'      => $meta['type'],
        'status'    => 'pending',
        'target_id' => $meta['target_id'],
        'payload'   => $payload,
        'submitter' => $submitter,
        'note'      => $meta['note'],
        'submitted' => date('Y-m-d H:i:s'),
        'ip'        => substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45),
        'reviewed'  => null,
    ];
    if (!zp_subs_save($rows)) {
        return ['ok' => false, 'msg' => '写入失败，请稍后再试'];
    }
    return ['ok' => true, 'id' => $id, 'msg' => '已提交，等待管理员审核'];
}

/* ---------------- 合并（批准） ---------------- */

/** 下一个成员 id：m15、m16… */
function zp_next_member_id($members) {
    $max = 0;
    foreach ($members as $m) {
        $n = (int) preg_replace('/\D/', '', (string) ($m['id'] ?? ''));
        if ($n > $max) $max = $n;
    }
    return 'm' . ($max + 1);
}

/** 把「配偶」关系写成双向 */
function zp_link_spouses(&$members, $id, $spouseIds) {
    foreach ($members as &$m) {
        if ($m['id'] === $id) {
            $m['spouse_ids'] = array_values(array_unique($spouseIds));
            continue;
        }
        $has = in_array($m['id'], $spouseIds, true);
        $cur = is_array($m['spouse_ids'] ?? null) ? $m['spouse_ids'] : [];
        if ($has && !in_array($id, $cur, true)) {
            $cur[] = $id;
            $m['spouse_ids'] = array_values($cur);
        } elseif (!$has && in_array($id, $cur, true)) {
            $m['spouse_ids'] = array_values(array_diff($cur, [$id]));
        }
    }
    unset($m);
}

/** 新增成员时给一个合理的同辈排行 */
function zp_sibling_order($members, $fatherId, $motherId) {
    $n = 0;
    foreach ($members as $m) {
        if ($fatherId && ($m['father_id'] ?? null) === $fatherId) { $n++; continue; }
        if (!$fatherId && $motherId && ($m['mother_id'] ?? null) === $motherId) $n++;
    }
    return $n + 1;
}

/**
 * 批准一条申请：把 payload 合并进 members.json。
 * @return array ['ok'=>bool, 'msg'=>string, 'member_id'=>string]
 */
function zp_sub_approve($subId, $reviewer = 'admin', $reviewNote = '') {
    $rows = zp_subs_load();
    $idx = -1;
    foreach ($rows as $i => $r) {
        if (($r['id'] ?? '') === $subId) { $idx = $i; break; }
    }
    if ($idx < 0) return ['ok' => false, 'msg' => '没有这条申请'];
    if (($rows[$idx]['status'] ?? '') !== 'pending') return ['ok' => false, 'msg' => '这条已经处理过了'];

    $members = zp_load_json(MEMBERS_FILE, []);
    $payload = $rows[$idx]['payload'] ?? [];
    $type = $rows[$idx]['type'] ?? 'new';

    if ($type === 'edit') {
        $tid = $rows[$idx]['target_id'] ?? '';
        $found = false;
        foreach ($members as &$m) {
            if ($m['id'] !== $tid) continue;
            $found = true;
            foreach (['name', 'zi_bei', 'gender', 'birth', 'death', 'bio', 'avatar', 'father_id', 'mother_id'] as $k) {
                if (array_key_exists($k, $payload)) $m[$k] = $payload[$k];
            }
            break;
        }
        unset($m);
        if (!$found) return ['ok' => false, 'msg' => '目标成员已不存在（可能被删了）'];
        zp_link_spouses($members, $tid, $payload['spouse_ids'] ?? []);
        $memberId = $tid;
    } else {
        $newId = zp_next_member_id($members);
        $order = (int) ($payload['order'] ?? 0);
        if ($order <= 0) {
            $order = zp_sibling_order($members, $payload['father_id'] ?? null, $payload['mother_id'] ?? null);
        }
        $row = [
            'id'         => $newId,
            'name'       => $payload['name'],
            'zi_bei'     => $payload['zi_bei'] ?? '',
            'gender'     => $payload['gender'] ?? 'male',
            'birth'      => $payload['birth'] ?? '',
            'death'      => ($payload['death'] ?? '') !== '' ? $payload['death'] : null,
            'bio'        => $payload['bio'] ?? '',
            'avatar'     => $payload['avatar'] ?? '',
            'father_id'  => $payload['father_id'] ?? null,
            'mother_id'  => $payload['mother_id'] ?? null,
            'spouse_ids' => [],
            'order'      => $order,
        ];
        $members[] = $row;
        zp_link_spouses($members, $newId, $payload['spouse_ids'] ?? []);
        // 画布上原有的手工坐标少了这个人，会让新旧坐标混排重叠，统一清掉重新自动排布
        foreach ($members as &$m) unset($m['pos']);
        unset($m);
        $memberId = $newId;
    }

    if (!zp_save_json(MEMBERS_FILE, $members)) {
        return ['ok' => false, 'msg' => '写入成员表失败'];
    }

    $rows[$idx]['status'] = 'approved';
    $rows[$idx]['reviewed'] = ['by' => $reviewer, 'at' => date('Y-m-d H:i:s'), 'note' => $reviewNote];
    $rows[$idx]['member_id'] = $memberId;
    zp_subs_save($rows);
    return ['ok' => true, 'msg' => '已合并进族谱', 'member_id' => $memberId];
}

/** 驳回 */
function zp_sub_reject($subId, $reviewer = 'admin', $reviewNote = '') {
    $rows = zp_subs_load();
    foreach ($rows as &$r) {
        if (($r['id'] ?? '') !== $subId) continue;
        if (($r['status'] ?? '') !== 'pending') return ['ok' => false, 'msg' => '这条已经处理过了'];
        $r['status'] = 'rejected';
        $r['reviewed'] = ['by' => $reviewer, 'at' => date('Y-m-d H:i:s'), 'note' => $reviewNote];
        zp_subs_save($rows);
        return ['ok' => true, 'msg' => '已驳回'];
    }
    unset($r);
    return ['ok' => false, 'msg' => '没有这条申请'];
}

/* ---------------- 展示辅助（后台差异对照用） ---------------- */

/** 字段中文名 */
function zp_sub_fields() {
    return [
        'name' => '姓名', 'zi_bei' => '字辈', 'gender' => '性别',
        'birth' => '出生', 'death' => '逝世', 'bio' => '简介',
        'avatar' => '头像链接', 'father_id' => '父亲', 'mother_id' => '母亲',
        'spouse_ids' => '配偶',
    ];
}

/** 把成员值渲染成可读文本 */
function zp_sub_val($key, $val, $nameOf) {
    if ($key === 'gender') return $val === 'female' ? '女' : '男';
    if ($key === 'father_id' || $key === 'mother_id') return $val ? $nameOf($val) : '—';
    if ($key === 'spouse_ids') {
        $out = [];
        foreach ((array) $val as $id) { if ($id) $out[] = $nameOf($id); }
        return $out ? implode('、', $out) : '—';
    }
    if ($key === 'death') return $val ?: '—';
    return trim((string) $val) !== '' ? (string) $val : '—';
}
