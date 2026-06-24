# 月亮狼人杀 · Moon Werewolf

单人 AI 对战的狼人杀游戏，由 AI 扮演其他玩家，与你共同完成一局完整的狼人杀对局。

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8) ![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能特性

- **完整对局流程**：夜晚（预言家/女巫/狼人）→ 白天（警长选举/发言/投票）→ 结算
- **多角色支持**：平民、狼人、预言家、女巫、猎人、白狼王、守卫等
- **AI 玩家**：基于 z-ai-web-dev-sdk (GLM) 的智能体，具备并发控制与速率限制韧性（指数退避重试 + 后备决策）
- **昼夜过渡动画**：沉浸式昼夜切换动效
- **AI 状态指示**：实时显示 AI 思考/发言/决策状态
- **响应式 UI**：基于 shadcn/ui + Framer Motion，移动端与桌面端适配

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + Turbopack |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS 4 + shadcn/ui (New York) |
| 动画 | Framer Motion |
| 数据库 | Prisma ORM (SQLite) |
| AI | z-ai-web-dev-sdk (GLM) |
| 包管理 | Bun |

## 🚀 快速开始

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env

# 初始化数据库
bun run db:push

# 启动开发服务器
bun run dev
```

访问 `http://localhost:3000` 开始游戏。

## 📁 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/werewolf/       # 游戏相关 API 路由
│   └── page.tsx            # 主入口
├── components/
│   ├── ui/                 # shadcn/ui 组件
│   └── werewolf/           # 狼人杀游戏组件
└── lib/
    ├── werewolf/           # 游戏核心逻辑（状态机、类型、配置）
    └── db.ts               # Prisma 客户端
prisma/
└── schema.prisma           # 数据库 Schema
```

## 📄 许可证

MIT
