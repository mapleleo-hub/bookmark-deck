# status

## 当前进度
- MV3 扩展可用：新标签页以 `chrome.bookmarks` 为唯一数据源，左侧分页 = 书签栏一级文件夹，图标 = 书签条目，文件夹卡片 = 子文件夹。
- 分页侧栏：竖排列表、首字头像、条目计数、选中态、右键重命名/上移/下移/删除、底部新建分页、可收起成 68px 窄条（偏好持久化）、拖图标到分页即移动。
- 已实现：网格渲染、favicon（`_favicon` API + 首字母回落）、拖拽排序与跨组移动、拖入文件夹、右键编辑/删除、新增、Ctrl+K 搜索、文件夹弹层与面包屑、壁纸与明暗主题、图标尺寸、空分组开关、书签根切换。
- 书签事件监听：`onCreated / onRemoved / onChanged / onMoved / onChildrenReordered / onImportEnded` 触发重载。
- 验证方式：用与真实 Chrome 书签同构的数据（本机 185 条快照）在 headless Chrome 里渲染，走了演示与 API 两条代码路径，截图确认布局。
- 未验证：以"加载已解压扩展"方式在真实 Chrome 中打开 `chrome://newtab`（headless 下扩展页未成功加载，`ERR_BLOCKED_BY_CLIENT`），需要用户装一次确认。

## 下一步
- 分页栏拖拽排序（目前只能右键上移下移）。
- 用户装上后若有渲染或权限问题，按控制台报错修。
- 可选：图标包（manifest `icons`）、搜索结果按分组聚合展示、书签根为"移动设备书签"时的图标回退。

## 已知坑
- `.tabs` 用 `display:flex` + `overflow-x:auto` 时，默认 `align-items:stretch` 会把标签按钮拉到容器高度（实测 102px），必须显式 `align-items:center`。
- `.modal/.drawer/.overlay` 用了 `display:grid`，会覆盖 `[hidden]` 的默认样式，CSS 里必须补 `[hidden]{display:none!important}`，否则首屏就弹出两个面板。
- `body` 有背景色时会在自身盒子范围内盖住 `position:fixed; z-index:-1` 的壁纸层，产生横向接缝；改成 `body{background:transparent}` 才能铺满视口。
- 书签数据没有坐标字段，自由摆放做不到，只能网格排序，这是路线选择不是缺陷。

## 决策记录
- 2026-11-16 不用 HumbleNewTabPage（783 star，MIT，同样以真实书签为源）。理由：它的布局是分栏文本列表，没有 iTab 的图标网格与壁纸，改造量接近重写。
- 2026-11-16 不做数据副本。所有读写直接落在 `chrome.bookmarks`，因此不存在合并冲突与双写问题，代价是放弃自由摆放与自定义图标。
- 2026-11-16 分页从顶部分组标签改为左侧竖排栏。理由：用户要的是 iTab 的左侧分页形态；竖排也不受数量限制，16 个分页不需要横向滚动。
- 2026-11-16 空分页默认显示（旧版顶栏时默认隐藏）。理由：侧栏竖排不会挤压布局，且空分页是用户准备往里加东西的占位。
- 2026-11-16 文件夹计数从右上角浮动徽标改为名称后缀（`aigc 15`）。理由：徽标挂在 tile 角落，实际落在卡片外的空白处，视觉上像错位。
