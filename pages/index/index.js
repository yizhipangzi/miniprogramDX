// 底图原始尺寸（images/tokyo_map.png，竖版）。热区坐标都基于这个像素系。
const MAP_W = 1080
const MAP_H = 1920

// 开屏 / 顶部提示的时序（毫秒）
const SPLASH_MS = 1500      // cover.png 停留
const SPLASH_FADE_MS = 400  // cover.png 淡出
const HINT_MS = 5000        // 地图露出后，「点击区域查看排片」显示时长
const HINT_FADE_MS = 400    // 提示淡出

// 热区：多边形（原图像素坐标）+ 点击后要跳转的数据区 id。
// id 必须存在于 utils/movie.js 的 LOADERS 里，否则跳过去会报「未知地区」。
// 1 熱区 = 1 区 = 1 份 step4 输出的 JSON，无需再经 district 字段间接映射。
const AREAS = [
  // 埼玉県
  { id: 'saitama_city',  name: 'さいたま市',
    polygon: [[150,130],[395,130],[425,200],[425,420],[390,455],[160,455],[135,390],[135,200]] },
  { id: 'saitama_west',  name: '県西',
    polygon: [[430,130],[675,130],[700,195],[700,420],[675,455],[435,455],[410,390],[410,200]] },
  { id: 'saitama_south', name: '県南',
    polygon: [[705,130],[950,130],[970,200],[970,420],[945,455],[710,455],[690,390],[690,200]] },

  // 東京都
  { id: 'ikebukuro_north',  name: '池袋・北',
    polygon: [[135,510],[510,510],[535,575],[535,820],[505,850],[150,850],[120,790],[120,570]] },
  { id: 'ueno_joto',        name: '上野・城東',
    polygon: [[545,510],[920,510],[945,575],[945,820],[915,850],[555,850],[525,790],[525,570]] },
  { id: 'west_tokyo',       name: '西東京',
    polygon: [[135,855],[510,855],[535,920],[535,1165],[505,1195],[150,1195],[120,1130],[120,915]] },
  { id: 'shinjuku_shibuya', name: '新宿・渋谷',
    polygon: [[545,855],[920,855],[945,920],[945,1165],[915,1195],[555,1195],[525,1130],[525,915]] },
  { id: 'city_center',      name: '都心',
    polygon: [[135,1200],[510,1200],[535,1265],[535,1510],[505,1540],[150,1540],[120,1475],[120,1260]] },
  { id: 'south_tokyo',      name: '城南',
    polygon: [[545,1200],[920,1200],[945,1265],[945,1510],[915,1540],[555,1540],[525,1475],[525,1260]] },

  // 千葉県
  { id: 'chiba_northwest', name: '北西部',
    polygon: [[820,560],[1050,560],[1065,615],[1065,900],[1045,930],[825,930],[805,885],[805,610]] },
  { id: 'chiba_bay',       name: '湾岸',
    polygon: [[820,920],[1050,920],[1065,980],[1065,1260],[1045,1290],[825,1290],[805,1245],[805,970]] },
  { id: 'chiba_south',     name: '南部',
    polygon: [[820,1285],[1050,1285],[1065,1340],[1065,1620],[1045,1650],[825,1650],[805,1605],[805,1335]] },

  // 神奈川県
  { id: 'yokohama',    name: '横浜',
    polygon: [[90,1555],[380,1555],[405,1615],[405,1865],[375,1895],[95,1895],[70,1840],[70,1615]] },
  { id: 'kawasaki',    name: '川崎',
    polygon: [[390,1555],[690,1555],[715,1615],[715,1865],[690,1895],[395,1895],[370,1840],[370,1615]] },
  { id: 'west_shonan', name: '県西・湘南',
    polygon: [[700,1555],[1005,1555],[1030,1615],[1030,1865],[1000,1895],[705,1895],[680,1840],[680,1615]] },
]

// 射线法：点 (x,y) 是否落在多边形内（均为原图像素坐标）
function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function bboxOf(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  poly.forEach(p => {
    if (p[0] < minX) minX = p[0]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  })
  return { minX, minY, maxX, maxY }
}

function centerOf(poly) {
  const b = bboxOf(poly)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

Page({
  data: {
    mapWidth: 0,
    mapHeight: 0,
    activeStyle: '',    // 命中区域的高亮框（按 bbox 换算到屏幕像素）
    showSplash: true,   // 开屏封面，显示 1.5s 后淡出
    splashFade: false,  // 触发淡出动画
    showHint: false,    // 顶部悬浮提示「点击区域查看排片」
    hintFade: false,    // 提示淡出
  },

  onLoad() {
    this._timers = []
    const later = (fn, ms) => this._timers.push(setTimeout(fn, ms))

    // 开屏 cover.png 停留 → 淡出 → 移除；地图一露出就开始计提示的 5 秒
    later(() => {
      this.setData({ splashFade: true })
      later(() => {
        this.setData({ showSplash: false, showHint: true })
        // 地图显示 0~5s 期间挂着提示，超过 5s 淡出移除
        later(() => {
          this.setData({ hintFade: true })
          later(() => this.setData({ showHint: false }), HINT_FADE_MS)
        }, HINT_MS)
      }, SPLASH_FADE_MS)
    }, SPLASH_MS)

    // 竖版底图按「宽度铺满屏幕」等比缩放，整张图基本都能看全；
    // 若某些机型算出来比屏幕高，scroll-view 可上下拖动。
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const scale = sys.windowWidth / MAP_W
    this._scale = scale
    this.setData({
      mapWidth: MAP_W * scale,
      mapHeight: MAP_H * scale,
    })
  },

  onUnload() {
    (this._timers || []).forEach(clearTimeout)
    this._timers = []
  },

  // 整张图只挂一个 tap：把点击点换算回原图像素，再做多边形命中判断。
  // 比逐个矩形 view 更准（热区是多边形，且相邻块有接缝重叠）。
  onMapTap(e) {
    const scale = this._scale
    if (!scale) return
    const px = e.detail.x
    const py = e.detail.y

    // 图片在视口中的位置（含 scroll-view 已滚动的偏移），据此换算相对坐标
    wx.createSelectorQuery().in(this).select('.map-img').boundingClientRect(rect => {
      if (!rect) return
      const ox = (px - rect.left) / scale
      const oy = (py - rect.top) / scale

      // 命中可能不止一个（坐标存在重叠），取中心离点击点最近的那个
      const hits = AREAS.filter(a => pointInPolygon(ox, oy, a.polygon))
      if (!hits.length) return
      let hit = hits[0]
      if (hits.length > 1) {
        let best = Infinity
        hits.forEach(a => {
          const c = centerOf(a.polygon)
          const d = (c.x - ox) * (c.x - ox) + (c.y - oy) * (c.y - oy)
          if (d < best) { best = d; hit = a }
        })
      }
      this.goArea(hit)
    }).exec()
  },

  // 高亮闪一下再跳转
  goArea(area) {
    const s = this._scale
    const b = bboxOf(area.polygon)
    this.setData({
      activeStyle: [
        `left:${b.minX * s}px`,
        `top:${b.minY * s}px`,
        `width:${(b.maxX - b.minX) * s}px`,
        `height:${(b.maxY - b.minY) * s}px`,
      ].join(';'),
    })

    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/district/district?id=${area.id}&name=${encodeURIComponent(area.name)}`,
        fail(err) {
          wx.showToast({ title: '导航失败: ' + (err.errMsg || ''), icon: 'none', duration: 4000 })
        },
      })
      this.setData({ activeStyle: '' })
    }, 150)
  },

  // 转发给好友/群：分享整个小程序入口（东京地图首页）
  onShareAppMessage() {
    return {
      title: '大熊看点映 · 看东京正在上映的电影',
      path: '/pages/index/index',
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return { title: '大熊看点映 · 看东京正在上映的电影' }
  },
})
