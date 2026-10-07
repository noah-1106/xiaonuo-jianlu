#!/usr/bin/env python3
"""小诺简录 BLE 直连桥:卡片(NUS) ⇄ localhost 中枢。

用法:
    python3 tools/ble-bridge.py sync [--host 192.168.31.242:3000] [--mac BT_MAC]

流程(一次 sync):
  1. 扫描 XIAONUO_ 前缀设备并连接,订阅 NUS TX
  2. GET {hub}/api/records?status=pending → 分块推送清单到卡片
  3. 卡片上报待同步勾选 ids → 逐条 PUT /api/records/{id} → pdone
  4. 卡片上报离线语音槽位 → 逐槽拉分块组装 WAV → POST /api/device/capture
     → vdel(由卡片在完整收到后执行;本期桥确认上传成功后发送 vdel)
依赖: pip install bleak
"""
import argparse
import asyncio
import base64
import json
import struct
import sys
import urllib.request
import wave

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    print("请先安装 bleak: pip install bleak", file=sys.stderr)
    sys.exit(1)

NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"   # 桥→卡片(写)
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"   # 卡片→桥(通知)

RECORDS_PER_CHUNK = 2
VOICE_CHUNK = 180


class LineProto:
    """按 '\\n' 重组 NUS 通知为一行 JSON,匹配 request_id 分发。"""

    def __init__(self):
        self.buf = b""
        self.waiters = []   # list[asyncio.Future] 按 r 字段匹配
        self.custom_feeders = []   # list[callable(msg)->bool] 优先分发

    def feed(self, data: bytes):
        self.buf += data
        while b"\n" in self.buf:
            line, self.buf = self.buf.split(b"\n", 1)
            if not line.strip():
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                print(f"[桥] 无法解析: {line[:80]!r}", file=sys.stderr)
                continue
            for feeder in list(self.custom_feeders):
                try:
                    if feeder(msg):
                        break
                except Exception:
                    pass
            else:
                self._dispatch_waiter(msg)

    def _dispatch_waiter(self, msg):
        for i, fut in enumerate(self.waiters):
            if not fut.done() and self._match(msg, fut):
                fut.set_result(msg)
                self.waiters.pop(i)
                break
        else:
            self._on_unsolicited(msg)

    @staticmethod
    def _match(msg, fut):
        want = getattr(fut, "jianlu_want", None)
        if want is None:
            return True
        key, val = want
        return msg.get(key) == val

    def _on_unsolicited(self, msg):
        tag = msg.get("r", "?")
        if tag == "ready":
            print(f"[桥] 卡片就绪: 清单 {msg.get('cnt')} 条")
        elif tag == "vc":
            pass   # vget 的分块由收集器处理(见 collect_voice)
        else:
            print(f"[桥] 未请求的通知: {json.dumps(msg, ensure_ascii)[:100]}")

    async def request(self, client, line: dict, want=None, timeout=10):
        fut = asyncio.get_event_loop().create_future()
        if want is not None:
            fut.jianlu_want = want
        self.waiters.append(fut)
        payload = (json.dumps(line, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        await write_chunked(client, payload)
        return await asyncio.wait_for(fut, timeout)


async def write_chunked(client, payload: bytes):
    """按 MTU-3 分片逐段带响应写。

    - 不带响应写:macOS CoreBluetooth 流控会静默丢片(卡片收不到完整行);
    - 整段带响应写:超过 MTU-3 直接被 ATT 拒(Invalid Attribute Value Length)。
    所以这里手动分片 + 逐片确认;卡片侧 line_feed 按 '\\n' 重组,天然兼容。
    """
    mtu = client.mtu_size or 23
    chunk_sz = max(mtu - 3, 20)
    for i in range(0, len(payload), chunk_sz):
        await client.write_gatt_char(NUS_RX, payload[i:i + chunk_sz], response=True)


async def find_card(mac):
    print("[桥] 扫描 XIAONUO_ ...")
    for _ in range(20):
        devices = await BleakScanner.discover(timeout=2.0)
        for d in devices:
            if d.name and d.name.startswith("XIAONUO_"):
                if mac and mac.lower() not in d.address.lower():
                    continue
                print(f"[桥] 发现 {d.name} ({d.address})")
                return d
    return None


async def collect_voice(proto, client, slot):
    """逐块收集 slot 的语音分块,返回 PCM 字节。

    收集器作为常驻 waiter 挂在协议层:只认 (r=vc, slot=N) 的分块,
    按 seq 严格递增拼接,见到最后一个 seq 即完成。此前的实现依赖
    request() 的单条匹配,分块流会被当成未请求通知丢弃——已重写。
    """
    loop = asyncio.get_event_loop()
    done = loop.create_future()
    state = {"last": -1, "pcm": bytearray()}

    def feed_vc(msg):
        if msg.get("r") != "vc" or msg.get("slot") != slot:
            return False
        seq = msg["seq"]
        if seq == state["last"] + 1:
            state["pcm"].extend(base64.b64decode(msg["data"]))
            state["last"] = seq
        if state["last"] + 1 >= msg["total"] and not done.done():
            done.set_result(bytes(state["pcm"]))
        return True

    proto.custom_feeders.append(feed_vc)
    try:
        await write_chunked(
            client, b'{"c":"vget","slot":%d}\n' % slot)
        # indication 逐条 ACK,实测 ~140ms/块(535 块 ≈ 75s),给足余量
        return await asyncio.wait_for(done, 300)
    finally:
        proto.custom_feeders.remove(feed_vc)


def wav_from_pcm(pcm: bytes) -> bytes:
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm)
    return buf.getvalue()


def hub_get(base, path):
    with urllib.request.urlopen(base + path, timeout=10) as r:
        return json.loads(r.read())


def hub_put(base, path, obj):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(base + path, data=data, method="PUT",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()


def hub_post_audio(base, wav: bytes):
    req = urllib.request.Request(base + "/api/device/capture", data=wav,
                                method="POST",
                                headers={"Content-Type": "audio/wav"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"raw": body[:200].decode(errors="replace")}


async def run_sync(args):
    dev = await find_card(args.mac)
    if dev is None:
        print("[桥] 未发现 XIAONUO_ 设备(卡片是否已开直连模式?)", file=sys.stderr)
        sys.exit(1)

    hub = f"http://{args.host}"
    proto = LineProto()

    async with BleakClient(dev.address, timeout=15) as client:
        print(f"[桥] 已连接 {dev.name}, MTU={client.mtu_size}")
        await client.start_notify(NUS_TX, lambda _, d: proto.feed(d))
        await asyncio.sleep(0.5)

        # 1) 推清单
        data = hub_get(hub, "/api/records?status=pending&pageSize=20")
        records = data.get("records", [])
        total_chunks = (len(records) + RECORDS_PER_CHUNK - 1) // RECORDS_PER_CHUNK or 1
        if not records:
            await proto.request(client, {"c": "reset"})
        for seq in range(total_chunks):
            chunk = records[seq * RECORDS_PER_CHUNK
                            :(seq + 1) * RECORDS_PER_CHUNK] if records else []
            line = {"c": "records", "total": total_chunks, "seq": seq,
                    "records": chunk}
            await proto.request(client, line)
        print(f"[桥] 清单推送完成: {len(records)} 条 / {total_chunks} 块")

        # 2) 勾选同步
        resp = await proto.request(client, {"c": "plist"})
        ids = resp.get("ids", [])
        for rid in ids:
            hub_put(hub, f"/api/records/{rid}", {"status": "completed"})
            await proto.request(client, {"c": "pdone", "id": str(rid)})
            print(f"[桥] 勾选已同步: {rid}")

        # 3) 离线语音
        resp = await proto.request(client, {"c": "vlist"})
        slots = resp.get("slots", [])
        for slot in slots:
            print(f"[桥] 拉取语音槽 {slot} ...")
            pcm = await collect_voice(proto, client, slot)
            wav = wav_from_pcm(pcm)
            print(f"[桥] 槽 {slot}: {len(pcm)} PCM → POST 中枢")
            try:
                result = hub_post_audio(hub, wav)
            except urllib.error.HTTPError as e:
                # 中枢侧 ASR/LLM 偶发 5xx:槽保留,下轮同步再试,不阻断其余槽
                print(f"[桥] 槽 {slot} 中枢 {e.code},保留待下轮")
                continue
            print(f"[桥] 中枢响应: {json.dumps(result, ensure_ascii=False)[:120]}")
            await proto.request(client, {"c": "vdel", "slot": slot})

        print("[桥] 同步完成")


def main():
    ap = argparse.ArgumentParser(description="小诺简录 BLE 直连桥")
    ap.add_argument("command", choices=["sync"], help="sync = 完整同步一轮")
    ap.add_argument("--host", default="192.168.31.242:3000", help="中枢 host:port")
    ap.add_argument("--mac", default=None, help="本机蓝牙适配器 MAC(可选)")
    args = ap.parse_args()
    asyncio.run(run_sync(args))


if __name__ == "__main__":
    main()
