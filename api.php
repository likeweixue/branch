<?php
/**
 * 统一 API 入口。前端通过 fetch 调用，返回 JSON。
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';

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
        $order = (int) ($in['order'] ?? 1);

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
        if (isset($in['layout']) && in_array($in['layout'], ['horizontal', 'vertical'], true)) {
            $settings['layout'] = $in['layout'];
        }
        if (isset($in['lines']) && is_array($in['lines'])) {
            foreach (['parent', 'marriage', 'self'] as $k) {
                if (isset($in['lines'][$k])) {
                    $settings['lines'][$k] = $in['lines'][$k];
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
        // 规整字段并保留坐标 pos
        $out = [];
        foreach ($incoming as $m) {
            $out[] = [
                'id'         => $m['id'],
                'name'       => $m['name'],
                'zi_bei'     => trim($m['zi_bei'] ?? ''),
                'gender'     => ($m['gender'] ?? 'male') === 'female' ? 'female' : 'male',
                'birth'      => trim($m['birth'] ?? ''),
                'death'      => trim($m['death'] ?? '') ?: null,
                'bio'        => trim($m['bio'] ?? ''),
                'father_id'  => (!empty($m['father_id']) && isset($byId[$m['father_id']])) ? $m['father_id'] : null,
                'mother_id'  => (!empty($m['mother_id']) && isset($byId[$m['mother_id']])) ? $m['mother_id'] : null,
                'spouse_ids' => $m['spouse_ids'],
                'order'      => (int) ($m['order'] ?? 1),
                'pos'        => (isset($m['pos']) && is_array($m['pos']) && is_numeric($m['pos']['x'] ?? null) && is_numeric($m['pos']['y'] ?? null))
                    ? ['x' => (float) $m['pos']['x'], 'y' => (float) $m['pos']['y']]
                    : null,
            ];
        }
        zp_save_json(MEMBERS_FILE, $out);
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
