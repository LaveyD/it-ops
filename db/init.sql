-- it-ops 建库脚本（以 postgres 超级用户执行：psql -f db/init.sql）
-- 幂等：重复执行不报错

-- 应用角色
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'it_ops') THEN
    CREATE ROLE it_ops LOGIN PASSWORD 'itops2026';
  END IF;
END
$$;

-- 数据库
SELECT 'CREATE DATABASE it_ops OWNER it_ops'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'it_ops')\gexec

GRANT ALL PRIVILEGES ON DATABASE it_ops TO it_ops;
