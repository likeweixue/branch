<?php
/**
 * 首次运行初始化：写入默认家族、管理员账号、默认设置。
 * 仅当对应文件为空时才写入，不会覆盖已有数据。
 *
 * 默认家族：麻/刘 两支 —— 父系麻家（麻林彪）、母系刘家（刘小雨），
 * 本人刘永生（「永」字辈）、姐姐刘雪，以及母亲的三位姐妹（大/三/五姨妈）。
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

/** 默认家族成员（与仓库内 data/members.json 保持一致） */
function zp_seed_members() {
    return [
        // 第一代：父系祖父母
        ['id'=>'m1','name'=>'麻家爷爷','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'父系祖父，姓名待补充。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m2'],'order'=>1],
        ['id'=>'m2','name'=>'麻家奶奶','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'父系祖母，姓名待补充。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m1'],'order'=>1],
        // 第一代：母系外祖父母
        ['id'=>'m3','name'=>'刘家外公','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'母系外祖父，姓名待补充。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m4'],'order'=>1],
        ['id'=>'m4','name'=>'刘家外婆','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'母系外祖母，姓名待补充。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m3'],'order'=>1],
        // 第二代：父母
        ['id'=>'m5','name'=>'麻林彪','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'父亲。','father_id'=>'m1','mother_id'=>'m2','spouse_ids'=>['m6'],'order'=>1],
        ['id'=>'m6','name'=>'刘小雨','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'母亲，刘家次女。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m5'],'order'=>2],
        // 第二代：母亲的姐妹（姨妈）及其配偶
        ['id'=>'m7','name'=>'大姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'母亲的大姐。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m8'],'order'=>1],
        ['id'=>'m8','name'=>'大姨父','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'大姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m7'],'order'=>1],
        ['id'=>'m9','name'=>'三姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'母亲的三姐。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m10'],'order'=>3],
        ['id'=>'m10','name'=>'三姨父','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'三姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m9'],'order'=>1],
        ['id'=>'m11','name'=>'五姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'母亲的五妹。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m12'],'order'=>4],
        ['id'=>'m12','name'=>'五姨父','zi_bei'=>'','gender'=>'male','birth'=>'','death'=>null,'bio'=>'五姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m11'],'order'=>1],
        // 第三代：本人与姐姐
        ['id'=>'m13','name'=>'刘雪','zi_bei'=>'','gender'=>'female','birth'=>'','death'=>null,'bio'=>'姐姐。','father_id'=>'m5','mother_id'=>'m6','spouse_ids'=>[],'order'=>1],
        ['id'=>'m14','name'=>'刘永生','zi_bei'=>'永','gender'=>'male','birth'=>'','death'=>null,'bio'=>'本人，本系统的“我”。','father_id'=>'m5','mother_id'=>'m6','spouse_ids'=>[],'order'=>2],
    ];
}

/** 默认语录（标注「示例」的条目请在后台替换为真实回忆） */
function zp_seed_quotes() {
    $now = date('Y-m-d H:i:s');
    return [
        ['id'=>'q1','member_id'=>'m1','speaker'=>'','relation'=>'祖父','text'=>'家和万事兴，勤俭能持家。做人先立品，做事要有始有终。','context'=>'示例 · 年节家宴上的嘱托','year'=>'','created'=>$now],
        ['id'=>'q2','member_id'=>'m3','speaker'=>'','relation'=>'外祖父','text'=>'读书明理，行路识人。吃一点亏不算坏事，心要放宽。','context'=>'示例 · 待替换为真实语录','year'=>'','created'=>$now],
        ['id'=>'q3','member_id'=>'m5','speaker'=>'','relation'=>'父亲','text'=>'自己的路自己走，但家里永远给你留着门。','context'=>'示例 · 待替换为真实语录','year'=>'','created'=>$now],
    ];
}

/** 默认家族历史（第一条是真实事件，其余为「示例」条目，可在后台删除） */
function zp_seed_events() {
    $now = date('Y-m-d H:i:s');
    return [
        ['id'=>'e1','date'=>'2026','title'=>'家族电子谱建立','text'=>'启用宗谱系统（ZUPÚ），把族谱、长辈语录与家族历史第一次完整整理到线上。','category'=>'家谱','member_ids'=>[],'created'=>$now],
        ['id'=>'e2','date'=>'','title'=>'示例：祖辈成家','text'=>'把祖辈成家的年份、地点与经过记在这里。（示例条目，可在后台修改或删除）','category'=>'婚嫁','member_ids'=>['m1','m2'],'created'=>$now],
        ['id'=>'e3','date'=>'','title'=>'示例：父辈外出求学 / 工作','text'=>'记录父辈离开家乡、求学或工作的那一段经历。（示例条目，可在后台修改或删除）','category'=>'求学','member_ids'=>['m5'],'created'=>$now],
    ];
}

function zp_ensure_seed() {
    // ---- 成员 ----
    if (!file_exists(MEMBERS_FILE) || count(zp_load_json(MEMBERS_FILE, [])) === 0) {
        zp_save_json(MEMBERS_FILE, zp_seed_members());
    }

    // ---- 语录 ----
    if (!file_exists(QUOTES_FILE)) {
        zp_save_json(QUOTES_FILE, zp_seed_quotes());
    }

    // ---- 家族历史 ----
    if (!file_exists(EVENTS_FILE)) {
        zp_save_json(EVENTS_FILE, zp_seed_events());
    }

    // ---- 账号（默认绑定本人 m14 刘永生）----
    if (!file_exists(USERS_FILE) || count(zp_load_json(USERS_FILE, [])) === 0) {
        $users = [
            [
                'id' => 'u1',
                'username' => 'admin',
                'password' => password_hash('admin123', PASSWORD_DEFAULT),
                'role' => 'admin',
                'member_id' => 'm14',
                'created' => date('Y-m-d H:i:s'),
            ],
            [
                'id' => 'u2',
                'username' => 'zhang',
                'password' => password_hash('123456', PASSWORD_DEFAULT),
                'role' => 'member',
                'member_id' => 'm14',
                'created' => date('Y-m-d H:i:s'),
            ],
        ];
        zp_save_json(USERS_FILE, $users);
    }

    // ---- 设置 ----
    if (!file_exists(SETTINGS_FILE) || count(zp_load_json(SETTINGS_FILE, [])) === 0) {
        zp_save_json(SETTINGS_FILE, zp_default_settings());
    }
}
