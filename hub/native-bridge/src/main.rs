// 小诺简录 BLE 直连中继:卡片(NUS) ⇄ stdio。
// 职责边界:本程序只做"蓝牙字节流 ⇄ 标准输入输出",协议与业务逻辑
// 全在中枢 Node 侧(src/bridge.js)——保持单一实现。
//
// 行为:
//   stdout = 卡片 NUS TX 通知的原始字节(按 \n 重组 JSON 行由 Node 负责)
//   stdin  = Node 写入的 JSON 行(本程序按 128B 分片、带响应写入 NUS RX)
//   stderr = 运行日志(连接/断开/重扫)
// 断线自动重扫 XIAONUO_ 前缀设备,永久运行直至 stdin 关闭或被 kill。

use btleplug::api::{
    BDAddr, CharPropFlags, Characteristic, Central, Manager as _, Peripheral as _, ScanFilter,
    WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::stream::StreamExt;
use std::io::{Read, Write};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use uuid::{uuid, Uuid};

const NUS_RX: Uuid = uuid!("6e400002-b5a3-f393-e0a9-e50e24dcca9e"); // 中继→卡片(写)
const NUS_TX: Uuid = uuid!("6e400003-b5a3-f393-e0a9-e50e24dcca9e"); // 卡片→中继(通知)
const CHUNK: usize = 128; // MTU-3 的保守分片(btleplug 不暴露协商 MTU)
const NAME_PREFIX: &str = "XIAONUO_";

fn log(msg: &str) {
    eprintln!("[relay] {msg}");
}

async fn find_adapter() -> Adapter {
    loop {
        let manager = Manager::new().await.expect("无法初始化蓝牙管理器");
        if let Some(a) = manager.adapters().await.ok().and_then(|v| v.into_iter().next()) {
            return a;
        }
        log("未找到蓝牙适配器,5s 后重试");
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

// 扫描直到发现 XIAONUO_ 前缀设备(每轮扫 3s,间隙 2s)
async fn find_card(adapter: &Adapter) -> Peripheral {
    loop {
        let _ = adapter.stop_scan().await;
        match adapter.start_scan(ScanFilter::default()).await {
            Ok(()) => {}
            Err(e) => {
                log(&format!("启动扫描失败: {e:?}, 5s 后重试"));
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while std::time::Instant::now() < deadline {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(peripherals) = adapter.peripherals().await {
                for p in peripherals {
                    if let Ok(Some(props)) = p.properties().await {
                        if let Some(name) = &props.local_name {
                            if name.starts_with(NAME_PREFIX) {
                                let _ = adapter.stop_scan().await;
                                log(&format!("发现 {name}"));
                                return p;
                            }
                        }
                    }
                }
            }
        }
        log("扫描 3s 未见卡片,继续");
    }
}

fn find_char(peripheral: &Peripheral, uuid: Uuid, want: CharPropFlags) -> Option<Characteristic> {
    peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid && c.properties.contains(want))
}

// 写入端:stdin 行 → 分片带响应写 NUS RX
async fn writer_task(
    peripheral: Peripheral,
    mut rx: mpsc::Receiver<Vec<u8>>,
) -> Result<(), String> {
    while let Some(line) = rx.recv().await {
        log(&format!("写 {} 字节", line.len()));
        for chunk in line.chunks(CHUNK) {
            // 带响应写:不带响应会被 macOS CoreBluetooth 流控静默丢弃(E2E 实测)
            if let Err(e) = peripheral
                .write(&find_char(&peripheral, NUS_RX, CharPropFlags::WRITE | CharPropFlags::WRITE_WITHOUT_RESPONSE).expect("NUS RX 消失"), chunk, WriteType::WithoutResponse)
                .await
            {
                log(&format!("写入失败: {e:?}"));
                return Err(format!("写入失败: {e:?}"));
            }
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    log("启动,扫描 XIAONUO_ ...");
    // stdin 阻塞读在独立线程,行 → 当前会话的 Sender(会话重建时整体替换)
    let current_tx: std::sync::Arc<tokio::sync::Mutex<Option<mpsc::Sender<Vec<u8>>>>> =
        std::sync::Arc::new(tokio::sync::Mutex::new(None));
    {
        let current_tx = current_tx.clone();
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let mut stdin = std::io::stdin();
            let mut chunk = [0u8; 4096];
            loop {
                match stdin.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        buf.extend_from_slice(&chunk[..n]);
                        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                            let mut line: Vec<u8> = buf.drain(..=pos).collect();
                            line.pop(); // 去掉 \n
                            if line.is_empty() { continue; }
                            // 无会话时丢弃输入(卡片未连接,业务层自会重试)
                            if let Some(tx) = current_tx.blocking_lock().as_ref() {
                                let _ = tx.try_send(line);
                            }
                        }
                    }
                }
            }
            log("stdin 已关闭");
        });
    }

    loop {
        let adapter = find_adapter().await;
        let card = find_card(&adapter).await;
        let addr: BDAddr = card.address();
        let (stx, srx) = mpsc::channel::<Vec<u8>>(64);
        *current_tx.lock().await = Some(stx);
        match run_session(card, srx).await {
            Ok(()) => log("会话正常结束"),
            Err(e) => log(&format!("会话结束: {e}")),
        }
        *current_tx.lock().await = None;
        log(&format!("重扫 {addr} ..."));
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

// 一次连接会话:连接 → 订阅 TX → 双向泵;断开即返回
async fn run_session(card: Peripheral, rx: mpsc::Receiver<Vec<u8>>) -> Result<(), String> {
    card.connect().await.map_err(|e| format!("连接失败: {e:?}"))?;
    // CoreBluetooth 异步完成需要轮询 is_connected
    for _ in 0..20 {
        if card.is_connected().await.unwrap_or(false) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    if !card.is_connected().await.unwrap_or(false) {
        return Err("连接超时".into());
    }
    card.discover_services().await.map_err(|e| format!("发现服务失败: {e:?}"))?;
    let tx_char = find_char(&card, NUS_TX, CharPropFlags::NOTIFY)
        .ok_or("未找到 NUS TX 特征")?;
    // btleplug/CoreBluetooth 顺序坑:通知流必须先建,再 subscribe,否则事件丢失
    let mut notifications = card.notifications().await.map_err(|e| format!("通知流失败: {e:?}"))?;
    card.subscribe(&tx_char).await.map_err(|e| format!("订阅失败: {e:?}"))?;
    log("已连接并订阅,开始转发");

    let writer = tokio::spawn(writer_task(card.clone(), rx));

    let session_card = card.clone();
    let mut watcher = tokio::spawn(async move {
        loop {
            if !session_card.is_connected().await.unwrap_or(true) {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });

    let mut out = tokio::io::stdout();
    let result: Result<(), String> = loop {
        tokio::select! {
            n = notifications.next() => match n {
                Some(data) => {
                    if out.write_all(&data.value).await.is_err() {
                        break Err("stdout 关闭".into());
                    }
                    let _ = out.flush().await;
                }
                None => break Err("通知流结束(断线)".into()),
            },
            _ = &mut watcher => break Err("连接已断开".into()),
        }
    };
    writer.abort();
    let _ = card.unsubscribe(&tx_char).await;
    let _ = card.disconnect().await;
    result
}
