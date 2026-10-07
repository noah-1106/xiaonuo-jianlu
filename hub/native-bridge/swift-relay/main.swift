// 小诺简录 BLE 直连中继(macOS 原生 Swift/CoreBluetooth 版)
// 契约与 Rust 版一致:stdout=卡片通知原始字节;stdin=JSON 行(分片写入);
// stderr=日志。断线自动重扫。
// 说明:btleplug 在 macOS 的写路径存在数据静默丢失(deviceplug/btleplug
// 已知问题),bleak(同样包 CoreBluetooth)工作正常,故 macOS 直接用原生。

import Foundation
import CoreBluetooth

let NUS_SERVICE = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
let NUS_RX = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // 中继→卡片(写)
let NUS_TX = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // 卡片→中继(通知)
let CHUNK = 128

func log(_ msg: String) { FileHandle.standardError.write(("[relay] " + msg + "\n").data(using: .utf8)!) }

final class Relay: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var manager: CBCentralManager!
    var peripheral: CBPeripheral?
    var rxChar: CBCharacteristic?
    var txChar: CBCharacteristic?
    var lineBuf = Data()

    override init() {
        super.init()
        manager = CBCentralManager(delegate: self, queue: nil)
    }

    // ---- 生命周期 ----
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            log("蓝牙就绪,扫描 XIAONUO_ ...")
            central.scanForPeripherals(withServices: nil)
        } else {
            log("蓝牙不可用(state=\(central.state.rawValue)),5s 后重试")
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                if let s = self, s.manager.state == .poweredOn { s.manager.scanForPeripherals(withServices: nil) }
            }
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard let name = peripheral.name, name.hasPrefix("XIAONUO_") else { return }
        central.stopScan()
        self.peripheral = peripheral
        peripheral.delegate = self
        log("发现 \(name)")
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([NUS_SERVICE])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        log("连接失败: \(error.map(String.init(describing:)) ?? "?")")
        rescan()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        log("断开,重扫")
        self.peripheral = nil
        rxChar = nil
        txChar = nil
        rescan()
    }

    func rescan() {
        guard manager.state == .poweredOn else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.manager.scanForPeripherals(withServices: nil)
        }
    }

    // ---- 服务/特征 ----
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == NUS_SERVICE }) else {
            log("未找到 NUS 服务")
            manager.cancelPeripheralConnection(peripheral)
            return
        }
        peripheral.discoverCharacteristics([NUS_RX, NUS_TX], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for c in service.characteristics ?? [] {
            if c.uuid == NUS_RX { rxChar = c }
            if c.uuid == NUS_TX { txChar = c }
        }
        guard let tx = txChar else {
            log("未找到 NUS TX")
            manager.cancelPeripheralConnection(peripheral)
            return
        }
        peripheral.setNotifyValue(true, for: tx)
        log("已连接并订阅,开始转发")
    }

    // ---- 卡片→stdout ----
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        FileHandle.standardOutput.write(data)
    }

    // ---- stdin→卡片(分片带响应写) ----
    func feed(_ data: Data) {
        lineBuf.append(data)
        while let nl = lineBuf.firstIndex(of: 0x0A) {
            let line = lineBuf[lineBuf.startIndex..<nl]
            lineBuf.removeSubrange(lineBuf.startIndex...nl)
            guard !line.isEmpty else { continue }
            writeLine(Data(line))
        }
    }

    func writeLine(_ line: Data) {
        guard let p = peripheral, let c = rxChar else { return }
        var framed = line
        framed.append(0x0A)   // 协议按 \n 分帧:卡片解析器等行结束符才分发命令
        for chunk in stride(from: 0, to: framed.count, by: CHUNK).map({ framed.subdata(in: $0..<min($0 + CHUNK, framed.count)) }) {
            // .withoutResponse 会被 CoreBluetooth 流控丢弃(E2E 实测),必须带响应
            p.writeValue(chunk, for: c, type: .withResponse)
        }
        log("写 \(line.count) 字节")
    }
}

let relay = Relay()

// stdin 独立线程读,转主线程 feed(CoreBluetooth 回调在主 RunLoop)
Thread.detachNewThread {
    let bufSize = 4096
    var buf = [UInt8](repeating: 0, count: bufSize)
    while true {
        let n = read(0, &buf, bufSize)
        if n <= 0 { log("stdin 已关闭"); break }
        let data = Data(buf[0..<n])
        DispatchQueue.main.sync { relay.feed(data) }
    }
}

RunLoop.main.run()
