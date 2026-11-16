# CRI Lab — 光谱显色指数在线实验台

一个纯前端单页：**拖动光谱曲线（或调 13 路通道计数）→ 实时算出 CIE 13.3-1995 的 Ra 与 R1–R12**，
并把 12 块标准色样在「测试光源 / 参考光源」下的颜色直接渲染成色块，肉眼就能看出显色好坏。

- 算法：CIE 13.3-1995，CIE 1931 2° 观察者，CIE 1964 U\*V\*W\* + von Kries 色适应
- 校验：与 `colour-science 0.4.7` 的 `colour_rendering_index` 逐项对齐，误差 ≤ 0.1
- 依赖：0（无框架、无构建、无后端、无外链字体）
- 体积：~54 KB（未压缩），gzip 后 ~19 KB

## 页面里有什么

| 模块 | 说明 |
|---|---|
| 光谱编辑器 | 抓住曲线上下拖动即改；7 个预设（白光 LED、2700K/4000K 黑体、D65、荧光灯 FL2、RGB 窄带、照片实测曲线） |
| 14 通道 counts | 13 根滑杆 → 用**示例矩阵**反解 SPD（`min‖C·w − n‖² + λ‖D₂·Mᵀw‖², w ≥ 0`，Lawson–Hanson NNLS），显示重建残差 |
| 实时结果 | Ra、CCT、Duv、参考光源类型、|Duv| > 0.0054 的适用性警告 |
| 色块对比 | 上排＝测试光源下、下排＝参考光源下，Bradford 适应到 D65 后渲染 sRGB；每块附 ΔE |
| 明细 | R1–R12 条形图 + ΔE；R9–R12 单独分组（不参与 Ra） |
| 导出 | 当前 SPD → CSV；当前结果 → JSON |

## 算法

```
k   = 100 / Σ S(λ)·ȳ(λ)·Δλ          # 理想白板 Y=100，每个光源各自求一次
XYZ = k·Σ S·CMF·Δλ
u,v = 4X/(X+15Y+3Z), 6Y/(X+15Y+3Z)  # CIE 1960 UCS
T   = argmin_T ‖uv − uv_planck(T)‖  # 1000–100000 K
ref = T < 5000 ? Planck(T) : CIE D(T)
c = (4−u−10v)/v ; d = (1.708v+0.404−1.481u)/v
u_k = (10.872 + 0.404·(c_r/c_t)·c_k − 4·(d_r/d_t)·d_k) / (16.518 + 1.481·(c_r/c_t)·c_k − (d_r/d_t)·d_k)
v_k = 5.520 / 分母
W* = 25·Y^(1/3) − 17 ; U* = 13W*(u−u_r) ; V* = 13W*(v−v_r)
ΔE = √(ΔU*²+ΔV*²+ΔW*²) ; Rᵢ = 100 − 4.6·ΔE ; Ra = mean(R1…R8)
```

**坑**：不要把每块色样各自归一化到 Y=100 —— 那样 Ra 会从 64 掉到 43（FL2）。k 必须由光源求一次，色样共用。

### 校验

| 光源 | Ra | R9 |
|---|---|---|
| 黑体 2856 K (A) | 100.00 | 100.0 |
| D65 | 99.99 | 100.0 |
| FL2 | 64.16 | −83.9 |
| FL11 | 82.83 | 25.2 |
| 照片实测曲线（380–900 nm 数字化） | 88.68 | 48.5 |

与 Python 版 `/xhs_spectrometer/cri/cri.py` 和 `colour-science` 三者一致（≤0.1/项）。

## 本地运行

```bash
python3 -m http.server 8080   # 然后打开 http://127.0.0.1:8080
# 或
docker build -t cri-demo . && docker run --rm -p 8080:80 cri-demo
```

不需要 Node、不需要打包。

## 部署到 Dokploy

1. Dokploy → **Create Application** → 选 GitHub 仓库 `Dakai/cri-demo`，Build Type 选 **Dockerfile**（或 Compose，用仓库里的 `docker-compose.yml`）。
2. **Domains** → Add Domain：
   - Host：`cri.oudakai.dev`
   - Service：`web`（Compose）或容器名（Dockerfile 应用）
   - Container Port：`80`
   - 勾选 **HTTPS** + **Let's Encrypt**
3. DNS：在 Cloudflare 给 `oudakai.dev` 加一条 A 记录
   `cri` → `212.47.68.180`（host `con`），**代理状态选 DNS only（灰云）**，
   让 Traefik 自己申请证书；等证书签发后可再打开橙云。

健康检查端点：`/healthz` → `200 ok`。

## 目录

```
index.html      页面结构
style.css       主题（深色、无外链字体）
app.js          UI / 画布 / 交互
cri.js          CIE 13.3-1995 核心 + NNLS + sRGB 渲染（浏览器与 node 共用）
data.js         CIE 1931 2° CMF、14 块色样反射比、D 系列基函数（5 nm / 380–780）
Dockerfile      nginx:alpine 静态站点
docker-compose.yml
nginx.conf      gzip、缓存头、/healthz
```

## 限制（页面上也写着）

- **示例矩阵是数据手册中心波长/FWHM 的高斯近似**，不是逐台实测的标定矩阵；真实设备的 `C` 必须用单色仪扫。
- **RAW counts ≠ SPD**：探测器响应度会把曲线整体压斜。对同一束光，去掉响应度后 CCT 从 5623 K 变到 7735 K，而 Ra 只从 88.7 到 89.4 —— 色温对响应度敏感，Ra 不敏感。
- Ra 只对接近普朗克轨迹的光源有效（|Duv| ≲ 0.0054）；彩色光、窄带 RGB、激光请用 TM-30 Rf/Rg 或分光计。
- 13 个宽通道（FWHM 28–123 nm）无法还原线状谱，counts 模式对荧光灯/激光的残差会明显变大。
