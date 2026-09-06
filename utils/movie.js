// 地区 / 影院两个页面共用的电影数据处理。改规则只改这一处。

// 各地区包内本地兜底数据的懒加载表（云端拉取失败时用）。
const LOADERS = {
  saitama_city:     () => require('../data/saitama_city.js'),
  saitama_west:     () => require('../data/saitama_west.js'),
  saitama_south:    () => require('../data/saitama_south.js'),
  ikebukuro_north:  () => require('../data/ikebukuro_north.js'),
  ueno_joto:        () => require('../data/ueno_joto.js'),
  west_tokyo:       () => require('../data/west_tokyo.js'),
  shinjuku_shibuya: () => require('../data/shinjuku_shibuya.js'),
  city_center:      () => require('../data/city_center.js'),
  south_tokyo:      () => require('../data/south_tokyo.js'),
  chiba_northwest:  () => require('../data/chiba_northwest.js'),
  chiba_bay:        () => require('../data/chiba_bay.js'),
  chiba_south:      () => require('../data/chiba_south.js'),
  yokohama:         () => require('../data/yokohama.js'),
  kawasaki:         () => require('../data/kawasaki.js'),
  west_shonan:      () => require('../data/west_shonan.js'),
}

function ratingColor(score) {
  if (!score) return '#555'
  if (score >= 8.0) return '#4ade80'
  if (score >= 7.0) return '#fbbf24'
  if (score >= 6.0) return '#f97316'
  return '#f87171'
}

// 展示用评分：某瓣优先，其次映画（eiga 5 分制 ×2 换算到 10 分制）。
// { score:10分制数值, label:来源, display:原始分字符串 }
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

// mv.id 以 99999 开头 = eiga.com 未单独登记该片页面（只在影院排片页里出现），
// movie-theater/{id}/... 链接不存在，退回该影院当天排片页。
// theaterId 已是「地区id/区域id/影院id」格式（如 13/130301/3035）。
function eigaShowtimeUrl(movieId, theaterId) {
  return String(movieId).startsWith('99999')
    ? `https://eiga.com/theater/${theaterId}/`
    : `https://eiga.com/movie-theater/${movieId}/${theaterId}/`
}

module.exports = {
  LOADERS,
  ratingColor,
  scoreInfo,
  genreTags,
  eigaShowtimeUrl,
}
