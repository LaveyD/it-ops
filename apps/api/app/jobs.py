"""后台采集任务：collector → 写库 →（M4）广播。"""
import time

from sqlalchemy import select

from .collectors import get_collector
from .db import SessionLocal
from .models import Alert, Device, DeviceMetric


async def run_collection() -> None:
    db = SessionLocal()
    try:
        dev_ids = [i for i in db.execute(select(Device.id)).scalars()]
        if not dev_ids:
            return
        collector = get_collector(dev_ids)
        batch = collector.collect()

        for m in batch["metrics"]:
            db.add(DeviceMetric(device_id=m["device_id"], metric=m["metric"],
                                ts=time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(m["ts"])),
                                value=m["value"]))
        for a in batch["alerts"]:
            db.add(Alert(device_id=a.get("device_id"), level=a["level"],
                         title=a["title"], detail=a.get("detail")))
        for st in batch["statuses"]:
            d = db.get(Device, st["device_id"])
            if d:
                d.status = st["status"]
        db.commit()
    finally:
        db.close()
