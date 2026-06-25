const LOADERS = {
  shibuya:      () => require('../../data/shibuya.js'),
  shinjuku:     () => require('../../data/shinjuku.js'),
  takadanobaba: () => require('../../data/takadanobaba.js'),
  ikebukuro:    () => require('../../data/ikebukuro.js'),
  yurakucho:    () => require('../../data/yurakucho.js'),
  roppongi:     () => require('../../data/roppongi.js'),
  ebisu:        () => require('../../data/ebisu.js'),
  suidobashi:   () => require('../../data/suidobashi.js'),
  ueno:         () => require('../../data/ueno.js'),
}

function ratingColor(score) {
  if (!score) return '#555'
  if (score >= 8.0) return '#4ade80'
  if (score >= 7.0) return '#fbbf24'
  if (score >= 6.0) return '#f97316'
  return '#f87171'
}

function scoreInfo(mv) {
  if (mv.doubanScore) {
    return { score: mv.doubanScore, label: '某瓣', display: mv.doubanScore.toFixed(1) }
  }
  if (mv.eigaRating) {
    return { score: mv.eigaRating * 2, label: '映画', display: mv.eigaRating.toFixed(1) }
  }
  return { score: 0, label: '', display: '' }
}

function genreTags(mv) {
  return mv.genre
    ? mv.genre.split(/[/／,，]/).map(g => g.trim()).filter(Boolean).slice(0, 3)
    : []
}

// Aggregate every movie across all theaters in the district, dedup by movie id.
function buildMovies(theaters) {
  const map = {}
  theaters.forEach((t, ti) => {
    t.movies.forEach((mv, mi) => {
      let entry = map[mv.id]
      if (!entry) {
        const si = scoreInfo(mv)
        entry = map[mv.id] = {
          id: mv.id,
          titleJp: mv.titleJp,
          titleCn: mv.titleCn || '',
          scoreLabel: si.label,
          scoreDisplay: si.display,
          sortScore: si.score,
          ratingColor: ratingColor(si.score),
          genres: genreTags(mv),
          eigaUrl: `https://eiga.com/movie/${mv.id}/`,
          doubanUrl: `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(mv.titleCn || mv.titleJp)}`,
          // --- 详情浮层字段（部分待数据补全，缺失则隐藏）---
          hasDouban: !!mv.doubanScore,
          // 封面：step4 已算好（eiga 优先，缺失回退某瓣），这里直接用
          poster: mv.poster || '',
          watched: mv.doubanWatched || 0,
          wish: mv.doubanWish || 0,
          director: mv.director || '',
          cast: mv.cast || '',
          genreText: mv.genre || '',
          comments: Array.isArray(mv.doubanComments)
            ? mv.doubanComments.slice(0, 3)
            : (mv.doubanComment ? [mv.doubanComment] : []),
          year: mv.year || '',
          country: mv.country || '',
          screenings: [],
          expanded: false,
        }
      }
      // 后端 JSON 的 showtimes 已是「今天(JST)」该影院该片的场次数组，
      // 每个元素 {time, movieType:[{type, typeTxt}]}
      ;(Array.isArray(mv.showtimes) ? mv.showtimes : []).forEach(st => {
        entry.screenings.push({
          time: st.time,
          movieType: Array.isArray(st.movieType) ? st.movieType : [],
          theaterName: t.name,
          // 该电影在该影院的场次页：movie-theater/电影id/地区id/区域id/影院id
          // t.id 已是「地区id/区域id/影院id」格式（如 13/130301/3035）
          eigaUrl: `https://eiga.com/movie-theater/${mv.id}/${t.id}/`,
        })
      })
    })
  })

  const movies = Object.keys(map).map(k => map[k])
  movies.forEach(m => {
    m.screenings.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
    m.theaterCount = new Set(m.screenings.map(s => s.theaterName)).size
    m.showCount = m.screenings.length
  })
  movies.sort((a, b) => b.sortScore - a.sortScore)
  return movies
}

Page({
  data: {
    districtId: '',
    districtName: '',
    viewMode: 'movie', // 'movie' | 'theater'
    theaters: [],
    movies: [],
    errMsg: '',
    showDetail: false,
    detailMovie: null,
    // 加载进度条：loading=true 时显示；progress 0~100 跟随云端 json 下载进度，
    // 下载满 100% 后渲染完成即隐藏（不额外等待）
    loading: false,
    progress: 0,
  },

  onLoad(options) {
    const { id, name } = options
    if (!id) {
      this.setData({ errMsg: '缺少地区参数' })
      return
    }
    if (!LOADERS[id]) {
      this.setData({ errMsg: `未知地区: ${id}` })
      return
    }

    const districtName = name ? decodeURIComponent(name) : id
    this.setData({ districtId: id, districtName })
    wx.setNavigationBarTitle({ title: districtName })

    // 1) 有本地缓存先秒开，避免白屏；后台静默拉云端刷新（不显示进度条）
    const cacheKey = `district:${id}`
    const cached = wx.getStorageSync(cacheKey)
    if (cached && cached.theaters) {
      this.renderDistrict(cached)
      this.loadFromCloud(id)
        .then(district => {
          wx.setStorageSync(cacheKey, district)
          this.renderDistrict(district)
        })
        .catch(() => {})
      return
    }

    // 2) 无缓存：显示百分比进度条。下载 json 占满整条 0~100%，渲染完成即隐藏（不额外等待）
    this.setData({ loading: true, progress: 0 })
    this.loadFromCloud(id, p => {
      // 下载进度 0~100 直接映射进度条 0~100
      this.setData({ progress: Math.round(p) })
    })
      .then(district => {
        wx.setStorageSync(cacheKey, district)
        this.renderWithProgress(district)
      })
      .catch(() => {
        // 3) 云端失败：回退包内本地数据（无下载进度，直接填满再渲染）
        let local = null
        try { local = LOADERS[id]() } catch (e) {}
        if (local) {
          this.setData({ progress: 100 })
          this.renderWithProgress(local)
        } else {
          this.setData({ loading: false, errMsg: '数据加载失败' })
        }
      })
  },

  // 从云存储下载该地区 json 并解析；传 onProgress 可拿下载进度（0~100）。
  loadFromCloud(id, onProgress) {
    const prefix = getApp().globalData.cloudDataPrefix
    if (!wx.cloud || !prefix || prefix.indexOf('REPLACE_WITH') !== -1) {
      return Promise.reject(new Error('云开发未配置'))
    }
    return new Promise((resolve, reject) => {
      const task = wx.cloud.downloadFile({
        fileID: prefix + id + '.json',
        success: res => {
          try {
            const text = wx.getFileSystemManager().readFileSync(res.tempFilePath, 'utf-8')
            resolve(JSON.parse(text))
          } catch (e) {
            reject(e)
          }
        },
        fail: reject,
      })
      if (onProgress && task && task.onProgressUpdate) {
        task.onProgressUpdate(r => onProgress(r.progress))
      }
    })
  },

  // 把地区数据渲染到页面（聚合 + 排序）
  renderDistrict(district) {
    const theaters = district.theaters || []
    this.setData({
      theaters,
      movies: buildMovies(theaters),
    })
  },

  // 带进度条的渲染：内容 setData 一上屏就立刻收起进度条——绝不额外等待。
  // 下载已把进度条填到 100%；这里渲染完成回调里同帧隐藏，内容就绪即露出，
  // 不加任何人为延时/补间。
  renderWithProgress(district) {
    const theaters = district.theaters || []
    const movies = buildMovies(theaters)
    this.setData({ theaters, movies, progress: 100 }, () => {
      this.setData({ loading: false, progress: 0 })
    })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode !== this.data.viewMode) {
      this.setData({ viewMode: mode })
    }
  },

  onTheaterTap(e) {
    const { id, name, district } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/theater/theater?districtId=${district}&theaterId=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`,
    })
  },

  onMovieTap(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`movies[${index}].expanded`]: !this.data.movies[index].expanded })
  },

  // 点击评分块：弹出电影详情浮层
  onScoreTap(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ detailMovie: this.data.movies[index], showDetail: true })
  },

  closeDetail() {
    this.setData({ showDetail: false })
  },

  // 阻止浮层内部点击穿透到遮罩
  noop() {},

  // 封面外链加载失败时清空，回退到占位
  onPosterError() {
    this.setData({ 'detailMovie.poster': '' })
  },

  // 点击场次行：复制该影院 eiga.com 场次页链接
  onScreeningTap(e) {
    const url = e.currentTarget.dataset.url
    if (url) this.copyLink(url, 'eiga.com 场次')
  },

  copyLink(url, label) {
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: `${label}链接已复制，可在浏览器打开`, icon: 'none', duration: 2500 })
      },
    })
  },

  // 转发给好友/群：带上地区参数，对方点开直达本区列表
  onShareAppMessage() {
    const { districtId, districtName } = this.data
    const name = districtName || '东京'
    if (!districtId) {
      return { title: '东京电影院地图', path: '/pages/index/index' }
    }
    return {
      title: `${name} 正在上映的电影 · 东京电影院`,
      path: `/pages/district/district?id=${districtId}&name=${encodeURIComponent(name)}`,
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { districtId, districtName } = this.data
    const name = districtName || '东京'
    return {
      title: `${name} 正在上映的电影`,
      query: districtId ? `id=${districtId}&name=${encodeURIComponent(name)}` : '',
    }
  },
})
