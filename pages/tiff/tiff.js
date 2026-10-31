// 東京国際映画祭 (TIFF) 排片页：按天分 tab，每天列出当天有场次的作品 + 场次格子。
// 数据：云存储 data/tiff.json（后端 run_tiff.py 生成，见 pipeline/tiff.py），
// 先比对极小的 tiff.meta.json 版本号，没变就用本地缓存秒开。
const { ratingColor } = require('../../utils/movie.js')

const CACHE_KEY = 'tiff:data'
const CACHE_VER_KEY = 'tiff:ver'
const CACHE_TS_KEY = 'tiff:ts'
const CACHE_FRESH_WINDOW_MS = 5 * 60 * 1000 // 5 分钟内重复打开不查版本

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 部门 → 角标颜色（没列到的用默认色）
const CATEGORY_COLOR = {
  'オープニング': '#e94560',
  'センターピース': '#e94560',
  'クロージング': '#e94560',
  'コンペティション': '#d4a017',
  'アジアの未来': '#16a085',
  'Nippon Cinema Now': '#2e86de',
  'ガラ・セレクション': '#c0392b',
  'ワールド・フォーカス': '#8e44ad',
  'アニメーション': '#e67e22',
  '日本映画クラシックス': '#7f8c8d',
  '黒澤明の愛した映画': '#7f8c8d',
  '東京国際映画祭 屋外上映会2026': '#27ae60',
}

function todayJst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

function dateTab(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { date: iso, md: `${m}/${d}`, week: WEEK[wd], weekend: wd === 0 || wd === 6 }
}

// 场次状态：可购 / 免费预约 / 免费 / 无网售
function showStatus(s) {
  if (s.ticketUrl) return { text: '购票', cls: 'st-buy' }
  if (s.free && s.prereg) return { text: '免费·需预约', cls: 'st-free' }
  if (s.free) return { text: '免费', cls: 'st-free' }
  if (s.saleStatus === 0) return { text: '无网售', cls: 'st-none' }
  return { text: '', cls: 'st-none' }
}

function scoreOf(f) {
  if (f.doubanScore) return { label: '某瓣', display: f.doubanScore.toFixed(1), score: f.doubanScore }
  if (f.eigaRating) return { label: '映画', display: f.eigaRating.toFixed(1), score: f.eigaRating * 2 }
  return { label: '', display: '', score: 0 }
}

function metaLine(f) {
  return [f.duration ? `${f.duration}分` : '', f.country, f.year || ''].filter(Boolean).join(' · ')
}

// 预处理：每部作品算好展示字段；按日期建索引 {date: [{film, shows}]}
function prepare(data) {
  const films = (data.films || []).map(f => {
    const sc = scoreOf(f)
    return Object.assign({}, f, {
      scoreLabel: sc.label,
      scoreDisplay: sc.display,
      ratingColor: ratingColor(sc.score),
      catColor: CATEGORY_COLOR[f.category] || '#5b5b8a',
      meta: metaLine(f),
      thumb: f.poster || f.image,
      comments: Array.isArray(f.doubanComments) ? f.doubanComments.slice(0, 3) : [],
    })
  })
  const byDate = {}
  films.forEach((f, idx) => {
    (f.screenings || []).forEach(s => {
      const st = showStatus(s)
      const list = byDate[s.date] || (byDate[s.date] = {})
      const entry = list[f.code] || (list[f.code] = { idx, shows: [] })
      entry.shows.push(Object.assign({}, s, { statusText: st.text, statusCls: st.cls }))
    })
  })
  const dates = (data.dates && data.dates.length ? data.dates : Object.keys(byDate)).slice().sort()
  return { films, byDate, dates }
}

Page({
  data: {
    loading: true,
    errMsg: '',
    festivalName: '',
    tabs: [],
    curDate: '',
    filter: 'all', // all | film | event
    dayList: [],   // 当前 tab 的作品卡片
    dayCount: 0,
    showDetail: false,
    detail: null,
  },

  onLoad() {
    const cached = wx.getStorageSync(CACHE_KEY)
    const ts = wx.getStorageSync(CACHE_TS_KEY)
    if (cached && cached.films && ts && Date.now() - ts < CACHE_FRESH_WINDOW_MS) {
      this.render(cached)
      return
    }
    const cachedVer = wx.getStorageSync(CACHE_VER_KEY)
    this.download('tiff.meta.json')
      .then(meta => {
        if (cached && cached.films && meta && meta.ver && meta.ver === cachedVer) {
          wx.setStorageSync(CACHE_TS_KEY, Date.now())
          this.render(cached)
          return
        }
        return this.fetchFresh(meta && meta.ver)
      })
      .catch(() => this.fetchFresh(''))
      .catch(() => {
        if (cached && cached.films) this.render(cached)
        else this.setData({ loading: false, errMsg: '数据加载失败，请稍后再试' })
      })
  },

  fetchFresh(ver) {
    return this.download('tiff.json').then(data => {
      wx.setStorageSync(CACHE_KEY, data)
      wx.setStorageSync(CACHE_TS_KEY, Date.now())
      if (ver) wx.setStorageSync(CACHE_VER_KEY, ver)
      this.render(data)
    })
  },

  download(name) {
    const prefix = getApp().globalData.cloudDataPrefix
    if (!wx.cloud || !prefix) return Promise.reject(new Error('云开发未配置'))
    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID: prefix + name,
        success: res => {
          try {
            resolve(JSON.parse(wx.getFileSystemManager().readFileSync(res.tempFilePath, 'utf-8')))
          } catch (e) { reject(e) }
        },
        fail: reject,
      })
    })
  },

  render(data) {
    const p = prepare(data)
    this._p = p
    const tabs = p.dates.map(dateTab)
    const today = todayJst()
    // 默认选中今天（JST）。今天不在会期内：会期前 → 选之后最近的一天；会期后 → 最后一天。
    const cur = p.dates.indexOf(today) >= 0 ? today
      : (p.dates.find(d => d >= today) || p.dates[p.dates.length - 1] || '')
    tabs.forEach(t => { t.isToday = t.date === today })
    this.setData({
      loading: false,
      festivalName: (data.festival && data.festival.name) || '東京国際映画祭',
      tabs,
      curDate: cur,
    })
    this.buildDay()
  },

  buildDay() {
    const p = this._p
    if (!p) return
    const { curDate, filter } = this.data
    const day = p.byDate[curDate] || {}
    let list = Object.keys(day).map(code => {
      const e = day[code]
      const f = p.films[e.idx]
      const shows = e.shows.slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
      return {
        idx: e.idx,
        code,
        titleJp: f.titleJp,
        titleCn: f.titleCn,
        category: f.category,
        catColor: f.catColor,
        premiere: f.premiere,
        meta: f.meta,
        thumb: f.thumb,
        isEvent: f.isEvent,
        scoreLabel: f.scoreLabel,
        scoreDisplay: f.scoreDisplay,
        ratingColor: f.ratingColor,
        first: shows[0] ? (shows[0].start || '99:99') : '99:99',
        shows,
      }
    })
    if (filter === 'film') list = list.filter(x => !x.isEvent)
    if (filter === 'event') list = list.filter(x => x.isEvent)
    list.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
    this.setData({ dayList: list, dayCount: list.length })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  onTabTap(e) {
    const date = e.currentTarget.dataset.date
    if (date === this.data.curDate) return
    this.setData({ curDate: date })
    this.buildDay()
  },

  onFilterTap(e) {
    const f = e.currentTarget.dataset.f
    if (f === this.data.filter) return
    this.setData({ filter: f })
    this.buildDay()
  },

  // 场次格子：有网售 → 复制购票链接；否则复制作品页
  onShowTap(e) {
    const { card, show } = e.currentTarget.dataset
    const item = this.data.dayList[card]
    const s = item && item.shows[show]
    if (!s) return
    const f = this._p.films[item.idx]
    if (s.ticketUrl) this.copyLink(s.ticketUrl, '购票')
    else this.copyLink(f.tiffUrl, 'TIFF 作品页')
  },

  onCardTap(e) {
    const f = this._p.films[e.currentTarget.dataset.idx]
    if (!f) return
    const shows = (f.screenings || []).map(s => {
      const st = showStatus(s)
      const t = dateTab(s.date)
      return Object.assign({}, s, { md: t.md, week: t.week, statusText: st.text, statusCls: st.cls })
    })
    this.setData({ detail: Object.assign({}, f, { shows }), showDetail: true })
  },

  closeDetail() {
    this.setData({ showDetail: false })
  },

  onDetailShowTap(e) {
    const s = this.data.detail.shows[e.currentTarget.dataset.i]
    if (s && s.ticketUrl) this.copyLink(s.ticketUrl, '购票')
    else this.copyLink(this.data.detail.tiffUrl, 'TIFF 作品页')
  },

  onCopyTiff() {
    this.copyLink(this.data.detail.tiffUrl, 'TIFF 作品页')
  },

  onCopyTrailer() {
    this.copyLink(this.data.detail.trailer, '预告片')
  },

  onCopyDouban() {
    const d = this.data.detail
    if (d.doubanId) this.copyLink(`https://movie.douban.com/subject/${d.doubanId}/`, '某瓣')
  },

  onThumbError(e) {
    // 外链海报挂了 → 退回 TIFF 剧照
    const i = e.currentTarget.dataset.card
    const item = this.data.dayList[i]
    if (!item) return
    const f = this._p.films[item.idx]
    if (item.thumb !== f.image) this.setData({ [`dayList[${i}].thumb`]: f.image })
  },

  noop() {},

  copyLink(url, label) {
    if (!url) return
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: `${label}链接已复制，可在浏览器打开`, icon: 'none', duration: 2500 })
      },
    })
  },

  onShareAppMessage() {
    return { title: '东京国际映画祭 TIFF 2026 排片表', path: '/pages/tiff/tiff' }
  },

  onShareTimeline() {
    return { title: '东京国际映画祭 TIFF 2026 排片表' }
  },
})
