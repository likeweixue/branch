<?php
/**
 * 鉴权：基于 PHP 会话的登录 / 注册 / 权限。
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

function zp_session_start() {
    if (session_status() === PHP_SESSION_NONE) {
        $params = session_get_cookie_params();
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'domain'   => $params['domain'],
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        @session_start();
    }
}

function zp_current_user() {
    zp_session_start();
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $users = zp_load_json(USERS_FILE, []);
    foreach ($users as $u) {
        if ($u['id'] === $_SESSION['uid']) {
            return $u;
        }
    }
    return null;
}

function zp_is_admin() {
    $u = zp_current_user();
    return $u && !empty($u['role']) && $u['role'] === 'admin';
}

function zp_login($username, $password) {
    $users = zp_load_json(USERS_FILE, []);
    foreach ($users as $u) {
        if ($u['username'] === $username && isset($u['password']) && password_verify($password, $u['password'])) {
            zp_session_start();
            $_SESSION['uid'] = $u['id'];
            return $u;
        }
    }
    return false;
}

function zp_logout() {
    zp_session_start();
    $_SESSION = [];
    if (session_id()) {
        @session_destroy();
    }
}

/** 注册新账号（默认普通成员，可由管理员指定角色/绑定成员） */
function zp_register($username, $password, $role = 'member', $memberId = null) {
    $username = trim($username);
    if ($username === '' || strlen($password) < 6) {
        return ['ok' => false, 'msg' => '用户名不能为空，密码至少 6 位'];
    }
    $users = zp_load_json(USERS_FILE, []);
    foreach ($users as $u) {
        if ($u['username'] === $username) {
            return ['ok' => false, 'msg' => '用户名已存在'];
        }
    }
    $id = zp_next_id($users, 'u');
    $users[] = [
        'id'        => $id,
        'username'  => $username,
        'password'  => password_hash($password, PASSWORD_DEFAULT),
        'role'      => $role === 'admin' ? 'admin' : 'member',
        'member_id' => $memberId,
        'created'   => date('Y-m-d H:i:s'),
    ];
    if (!zp_save_json(USERS_FILE, $users)) {
        return ['ok' => false, 'msg' => '写入失败'];
    }
    return ['ok' => true, 'id' => $id];
}
