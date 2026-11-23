import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE, ROOT } from './paths.mjs';

// 所有可调规则都在这里；首次运行会生成 config/settings.json，之后改那个文件即可。
export const DEFAULT_SETTINGS = {
  version: 1,
  platforms: {
    xiaohongshu: { label: '小红书', prefix: 'xhs', hosts: ['xiaohongshu.com', 'xhslink.com'] },
    douyin: { label: '抖音', prefix: 'dy', hosts: ['douyin.com', 'iesdouyin.com'] },
    weibo: { label: '微博', prefix: 'wb', hosts: ['weibo.com', 'weibo.cn'] },
    bilibili: { label: 'B站', prefix: 'bili', hosts: ['bilibili.com', 'b23.tv'] },
    kuaishou: { label: '快手', prefix: 'ks', hosts: ['kuaishou.com', 'v.kuaishou.com'] },
    taobao: { label: '淘宝天猫', prefix: 'tb', hosts: ['taobao.com', 'tmall.com', 'm.tb.cn'] },
    jd: { label: '京东', prefix: 'jd', hosts: ['jd.com', '3.cn', 'u.jd.com'] },
    dewu: { label: '得物', prefix: 'dw', hosts: ['dewu.com', 'poizon.com'] },
    wechat: { label: '公众号/视频号', prefix: 'wx', hosts: ['mp.weixin.qq.com', 'channels.weixin.qq.com'] },
    zhihu: { label: '知乎', prefix: 'zh', hosts: ['zhihu.com'] },
    other: { label: '其他平台', prefix: 'oth', hosts: [] },
  },
  kinds: {
    lottery: '抽奖送福利',
    seat: '名额/试用',
    coupon: '优惠券/羊毛',
    other: '其他',
  },
  statuses: {
    pending: '待参与',
    joined: '已参与',
    awaiting: '待开奖',
    won: '已中奖',
    lost: '未中',
    claimed: '已领奖',
    skipped: '已放弃',
  },
  scoring: {
    base: 50,
    vetoCap: 25,
    thresholds: { trust: 75, doubt: 50 },
    vetoes: [
      { id: 'wechat', label: '要求加微信/进群/私信领', points: 35, pattern: '加\\s*(微信|v信|vx|v\\b)|进群|入群|群内|私信我领|加我好友|加好友领' },
      { id: 'postage', label: '要你付邮费/运费', points: 30, pattern: '付邮费|邮费自理|自理邮费|运费自理|邮费到付|自付运费' },
      { id: 'prepay', label: '要求先付款/押金/保证金', points: 35, pattern: '垫付|押金|保证金|手续费|先付款|先转账|收款码|扫码付款' },
      { id: 'task', label: '要求刷单/做任务/助力', points: 30, pattern: '刷单|做任务|返利|佣金|助力|砍一刀|拼团返' },
      { id: 'private', label: '引导私下交易/脱离平台', points: 25, pattern: '私下交易|脱离平台|微信转账|支付宝转账|走线下' },
    ],
    risks: [
      { id: 'external', label: '跳到第三方小程序/公众号抽奖', points: 15, pattern: '小程序|公众号|抽奖助手|第三方平台' },
      { id: 'app', label: '要求下载APP/注册/实名', points: 12, pattern: '下载\\s*APP|下载软件|注册账号|实名认证' },
      { id: 'unlimited', label: '开奖没有固定日期', points: 15, pattern: '满\\s*\\d+\\s*人开奖|人满开奖|人数达标|择日开奖|开奖时间待定|后续通知' },
      { id: 'privacy', label: '要求填写地址/身份证等隐私', points: 8, pattern: '收货地址|填写地址|身份证号|银行卡号' },
    ],
    bonuses: [
      { id: 'official', label: '提到官方/旗舰店/品牌方', points: 10, pattern: '官方|旗舰店|品牌方|官方账号' },
      { id: 'history', label: '有往期中奖公示', points: 12, pattern: '往期中奖|中奖名单|已开奖|上期开奖|公示' },
      { id: 'inplatform', label: '平台内评论区/转发抽奖', points: 8, pattern: '评论区抽|评论抽奖|转发抽奖|评论区揪|平台抽奖' },
      { id: 'date', label: '写明了开奖日期', points: 8, pattern: '\\d{1,2}\\s*月\\s*\\d{1,2}\\s*[日号]|\\d{4}-\\d{1,2}-\\d{1,2}' },
      { id: 'ship', label: '包邮/顺丰', points: 6, pattern: '包邮|顺丰' },
    ],
  },
  // 奖品筛选：太便宜的、入口/上身的、限定券，直接判"筛掉"
  prize: {
    minAmount: 50,      // 低于这个金额当"太便宜"
    highAmount: 150,    // 到这个金额算"贵"
    highValueKeywords: [
      '手机', '平板', '耳机', '手表', '相机', '键盘', '显示器', '充电宝', '音箱', '投影',
      '吸尘器', '吹风机', '咖啡机', '电饭煲', '空气炸锅', '扫地机', '电脑',
      '香水', '黄金', '银饰', '羽绒服', '跑鞋', '双肩包', '行李箱', '床品', '四件套',
      '正装', '面霜', '精华', '套装', '礼盒', '会员年卡',
    ],
    lowValueKeywords: [
      '小样', '试用装', '体验装', '贴纸', '明信片', '挂件', '钥匙扣', '帆布袋',
      '优惠券', '代金券', '满减券', '折扣券', '样品', '手机支架', '冰箱贴',
    ],
    categories: [
      { key: 'food', label: '吃的/喝的', risk: true, pattern: '零食|食品|饼干|巧克力|糖果|牛奶|饮料|咖啡|茶叶|坚果|蛋糕|面包|泡面|火锅|外卖|餐券|生鲜|水果|酒|奶茶|零食礼包' },
      { key: 'beauty', label: '护肤/彩妆', risk: true, pattern: '护肤|彩妆|面膜|精华|面霜|乳液|口红|唇釉|粉底|眼影|腮红|防晒|香水|卸妆|洗面奶|身体乳|洗发水|沐浴露|护手霜' },
      { key: 'health', label: '保健/药品', risk: true, pattern: '保健|维生素|钙片|胶囊|膳食纤维|减肥|代餐|药品|药膏|眼药水|益生菌' },
      { key: 'digital', label: '数码/家电', risk: false, pattern: '手机|平板|耳机|手表|相机|键盘|鼠标|显示器|充电宝|音箱|投影|吸尘器|吹风机|咖啡机|电饭煲|空气炸锅|扫地机' },
      { key: 'cash', label: '现金/红包', risk: false, pattern: '现金|红包|话费|充值|转账|余额' },
      { key: 'coupon', label: '优惠券', risk: false, pattern: '优惠券|代金券|满减|折扣券|团购券|兑换券' },
      { key: 'home', label: '家居/日用', risk: false, pattern: '床品|四件套|锅|餐具|收纳|纸巾|毛巾|拖鞋|杯子|保温杯|台灯' },
      { key: 'cloth', label: '服饰/箱包', risk: false, pattern: '衣服|外套|羽绒服|裤子|裙|鞋|袜|背包|双肩包|行李箱' },
    ],
    officialHints: ['官方', '旗舰店', '品牌方', '自营', '专柜', '正品', '假一赔', '质检', '检测报告'],
    couponRestrictKeywords: [
      '满', '指定商品', '指定店铺', '限品类', '仅限', '限定', '新客', '首单', '凑单',
      '限时', '有效期', '不可叠加', '部分商品', '券后', '使用门槛',
    ],
  },
  requirements: [
    { key: 'follow', label: '关注博主', pattern: '关注' },
    { key: 'like', label: '点赞', pattern: '点赞|点个赞|赞一下|三连' },
    { key: 'save', label: '收藏', pattern: '收藏' },
    { key: 'comment', label: '评论留言', pattern: '评论|留言' },
    { key: 'share', label: '转发/分享', pattern: '转发|分享|扩散' },
    { key: 'mention', label: '@好友', pattern: '@\\s*好友|艾特|@好友' },
    { key: 'topic', label: '带话题标签', pattern: '话题|#' },
    { key: 'dm', label: '私信博主', pattern: '私信' },
    { key: 'group', label: '进群/加群', pattern: '进群|入群' },
    { key: 'app', label: '下载APP/注册', pattern: '下载\\s*APP|下载软件|注册' },
    { key: 'screenshot', label: '截图留存', pattern: '截图' },
    { key: 'verify', label: '实名认证', pattern: '实名|身份证' },
  ],
  templates: {
    comment: {
      xiaohongshu: [
        '已关注+点赞+收藏啦～蹲一个名额，谢谢博主送福利 🌸',
        '关注点赞收藏都安排好了，来蹲一个，博主大气～',
        '三连已到，蹲住！希望这次好运轮到我 🙌',
      ],
      douyin: [
        '已关注+点赞，评论区蹲一个，谢谢老板送福利～',
        '关注点赞安排上了，坐等开奖，好运来！',
        '已三连，蹲一个名额，祝老板生意兴隆～',
      ],
      weibo: [
        '已关注+转发，蹲一个名额，谢谢博主～',
        '关注转发都做了，来蹲一个，好运来！',
      ],
      bilibili: [
        '已三连，评论区蹲一个，谢谢 UP 送福利～',
        '关注+点赞+投币已安排，蹲一个名额！',
      ],
      kuaishou: ['已关注+点赞，蹲一个名额，谢谢老铁～'],
      taobao: ['已关注店铺+收藏，蹲一个名额，谢谢～'],
      jd: ['已关注店铺+评论，蹲一个名额，谢谢～'],
      dewu: ['已关注+点赞，蹲一个名额，谢谢～'],
      wechat: ['已关注+在看，蹲一个名额，谢谢～'],
      zhihu: ['已关注+赞同，蹲一个名额，谢谢～'],
      other: ['已按要求参与，蹲一个名额，谢谢～'],
    },
    dm: '博主您好～我看到您在【{title}】活动的开奖名单里有我，请问领取方式是怎样的呀？麻烦了～',
  },
};

function merge(base, patch) {
  if (Array.isArray(base)) return Array.isArray(patch) ? patch : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch && typeof patch === 'object' ? patch : {})) {
      out[k] = k in base ? merge(base[k], v) : v;
    }
    return out;
  }
  return patch === undefined ? base : patch;
}

export function loadSettings() {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return DEFAULT_SETTINGS;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    throw new Error('配置文件不是合法 JSON：' + CONFIG_FILE + '（' + e.message + '）');
  }
  return merge(DEFAULT_SETTINGS, raw);
}

export { CONFIG_FILE, ROOT };
