<?php
/**
 * 统一 API 入口。前端通过 fetch 调用，返回 JSON。
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';
require_once __DIR__ . '/core/submissions.php';

zp_ensure_seed();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function zp_json($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function zp_input() {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw, true);
    if (!is_array($d)) {
        $d = $_POST;
    }
    return is_array($d) ? $d : [];
}

function require_admin() {
    if (!zp_is_admin()) {
        zp_json(['ok' => false, 'msg' => '需要管理员权限'], 403);
    }
}

function require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        zp_json(['ok' => false, 'msg' => '请使用 POST 请求'], 405);
    }
}

/* ---------- 树形工具 ---------- */
function zp_member_by_id($members, $id) {
    foreach ($members as $m) {
        if ($m['id'] === $id) return $m;
    }
    return null;
}

/** 在数组里按 id 找一行（语录 / 大事记通用） */
function zp_find_row($rows, $id) {
    foreach ($rows as $r) {
        if (($r['id'] ?? '') === $id) return $r;
    }
    return null;
}

/** 判断 $anc 是否是 $node 的祖先（沿 father/mother 上溯，BFS 防环） */
function zp_is_ancestor($members, $anc, $node) {
    $queue = [$node];
    $seen = [];
    $guard = 0;
    while ($queue && $guard++ < 500) {
        $curId = array_shift($queue);
        if (isset($seen[$curId])) continue;
        $seen[$curId] = true;
        if ($curId === $anc) return true;
        $m = zp_member_by_id($members, $curId);
        if ($m) {
            if (!empty($m['father_id'])) $queue[] = $m['father_id'];
            if (!empty($m['mother_id'])) $queue[] = $m['mother_id'];
        }
    }
    return false;
}

/** 规范化图片地址数组（去空、去重、限量） */
function zp_clean_photos($arr, $max = 12) {
    $out = [];
    if (!is_array($arr)) return $out;
    foreach ($arr as $u) {
        $u = is_string($u) ? zp_clean_url($u) : '';
        if ($u !== '' && !in_array($u, $out, true)) $out[] = $u;
        if (count($out) >= $max) break;
    }
    return $out;
}

/** 经纬度：非法或越界一律存 null（表示「未标点」） */
function zp_coord($v, $min, $max) {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $f = (float) $v;
    if ($f < $min || $f > $max) return null;
    return round($f, 6);
}

/** 只保留真实存在的成员 id */
function zp_member_ids($arr, $members) {
    $out = [];
    foreach ((array) $arr as $mid) {
        if (is_string($mid) && $mid !== '' && zp_member_by_id($members, $mid) && !in_array($mid, $out, true)) {
            $out[] = $mid;
        }
    }
    return $out;
}

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

switch ($action) {

    /* ============ 公开：获取族谱树 ============ */
    case 'get_tree':
        $members = zp_load_json(MEMBERS_FILE, []);
        $settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
        $me = null;
        $role = null;
        $u = zp_current_user();
        if ($u) {
            $me = $u['member_id'] ?? null;
            $role = $u['role'];
        }
        zp_json([
            'ok'       => true,
            'members'  => $members,
            'settings' => $settings,
            'me'       => $me,
            'role'     => $role,
            'logged_in'=> !empty($u),
        ]);
        break;

    /* ============ 登录 ============ */
    case 'login':
        require_post();
        $in = zp_input();
        $username = trim($in['username'] ?? '');
        $password = $in['password'] ?? '';
        $u = zp_login($username, $password);
        if ($u) {
            zp_json(['ok' => true, 'user' => ['id' => $u['id'], 'username' => $u['username'], 'role' => $u['role'], 'member_id' => $u['member_id'] ?? null]]);
        }
        zp_json(['ok' => false, 'msg' => '用户名或密码错误'], 401);
        break;

    /* ============ 登出 ============ */
    case 'logout':
        zp_logout();
        zp_json(['ok' => true]);
        break;

    /* ============ 注册 ============ */
    case 'register':
        require_post();
        $in = zp_input();
        $res = zp_register($in['username'] ?? '', $in['password'] ?? '');
        if ($res['ok']) {
            zp_json(['ok' => true, 'id' => $res['id']]);
        }
        zp_json(['ok' => false, 'msg' => $res['msg']], 400);
        break;

    /* ============ 当前用户 ============ */
    case 'me':
        $u = zp_current_user();
        if ($u) {
            zp_json(['ok' => true, 'user' => ['id' => $u['id'], 'username' => $u['username'], 'role' => $u['role'], 'member_id' => $u['member_id'] ?? null]]);
        }
        zp_json(['ok' => false]);
        break;

    /* ============ 用户列表（管理员） ============ */
    case 'list_users':
        require_admin();
        $users = zp_load_json(USERS_FILE, []);
        $out = array_map(function ($u) {
            return [
                'id' => $u['id'],
                'username' => $u['username'],
                'role' => $u['role'],
                'member_id' => $u['member_id'] ?? null,
                'created' => $u['created'] ?? '',
            ];
        }, $users);
        zp_json(['ok' => true, 'users' => $out]);
        break;

    /* ============ 保存成员（管理员） ============ */
    case 'save_member':
        require_post();
        require_admin();
        $in = zp_input();
        $members = zp_load_json(MEMBERS_FILE, []);
        $id = $in['id'] ?? '';
        $isNew = ($id === '' || zp_member_by_id($members, $id) === null);

        // 校验
        $name = trim($in['name'] ?? '');
        if ($name === '') {
            zp_json(['ok' => false, 'msg' => '姓名不能为空'], 400);
        }
        $gender = ($in['gender'] ?? 'male') === 'female' ? 'female' : 'male';
        $father_id = !empty($in['father_id']) ? $in['father_id'] : null;
        $mother_id = !empty($in['mother_id']) ? $in['mother_id'] : null;
        $spouse_ids = isset($in['spouse_ids']) && is_array($in['spouse_ids']) ? array_values(array_unique(array_filter($in['spouse_ids'], fn($x) => $x !== '' && $x !== $id))) : [];
        $zi_bei = trim($in['zi_bei'] ?? '');
        $birth = trim($in['birth'] ?? '');
        $death = trim($in['death'] ?? '');
        $bio = trim($in['bio'] ?? '');
        $avatar = zp_clean_url($in['avatar'] ?? '');
        $order = (int) ($in['order'] ?? 1);
        // 与父母的连线类型（取自定义关系线里的 id，空 = 用默认父/母线）
        $link_type = preg_replace('/[^\w\-]/', '', (string) ($in['link_type'] ?? ''));
        $validTypes = array_column(zp_line_types(zp_load_json(SETTINGS_FILE, zp_default_settings())), 'id');
        if ($link_type !== '' && !in_array($link_type, $validTypes, true)) $link_type = '';

        if ($father_id && !zp_member_by_id($members, $father_id)) $father_id = null;
        if ($mother_id && !zp_member_by_id($members, $mother_id)) $mother_id = null;

        // 新成员先分配 id，便于关系互通校验
        if ($isNew) {
            $id = zp_next_id($members, 'm');
        }

        // 防环：不能选自己或自己的后代做父/母
        if ($father_id === $id || $mother_id === $id) {
            zp_json(['ok' => false, 'msg' => '父/母不能设为本人'], 400);
        }
        if (($father_id && zp_is_ancestor($members, $id, $father_id)) ||
            ($mother_id && zp_is_ancestor($members, $id, $mother_id))) {
            zp_json(['ok' => false, 'msg' => '父/母不能设为自己的后代（会形成环）'], 400);
        }

        $member = [
            'id'         => $id,
            'name'       => $name,
            'zi_bei'     => $zi_bei,
            'gender'     => $gender,
            'birth'      => $birth,
            'death'      => $death ?: null,
            'bio'        => $bio,
            'avatar'     => $avatar,
            'link_type'  => $link_type,
            'father_id'  => $father_id,
            'mother_id'  => $mother_id,
            'spouse_ids' => $spouse_ids,
            'order'      => $order,
        ];

        // 写回成员列表
        if ($isNew) {
            $members[] = $member;
        } else {
            foreach ($members as &$m) {
                if ($m['id'] === $id) { $m = $member; break; }
            }
            unset($m);
        }

        // 配偶关系互通：保证双向
        $old = $isNew ? [] : (zp_member_by_id($members, $id)['spouse_ids'] ?? []);
        $old = is_array($old) ? $old : [];
        // 以最新 members 为准再处理
        foreach ($members as &$m) {
            if ($m['id'] === $id) continue;
            $sp = isset($m['spouse_ids']) && is_array($m['spouse_ids']) ? $m['spouse_ids'] : [];
            $hasMe = in_array($id, $sp, true);
            $wantMe = in_array($m['id'], $spouse_ids, true);
            if ($wantMe && !$hasMe) { $sp[] = $id; }
            if (!$wantMe && $hasMe) { $sp = array_values(array_diff($sp, [$id])); }
            $m['spouse_ids'] = $sp;
        }
        unset($m);

        zp_save_json(MEMBERS_FILE, $members);
        zp_json(['ok' => true, 'id' => $id]);
        break;

    /* ============ 删除成员（管理员） ============ */
    case 'delete_member':
        require_post();
        require_admin();
        $in = zp_input();
        $id = $in['id'] ?? '';
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $members = zp_load_json(MEMBERS_FILE, []);
        $members = array_values(array_filter($members, fn($m) => $m['id'] !== $id));
        // 清理相关父母的指向与配偶互通
        foreach ($members as &$m) {
            if (!empty($m['father_id']) && $m['father_id'] === $id) $m['father_id'] = null;
            if (!empty($m['mother_id']) && $m['mother_id'] === $id) $m['mother_id'] = null;
            if (!empty($m['spouse_ids'])) {
                $m['spouse_ids'] = array_values(array_filter($m['spouse_ids'], fn($s) => $s !== $id));
            }
        }
        unset($m);
        // 同时解绑用户绑定
        $users = zp_load_json(USERS_FILE, []);
        foreach ($users as &$u) {
            if (($u['member_id'] ?? null) === $id) $u['member_id'] = null;
        }
        unset($u);
        zp_save_json(MEMBERS_FILE, $members);
        zp_save_json(USERS_FILE, $users);

        // 语录：讲述人被删除后转为手填姓名，不丢内容
        $quotes = zp_load_json(QUOTES_FILE, []);
        $qTouched = false;
        foreach ($quotes as &$q) {
            if (($q['member_id'] ?? null) === $id) {
                $q['member_id'] = null;
                $qTouched = true;
            }
        }
        unset($q);
        if ($qTouched) zp_save_json(QUOTES_FILE, $quotes);

        // 大事记：移除对已删成员的引用
        $events = zp_load_json(EVENTS_FILE, []);
        $eTouched = false;
        foreach ($events as &$ev) {
            if (!empty($ev['member_ids']) && is_array($ev['member_ids']) && in_array($id, $ev['member_ids'], true)) {
                $ev['member_ids'] = array_values(array_diff($ev['member_ids'], [$id]));
                $eTouched = true;
            }
        }
        unset($ev);
        if ($eTouched) zp_save_json(EVENTS_FILE, $events);

        // 相册：移除照片里对已删成员的标注
        $photos = zp_load_json(PHOTOS_FILE, []);
        $pTouched = false;
        foreach ($photos as &$ph) {
            if (!empty($ph['member_ids']) && is_array($ph['member_ids']) && in_array($id, $ph['member_ids'], true)) {
                $ph['member_ids'] = array_values(array_diff($ph['member_ids'], [$id]));
                $pTouched = true;
            }
        }
        unset($ph);
        if ($pTouched) zp_save_json(PHOTOS_FILE, $photos);

        zp_json(['ok' => true]);
        break;

    /* ============ 保存设置（管理员） ============ */
    case 'save_settings':
        require_post();
        require_admin();
        $in = zp_input();
        $settings = zp_load_json(SETTINGS_FILE, zp_default_settings());

        if (isset($in['zi_bei']) && is_array($in['zi_bei'])) {
            $settings['zi_bei'] = array_values(array_filter(array_map('trim', $in['zi_bei']), fn($x) => $x !== ''));
        }
        if (isset($in['layout']) && in_array($in['layout'], ['horizontal', 'vertical', 'custom'], true)) {
            if ($in['layout'] === 'custom') {
                $settings['layout_mode'] = 'custom';     // 位置以画布编辑器保存的为准
            } else {
                $settings['layout'] = $in['layout'];
                $settings['layout_mode'] = 'auto';
            }
        }
        if (isset($in['lines']) && is_array($in['lines'])) {
            foreach (['parent', 'marriage', 'self'] as $k) {
                if (isset($in['lines'][$k])) {
                    $settings['lines'][$k] = zp_clean_color($in['lines'][$k], $settings['lines'][$k] ?? '#cfd3d8');
                }
            }
        }
        // 自定义关系线：名称 + 颜色 + 语义（parent / marriage / 自定义）
        if (isset($in['line_types']) && is_array($in['line_types'])) {
            $clean = [];
            foreach ($in['line_types'] as $i => $t) {
                if (!is_array($t)) continue;
                $label = trim((string) ($t['label'] ?? ''));
                if ($label === '') continue;
                $kind = (string) ($t['kind'] ?? '');
                if (!in_array($kind, ['parent', 'marriage'], true)) $kind = '';
                $id = preg_replace('/[^\w\-]/', '', (string) ($t['id'] ?? ''));
                if ($id === '') $id = 'lt' . ($i + 1);
                $clean[] = [
                    'id'    => $id,
                    'label' => mb_substr($label, 0, 24),
                    'color' => zp_clean_color($t['color'] ?? '', '#cfd3d8'),
                    'kind'  => $kind,
                ];
            }
            if ($clean) {
                // 规范化：基础两条必留
                $settings['line_types'] = zp_line_types(['line_types' => $clean]);
                foreach ($settings['line_types'] as $t) {
                    if ($t['kind'] === 'parent')   $settings['lines']['parent']   = $t['color'];
                    if ($t['kind'] === 'marriage') $settings['lines']['marriage'] = $t['color'];
                }
            }
        }
        if (isset($in['startup']) && is_array($in['startup'])) {
            foreach (['enabled', 'mode', 'brand1', 'brand2', 'brand3', 'org'] as $k) {
                if (isset($in['startup'][$k])) {
                    $settings['startup'][$k] = $in['startup'][$k];
                }
            }
        }
        if (isset($in['theme'])) {
            $settings['theme'] = $in['theme'];
        }
        zp_save_json(SETTINGS_FILE, $settings);
        zp_json(['ok' => true]);
        break;

    /* ============ 用户管理（管理员） ============ */
    case 'save_user':
        require_post();
        require_admin();
        $in = zp_input();
        $users = zp_load_json(USERS_FILE, []);
        $id = $in['id'] ?? '';
        $username = trim($in['username'] ?? '');
        if ($username === '') zp_json(['ok' => false, 'msg' => '用户名不能为空'], 400);
        // 重名检查（排除自身）
        foreach ($users as $u) {
            if ($u['username'] === $username && $u['id'] !== $id) {
                zp_json(['ok' => false, 'msg' => '用户名已存在'], 400);
            }
        }
        $role = ($in['role'] ?? 'member') === 'admin' ? 'admin' : 'member';
        $member_id = !empty($in['member_id']) ? $in['member_id'] : null;
        $password = $in['password'] ?? '';

        if ($id === '' || zp_member_by_id_user($users, $id) === null) {
            if (strlen($password) < 6) zp_json(['ok' => false, 'msg' => '新增用户密码至少 6 位'], 400);
            $id = zp_next_id($users, 'u');
            $users[] = [
                'id' => $id,
                'username' => $username,
                'password' => password_hash($password, PASSWORD_DEFAULT),
                'role' => $role,
                'member_id' => $member_id,
                'created' => date('Y-m-d H:i:s'),
            ];
        } else {
            foreach ($users as &$u) {
                if ($u['id'] === $id) {
                    $u['username'] = $username;
                    $u['role'] = $role;
                    $u['member_id'] = $member_id;
                    if ($password !== '') {
                        if (strlen($password) < 6) { zp_json(['ok' => false, 'msg' => '密码至少 6 位'], 400); }
                        $u['password'] = password_hash($password, PASSWORD_DEFAULT);
                    }
                    break;
                }
            }
            unset($u);
        }
        zp_save_json(USERS_FILE, $users);
        zp_json(['ok' => true, 'id' => $id]);
        break;

    case 'delete_user':
        require_post();
        require_admin();
        $in = zp_input();
        $id = $in['id'] ?? '';
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $users = zp_load_json(USERS_FILE, []);
        // 不允许删除最后一个管理员
        $admins = array_filter($users, fn($u) => ($u['role'] ?? '') === 'admin');
        if (count($admins) <= 1) {
            $target = null;
            foreach ($users as $u) { if ($u['id'] === $id) $target = $u; }
            if ($target && ($target['role'] ?? '') === 'admin') {
                zp_json(['ok' => false, 'msg' => '至少保留一个管理员'], 400);
            }
        }
        $users = array_values(array_filter($users, fn($u) => $u['id'] !== $id));
        zp_save_json(USERS_FILE, $users);
        zp_json(['ok' => true]);
        break;

    /* ============ 语录：列表 / 保存 / 删除（管理员） ============ */
    case 'list_quotes':
        require_admin();
        zp_json(['ok' => true, 'quotes' => zp_load_json(QUOTES_FILE, [])]);
        break;

    case 'save_quote':
        require_post();
        require_admin();
        $in = zp_input();
        $text = trim($in['text'] ?? '');
        if ($text === '') zp_json(['ok' => false, 'msg' => '语录内容不能为空'], 400);

        $quotes  = zp_load_json(QUOTES_FILE, []);
        $members = zp_load_json(MEMBERS_FILE, []);
        $id = trim($in['id'] ?? '');
        $isNew = ($id === '' || zp_find_row($quotes, $id) === null);

        $member_id = !empty($in['member_id']) ? $in['member_id'] : null;
        if ($member_id && !zp_member_by_id($members, $member_id)) $member_id = null;

        $row = [
            'member_id' => $member_id,
            'speaker'   => trim($in['speaker'] ?? ''),
            'relation'  => trim($in['relation'] ?? ''),
            'text'      => $text,
            'context'   => trim($in['context'] ?? ''),
            'year'      => trim($in['year'] ?? ''),
        ];

        if ($isNew) {
            $row = ['id' => zp_next_id($quotes, 'q')] + $row;
            $row['created'] = date('Y-m-d H:i:s');
            $quotes[] = $row;
        } else {
            $row = ['id' => $id] + $row;
            foreach ($quotes as &$q) {
                if ($q['id'] === $id) {
                    $row['created'] = $q['created'] ?? date('Y-m-d H:i:s');
                    $q = $row;
                    break;
                }
            }
            unset($q);
        }
        zp_save_json(QUOTES_FILE, $quotes);
        zp_json(['ok' => true, 'id' => $row['id']]);
        break;

    case 'delete_quote':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim($in['id'] ?? '');
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $quotes = array_values(array_filter(zp_load_json(QUOTES_FILE, []), fn($q) => ($q['id'] ?? '') !== $id));
        zp_save_json(QUOTES_FILE, $quotes);
        zp_json(['ok' => true]);
        break;

    /* ============ 家族历史：列表 / 保存 / 删除（管理员） ============ */
    case 'list_events':
        require_admin();
        // 与前台一致：最新的排在最上面
        zp_json(['ok' => true, 'events' => zp_sort_by_date(zp_load_json(EVENTS_FILE, []), 'date', true)]);
        break;

    case 'save_event':
        require_post();
        require_admin();
        $in = zp_input();
        $title = trim($in['title'] ?? '');
        if ($title === '') zp_json(['ok' => false, 'msg' => '事件标题不能为空'], 400);

        $events  = zp_load_json(EVENTS_FILE, []);
        $members = zp_load_json(MEMBERS_FILE, []);
        $id = trim($in['id'] ?? '');
        $isNew = ($id === '' || zp_find_row($events, $id) === null);

        $ids = [];
        if (isset($in['member_ids']) && is_array($in['member_ids'])) {
            foreach ($in['member_ids'] as $mid) {
                if ($mid !== '' && zp_member_by_id($members, $mid) && !in_array($mid, $ids, true)) $ids[] = $mid;
            }
        }

        $row = [
            'date'       => trim($in['date'] ?? ''),
            'title'      => $title,
            'text'       => trim($in['text'] ?? ''),
            'category'   => trim($in['category'] ?? ''),
            'member_ids' => $ids,
        ];

        if ($isNew) {
            $row = ['id' => zp_next_id($events, 'e')] + $row;
            $row['created'] = date('Y-m-d H:i:s');
            $events[] = $row;
        } else {
            $row = ['id' => $id] + $row;
            foreach ($events as &$ev) {
                if ($ev['id'] === $id) {
                    $row['created'] = $ev['created'] ?? date('Y-m-d H:i:s');
                    $ev = $row;
                    break;
                }
            }
            unset($ev);
        }
        zp_save_json(EVENTS_FILE, $events);
        zp_json(['ok' => true, 'id' => $row['id']]);
        break;

    case 'delete_event':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim($in['id'] ?? '');
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $events = array_values(array_filter(zp_load_json(EVENTS_FILE, []), fn($e) => ($e['id'] ?? '') !== $id));
        zp_save_json(EVENTS_FILE, $events);
        zp_json(['ok' => true]);
        break;

    /* ============ 家族相册：列表 / 保存 / 删除（管理员） ============ */
    case 'list_photos':
        require_admin();
        zp_json(['ok' => true, 'photos' => zp_load_json(PHOTOS_FILE, [])]);
        break;

    case 'save_photo':
        require_post();
        require_admin();
        $in = zp_input();
        $url = zp_clean_url($in['url'] ?? '');
        if ($url === '') zp_json(['ok' => false, 'msg' => '请填写有效的图片链接（http/https 开头）'], 400);

        $photos  = zp_load_json(PHOTOS_FILE, []);
        $members = zp_load_json(MEMBERS_FILE, []);
        $id = trim($in['id'] ?? '');
        $isNew = ($id === '' || zp_find_row($photos, $id) === null);

        $ids = [];
        if (isset($in['member_ids']) && is_array($in['member_ids'])) {
            foreach ($in['member_ids'] as $mid) {
                if ($mid !== '' && zp_member_by_id($members, $mid) && !in_array($mid, $ids, true)) $ids[] = $mid;
            }
        }

        $row = [
            'url'        => $url,
            'title'      => trim($in['title'] ?? ''),
            'date'       => trim($in['date'] ?? ''),
            'place'      => trim($in['place'] ?? ''),
            'note'       => trim($in['note'] ?? ''),
            'member_ids' => $ids,
        ];

        if ($isNew) {
            $row = ['id' => zp_next_id($photos, 'p')] + $row;
            $row['created'] = date('Y-m-d H:i:s');
            $photos[] = $row;
        } else {
            $row = ['id' => $id] + $row;
            foreach ($photos as &$ph) {
                if ($ph['id'] === $id) {
                    $row['created'] = $ph['created'] ?? date('Y-m-d H:i:s');
                    $ph = $row;
                    break;
                }
            }
            unset($ph);
        }
        zp_save_json(PHOTOS_FILE, $photos);
        zp_json(['ok' => true, 'id' => $row['id']]);
        break;

    case 'delete_photo':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim($in['id'] ?? '');
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $photos = array_values(array_filter(zp_load_json(PHOTOS_FILE, []), fn($p) => ($p['id'] ?? '') !== $id));
        zp_save_json(PHOTOS_FILE, $photos);
        zp_json(['ok' => true]);
        break;

    /* ============ 续谱收集表：外部提交 / 管理员审核 ============ */
    case 'submit_change':
        require_post();
        $in = zp_input();
        // 蜜罐：正常用户看不见这个字段，填了基本都是机器人
        if (trim((string) ($in['website'] ?? '')) !== '') {
            zp_json(['ok' => true, 'msg' => '已提交，等待管理员审核']);
        }
        $r = zp_sub_add($in);
        zp_json($r, $r['ok'] ? 200 : 400);
        break;

    case 'list_submissions':
        require_admin();
        $rows = zp_subs_load();
        usort($rows, fn($a, $b) => strcmp((string) ($b['submitted'] ?? ''), (string) ($a['submitted'] ?? '')));
        zp_json(['ok' => true, 'submissions' => $rows, 'pending' => zp_subs_pending_count($rows)]);
        break;

    case 'review_submission':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim((string) ($in['id'] ?? ''));
        $act = (string) ($in['action'] ?? '');
        $note = trim((string) ($in['note'] ?? ''));
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少申请编号'], 400);
        if ($act === 'approve') {
            $r = zp_sub_approve($id, $cur['username'] ?? 'admin', $note);
        } elseif ($act === 'reject') {
            $r = zp_sub_reject($id, $cur['username'] ?? 'admin', $note);
        } else {
            $r = ['ok' => false, 'msg' => '未知操作'];
        }
        zp_json($r, $r['ok'] ? 200 : 400);
        break;

    /* ============ 土地：列表 / 保存 / 删除（管理员） ============ */
    case 'list_lands':
        require_admin();
        $lands = zp_load_json(LANDS_FILE, []);
        foreach ($lands as &$ld) {
            if (!empty($ld['history']) && is_array($ld['history'])) {
                $ld['history'] = zp_sort_by_date($ld['history'], 'date', true);
            }
        }
        unset($ld);
        zp_json(['ok' => true, 'lands' => $lands]);
        break;

    case 'save_land':
        require_post();
        require_admin();
        $in = zp_input();
        $name = trim($in['name'] ?? '');
        if ($name === '') zp_json(['ok' => false, 'msg' => '地块名称不能为空'], 400);

        $lands   = zp_load_json(LANDS_FILE, []);
        $members = zp_load_json(MEMBERS_FILE, []);
        $id = trim($in['id'] ?? '');
        $isNew = ($id === '' || zp_find_row($lands, $id) === null);

        // 流转历史：只留有内容的分支，重新编号
        $hist = [];
        $hi = 0;
        foreach ((array) ($in['history'] ?? []) as $h) {
            if (!is_array($h)) continue;
            $date = trim((string) ($h['date'] ?? ''));
            $event = trim((string) ($h['event'] ?? ''));
            $note = trim((string) ($h['note'] ?? ''));
            $to = zp_member_ids($h['to_ids'] ?? [], $members);
            if ($date === '' && $event === '' && $note === '' && !$to) continue;
            $hist[] = ['id' => 'h' . (++$hi), 'date' => $date, 'event' => $event, 'to_ids' => $to, 'note' => $note];
        }
        // 存的时候就按时间倒序（最近一次变更在最前），前台/后台读出来顺序一致
        $hist = zp_sort_by_date($hist, 'date', true);

        $status = trim((string) ($in['status'] ?? '在册'));
        if (!in_array($status, zp_land_status(), true)) $status = '在册';

        $row = [
            'name'      => $name,
            'area'      => trim((string) ($in['area'] ?? '')),
            'unit'      => (trim((string) ($in['unit'] ?? '')) ?: '亩'),
            'location'  => trim((string) ($in['location'] ?? '')),
            'lat'       => zp_coord($in['lat'] ?? null, -90, 90),
            'lng'       => zp_coord($in['lng'] ?? null, -180, 180),
            'owner_ids' => zp_member_ids($in['owner_ids'] ?? [], $members),
            'status'    => $status,
            'note'      => trim((string) ($in['note'] ?? '')),
            'photos'    => zp_clean_photos($in['photos'] ?? []),
            'history'   => $hist,
        ];

        if ($isNew) {
            $row = ['id' => zp_next_id($lands, 'ld')] + $row;
            $row['created'] = date('Y-m-d H:i:s');
            $lands[] = $row;
        } else {
            $row = ['id' => $id] + $row;
            foreach ($lands as &$ld) {
                if ($ld['id'] === $id) {
                    $row['created'] = $ld['created'] ?? date('Y-m-d H:i:s');
                    $ld = $row;
                    break;
                }
            }
            unset($ld);
        }
        zp_save_json(LANDS_FILE, $lands);
        zp_json(['ok' => true, 'id' => $row['id']]);
        break;

    case 'delete_land':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim($in['id'] ?? '');
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $lands = array_values(array_filter(zp_load_json(LANDS_FILE, []), fn($x) => ($x['id'] ?? '') !== $id));
        zp_save_json(LANDS_FILE, $lands);
        zp_json(['ok' => true]);
        break;

    /* ============ 坟墓：列表 / 保存 / 删除（管理员） ============ */
    case 'list_graves':
        require_admin();
        zp_json(['ok' => true, 'graves' => zp_load_json(GRAVES_FILE, [])]);
        break;

    case 'save_grave':
        require_post();
        require_admin();
        $in = zp_input();
        $members = zp_load_json(MEMBERS_FILE, []);
        $mid = zp_member_ids($in['member_ids'] ?? [], $members);
        $name = trim($in['name'] ?? '');
        if ($name === '' && $mid) {
            foreach ($members as $m) { if ($m['id'] === $mid[0]) { $name = $m['name'] . '墓'; break; } }
        }
        if ($name === '') zp_json(['ok' => false, 'msg' => '请填写墓名，或选择安葬的家人'], 400);

        $graves = zp_load_json(GRAVES_FILE, []);
        $id = trim($in['id'] ?? '');
        $isNew = ($id === '' || zp_find_row($graves, $id) === null);

        $type = trim((string) ($in['type'] ?? '土坟'));
        if (!in_array($type, zp_grave_types(), true)) $type = '土坟';

        $row = [
            'name'       => $name,
            'member_ids' => $mid,
            'place'      => trim((string) ($in['place'] ?? '')),
            'address'    => trim((string) ($in['address'] ?? '')),
            'lat'        => zp_coord($in['lat'] ?? null, -90, 90),
            'lng'        => zp_coord($in['lng'] ?? null, -180, 180),
            'facing'     => trim((string) ($in['facing'] ?? '')),
            'type'       => $type,
            'date'       => trim((string) ($in['date'] ?? '')),
            'visited'    => trim((string) ($in['visited'] ?? '')),
            'note'       => trim((string) ($in['note'] ?? '')),
            'photos'     => zp_clean_photos($in['photos'] ?? []),
        ];

        if ($isNew) {
            $row = ['id' => zp_next_id($graves, 'gv')] + $row;
            $row['created'] = date('Y-m-d H:i:s');
            $graves[] = $row;
        } else {
            $row = ['id' => $id] + $row;
            foreach ($graves as &$gv) {
                if ($gv['id'] === $id) {
                    $row['created'] = $gv['created'] ?? date('Y-m-d H:i:s');
                    $gv = $row;
                    break;
                }
            }
            unset($gv);
        }
        zp_save_json(GRAVES_FILE, $graves);
        zp_json(['ok' => true, 'id' => $row['id']]);
        break;

    case 'delete_grave':
        require_post();
        require_admin();
        $in = zp_input();
        $id = trim($in['id'] ?? '');
        if ($id === '') zp_json(['ok' => false, 'msg' => '缺少 id'], 400);
        $graves = array_values(array_filter(zp_load_json(GRAVES_FILE, []), fn($x) => ($x['id'] ?? '') !== $id));
        zp_save_json(GRAVES_FILE, $graves);
        zp_json(['ok' => true]);
        break;

    /* ============ 本地上传图片（管理员，仅图片） ============ */
    case 'upload_image':
        require_post();
        require_admin();
        $f = $_FILES['file'] ?? null;
        if (!$f || (int) ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            zp_json(['ok' => false, 'msg' => '没有收到文件，或上传中断'], 400);
        }
        if ((int) $f['size'] > UPLOAD_MAX_BYTES) {
            zp_json(['ok' => false, 'msg' => '图片超过 ' . round(UPLOAD_MAX_BYTES / 1048576) . 'MB，请压缩后再传'], 400);
        }
        $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/avif' => 'avif'];
        $mime = '';
        if (class_exists('finfo')) {
            $fi = new finfo(FILEINFO_MIME_TYPE);
            $mime = (string) $fi->file($f['tmp_name']);
        }
        if (!isset($map[$mime])) {
            // finfo 不可用时退回扩展名判断
            $ext = strtolower(pathinfo((string) ($f['name'] ?? ''), PATHINFO_EXTENSION));
            $byExt = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'avif' => 'image/avif'];
            if (isset($byExt[$ext])) { $mime = $byExt[$ext]; }
        }
        if (!isset($map[$mime])) zp_json(['ok' => false, 'msg' => '只支持 jpg / png / webp / gif / avif'], 400);

        $sub = date('Ym');
        $dir = UPLOAD_DIR . '/' . $sub;
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            zp_json(['ok' => false, 'msg' => '上传目录不可写（uploads/）'], 500);
        }
        $fname = date('d') . '-' . bin2hex(random_bytes(8)) . '.' . $map[$mime];
        if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $fname)) {
            zp_json(['ok' => false, 'msg' => '保存失败，请检查 uploads/ 权限'], 500);
        }
        @chmod($dir . '/' . $fname, 0644);
        zp_json(['ok' => true, 'url' => 'uploads/' . $sub . '/' . $fname]);
        break;

    /* ============ 画布编辑器：整体保存树（含位置与关系） ============ */
    case 'save_tree':
        require_post();
        require_admin();
        $in = zp_input();
        $incoming = isset($in['members']) && is_array($in['members']) ? $in['members'] : [];
        $byId = [];
        foreach ($incoming as $m) {
            if (empty($m['id']) || empty($m['name'])) {
                zp_json(['ok' => false, 'msg' => '存在缺少 id 或姓名的成员'], 400);
            }
            $byId[$m['id']] = $m;
        }
        // 防环：父/母不能是自己或自己的后代
        foreach ($incoming as $m) {
            foreach (['father_id', 'mother_id'] as $pk) {
                $pid = $m[$pk] ?? null;
                if ($pid && ($pid === $m['id'] || zp_is_ancestor($incoming, $m['id'], $pid))) {
                    zp_json(['ok' => false, 'msg' => '存在循环亲属关系（' . ($m['name'] ?? $m['id']) . '）'], 400);
                }
            }
        }
        // 配偶关系互惠（仅保留互相指向的）
        foreach ($incoming as &$m) {
            $m['spouse_ids'] = isset($m['spouse_ids']) && is_array($m['spouse_ids'])
                ? array_values(array_unique(array_filter($m['spouse_ids'], fn($x) => $x !== '' && isset($byId[$x]))))
                : [];
        }
        unset($m);
        foreach ($incoming as $m) {
            foreach ($m['spouse_ids'] as $sid) {
                $sp2 = $byId[$sid]['spouse_ids'] ?? [];
                if (!in_array($m['id'], $sp2, true)) { $byId[$sid]['spouse_ids'][] = $m['id']; }
            }
        }
        // 规整字段并保留坐标 pos（无坐标时不写，保持数据干净）
        $out = [];
        foreach ($incoming as $m) {
            $row = [
                'id'         => $m['id'],
                'name'       => $m['name'],
                'zi_bei'     => trim($m['zi_bei'] ?? ''),
                'gender'     => ($m['gender'] ?? 'male') === 'female' ? 'female' : 'male',
                'birth'      => trim($m['birth'] ?? ''),
                'death'      => trim($m['death'] ?? '') ?: null,
                'bio'        => trim($m['bio'] ?? ''),
                'avatar'     => zp_clean_url($m['avatar'] ?? ''),
                'link_type'  => preg_replace('/[^\w\-]/', '', (string) ($m['link_type'] ?? '')),
                'father_id'  => (!empty($m['father_id']) && isset($byId[$m['father_id']])) ? $m['father_id'] : null,
                'mother_id'  => (!empty($m['mother_id']) && isset($byId[$m['mother_id']])) ? $m['mother_id'] : null,
                'spouse_ids' => $m['spouse_ids'],
                'order'      => (int) ($m['order'] ?? 1),
            ];
            if (isset($m['pos']) && is_array($m['pos']) && is_numeric($m['pos']['x'] ?? null) && is_numeric($m['pos']['y'] ?? null)) {
                $row['pos'] = ['x' => (float) $m['pos']['x'], 'y' => (float) $m['pos']['y']];
            }
            $out[] = $row;
        }
        zp_save_json(MEMBERS_FILE, $out);

        // 连线样式（颜色 / 箭头）+ 自定义线 + 排列方式（编辑器与前台共用）
        $settings = zp_load_json(SETTINGS_FILE, zp_default_settings());

        // 老字段 edge_arrows：仍然收，兼容老版本编辑器
        if (isset($in['arrows']) && is_array($in['arrows'])) {
            $clean = [];
            foreach ($in['arrows'] as $k => $v) {
                if (!is_string($k)) continue;
                if (!preg_match('/^(parent|marriage):[\w\-|>]+$/', $k)) continue;
                if (!in_array($v, ['to', 'back'], true)) continue;
                $clean[$k] = $v;
            }
            $settings['edge_arrows'] = $clean ?: new stdClass();
        }

        // 新字段 edge_styles：{ 'parent:m1>m2': {c:'#e5484d', a:'to'} }
        if (isset($in['styles']) && is_array($in['styles'])) {
            $styles = [];
            foreach ($in['styles'] as $k => $v) {
                if (!is_string($k) || !is_array($v)) continue;
                if (!preg_match('/^(parent|marriage|free):[\w\-|>]+$/', $k)) continue;
                $row = [];
                $c = strtolower(trim((string) ($v['c'] ?? '')));
                if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/', $c)) $row['c'] = $c;
                $a = (string) ($v['a'] ?? '');
                if (in_array($a, ['to', 'back'], true)) $row['a'] = $a;
                if ($row) $styles[$k] = $row;
            }
            $settings['edge_styles'] = $styles ?: new stdClass();
        }

        // 自定义线：只画线，不写入亲属关系
        if (isset($in['free_edges']) && is_array($in['free_edges'])) {
            $frees = [];
            $seen = [];
            foreach ($in['free_edges'] as $f) {
                if (!is_array($f)) continue;
                $fid = preg_replace('/[^\w\-]/', '', (string) ($f['id'] ?? ''));
                $a = (string) ($f['from'] ?? '');
                $b = (string) ($f['to'] ?? '');
                if ($fid === '' || $a === '' || $b === '' || $a === $b) continue;
                if (!isset($byId[$a]) || !isset($byId[$b])) continue;
                if (isset($seen[$fid])) continue;
                $seen[$fid] = true;
                $frees[] = [
                    'id'    => $fid,
                    'from'  => $a,
                    'to'    => $b,
                    'label' => mb_substr(trim((string) ($f['label'] ?? '')), 0, 20),
                ];
            }
            $settings['free_edges'] = $frees;
        }

        if (isset($in['layout']) && in_array($in['layout'], ['horizontal', 'vertical'], true)) {
            $settings['layout'] = $in['layout'];
        }
        if (isset($in['layout_mode']) && in_array($in['layout_mode'], ['auto', 'custom'], true)) {
            $settings['layout_mode'] = $in['layout_mode'];
        }
        zp_save_json(SETTINGS_FILE, $settings);
        zp_json(['ok' => true]);
        break;

    default:
        zp_json(['ok' => false, 'msg' => '未知操作'], 404);
}

function zp_member_by_id_user($users, $id) {
    foreach ($users as $u) {
        if ($u['id'] === $id) return $u;
    }
    return null;
}
