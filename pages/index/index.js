// Hotspot definitions in original image pixels (base map: 853 x 1844).
// id must match the data file / district id so navigation can load it.
const SPOTS = [
  { id: 'takadanobaba', name: '高田馬場',           x: 20,  y: 150,  width: 320, height: 260 },
  { id: 'ikebukuro',    name: '池袋',               x: 330, y: 110,  width: 450, height: 320 },
  { id: 'shinjuku',     name: '新宿',               x: 40,  y: 470,  width: 370, height: 320 },
  { id: 'ueno',         name: '上野',               x: 420, y: 410,  width: 380, height: 260 },
  { id: 'suidobashi',   name: '水道橋・飯田橋',       x: 380, y: 650,  width: 420, height: 320 },
  { id: 'shibuya',      name: '渋谷',               x: 20,  y: 900,  width: 400, height: 380 },
  { id: 'yurakucho',    name: '有楽町・銀座・日本橋',  x: 430, y: 980,  width: 390, height: 380 },
  { id: 'roppongi',     name: '六本木',             x: 240, y: 1270, width: 420, height: 320 },
  { id: 'ebisu',        name: '恵比寿・目黒',         x: 180, y: 1590, width: 500, height: 220 },
]

Page({
  data: {
    mapHeight: 0,
    spots: [],
    activeSpot: '',
    showSplash: true,   // 开屏封面，显示 1.5s 后淡出
    splashFade: false,  // 触发淡出动画
  },

  onLoad() {
    // 开屏：cover.png 显示 1.5s，再 0.4s 淡出后移除
    setTimeout(() => {
      this.setData({ splashFade: true })
      setTimeout(() => this.setData({ showSplash: false }), 400)
    }, 1500)
  },

  onImgLoad(e) {
    const { width, height } = e.detail
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const screenW = sys.windowWidth
    const scale = screenW / width // displayed-image scale vs. original pixels
    const mapH = height * scale

    const spots = SPOTS.map(s => ({
      id: s.id,
      name: s.name,
      style: [
        `top:${s.y * scale}px`,
        `left:${s.x * scale}px`,
        `width:${s.width * scale}px`,
        `height:${s.height * scale}px`,
      ].join(';'),
    }))

    this.setData({ mapHeight: mapH, spots })
  },

  onSpotTap(e) {
    const { id, name } = e.currentTarget.dataset
    if (!id) return
    this.setData({ activeSpot: id })
    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/district/district?id=${id}&name=${encodeURIComponent(name)}`,
        fail(err) {
          wx.showToast({ title: '导航失败: ' + (err.errMsg || ''), icon: 'none', duration: 4000 })
        },
      })
      this.setData({ activeSpot: '' })
    }, 150)
  },

  // 转发给好友/群：分享整个小程序入口（东京地图首页）
  onShareAppMessage() {
    return {
      title: '东京电影院地图 · 看东京正在上映的电影',
      path: '/pages/index/index',
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return { title: '东京电影院地图 · 看东京正在上映的电影' }
  },
})
