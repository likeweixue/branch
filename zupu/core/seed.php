<?php
/**
 * 首次运行初始化：写入示例家族、管理员账号、默认设置。
 * 仅当对应文件为空时才写入，不会覆盖已有数据。
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

function zp_ensure_seed() {
    // ---- 成员（示例家族：张氏，字辈 仁德朝众大从先正子文国安常孟学永远照光明）----
    if (!file_exists(MEMBERS_FILE) || count(zp_load_json(MEMBERS_FILE, [])) === 0) {
        $members = [
            ['id'=>'m1','name'=>'张安邦','zi_bei'=>'安','gender'=>'male','birth'=>'1935-03-12','death'=>null,'bio'=>'张氏本支最高辈，勤俭持家。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m2'],'order'=>1],
            ['id'=>'m2','name'=>'李秀兰','zi_bei'=>'','gender'=>'female','birth'=>'1938-07-20','death'=>null,'bio'=>'安邦之妻，李姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m1'],'order'=>1],
            ['id'=>'m3','name'=>'张常贵','zi_bei'=>'常','gender'=>'male','birth'=>'1960-11-02','death'=>null,'bio'=>'长子。','father_id'=>'m1','mother_id'=>'m2','spouse_ids'=>['m4'],'order'=>1],
            ['id'=>'m4','name'=>'王美华','zi_bei'=>'','gender'=>'female','birth'=>'1962-05-18','death'=>null,'bio'=>'常贵之妻，王姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m3'],'order'=>1],
            ['id'=>'m5','name'=>'张常富','zi_bei'=>'常','gender'=>'male','birth'=>'1963-09-09','death'=>null,'bio'=>'次子。','father_id'=>'m1','mother_id'=>'m2','spouse_ids'=>['m6'],'order'=>2],
            ['id'=>'m6','name'=>'赵丽','zi_bei'=>'','gender'=>'female','birth'=>'1965-01-25','death'=>null,'bio'=>'常富之妻，赵姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m5'],'order'=>1],
            ['id'=>'m7','name'=>'张学强','zi_bei'=>'学','gender'=>'male','birth'=>'1985-04-15','death'=>null,'bio'=>'常贵长子。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m8'],'order'=>1],
            ['id'=>'m8','name'=>'刘芳','zi_bei'=>'','gender'=>'female','birth'=>'1986-12-03','death'=>null,'bio'=>'学强之妻，刘姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m7'],'order'=>1],
            ['id'=>'m9','name'=>'张永杰','zi_bei'=>'永','gender'=>'male','birth'=>'2012-08-08','death'=>null,'bio'=>'学强长子。','father_id'=>'m7','mother_id'=>'m8','spouse_ids'=>['m10'],'order'=>1],
            ['id'=>'m10','name'=>'周敏','zi_bei'=>'','gender'=>'female','birth'=>'2014-02-14','death'=>null,'bio'=>'永杰之妻，周姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m9'],'order'=>1],
            ['id'=>'m11','name'=>'张学丽','zi_bei'=>'学','gender'=>'female','birth'=>'1988-06-21','death'=>null,'bio'=>'常贵长女。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m12'],'order'=>2],
            ['id'=>'m12','name'=>'陈强','zi_bei'=>'','gender'=>'male','birth'=>'1987-10-30','death'=>null,'bio'=>'学丽之夫，陈姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m11'],'order'=>1],
            ['id'=>'m13','name'=>'张永华','zi_bei'=>'永','gender'=>'male','birth'=>'2010-05-01','death'=>null,'bio'=>'学强次子，本系统示例中的“我”。','father_id'=>'m7','mother_id'=>'m8','spouse_ids'=>[],'order'=>2],
            ['id'=>'m14','name'=>'张学军','zi_bei'=>'学','gender'=>'male','birth'=>'1989-03-03','death'=>null,'bio'=>'常富长子。','father_id'=>'m5','mother_id'=>'m6','spouse_ids'=>['m15'],'order'=>1],
            ['id'=>'m15','name'=>'孙倩','zi_bei'=>'','gender'=>'female','birth'=>'1990-07-07','death'=>null,'bio'=>'学军之妻，孙姓。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m14'],'order'=>1],
            ['id'=>'m16','name'=>'张远涛','zi_bei'=>'远','gender'=>'male','birth'=>'2040-01-01','death'=>null,'bio'=>'永杰之子（示例晚辈）。','father_id'=>'m9','mother_id'=>'m10','spouse_ids'=>[],'order'=>1],
            ['id'=>'m17','name'=>'张永胜','zi_bei'=>'永','gender'=>'male','birth'=>'2015-09-09','death'=>null,'bio'=>'学军之子。','father_id'=>'m14','mother_id'=>'m15','spouse_ids'=>[],'order'=>1],
        ];
        zp_save_json(MEMBERS_FILE, $members);
    }

    // ---- 账号 ----
    if (!file_exists(USERS_FILE) || count(zp_load_json(USERS_FILE, [])) === 0) {
        $users = [
            [
                'id' => 'u1',
                'username' => 'admin',
                'password' => password_hash('admin123', PASSWORD_DEFAULT),
                'role' => 'admin',
                'member_id' => 'm13',
                'created' => date('Y-m-d H:i:s'),
            ],
            [
                'id' => 'u2',
                'username' => 'zhang',
                'password' => password_hash('123456', PASSWORD_DEFAULT),
                'role' => 'member',
                'member_id' => 'm13',
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
