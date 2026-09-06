const { LOADERS, ratingColor, scoreInfo, genreTags, eigaShowtimeUrl } = require('../../utils/movie.js')

function formatDuration(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

function processMovie(mv, index, theaterId) {
  const si = scoreInfo(mv)

  return {
    id: mv.id,
    titleJp: mv.titleJp,
    titleCn: mv.titleCn || '',
    scoreLabel: si.label,
    scoreDisplay: si.display,
    ratingColor: ratingColor(si.score),
    genres: genreTags(mv),
    duration: mv.duration,
    durationText: formatDuration(mv.duration),
    year: mv.year,
    country: mv.country || '',
    director: mv.director || '',
    // 后端 JSON 已是「今天(JST)」的一维场次数组，直接用，不再生成假数据
    showtimes: Array.isArray(mv.showtimes) ? mv.showtimes : [],
    // 该电影在本影院的 eiga.com 场次页（点击场次复制）
    eigaUrl: eigaShowtimeUrl(mv.id, theaterId),
  }
}

Page({
  data: {
    theaterName: '',
    movies: [],
    errMsg: '',
  },

  onLoad(options) {
    const { districtId, theaterId, name } = options
    // 存下入场参数，供转发时原样重建链接（对方点开直达本影院排片）
    this._shareOpts = { districtId, theaterId, name }
    if (!LOADERS[districtId]) {
      this.setData({ errMsg: `未知地区: ${districtId}` })
      return
    }

    this.getDistrict(districtId)
      .then(district => {
        const theater = district.theaters.find(t => t.id === decodeURIComponent(theaterId))
        if (!theater) {
          this.setData({ errMsg: `未找到影院: ${theaterId}` })
          return
        }
        const movies = theater.movies.map((mv, i) => processMovie(mv, i, theater.id))
        const theaterName = decodeURIComponent(name)
        this.setData({ theaterName, movies })
        wx.setNavigationBarTitle({ title: theaterName })
      })
      .catch(() => this.setData({ errMsg: `${districtId} 数据加载失败` }))
  },

  // 取地区数据：优先 district 页写入的缓存，其次云存储，最后包内本地兜底
  getDistrict(id) {
    const cached = wx.getStorageSync(`district:${id}`)
    if (cached && cached.theaters) return Promise.resolve(cached)

    const prefix = getApp().globalData.cloudDataPrefix
    if (wx.cloud && prefix && prefix.indexOf('REPLACE_WITH') === -1) {
      return wx.cloud
        .downloadFile({ fileID: prefix + id + '.json' })
        .then(res => {
          const text = wx.getFileSystemManager().readFileSync(res.tempFilePath, 'utf-8')
          const district = JSON.parse(text)
          wx.setStorageSync(`district:${id}`, district)
          return district
        })
        .catch(() => LOADERS[id]())
    }
    return Promise.resolve(LOADERS[id]())
  },

  // 转发给好友/群：带上入场参数，对方点开直达本影院排片
  onShareAppMessage() {
    const o = this._shareOpts || {}
    if (o.districtId && o.theaterId) {
      const q = `districtId=${encodeURIComponent(o.districtId)}` +
                `&theaterId=${encodeURIComponent(o.theaterId)}` +
                `&name=${encodeURIComponent(o.name || this.data.theaterName || '')}`
      return {
        title: `${this.data.theaterName || '影院'} 排片 · 东京电影院`,
        path: `/pages/theater/theater?${q}`,
      }
    }
    return { title: '大熊看点映', path: '/pages/index/index' }
  },

  // 点击场次：复制该电影在本影院的 eiga.com 场次页链接。
  // 无在线购票的场次（onlineTicket=false）不可点击，直接忽略。
  onShowtimeTap(e) {
    const { url, online } = e.currentTarget.dataset
    if (!online) return
    if (!url) return
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: 'eiga.com 场次链接已复制，可在浏览器打开', icon: 'none', duration: 2500 })
      },
    })
  },
})
