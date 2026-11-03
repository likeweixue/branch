<?php
/**
 * 后台管理（需管理员登录）
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';
require_once __DIR__ . '/core/layout.php';
require_once __DIR__ . '/core/submissions.php';

zp_ensure_seed();

if (!zp_is_admin()) {
    header('Location: index.php');
    exit;
}
$cur = zp_current_user();
$members = zp_load_json(MEMBERS_FILE, []);
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$users_local = zp_load_json(USERS_FILE, []);
$quotes_local = zp_load_json(QUOTES_FILE, []);
$events_local = zp_sort_by_date(zp_load_json(EVENTS_FILE, []), 'date', true);
$photos_local = zp_load_json(PHOTOS_FILE, []);
$lands_local = zp_load_json(LANDS_FILE, []);
$graves_local = zp_load_json(GRAVES_FILE, []);
$line_types = zp_line_types($settings);
$subs_local = zp_subs_load();
$zp_admin = [
    'members' => $members, 'settings' => $settings, 'quotes' => $quotes_local, 'events' => $events_local,
    'photos' => $photos_local, 'lands' => $lands_local, 'graves' => $graves_local, 'line_types' => $line_types,
];

/* 服务端渲染辅助：取成员名 / 生成下拉选项（即便 JS 未加载也能显示数据） */
function zp_name($ms, $id) {
    if (!$id) return '—';
    foreach ($ms as $m) { if ($m['id'] === $id) return $m['name']; }
    return '—';
}
function zp_opt($ms, $sel, $withNone) {
    $h = $withNone ? '<option value="">（无）</option>' : '';
    foreach ($ms as $m) {
        $lab = htmlspecialchars($m['name']) . ($m['zi_bei'] ? '（' . htmlspecialchars($m['zi_bei']) . '）' : '');
        $h .= '<option value="' . $m['id'] . '"' . ($m['id'] === $sel ? ' selected' : '') . '>' . $lab . '</option>';
    }
    return $h;
}
/** 截断文本（兼容未装 mbstring） */
function zp_trunc($s, $n = 46) {
    $s = trim((string) $s);
    if ($s === '') return '';
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($s, 'UTF-8') > $n ? mb_substr($s, 0, $n, 'UTF-8') . '…' : $s;
    }
    $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
    if (is_array($chars) && count($chars) > $n) {
        return implode('', array_slice($chars, 0, $n)) . '…';
    }
    return $s;
}

/** 头像缩略图（有链接用图片，无链接用首字） */
function zp_ava_html($m, $cls = 'ad-thumb') {
    $url = zp_clean_url($m['avatar'] ?? '');
    $ini = zp_first_char($m['name'] ?? '?');
    if ($url !== '') {
        return '<span class="' . $cls . '"><img src="' . htmlspecialchars($url) . '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
    }
    return '<span class="' . $cls . ' is-empty"><i>' . htmlspecialchars($ini) . '</i></span>';
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 后台管理</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/splash.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<style>
  .ad-wrap{max-width:1100px;margin:74px auto 40px;padding:0 20px;}
  .ad-nav{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;}
  .ad-nav button{border:1.5px solid var(--hair);background:var(--card);color:var(--ink-soft);font-family:var(--din);font-size:13px;letter-spacing:.06em;padding:8px 16px;border-radius:2px;}
  .ad-nav button.on{border-color:var(--accent);color:var(--accent);}
  .ad-panel{display:none;background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.05);overflow-x:auto;}
  .ad-panel.on{display:block;}
  .ad-panel h2{font-family:var(--din);font-size:17px;letter-spacing:.04em;margin:0 0 16px;}
  table.ad-t{width:100%;border-collapse:collapse;font-size:13px;}
  table.ad-t th,table.ad-t td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--hair-soft);}
  table.ad-t th{color:var(--muted);font-weight:600;font-family:var(--mono);font-size:10px;letter-spacing:.1em;}
  .ad-act{color:var(--accent);cursor:pointer;margin-right:10px;}
  .ad-act.del{color:#e5484d;}
  .ad-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;background:var(--bg);padding:18px;border-radius:10px;}
  .ad-form .full{grid-column:1 / -1;}
  .ad-form label{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:5px;}
  .ad-form input,.ad-form select,.ad-form textarea{font:inherit;font-size:13px;padding:9px 11px;border:1px solid var(--hair);border-radius:8px;background:#fff;color:var(--ink);width:100%;outline:none;}
  .ad-form input:focus,.ad-form select:focus,.ad-form textarea:focus{border-color:var(--accent);}
  .ad-form textarea{resize:vertical;min-height:60px;}
  .ad-chk{display:flex;flex-wrap:wrap;gap:8px 14px;max-height:168px;overflow:auto;padding:2px;}
  .ad-chk label{display:flex;align-items:center;gap:5px;font-weight:400;font-size:12px;color:var(--ink);white-space:nowrap;}
  .ad-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
  .ad-row label{font-size:12px;font-weight:600;color:var(--ink-soft);min-width:84px;}
  .ad-row input[type=text],.ad-row select,.ad-row textarea{flex:1;font:inherit;font-size:13px;padding:8px 11px;border:1px solid var(--hair);border-radius:8px;background:#fff;color:var(--ink);outline:none;min-width:160px;}
  .ad-row textarea{font-family:var(--mono);min-height:54px;}
  .ad-color{display:flex;align-items:center;gap:10px;}
  .ad-color input[type=color]{width:46px;height:32px;border:1px solid var(--hair);border-radius:6px;background:none;padding:2px;}
  .ad-muted{color:var(--muted);font-size:12px;font-family:var(--mono);letter-spacing:.04em;}
  .ad-sel-member{font-size:12px;color:var(--muted);}
  .ad-top a{text-decoration:none;}
  /* 续谱审核 */
  .ad-badge{display:inline-block;min-width:16px;padding:0 5px;height:16px;line-height:16px;border-radius:8px;
    background:var(--accent);color:#fff;font-size:10px;font-family:var(--din);margin-left:2px;text-align:center;}
  .ad-sub{border:1px solid var(--hair);border-radius:10px;padding:16px;margin-bottom:14px;background:var(--bg);}
  .ad-sub-head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px;font-size:14px;}
  .ad-sub-note{margin:0 0 10px;font-size:12px;color:var(--ink-soft);background:#fff;border-left:2px solid var(--accent);
    padding:8px 10px;border-radius:0 6px 6px 0;line-height:1.7;white-space:pre-wrap;}
  .ad-diff{background:#fff;border-radius:8px;}
  .ad-diff-k{color:var(--muted);font-size:12px;white-space:nowrap;width:104px;}
  .ad-diff-old{color:var(--muted);}
  .ad-diff-new{color:var(--ink);font-weight:600;}
  .ad-sub-act{display:flex;gap:10px;margin-top:12px;}
  /* 头像 / 图片链接 */
  .ad-ava-row{display:flex;gap:14px;align-items:flex-start;}
  .ad-ava-prev{width:74px;height:74px;flex:0 0 74px;border-radius:10px;overflow:hidden;background:var(--bg-2);
    border:1px solid var(--hair);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;}
  .ad-ava-prev img{width:100%;height:100%;object-fit:cover;display:block;}
  .ad-ava-input{flex:1;min-width:0;}
  .ad-ava-tip{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.6;}
  .ad-thumb{width:34px;height:34px;border-radius:8px;overflow:hidden;background:var(--accent-soft);
    display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;}
  .ad-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .ad-thumb.is-empty i{font-style:normal;font-family:var(--din);font-weight:700;font-size:14px;color:var(--accent);}
  .ad-thumb-wide{width:58px;height:44px;border-radius:6px;}
  /* 连线类型编辑器 */
  .ad-lines{display:flex;flex-direction:column;gap:10px;margin:14px 0 6px;}
  .ad-line-row{display:grid;grid-template-columns:52px minmax(140px,1fr) 180px 96px 40px;gap:10px;align-items:center;
    background:var(--bg);border:1px solid var(--hair-soft);border-radius:9px;padding:9px 12px;}
  .ad-line-row input[type=color]{width:44px;height:30px;border:1px solid var(--hair);border-radius:6px;background:none;padding:2px;}
  .ad-line-row input[type=text]{font:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--hair);
    border-radius:7px;background:#fff;color:var(--ink);outline:none;width:100%;}
  .ad-line-row .ln-prev{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;color:var(--muted);}
  .ad-line-row .ln-prev i{display:block;height:2px;flex:1;border-radius:2px;min-width:18px;}
  .ad-line-row .ln-kind{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;color:var(--muted);text-align:right;}
  .ad-line-row .ln-del{background:none;border:0;color:#e5484d;font-size:15px;line-height:1;padding:4px;}
  .ad-line-row .ln-del:disabled{color:var(--hair);cursor:not-allowed;}
  /* 土地流转 */
  .ad-hist{display:flex;flex-direction:column;gap:10px;}
  .ad-hist-row{display:grid;grid-template-columns:96px 150px minmax(120px,1fr) minmax(140px,1.4fr) 34px;gap:8px;align-items:center;
    background:#fff;border:1px solid var(--hair-soft);border-radius:9px;padding:9px 11px;}
  .ad-hist-row input,.ad-hist-row select{font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid var(--hair);
    border-radius:7px;background:#fff;color:var(--ink);outline:none;width:100%;}
  .ad-hist-row .h-to{max-height:74px;overflow:auto;border:1px solid var(--hair);border-radius:7px;padding:5px 7px;background:#fff;}
  .ad-hist-row .h-to label{display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:400;margin:1px 0;color:var(--ink);white-space:nowrap;}
  .ad-hist-row .h-del{background:none;border:0;color:#e5484d;font-size:14px;padding:4px;}
  /* 上传 */
  .ad-up{display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;}
  .ad-up input[type=file]{font-size:11.5px;color:var(--muted);max-width:230px;}
  .ad-up .ad-muted{font-size:11px;}
  @media (max-width:760px){
    .ad-wrap{margin-top:66px;padding:0 12px;}
    .ad-panel{padding:14px;}
    .ad-form{grid-template-columns:1fr;}
    table.ad-t{min-width:760px;}
  }
</style>
</head>
<body>

<header class="zp-top">
  <a class="zp-brand" href="index.php" style="text-decoration:none;color:inherit"><b>宗谱</b><span>ADMIN CONSOLE</span></a>
  <nav class="zp-nav">
    <a href="index.php">族谱</a>
    <a href="quotes.php">语录</a>
    <a href="album.php">相册</a>
    <a href="history.php">历史</a>
    <a href="land.php">土地</a>
    <a href="grave.php">坟茔</a>
    <a href="submit.php">续谱</a>
  </nav>
  <div class="spacer"></div>
  <a class="zp-btn accent" href="editor.php">画布编辑器 →</a>
  <div class="zp-user"><span class="dot"></span><?= zp_h($cur['username']) ?>（管理员）</div>
  <button class="zp-btn ghost" id="zpLogout">退出</button>
</header>

<div class="ad-wrap">
  <div class="ad-nav">
    <button data-tab="members" class="on">成员管理</button>
    <button data-tab="zb">字辈与排列</button>
    <button data-tab="lines">连线类型</button>
    <button data-tab="users">用户管理</button>
    <button data-tab="quotes">语录管理</button>
    <button data-tab="history">历史管理</button>
    <button data-tab="album">相册管理</button>
    <button data-tab="land">土地管理</button>
    <button data-tab="grave">坟茔管理</button>
    <button data-tab="review">续谱审核<?php $pend = zp_subs_pending_count($subs_local); ?><?php if ($pend > 0): ?> <span class="ad-badge"><?= $pend ?></span><?php endif; ?></button>
  </div>

  <!-- 成员管理 -->
  <section class="ad-panel on" id="tab-members">
    <h2>成员管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddMember">+ 添加成员</button>
      <span class="ad-muted">提示：父/母填其一即可；配偶可多选（红线）。删除成员会一并清理其亲属指向。</span></div>
    <div class="ad-form" id="adMemberForm" style="display:none">
      <input type="hidden" id="m_id">
      <div><label>姓名 *</label><input id="m_name" type="text" placeholder="如 刘永生"></div>
      <div><label>字辈（可输入，也可从下拉选）</label><input id="m_zibei" type="text" list="zbList" maxlength="4" placeholder="如 永"><datalist id="zbList"><?php foreach (($settings['zi_bei'] ?? []) as $z): ?><option value="<?= htmlspecialchars($z) ?>"><?php endforeach; ?></datalist></div>
      <div><label>性别</label><select id="m_gender"><option value="male">男</option><option value="female">女</option></select></div>
      <div><label>出生日期</label><input id="m_birth" type="text" placeholder="YYYY-MM-DD"></div>
      <div><label>逝世日期（健在留空）</label><input id="m_death" type="text" placeholder="YYYY-MM-DD"></div>
      <div><label>父亲</label><select id="m_father"><?= zp_opt($members, '', true) ?></select></div>
      <div><label>母亲</label><select id="m_mother"><?= zp_opt($members, '', true) ?></select></div>
      <div class="full"><label>配偶（两姓结姻 · 红线，可多选）</label><div class="ad-chk" id="m_spouse"><?php foreach ($members as $m): ?><label><input type="checkbox" id="sp_<?= $m['id'] ?>" value="<?= $m['id'] ?>"><?= htmlspecialchars($m['name']) . ($m['zi_bei'] ? '（' . htmlspecialchars($m['zi_bei']) . '）' : '') ?></label><?php endforeach; ?></div></div>
      <div><label>同辈排行（数字，越小越年长）</label><input id="m_order" type="number" value="1" min="1"></div>
      <div><label>与父母的连线</label>
        <select id="m_linktype">
          <option value="">默认（父子 / 母子）</option>
          <?php foreach ($line_types as $t): if ($t['kind'] !== '') continue; ?>
            <option value="<?= zp_h($t['id']) ?>"><?= zp_h($t['label']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="full">
        <label>头像链接（图床地址，可留空）</label>
        <div class="ad-ava-row">
          <div class="ad-ava-prev" id="m_avatar_prev"><span>未设置</span></div>
          <div class="ad-ava-input">
            <input id="m_avatar" type="text" placeholder="https://图床域名/xxx.jpg">
            <div class="ad-ava-tip">支持任意图床直链（http/https）；留空则显示姓名首字。</div>
          </div>
        </div>
      </div>
      <div class="full"><label>简介 / 备注</label><textarea id="m_bio" placeholder="生平、事迹等"></textarea></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="mCancel">取消</button>
        <button class="zp-btn accent" id="mSave">保存成员</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>头像</th><th>姓名</th><th>字辈</th><th>性别</th><th>生卒</th><th>父母</th><th>配偶</th><th>操作</th></tr></thead>
      <tbody id="mList"><?php foreach ($members as $m):
        $sp = [];
        foreach (($m['spouse_ids'] ?? []) as $sid) { $sp[] = zp_name($members, $sid); }
        $spouse = $sp ? implode('、', $sp) : '—';
        $par = array_filter([!empty($m['father_id']) ? zp_name($members, $m['father_id']) : null, !empty($m['mother_id']) ? zp_name($members, $m['mother_id']) : null]);
        $parents = $par ? implode(' / ', $par) : '—';
        $gender = ($m['gender'] ?? 'male') === 'female' ? '女' : '男';
        $birth = ($m['birth'] ?? '') ?: '?';
        $life = $birth . (!empty($m['death']) ? ' ～ ' . htmlspecialchars($m['death']) : '');
      ?><tr>
        <td><?= zp_ava_html($m) ?></td>
        <td><?= htmlspecialchars($m['name']) ?></td>
        <td><?= $m['zi_bei'] ? htmlspecialchars($m['zi_bei']) : '—' ?></td>
        <td><?= $gender ?></td>
        <td><?= htmlspecialchars($life) ?></td>
        <td><?= htmlspecialchars($parents) ?></td>
        <td><?= htmlspecialchars($spouse) ?></td>
        <td><span class="ad-act" data-edit="<?= $m['id'] ?>">编辑</span><span class="ad-act del" data-del="<?= $m['id'] ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 字辈与排列 -->
  <section class="ad-panel" id="tab-zb">
    <h2>字辈与排列</h2>
    <div class="ad-row"><label>字辈序列</label><textarea id="zb_list" placeholder="用空格或逗号分隔，如：仁 德 朝 众 大 ……"><?= htmlspecialchars(implode(' ', $settings['zi_bei'] ?? [])) ?></textarea></div>
    <p class="ad-muted">左侧为长辈（大字辈），右侧为晚辈（小字辈）。如「仁德朝众大…永远照光明」，仁是最高辈、明是最低辈。<br>
      选了「自定义」就到<a href="editor.php" style="color:var(--accent)">画布编辑器</a>里自己摆位置，摆好点「保存布局」，前台族谱会长得和编辑器里一样。</p>
    <div class="ad-row"><label>排列方向</label>
      <?php $lm = zp_layout_mode($settings); $ly = $lm === 'custom' ? 'custom' : ($settings['layout'] ?? 'horizontal'); ?>
      <select id="zb_layout"><option value="horizontal"<?= $ly==='horizontal'?' selected':'' ?>>横排（左大字辈 · 右小字辈）</option><option value="vertical"<?= $ly==='vertical'?' selected':'' ?>>竖排（上大字辈 · 下小字辈）</option><option value="custom"<?= $ly==='custom'?' selected':'' ?>>自定义（用画布编辑器保存的位置）</option></select>
    </div>
    <h2 style="margin-top:22px">启动页</h2>
    <div class="ad-row"><label>启用启动页</label><input type="checkbox" id="su_enabled" <?= !empty($settings['startup']['enabled'])?'checked':'' ?>></div>
    <div class="ad-row"><label>播放时机</label><select id="su_mode"><option value="first"<?= ($settings['startup']['mode']??'first')==='first'?' selected':'' ?>>首次访问</option><option value="always"<?= ($settings['startup']['mode']??'')==='always'?' selected':'' ?>>每次访问</option><option value="off"<?= ($settings['startup']['mode']??'')==='off'?' selected':'' ?>>关闭</option></select></div>
    <div class="ad-row"><label>主标题</label><input type="text" id="su_b1" value="<?= htmlspecialchars($settings['startup']['brand1'] ?? '宗谱') ?>"></div>
    <div class="ad-row"><label>副标题</label><input type="text" id="su_b2" value="<?= htmlspecialchars($settings['startup']['brand2'] ?? 'CLAN GENEALOGY') ?>"></div>
    <div class="ad-row"><label>产品行</label><input type="text" id="su_b3" value="<?= htmlspecialchars($settings['startup']['brand3'] ?? 'FAMILY TREE OS') ?>"></div>
    <div class="ad-row"><label>组织名</label><input type="text" id="su_org" value="<?= htmlspecialchars($settings['startup']['org'] ?? '家族族谱') ?>"></div>
    <div class="ad-row" style="justify-content:flex-end"><button class="zp-btn accent" id="zbSave">保存字辈与启动页</button></div>
  </section>

  <!-- 连线类型 -->
  <section class="ad-panel" id="tab-lines">
    <h2>连线类型</h2>
    <p class="ad-muted" style="line-height:1.8">每条线代表一种关系，前台右下角的图例会照着这里的配置显示。<br>
      「父子 / 母子」和「两姓结姻」是两条基础线（不可删除，可改色改叫法）；其余可以自己加——比如「过继」「入赘」「义亲」，加完在成员表单的「与父母的连线」里就能选。</p>
    <div id="lnList" class="ad-lines"></div>
    <div class="ad-row"><button class="zp-btn ghost" id="lnAdd" type="button">＋ 新增一种线</button></div>
    <div class="ad-row" style="margin-top:16px"><label>本人高亮</label>
      <div class="ad-color"><input type="color" id="ln_self" value="<?= htmlspecialchars($settings['lines']['self'] ?? '#ff7500') ?>"><span class="ad-muted">登录者自己的节点描边</span></div>
    </div>
    <div class="ad-row" style="justify-content:flex-end"><button class="zp-btn accent" id="lnSave">保存连线类型</button></div>
  </section>

  <!-- 土地管理 -->
  <section class="ad-panel" id="tab-land">
    <h2>土地管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddLand">+ 录入地块</button>
      <span class="ad-muted">记面积、位置与归属，再补上「哪年因为什么分给了谁」。填了经纬度就会出现在前台地图上。</span>
      <a class="zp-btn ghost ad-top" href="land.php" style="text-decoration:none" target="_blank">查看前台 →</a></div>

    <div class="ad-form" id="adLandForm" style="display:none">
      <input type="hidden" id="ld_id">
      <div><label>地块名称 *</label><input id="ld_name" type="text" placeholder="如 屋后坡地、大坵田"></div>
      <div><label>状态</label><select id="ld_status"><?php foreach (zp_land_status() as $s): ?><option value="<?= zp_h($s) ?>"><?= zp_h($s) ?></option><?php endforeach; ?></select></div>
      <div><label>面积</label><input id="ld_area" type="text" placeholder="如 2.3"></div>
      <div><label>单位</label><input id="ld_unit" type="text" value="亩" placeholder="亩 / 分 / 平方米"></div>
      <div class="full"><label>位置（小地名，越具体越好）</label><input id="ld_location" type="text" placeholder="如 村东头水井旁"></div>
      <div><label>纬度（可空）</label><input id="ld_lat" type="text" placeholder="26.123456"></div>
      <div><label>经度（可空）</label><input id="ld_lng" type="text" placeholder="113.123456"></div>
      <div class="full"><label>现归（可多选）</label><div class="ad-chk" id="ld_owners"></div></div>
      <div class="full"><label>备注</label><textarea id="ld_note" placeholder="四至、土质、种什么、有没有纠纷…"></textarea></div>

      <div class="full">
        <label>流转历史（这块地的来历：哪年、为什么、给了谁）</label>
        <div id="ld_hist" class="ad-hist"></div>
        <button class="zp-btn ghost" id="ld_addHist" type="button" style="margin-top:8px">＋ 加一条流转记录</button>
      </div>

      <div class="full">
        <label>照片（每行一个图床直链，也可以直接上传）</label>
        <textarea id="ld_photos" placeholder="https://图床/xxx.jpg&#10;uploads/202611/xxx.jpg"></textarea>
        <div class="ad-up"><input type="file" id="ld_file" accept="image/*" multiple><span class="ad-muted">支持 jpg/png/webp，单张 ≤6MB，上传后自动填进上面的框</span></div>
      </div>

      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="ldCancel">取消</button>
        <button class="zp-btn accent" id="ldSave">保存地块</button>
      </div>
    </div>

    <table class="ad-t">
      <thead><tr><th>名称</th><th>面积</th><th>位置</th><th>状态</th><th>归属</th><th>流转</th><th>操作</th></tr></thead>
      <tbody id="ldList"><?php foreach ($lands_local as $l):
        $own = [];
        foreach ((array) ($l['owner_ids'] ?? []) as $mid) { $n = zp_name($members, $mid); if ($n !== '—') $own[] = $n; }
        $hn = count((array) ($l['history'] ?? []));
      ?><tr>
        <td><?= zp_h($l['name'] ?? '') ?></td>
        <td><?= trim((string) ($l['area'] ?? '')) !== '' ? zp_h($l['area'] . ' ' . ($l['unit'] ?? '亩')) : '—' ?></td>
        <td><?= trim((string) ($l['location'] ?? '')) !== '' ? zp_h($l['location']) : '—' ?></td>
        <td><?= zp_h($l['status'] ?? '在册') ?></td>
        <td><?= $own ? zp_h(implode('、', $own)) : '—' ?></td>
        <td class="ad-muted"><?= $hn ?> 条</td>
        <td><span class="ad-act" data-ldedit="<?= zp_h($l['id']) ?>">编辑</span><span class="ad-act del" data-lddel="<?= zp_h($l['id']) ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 坟茔管理 -->
  <section class="ad-panel" id="tab-grave">
    <h2>坟茔管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddGrave">+ 录入坟茔</button>
      <span class="ad-muted">写上地名与经纬度，附一张照片，就不怕「哭错坟」了。族谱里只有标了已故的家人，鼠标悬停才会显示安葬地。</span>
      <a class="zp-btn ghost ad-top" href="grave.php" style="text-decoration:none" target="_blank">查看前台 →</a></div>

    <div class="ad-form" id="adGraveForm" style="display:none">
      <input type="hidden" id="gv_id">
      <div><label>墓名 *（可留空，按安葬人生成）</label><input id="gv_name" type="text" placeholder="如 刘子隆墓"></div>
      <div><label>形制</label><select id="gv_type"><?php foreach (zp_grave_types() as $t): ?><option value="<?= zp_h($t) ?>"><?= zp_h($t) ?></option><?php endforeach; ?></select></div>
      <div class="full"><label>安葬的家人（可多选，合葬就选多个）</label><div class="ad-chk" id="gv_members"></div></div>
      <div><label>小地名</label><input id="gv_place" type="text" placeholder="如 弄袍坳"></div>
      <div><label>朝向</label><input id="gv_facing" type="text" placeholder="如 坐北朝南"></div>
      <div class="full"><label>详细地址（怎么走、找谁带路）</label><input id="gv_address" type="text" placeholder="如 从村口沿水泥路走 800 米，右手山坡第三台"></div>
      <div><label>纬度（可空）</label><input id="gv_lat" type="text" placeholder="26.123456"></div>
      <div><label>经度（可空）</label><input id="gv_lng" type="text" placeholder="113.123456"></div>
      <div><label>立碑 / 下葬时间</label><input id="gv_date" type="text" placeholder="如 1985 或 民国二十四年"></div>
      <div><label>最近祭扫</label><input id="gv_visited" type="text" placeholder="如 2026 清明"></div>
      <div class="full"><label>备注</label><textarea id="gv_note" placeholder="碑文、后人、修缮记录…"></textarea></div>
      <div class="full">
        <label>照片（每行一个直链，也可以直接上传）</label>
        <textarea id="gv_photos" placeholder="https://图床/xxx.jpg&#10;uploads/202611/xxx.jpg"></textarea>
        <div class="ad-up"><input type="file" id="gv_file" accept="image/*" multiple><span class="ad-muted">拍一张墓碑或周边的样子，下一代才认得路</span></div>
      </div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="gvCancel">取消</button>
        <button class="zp-btn accent" id="gvSave">保存坟茔</button>
      </div>
    </div>

    <table class="ad-t">
      <thead><tr><th>墓名</th><th>安葬人</th><th>地名</th><th>坐标</th><th>祭扫</th><th>操作</th></tr></thead>
      <tbody id="gvList"><?php foreach ($graves_local as $g):
        $who = [];
        foreach ((array) ($g['member_ids'] ?? []) as $mid) { $n = zp_name($members, $mid); if ($n !== '—') $who[] = $n; }
        $geo = ($g['lat'] !== null && $g['lng'] !== null) ? number_format((float) $g['lat'], 4, '.', '') . ', ' . number_format((float) $g['lng'], 4, '.', '') : '—';
      ?><tr>
        <td><?= zp_h($g['name'] ?? '') ?></td>
        <td><?= $who ? zp_h(implode('、', $who)) : '—' ?></td>
        <td><?= trim((string) ($g['place'] ?? '')) !== '' ? zp_h($g['place']) : '—' ?></td>
        <td class="ad-muted"><?= $geo ?></td>
        <td><?= trim((string) ($g['visited'] ?? '')) !== '' ? zp_h($g['visited']) : '—' ?></td>
        <td><span class="ad-act" data-gvedit="<?= zp_h($g['id']) ?>">编辑</span><span class="ad-act del" data-gvdel="<?= zp_h($g['id']) ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 用户管理 -->
  <section class="ad-panel" id="tab-users">
    <h2>用户管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddUser">+ 添加用户</button>
      <span class="ad-muted">管理员可创建用户并绑定对应家族成员；普通用户仅可登录浏览。</span></div>
    <div class="ad-form" id="adUserForm" style="display:none">
      <input type="hidden" id="u_id">
      <div><label>用户名 *</label><input id="u_name" type="text"></div>
      <div><label>密码（新增必填 / 修改留空不改）</label><input id="u_pass" type="password" placeholder="至少 6 位"></div>
      <div><label>角色</label><select id="u_role"><option value="member">普通成员</option><option value="admin">管理员</option></select></div>
      <div><label>绑定成员</label><select id="u_member"><?= zp_opt($members, '', true) ?></select></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="uCancel">取消</button>
        <button class="zp-btn accent" id="uSave">保存用户</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>用户名</th><th>角色</th><th>绑定成员</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody id="uList"><?php foreach ($users_local as $u):
        $role = ($u['role'] ?? 'member') === 'admin' ? '管理员' : '普通成员';
        $mem = !empty($u['member_id']) ? zp_name($members, $u['member_id']) : '—';
      ?><tr>
        <td><?= htmlspecialchars($u['username']) ?></td>
        <td><?= $role ?></td>
        <td><?= htmlspecialchars($mem) ?></td>
        <td><?= htmlspecialchars($u['created'] ?? '') ?></td>
        <td><span class="ad-act" data-uedit="<?= $u['id'] ?>">编辑</span><span class="ad-act del" data-udel="<?= $u['id'] ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 语录管理 -->
  <section class="ad-panel" id="tab-quotes">
    <h2>语录管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddQuote">+ 添加语录</button>
      <span class="ad-muted">记下长辈的原话与嘱托；前台「语录」页按讲述人筛选展示。</span>
      <a class="zp-btn ghost ad-top" href="quotes.php" style="text-decoration:none">查看前台 →</a></div>
    <div class="ad-form" id="adQuoteForm" style="display:none">
      <input type="hidden" id="q_id">
      <div><label>讲述人（选家族成员）</label><select id="q_member"><?= zp_opt($members, '', true) ?></select></div>
      <div><label>称谓 / 身份</label><input id="q_relation" type="text" placeholder="如 祖父、父亲、外祖母"></div>
      <div><label>姓名（未选成员时手填）</label><input id="q_speaker" type="text" placeholder="如 麻家爷爷"></div>
      <div><label>年份（可空）</label><input id="q_year" type="text" placeholder="如 1998 或 1990 年代"></div>
      <div class="full"><label>语录内容 *</label><textarea id="q_text" placeholder="长辈的原话…"></textarea></div>
      <div class="full"><label>场合 / 背景</label><input id="q_context" type="text" placeholder="如 年节家宴上的嘱托"></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="qCancel">取消</button>
        <button class="zp-btn accent" id="qSave">保存语录</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>讲述人</th><th>内容</th><th>场合 / 年份</th><th>操作</th></tr></thead>
      <tbody id="qList"><?php foreach ($quotes_local as $q):
        $sp = !empty($q['member_id']) ? zp_name($members, $q['member_id']) : (trim($q['speaker'] ?? '') ?: '佚名');
        $meta = array_filter([trim($q['context'] ?? ''), trim($q['year'] ?? '')]);
      ?><tr>
        <td><?= zp_h($sp) ?><?= !empty($q['relation']) ? '<span class="ad-muted"> · ' . zp_h($q['relation']) . '</span>' : '' ?></td>
        <td><?= zp_h(zp_trunc($q['text'] ?? '', 40)) ?></td>
        <td><?= $meta ? zp_h(implode(' · ', $meta)) : '—' ?></td>
        <td><span class="ad-act" data-qedit="<?= zp_h($q['id']) ?>">编辑</span><span class="ad-act del" data-qdel="<?= zp_h($q['id']) ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 历史管理 -->
  <section class="ad-panel" id="tab-history">
    <h2>历史管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddEvent">+ 记录一件大事</button>
      <span class="ad-muted">迁徙、婚嫁、添丁、求学、事业……前台「历史」页按事件时间倒序排列，最新的一件在最上面。</span>
      <a class="zp-btn ghost ad-top" href="history.php" style="text-decoration:none">查看前台 →</a></div>
    <div class="ad-form" id="adEventForm" style="display:none">
      <input type="hidden" id="ev_id">
      <div><label>年代 / 日期</label><input id="ev_date" type="text" placeholder="如 1949、1985-03、1980 年代"></div>
      <div><label>分类</label><input id="ev_cat" type="text" list="evCats" placeholder="如 迁徙"><datalist id="evCats"><?php foreach (zp_event_categories() as $c): ?><option value="<?= zp_h($c) ?>"><?php endforeach; ?></datalist></div>
      <div class="full"><label>标题 *</label><input id="ev_title" type="text" placeholder="如 祖父自外地迁居本地"></div>
      <div class="full"><label>经过 / 说明</label><textarea id="ev_text" placeholder="时间、地点、人物、经过…"></textarea></div>
      <div class="full"><label>关联成员（可多选）</label><div class="ad-chk" id="ev_members"></div></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="evCancel">取消</button>
        <button class="zp-btn accent" id="evSave">保存事件</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>年代</th><th>标题</th><th>分类</th><th>关联成员</th><th>操作</th></tr></thead>
      <tbody id="evList"><?php foreach ($events_local as $ev):
        $memNames = [];
        foreach ((array) ($ev['member_ids'] ?? []) as $mid) {
            if ($mid && zp_name($members, $mid) !== '—') $memNames[] = zp_name($members, $mid);
        }
      ?><tr>
        <td><?= trim($ev['date'] ?? '') !== '' ? zp_h($ev['date']) : '待考' ?></td>
        <td><?= zp_h($ev['title'] ?? '') ?></td>
        <td><?= trim($ev['category'] ?? '') !== '' ? zp_h($ev['category']) : '—' ?></td>
        <td><?= $memNames ? zp_h(implode('、', $memNames)) : '—' ?></td>
        <td><span class="ad-act" data-evedit="<?= zp_h($ev['id']) ?>">编辑</span><span class="ad-act del" data-evdel="<?= zp_h($ev['id']) ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 相册管理 -->
  <section class="ad-panel" id="tab-album">
    <h2>相册管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddPhoto">+ 添加照片</button>
      <span class="ad-muted">只存图床直链，不占本站空间；前台「相册」按错位照片墙展示，滚轮缩放、点击放大。</span>
      <a class="zp-btn ghost ad-top" href="album.php" style="text-decoration:none">查看前台 →</a></div>
    <div class="ad-form" id="adPhotoForm" style="display:none">
      <input type="hidden" id="ph_id">
      <div class="full"><label>图片链接 *（图床直链）</label>
        <div class="ad-ava-row">
          <div class="ad-ava-prev ad-ph-prev" id="ph_prev"><span>预览</span></div>
          <div class="ad-ava-input">
            <input id="ph_url" type="text" placeholder="https://i.imgur.com/xxxx.jpg">
            <div class="ad-ava-tip">支持 jpg / png / webp / gif / avif 直链；粘贴后失焦即可预览。</div>
          </div>
        </div>
      </div>
      <div><label>标题</label><input id="ph_title" type="text" placeholder="如 1985 年春节全家福"></div>
      <div><label>拍摄时间（可空）</label><input id="ph_date" type="text" placeholder="如 1985 或 1985-02"></div>
      <div><label>地点（可空）</label><input id="ph_place" type="text" placeholder="如 老宅门前"></div>
      <div class="full"><label>照片里的人（可多选）</label><div class="ad-chk" id="ph_members"></div></div>
      <div class="full"><label>说明 / 备注</label><textarea id="ph_note" placeholder="当时的场景、谁拍的、背后的小故事…"></textarea></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="phCancel">取消</button>
        <button class="zp-btn accent" id="phSave">保存照片</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>照片</th><th>标题</th><th>时间</th><th>地点</th><th>人物</th><th>操作</th></tr></thead>
      <tbody id="phList"><?php foreach ($photos_local as $ph):
        $who = [];
        foreach ((array) ($ph['member_ids'] ?? []) as $mid) {
            $n = zp_name($members, $mid);
            if ($n !== '—') $who[] = $n;
        }
      ?><tr>
        <td><?= zp_ava_html(['name' => $ph['title'] ?? '照', 'avatar' => $ph['url'] ?? ''], 'ad-thumb ad-thumb-wide') ?></td>
        <td><?= zp_h($ph['title'] ?? '') !== '' ? zp_h($ph['title']) : '（未命名）' ?><?= trim($ph['note'] ?? '') !== '' ? '<div class="ad-muted">' . zp_h(zp_trunc($ph['note'], 26)) . '</div>' : '' ?></td>
        <td><?= trim($ph['date'] ?? '') !== '' ? zp_h($ph['date']) : '待考' ?></td>
        <td><?= trim($ph['place'] ?? '') !== '' ? zp_h($ph['place']) : '—' ?></td>
        <td><?= $who ? zp_h(implode('、', $who)) : '—' ?></td>
        <td><span class="ad-act" data-phedit="<?= zp_h($ph['id']) ?>">编辑</span><span class="ad-act del" data-phdel="<?= zp_h($ph['id']) ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 续谱审核 -->
  <section class="ad-panel" id="tab-review">
    <h2>续谱审核</h2>
    <div class="ad-row">
      <a class="zp-btn ghost" href="submit.php" style="text-decoration:none" target="_blank">打开收集表 →</a>
      <span class="ad-muted">亲戚在「续谱」页提交的新增 / 修改都排在这里。批准即写进族谱，驳回只留档不删记录。</span>
    </div>
    <?php
      $fields = zp_sub_fields();
      $nof = function ($id) use ($members) { return zp_name($members, $id); };
      $curId = [];
      foreach ($members as $m) { $curId[$m['id']] = $m; }
      $pendingRows = [];
      $doneRows = [];
      foreach ($subs_local as $s) {
          if (($s['status'] ?? 'pending') === 'pending') { $pendingRows[] = $s; } else { $doneRows[] = $s; }
      }
      usort($pendingRows, fn($a, $b) => strcmp((string) ($b['submitted'] ?? ''), (string) ($a['submitted'] ?? '')));
      usort($doneRows, fn($a, $b) => strcmp((string) ($b['reviewed']['at'] ?? ''), (string) ($a['reviewed']['at'] ?? '')));
    ?>
    <?php if (!$pendingRows): ?>
      <p class="ad-muted" style="padding:14px 0">目前没有待审的提交。</p>
    <?php endif; ?>
    <?php foreach ($pendingRows as $s):
      $p = $s['payload'] ?? [];
      $isEdit = ($s['type'] ?? 'new') === 'edit';
      $t = $isEdit ? ($curId[$s['target_id'] ?? ''] ?? null) : null;
    ?>
      <article class="ad-sub" data-sub="<?= zp_h($s['id']) ?>">
        <header class="ad-sub-head">
          <b><?= $isEdit ? '修正 · ' . zp_h($t['name'] ?? '（原成员已删除）') : '新增 · ' . zp_h($p['name'] ?? '') ?></b>
          <span class="ad-muted">#<?= zp_h($s['id']) ?> · <?= zp_h($s['submitted'] ?? '') ?><?= !empty($s['submitter']['name']) ? ' · 提交人 ' . zp_h($s['submitter']['name']) : '' ?><?= !empty($s['submitter']['contact']) ? ' · ' . zp_h($s['submitter']['contact']) : '' ?></span>
        </header>
        <?php if (trim((string) ($s['note'] ?? '')) !== ''): ?>
          <p class="ad-sub-note">说明：<?= zp_h($s['note']) ?></p>
        <?php endif; ?>
        <table class="ad-t ad-diff">
          <thead><tr><th>字段</th><?php if ($isEdit): ?><th>现在</th><?php endif; ?><th>提交</th></tr></thead>
          <tbody>
          <?php $changed = 0; ?>
          <?php foreach ($fields as $k => $label):
            $new = $p[$k] ?? '';
            $old = $t ? ($t[$k] ?? '') : null;
            if ($isEdit && (string) zp_sub_val($k, $old, $nof) === (string) zp_sub_val($k, $new, $nof)) continue;
            $changed++;
          ?>
            <tr>
              <td class="ad-diff-k"><?= zp_h($label) ?></td>
              <?php if ($isEdit): ?><td class="ad-diff-old"><?= zp_h(zp_sub_val($k, $old, $nof)) ?></td><?php endif; ?>
              <td class="ad-diff-new"><?= zp_h(zp_sub_val($k, $new, $nof)) ?></td>
            </tr>
          <?php endforeach; ?>
          <?php if ($isEdit && $changed === 0): ?>
            <tr><td colspan="3" class="ad-muted">没有字段差异</td></tr>
          <?php endif; ?>
          </tbody>
        </table>
        <div class="ad-sub-act">
          <button class="zp-btn accent" data-approve="<?= zp_h($s['id']) ?>">批准并合并</button>
          <button class="zp-btn ghost" data-reject="<?= zp_h($s['id']) ?>">驳回</button>
        </div>
      </article>
    <?php endforeach; ?>

    <?php if ($doneRows): ?>
      <h2 style="margin-top:24px">已处理</h2>
      <table class="ad-t">
        <thead><tr><th>编号</th><th>内容</th><th>结果</th><th>处理时间</th></tr></thead>
        <tbody>
        <?php foreach (array_slice($doneRows, 0, 60) as $s): ?>
          <tr>
            <td class="ad-muted">#<?= zp_h($s['id']) ?></td>
            <td><?= ($s['type'] ?? 'new') === 'edit' ? '修正 · ' : '新增 · ' ?><?= zp_h($s['payload']['name'] ?? '') ?></td>
            <td><?= ($s['status'] ?? '') === 'approved' ? '已合并' : '已驳回' ?></td>
            <td class="ad-muted"><?= zp_h($s['reviewed']['at'] ?? '') ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </section>
</div>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_ADMIN = <?= json_encode($zp_admin, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= zp_asset('assets/js/admin.js') ?>"></script>
</body>
</html>
