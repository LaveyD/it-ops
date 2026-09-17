# it-ops 内网部署（Ubuntu 24.04，有 pip/npm 源）

包内容：apps/api（后端源码+alembic+tests）、apps/web（dist 构建产物 + 源码，不含 node_modules）、
db/init.sql（建库脚本）、deploy/nginx-itops.conf（Nginx 配置模板）、.env.example

> 前端已在本机构建好 dist（commit 115c0c3），内网直接用，**无需 npm install / 构建**。
> 如需改前端再构建：`cd apps/web && npm install && npm run build`（走内网 npm 源）。

端口约定：后端 8110 · Nginx 生产入口 8041（如被占用，改 conf 里 listen 即可）。

## 部署步骤（逐步执行，每步有预期输出）

### 0. 放置
```bash
mkdir -p /data/project/dct && cd /data/project/dct
# 上传 it-ops-deploy-<date>.tar.gz 到本机后：
tar xzf it-ops-deploy-<date>.tar.gz && cd it-ops
```
预期：目录里有 apps/ db/ deploy/ README.md。

### 1. 数据库（需要 PG 超级用户执行建库，一次）
```bash
sudo -u postgres psql -f db/init.sql
```
预期：CREATE ROLE / CREATE DATABASE，无 ERROR。重复执行不报错（幂等）。
- 库 it_ops / 角色 it_ops / 密码 itops2026（写在 init.sql，生产建议改后同步改 .env）
- 默认监听 127.0.0.1:23432；若本机 PG 端口不同，改 .env 的 DATABASE_URL。

### 2. 后端 venv + 依赖
```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install "fastapi>=0.111" "uvicorn[standard]>=0.30" "sqlalchemy>=2.0" \
  "alembic>=1.13" "psycopg[binary]>=3.1" "pydantic>=2.7" "pydantic-settings>=2.2" \
  "pyjwt>=2.8" "bcrypt>=5.0.0" "httpx>=0.27"
```
预期：Successfully installed ...（走内网 pip 源）。
> httpx 是通知框架 webhook 的运行时依赖，别漏（漏了 uvicorn 启动报 ModuleNotFoundError）。

### 3. 环境变量（注意放 apps/api/ 下，不放根目录——config 按工作目录找 .env）
```bash
cd apps/api
cp ../.env.example .env
# 用文本编辑器改 JWT_SECRET（随机长串）和 ADMIN_PASSWORD（管理员密码）
# JWT_SECRET 生成：openssl rand -hex 32
# DATABASE_URL 保持默认即指向 127.0.0.1:23432
```
管理员账号 admin，密码 = 你填的 ADMIN_PASSWORD。

### 4. 建表 + 种子
```bash
cd apps/api
unset DATABASE_URL   # 防止 shell 残留环境变量覆盖 .env
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
```
预期：alembic 输出 `Running upgrade  -> <rev>`；seed 输出「已创建管理员 admin」等（首次）。

### 5. 启动后端（systemd）
```bash
sudo tee /etc/systemd/system/it-ops-api.service > /dev/null <<'EOF'
[Unit]
Description=it-ops API
After=network.target postgresql.service

[Service]
WorkingDirectory=/data/project/dct/it-ops/apps/api
ExecStart=/data/project/dct/it-ops/apps/api/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8110
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now it-ops-api
```
预期：`systemctl status it-ops-api` active (running)。

验证：
```bash
curl -s http://127.0.0.1:8110/api/health
```
预期：`{"ok":true}`

### 6. Nginx
```bash
# 改 deploy/nginx-itops.conf 里的 root 路径为实际路径（默认已是 /data/project/dct/it-ops/apps/web/dist）
sudo cp deploy/nginx-itops.conf /etc/nginx/conf.d/itops.conf
sudo nginx -t && sudo nginx -s reload
```
预期：nginx -t syntax is ok / test is successful，RELOADED。
（大量 mime.types duplicate 警告为历史遗留，无害。）

### 7. 访问
- 浏览器开 `http://<内网IP>:8041` → /login
- 登录 admin + 你在第 3 步设的密码
- 大屏 /dashboard（支持 2D/3D 切换）· 后台 /admin（拓扑编辑 /admin/network/topology、3D 预览 /admin/network/topo3d、3D 机房 /admin/twin/room）

## 升级（后续发版）
本机重新打包 dist 后内网只需：
```bash
cd /data/project/dct && tar xzf it-ops-deploy-<新日期>.tar.gz   # 覆盖
# 后端有改动才需要：
cd it-ops/apps/api && .venv/bin/alembic upgrade head && sudo systemctl restart it-ops-api
```

## 备注
- 采集当前为 mock（.env COLLECTOR=mock），数据每 5s 随机游走，演示足够。
- 后端 62 条 pytest 全过（含 2D/3D 拓扑、保存语义、WS 广播）。
- 大屏免密：管理端可给 viewer 角色发 screen-token（/api/auth/screen-token），无需改。
