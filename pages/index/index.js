// Hotspot definitions in original image pixels (base map: 1536 x 1024).
// id must match the data file / district id so navigation can load it.
const SPOTS = [
  { id: 'saitama',         name: '埼玉県',      left: 470,  top: 20,  width: 615, height: 200 },
  { id: 'nishitokyo',      name: '西東京',       left: 20,   top: 200, width: 370, height: 615 },
  { id: 'ikebukuro_kita',  name: '池袋・北',     left: 395,  top: 235, width: 295, height: 220 },
  { id: 'suidobashi',      name: '水道橋・飯田橋', left: 625,  top: 255, width: 240, height: 215 },
  { id: 'joto',            name: '城東',         left: 845,  top: 235, width: 300, height: 220 },
  { id: 'shinjuku_shibuya',name: '新宿・渋谷',    left: 430,  top: 450, width: 305, height: 215 },
  { id: 'toshin',          name: '都心',         left: 770,  top: 440, width: 350, height: 225 },
  { id: 'jonan',           name: '城南',         left: 470,  top: 650, width: 625, height: 170 },
  { id: 'chiba',           name: '千葉県',       left: 1160, top: 90,  width: 355, height: 775 },
  { id: 'kennishi_shonan', name: '県西・湘南',    left: 215,  top: 805, width: 465, height: 205 },
  { id: 'kawasaki',        name: '川崎',         left: 685,  top: 770, width: 435, height: 105 },
  { id: 'yokohama',        name: '横浜',         left: 685,  top: 875, width: 435, height: 140 },
]

Page({
  data: {
    mapWidth: 0,
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

    this.initMap()
  },

  // 地图按「垂直方向适应屏幕」铺开：图高 = 屏幕可视高度，宽度按原图比例等比放大。
  // 横向图会溢出屏幕宽度，交给 scroll-view 左右拖动查看；热区用同一 scale 换算，点击照常。
  initMap() {
    wx.getImageInfo({
      src: '/images/tokyo_map.png',
      success: res => {
        const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const screenH = sys.windowHeight
        const scale = screenH / res.height // 以高度为基准的缩放比
        const mapW = res.width * scale

        const spots = SPOTS.map(s => ({
          id: s.id,
          name: s.name,
          style: [
            `top:${s.top * scale}px`,
            `left:${s.left * scale}px`,
            `width:${s.width * scale}px`,
            `height:${s.height * scale}px`,
          ].join(';'),
        }))

        this.setData({ mapWidth: mapW, mapHeight: screenH, spots })
      },
      fail: () => {
        wx.showToast({ title: '地图加载失败', icon: 'none', duration: 3000 })
      },
    })
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
