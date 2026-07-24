# FormFit AI · 口袋里的 AI 力量私教（Web Demo）

用摄像头实时看懂力量训练动作并纠错的 Web Demo，验证「AI 动作识别与纠正」核心价值。全部推理在浏览器端侧完成，画面不上传。

## 功能

- **实时相机训练**（`/#/live/:exerciseId?`）：机位校准 → 倒计时 → 实时计数 / 深度计 / 纠错横幅 + 语音播报 → 组后总结（质量分、每次得分、主要问题 Top3）
- **视频动作分析**（`/#/video`）：上传 mp4/mov/webm，逐帧采样分析，输出统计卡、骨骼叠加回放、主角度时间轴、rep 评分列表与问题汇总
- 5 个动作：深蹲、俯卧撑、硬拉、弓步蹲、站姿推举，共 15 条纠错规则 + 每动作 1 条深度判定

## 运行

```bash
npm install
npm run dev        # 桌面开发：http://localhost:5173
```

### 手机访问（摄像头需要安全上下文）

```bash
npm run dev:mobile # HTTPS + 局域网监听
```

手机与电脑连同一 Wi-Fi，浏览器打开终端里显示的 Network 地址（形如 `https://192.168.x.x:5173`），首次访问会提示证书不受信任（自签名证书），选择「继续访问」即可。

## 技术栈

- Vite 8 + React 19 + TypeScript + Tailwind CSS 3.4 + react-router-dom 7（HashRouter）
- 姿态估计：MediaPipe BlazePose（`@mediapipe/tasks-vision`，pose_landmarker_full，33 关键点，GPU delegate，VIDEO 模式）
- 算法流水线：关键点 → OneEuro 滤波 + 置信度门控(0.4) → 关节角度（门控 0.35）→ 状态机计数 + 规则引擎纠错（每条规则 3s 冷却）+ DTW-lite 模板相似度
- 语音反馈：Web Speech API（speechSynthesis，zh-CN，规则级 3s 冷却 / 全局 1.2s 间隔）
- 训练记录：localStorage（`formfit.sessions`）

## 资源文件

- `public/models/pose_landmarker_full.task` — BlazePose full 模型（9,398,198 字节，已校验完整）
- `public/wasm/` — 从 `@mediapipe/tasks-vision/wasm` 复制的 WASM 运行时，代码中通过 `FilesetResolver.forVisionTasks(BASE_URL + 'wasm')` 加载

## 构建

```bash
npm run build      # tsc --noEmit + vite build
```

## 说明与限制

- 桌面浏览器使用摄像头同样需要权限；权限被拒会展示引导 UI
- DTW 模板采用完整 rep 的余弦轮廓（start→target→start，32 点重采样，Sakoe-Chiba 窗 8）
- 视频分析按 1/12s 步进采样（超过 400 帧自动加大步长）
- 演示数据区（今日计划、肌群恢复环）为静态展示数据，已标注「演示数据」
