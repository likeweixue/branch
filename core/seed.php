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
        // 第一代：母系外祖父母（父系麻家从母亲这一辈起才并入谱，祖辈不单列）
        ['id'=>'m3','name'=>'刘祖德','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'外公。刘小雨与大姨妈、三姨妈、五姨妈之父。','father_id'=>'m28','mother_id'=>null,'spouse_ids'=>['m4'],'order'=>1],
        ['id'=>'m4','name'=>'刘家外婆','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'外婆，姓名待补。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m3'],'order'=>1],
        // 第二代：父母
        ['id'=>'m5','name'=>'麻林彪','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'父亲。母系一支从母亲这一辈起入谱，父系祖辈不再单列。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m6'],'order'=>1],
        ['id'=>'m6','name'=>'刘小雨','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'母亲，刘家次女。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m5'],'order'=>2],
        // 第二代：母亲的姐妹（姨妈）及其配偶
        ['id'=>'m7','name'=>'大姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'母亲的大姐。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m8'],'order'=>1],
        ['id'=>'m8','name'=>'大姨父','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'大姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m7'],'order'=>1],
        ['id'=>'m9','name'=>'三姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'母亲的三姐。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m10'],'order'=>3],
        ['id'=>'m10','name'=>'三姨父','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'三姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m9'],'order'=>1],
        ['id'=>'m11','name'=>'五姨妈','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'母亲的五妹。','father_id'=>'m3','mother_id'=>'m4','spouse_ids'=>['m12'],'order'=>4],
        ['id'=>'m12','name'=>'五姨父','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'五姨妈的丈夫。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>['m11'],'order'=>1],
        // 第三代：本人与姐姐
        ['id'=>'m13','name'=>'刘雪','zi_bei'=>'','gender'=>'female','birth'=>'','avatar'=>'','death'=>null,'bio'=>'姐姐。','father_id'=>'m5','mother_id'=>'m6','spouse_ids'=>[],'order'=>1],
        ['id'=>'m14','name'=>'刘永生','zi_bei'=>'永','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'本人，本系统的“我”。','father_id'=>'m5','mother_id'=>'m6','spouse_ids'=>[],'order'=>2],
        // 刘氏世系（据手抄族谱补录，最长一支九代）
        ['id'=>'m15','name'=>'刘子隆','zi_bei'=>'子','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'手抄族谱载：『九代祖坟墓　弄袍坳坟　刘子隆』。子字辈，本支开山祖，世系自其而下。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m16','name'=>'刘子亮','zi_bei'=>'子','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'子字辈，与刘子隆同辈，是现存最早的两座祖坟之一；后世未记。','father_id'=>null,'mother_id'=>null,'spouse_ids'=>[],'order'=>2],
        ['id'=>'m17','name'=>'刘文门','zi_bei'=>'文','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘子隆之子。','father_id'=>'m15','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m18','name'=>'刘国赢','zi_bei'=>'国','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘文门长子。','father_id'=>'m17','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m19','name'=>'刘国清','zi_bei'=>'国','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘文门次子。生一男而早亡，此脉遂绝。','father_id'=>'m17','mother_id'=>null,'spouse_ids'=>[],'order'=>2],
        ['id'=>'m20','name'=>'刘国顺','zi_bei'=>'国','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘文门三子，后世未记。','father_id'=>'m17','mother_id'=>null,'spouse_ids'=>[],'order'=>3],
        ['id'=>'m21','name'=>'国清之子','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘国清之子，早亡无嗣，名字未留下。刘国清一脉至此而止。','father_id'=>'m19','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m22','name'=>'刘老三','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘国赢之子。名字没有记录，族中只称『刘老三』。','father_id'=>'m18','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m23','name'=>'刘常芝','zi_bei'=>'常','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘老三长子。','father_id'=>'m22','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m24','name'=>'刘常云','zi_bei'=>'常','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘老三次子，母亲的爷爷（外曾祖父）。','father_id'=>'m22','mother_id'=>null,'spouse_ids'=>[],'order'=>2],
        ['id'=>'m25','name'=>'刘正国','zi_bei'=>'国','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘常芝之子，小名『小虫』。手抄本在名字之后另记一句：『招祖德命尽亡故』（原文照录，文意待考）。','father_id'=>'m23','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m26','name'=>'刘长才','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘常云长子。','father_id'=>'m24','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
        ['id'=>'m27','name'=>'刘孟祥','zi_bei'=>'孟','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘常云次子。','father_id'=>'m24','mother_id'=>null,'spouse_ids'=>[],'order'=>2],
        ['id'=>'m28','name'=>'刘主福','zi_bei'=>'','gender'=>'male','birth'=>'','avatar'=>'','death'=>null,'bio'=>'刘常云三子。刘祖德之父，即母亲的爷爷。','father_id'=>'m24','mother_id'=>null,'spouse_ids'=>[],'order'=>3],
        ['id'=>'m29','name'=>'刘璟弋','zi_bei'=>'远','gender'=>'male','birth'=>'2026-08-06','avatar'=>'','death'=>null,'bio'=>'2026 年 8 月 6 日出生，字辈『远』。','father_id'=>'m14','mother_id'=>null,'spouse_ids'=>[],'order'=>1],
    ];
}

/** 默认语录（标注「示例」的条目请在后台替换为真实回忆） */
function zp_seed_quotes() {
    $now = date('Y-m-d H:i:s');
    return [
        ['id'=>'q1','member_id'=>null,'speaker'=>'祖父','relation'=>'祖父','text'=>'家和万事兴，勤俭能持家。做人先立品，做事要有始有终。','context'=>'示例 · 年节家宴上的嘱托','year'=>'','created'=>$now],
        ['id'=>'q2','member_id'=>'m3','speaker'=>'','relation'=>'外祖父','text'=>'读书明理，行路识人。吃一点亏不算坏事，心要放宽。','context'=>'示例 · 待替换为真实语录','year'=>'','created'=>$now],
        ['id'=>'q3','member_id'=>'m5','speaker'=>'','relation'=>'父亲','text'=>'自己的路自己走，但家里永远给你留着门。','context'=>'示例 · 待替换为真实语录','year'=>'','created'=>$now],
    ];
}

/** 默认家族历史（第一条是真实事件，其余为「示例」条目，可在后台删除） */
function zp_seed_events() {
    $now = date('Y-m-d H:i:s');
    return [
        ['id'=>'e1','date'=>'2026-08-06','title'=>'刘璟弋出生','text'=>'刘璟弋（男）出生，字辈「远」。','category'=>'添丁','member_ids'=>['m29'],'created'=>$now],
    ];
}

/**
 * 默认相册（示例图片，直接填图床链接；可在后台「相册管理」删除或替换）
 * 用固定灰度示例图，避免依赖本地文件。
 */
function zp_seed_photos() {
    $now = date('Y-m-d H:i:s');
    // 照片文件随仓库提供（photos/ 目录），这里只记录链接与说明
    $p = [
        ['01-zupu-archive.jpg',   '手抄族谱',       '',           '“刘氏祖宗族谱”手抄本。中录二十字字辈：仁德朝众大 · 从先正子文 · 国安常孟学 · 永远照光明；页脚另记“九代祖坟墓　弄袍坳坟　刘子隆”。'],
        ['02-baby-swaddle.jpg',   '襁褓',           '',           '碎花包被裹得严严实实，只露出一张小脸，枕边垫着黄色小枕。'],
        ['03-baby-chair.jpg',     '摇椅上的午后',   '',           '网布摇椅里躺着，一只手攥住盖毯的边角。'],
        ['04-baby-cry.jpg',       '放声大哭',       '',           '哭得满脸通红。留着，长大给他自己看。'],
        ['05-elder-yard.jpg',     '堂屋门口',       '',           '老屋堂屋门口，竹篮、搪瓷盆、红塑料桶，都是过日子的家什。'],
        ['06-ancestral-shrine.jpg','祖公神位',      '',           '老墙上贴着红纸神位“刘氏祖宗之位”，两侧对联，上方横批“祖德流芳”。'],
        ['07-father-baby.jpg',    '抱着娃娃',       '',           '木躺椅上，怀里抱着刚满月的娃娃，身后是灶房门口的暖瓶与锅灶。'],
        ['08-elder-bridge.jpg',   '大桥上',         '',           '斜拉桥人行道，红漆地面一直铺到远处，两边是连绵的山。'],
        ['09-lady-dog.jpg',       '怀里的黑狗',     '2023-01-21', '夜里在院子里，怀里揣着一只小黑狗。手机水印：2023.01.21 22:45。'],
        ['10-lady-field.jpg',     '山里',           '2022-10-20', '坡地上歇脚，身后是层层叠叠的喀斯特群山。手机水印：2022.10.20 14:40。'],
    ];
    $out = [];
    foreach ($p as $i => $row) {
        $out[] = [
            'id'         => 'p' . ($i + 1),
            'url'        => 'photos/' . $row[0],
            'title'      => $row[1],
            'date'       => $row[2],
            'place'      => '',
            'note'       => $row[3],
            'member_ids' => [],
            'created'    => $now,
        ];
    }
    return $out;
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

    // ---- 家族相册 ----
    if (!file_exists(PHOTOS_FILE)) {
        zp_save_json(PHOTOS_FILE, zp_seed_photos());
    }

    // ---- 土地 / 坟墓（首次为空，由后台录入）----
    if (!file_exists(LANDS_FILE)) {
        zp_save_json(LANDS_FILE, []);
    }
    if (!file_exists(GRAVES_FILE)) {
        zp_save_json(GRAVES_FILE, []);
    }
    if (!is_dir(UPLOAD_DIR)) {
        @mkdir(UPLOAD_DIR, 0755, true);
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
