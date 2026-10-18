// 元宝本机桥接（Yuanbao Bridge）
//
// 元宝 App（com.tencent.yuanbao）是 Tauri/WKWebView 应用：没有本地 HTTP
// API、没有开放 URL Scheme 路由、不监听任何端口。唯一可用的自动化通道
// 是 macOS 辅助功能（Accessibility）——它的 AX 树完整暴露了输入区、
// 发送按钮、AI 生图技能开关、生成结果标记与图片查看器窗口。
//
// 本程序是一个「AX 远程控制」常驻进程：
// - 只监听 127.0.0.1，不对外暴露；
// - 暴露通用原语（dump / query / act / key / click）供排障与流程迭代；
// - 暴露 OpenAI 兼容的 POST /v1/images/generations，把「写提示词 →
//   发送 → 等待出图 → 读取 IndexedDB originUrl」串成一次调用，产物经 GET
//   /v1/images/<id> 回传字节。
//
// 之所以是独立 .app 而不是脚本：AX 权限按代码签名授予进程，普通 CLI
// 进程（Node / shell 子进程）拿不到 TCC 授权；只有经 LaunchServices
// 启动的、被加入「辅助功能」列表的 .app 才稳定持有该权限。

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import Network
import SQLite3

// MARK: - 常量

let yuanbaoBundleId = "com.tencent.yuanbao"
let viewerBundleId = yuanbaoBundleId
let supportDir: URL = {
  let base = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/YuanbaoBridge", isDirectory: true)
  try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
  return base
}()
let imageDir = supportDir.appendingPathComponent("images", isDirectory: true)
let logURL = supportDir.appendingPathComponent("bridge.log")

let keyV: CGKeyCode = 0x09
let keyA: CGKeyCode = 0x00
let keyReturn: CGKeyCode = 0x24
let keyBackspace: CGKeyCode = 0x33
let axManualAccessibility = "AXManualAccessibility" as CFString
let keyEscape: CGKeyCode = 0x35
let keyG: CGKeyCode = 0x05

// MARK: - 日志

let logFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

func blog(_ message: String) {
  let line = "[\(logFormatter.string(from: Date()))] \(message)\n"
  guard let data = line.data(using: .utf8) else { return }
  if let handle = try? FileHandle(forWritingTo: logURL) {
    defer { try? handle.close() }
    _ = try? handle.seekToEnd()
    try? handle.write(contentsOf: data)
  } else {
    try? data.write(to: logURL)
  }
  FileHandle.standardError.write(data)
}

// MARK: - JSON 辅助

typealias JSONDict = [String: Any]

func jsonData(_ object: Any) -> Data {
  (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]))
    ?? Data("{}".utf8)
}

func jsonText(_ object: Any) -> String {
  String(data: jsonData(object), encoding: .utf8) ?? "{}"
}

func jsonObject(_ data: Data) -> JSONDict? {
  (try? JSONSerialization.jsonObject(with: data)) as? JSONDict
}

// MARK: - AX 原语

func axAttr(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? {
  var value: CFTypeRef?
  let error = AXUIElementCopyAttributeValue(element, name, &value)
  return error == .success ? value : nil
}

func axRawString(_ element: AXUIElement, _ name: CFString) -> String? {
  guard let value = axAttr(element, name) else { return nil }
  if let text = value as? String { return text }
  if let number = value as? NSNumber { return number.stringValue }
  return nil
}

func axString(_ element: AXUIElement, _ name: CFString) -> String {
  axRawString(element, name) ?? ""
}

func axChildren(_ element: AXUIElement) -> [AXUIElement] {
  guard let value = axAttr(element, kAXChildrenAttribute as CFString) else { return [] }
  return (value as? [AXUIElement]) ?? []
}

func axParent(_ element: AXUIElement) -> AXUIElement? {
  guard let value = axAttr(element, kAXParentAttribute as CFString) else { return nil }
  return value as! AXUIElement
}

func axRole(_ element: AXUIElement) -> String {
  axString(element, kAXRoleAttribute as CFString)
}

func axRoleDescription(_ element: AXUIElement) -> String {
  axString(element, kAXRoleDescriptionAttribute as CFString)
}

func axTitle(_ element: AXUIElement) -> String {
  axString(element, kAXTitleAttribute as CFString)
}

func axDescription(_ element: AXUIElement) -> String {
  axString(element, kAXDescriptionAttribute as CFString)
}

func axValueText(_ element: AXUIElement) -> String {
  axString(element, kAXValueAttribute as CFString)
}

func axIdentifier(_ element: AXUIElement) -> String {
  axString(element, kAXIdentifierAttribute as CFString)
}

func axHelp(_ element: AXUIElement) -> String {
  axString(element, kAXHelpAttribute as CFString)
}

func axEnabled(_ element: AXUIElement) -> Bool {
  guard let value = axAttr(element, kAXEnabledAttribute as CFString) as? NSNumber else { return true }
  return value.boolValue
}

func axSettable(_ element: AXUIElement, _ name: CFString) -> Bool {
  var settable: DarwinBoolean = false
  guard AXUIElementIsAttributeSettable(element, name, &settable) == .success else { return false }
  return settable.boolValue
}

func axActions(_ element: AXUIElement) -> [String] {
  var names: CFArray?
  guard AXUIElementCopyActionNames(element, &names) == .success else { return [] }
  return (names as? [String]) ?? []
}

func axFrame(_ element: AXUIElement) -> (CGPoint, CGSize)? {
  guard let rawPosition = axAttr(element, kAXPositionAttribute as CFString),
        CFGetTypeID(rawPosition) == AXValueGetTypeID(),
        let rawSize = axAttr(element, kAXSizeAttribute as CFString),
        CFGetTypeID(rawSize) == AXValueGetTypeID()
  else { return nil }
  var position = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetValue(rawPosition as! AXValue, .cgPoint, &position),
        AXValueGetValue(rawSize as! AXValue, .cgSize, &size)
  else { return nil }
  return (position, size)
}

struct MatchedElement {
  let element: AXUIElement
  let depth: Int
}

/// 广度优先遍历整棵 AX 树（含窗口），收集全部命中项。
func axFindAll(
  root: AXUIElement,
  maxDepth: Int = 40,
  maxNodes: Int = 6000,
  predicate: (AXUIElement) -> Bool
) -> [MatchedElement] {
  var matches: [MatchedElement] = []
  var queue: [(AXUIElement, Int)] = [(root, 0)]
  var visited = 0
  var cursor = 0
  while cursor < queue.count && visited < maxNodes {
    let (element, depth) = queue[cursor]
    cursor += 1
    visited += 1
    if predicate(element) { matches.append(MatchedElement(element: element, depth: depth)) }
    if depth < maxDepth {
      let isAppRecursion = axRole(element) == "AXApplication"
      for child in axChildren(element) {
        // Tauri/WKWebView 的 app 元素会把自身再作为 child 暴露一层，
        // 无限套娃会吃光深度与节点预算——跳过 app → app 自引用。
        if isAppRecursion && axRole(child) == "AXApplication" { continue }
        queue.append((child, depth + 1))
      }
    }
  }
  return matches
}

/// 遍历根选择：app 自根几乎拿不到窗口内容（Tauri 自引用 + 菜单噪声），
/// 真正的内容都在 kAXWindowsAttribute 下的各窗口里。
func resolveRoots(_ appElement: AXUIElement, _ spec: JSONDict?) -> [AXUIElement] {
  let all = windows(appElement)
  let fallback = all.isEmpty ? [appElement] : all
  switch ((spec?["root"] as? String) ?? "main") {
  case "app":
    return [appElement]
  case "all":
    return fallback
  case "viewer":
    let viewers = all.filter { window in
      let haystack = axTitle(window) + "\u{1}" + axRoleDescription(window)
      return haystack.localizedCaseInsensitiveContains("image-viewer")
        || haystack.localizedCaseInsensitiveContains("查看")
        || haystack.localizedCaseInsensitiveContains("图片")
    }
    return viewers.isEmpty ? fallback : viewers
  case "window":
    if let index = spec?["windowIndex"] as? Int, all.indices.contains(index) {
      return [all[index]]
    }
    return fallback
  default:
    if let main = mainChatWindow(appElement) { return [main] }
    return fallback
  }
}

func findAllInRoots(
  _ roots: [AXUIElement],
  maxDepth: Int,
  maxNodes: Int,
  predicate: @escaping (AXUIElement) -> Bool
) -> [MatchedElement] {
  var collected: [MatchedElement] = []
  for root in roots {
    let found = axFindAll(
      root: root,
      maxDepth: maxDepth,
      maxNodes: maxNodes,
      predicate: predicate
    )
    collected.append(contentsOf: found)
  }
  return collected
}

// MARK: - 元素匹配描述

struct MatchSpec {
  var role: String?
  var roleDescription: String?
  var titleContains: String?
  var descriptionContains: String?
  var valueContains: String?
  var identifier: String?
  var helpContains: String?
  var enabledOnly = false
  var index: Int?

  static func parse(_ dict: JSONDict?) -> MatchSpec {
    var spec = MatchSpec()
    guard let dict else { return spec }
    spec.role = dict["role"] as? String
    spec.roleDescription = dict["roleDescription"] as? String
    spec.titleContains = dict["titleContains"] as? String
    spec.descriptionContains = dict["descriptionContains"] as? String
    spec.valueContains = dict["valueContains"] as? String
    spec.identifier = dict["identifier"] as? String
    spec.helpContains = dict["helpContains"] as? String
    spec.enabledOnly = (dict["enabledOnly"] as? Bool) ?? false
    spec.index = dict["index"] as? Int
    return spec
  }

  func matches(_ element: AXUIElement) -> Bool {
    if let role, !role.isEmpty {
      let actual = axRole(element)
      if actual.caseInsensitiveCompare(role) != .orderedSame { return false }
    }
    if let roleDescription, !roleDescription.isEmpty {
      if !axRoleDescription(element).localizedCaseInsensitiveContains(roleDescription) { return false }
    }
    if let titleContains, !titleContains.isEmpty {
      if !axTitle(element).localizedCaseInsensitiveContains(titleContains) { return false }
    }
    if let descriptionContains, !descriptionContains.isEmpty {
      let haystack = axDescription(element) + "\u{1}" + axRoleDescription(element)
      if !haystack.localizedCaseInsensitiveContains(descriptionContains) { return false }
    }
    if let valueContains, !valueContains.isEmpty {
      if !axValueText(element).localizedCaseInsensitiveContains(valueContains) { return false }
    }
    if let identifier, !identifier.isEmpty {
      if axIdentifier(element).caseInsensitiveCompare(identifier) != .orderedSame { return false }
    }
    if let helpContains, !helpContains.isEmpty {
      if !axHelp(element).localizedCaseInsensitiveContains(helpContains) { return false }
    }
    if enabledOnly && !axEnabled(element) { return false }
    return true
  }
}

func describeElement(_ element: AXUIElement, index: Int, depth: Int) -> JSONDict {
  var dict: JSONDict = [
    "index": index,
    "depth": depth,
    "role": axRole(element),
    "roleDescription": axRoleDescription(element),
    "enabled": axEnabled(element),
    "actions": axActions(element),
  ]
  let title = axTitle(element)
  if !title.isEmpty { dict["title"] = title }
  let description = axDescription(element)
  if !description.isEmpty { dict["description"] = description }
  let value = axValueText(element)
  if !value.isEmpty { dict["value"] = String(value.prefix(400)) }
  let identifier = axIdentifier(element)
  if !identifier.isEmpty { dict["identifier"] = identifier }
  let help = axHelp(element)
  if !help.isEmpty { dict["help"] = help }
  if let (position, size) = axFrame(element) {
    dict["x"] = Int(position.x)
    dict["y"] = Int(position.y)
    dict["w"] = Int(size.width)
    dict["h"] = Int(size.height)
  }
  return dict
}

// MARK: - 输入事件

/// 事件只投递到元宝进程，避免移动全局光标/抢前台。
func postToYuanbao(_ event: CGEvent) {
  let pid = pid_t(runningYuanbao()?.processIdentifier ?? 0)
  if pid > 0 {
    event.postToPid(pid)
  } else {
    event.post(tap: .cghidEventTap)
  }
}

func postKey(_ code: CGKeyCode, flags: CGEventFlags = []) {
  let source = CGEventSource(stateID: .hidSystemState)
  if let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true) {
    down.flags = flags
    postToYuanbao(down)
  }
  usleep(25_000)
  if let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false) {
    up.flags = flags
    postToYuanbao(up)
  }
  usleep(25_000)
}

/// 将 Unicode 文本作为目标进程的键盘事件注入。
///
/// 元宝的 Quill 输入组件在某些状态下会拒绝 AXSetValue
///（返回成功但立刻重置）；键盘事件走真实输入管线。
/// 事件仍 postToPid，不移动全局光标、不改变前台应用。
func postUnicodeText(_ text: String) {
  let units = Array(text.utf16)
  let chunkSize = 120
  var offset = 0
  while offset < units.count {
    let end = min(offset + chunkSize, units.count)
    let chunk = Array(units[offset..<end])
    chunk.withUnsafeBufferPointer { buffer in
      let source = CGEventSource(stateID: .hidSystemState)
      if let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true) {
        down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: buffer.baseAddress)
        postToYuanbao(down)
      }
      usleep(20_000)
      if let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) {
        up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: buffer.baseAddress)
        postToYuanbao(up)
      }
    }
    offset = end
    usleep(30_000)
  }
}

func typeIntoInput(
  _ input: AXUIElement,
  appElement: AXUIElement,
  text: String
) -> Bool {
  focusElement(input, appElement: appElement)
  usleep(180_000)
  _ = AXUIElementSetAttributeValue(input, kAXValueAttribute as CFString, "" as CFTypeRef)
  postKey(keyBackspace)
  postUnicodeText(text)
  usleep(400_000)
  return axValueText(input).trimmingCharacters(in: .whitespacesAndNewlines) == text
}

func postClick(_ point: CGPoint, right: Bool = false) {
  let source = CGEventSource(stateID: .hidSystemState)
  let button: CGMouseButton = right ? .right : .left
  let downType: CGEventType = right ? .rightMouseDown : .leftMouseDown
  let upType: CGEventType = right ? .rightMouseUp : .leftMouseUp
  if let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) {
    postToYuanbao(move)
  }
  usleep(60_000)
  if let down = CGEvent(mouseEventSource: source, mouseType: downType, mouseCursorPosition: point, mouseButton: button) {
    postToYuanbao(down)
  }
  usleep(70_000)
  if let up = CGEvent(mouseEventSource: source, mouseType: upType, mouseCursorPosition: point, mouseButton: button) {
    postToYuanbao(up)
  }
  usleep(60_000)
}

/// 垂直滚轮滚动（负数 = 向下，像素单位）。
func postScroll(pixels: Int32) {
  let source = CGEventSource(stateID: .hidSystemState)
  guard let event = CGEvent(
    scrollWheelEvent2Source: source,
    units: .pixel,
    wheelCount: 1,
    wheel1: pixels,
    wheel2: 0,
    wheel3: 0
  ) else { return }
  postToYuanbao(event)
  usleep(120_000)
}

/// 滚动聊天区到底部。
///
/// 两个实测约束：
/// 1. 滚轮事件路由到「光标下的窗口」——
///    必须先把光标移入元宝窗口中心，否则
///    滚动的是别的窗口；
/// 2. 新消息渲染在视口下方时，WKWebView
///    的 AX 树对滚动容器外很远的元素不创建
///    节点（虚拟化）——滚轮滚动后才出现。
func scrollChatToBottom(appElement: AXUIElement) {
  let window = mainChatWindow(appElement) ?? appElement
  let jump = axFindAll(root: window, maxDepth: 24, maxNodes: 4000) { element in
    axTitle(element) == "查看最新内容"
  }
  if let button = jump.first?.element {
    _ = pressElement(button)
  }
  usleep(300_000)
}

func setClipboard(_ text: String) {
  let pasteboard = NSPasteboard.general
  pasteboard.clearContents()
  pasteboard.setString(text, forType: .string)
}

// MARK: - 应用与窗口

func runningYuanbao() -> NSRunningApplication? {
  NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == yuanbaoBundleId }
}

@discardableResult
func ensureYuanbaoRunning(timeout: Double = 30) -> NSRunningApplication? {
  if let app = runningYuanbao() { return app }
  guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: yuanbaoBundleId) else {
    return nil
  }
  let configuration = NSWorkspace.OpenConfiguration()
  configuration.activates = false
  let semaphore = DispatchSemaphore(value: 0)
  var launched: NSRunningApplication?
  NSWorkspace.shared.openApplication(at: url, configuration: configuration) { app, _ in
    launched = app
    semaphore.signal()
  }
  _ = semaphore.wait(timeout: .now() + timeout)
  let deadline = Date().addingTimeInterval(timeout)
  while Date() < deadline {
    if let app = runningYuanbao() { return app }
    usleep(300_000)
  }
  return launched
}

func applicationElement() -> AXUIElement? {
  guard let app = ensureYuanbaoRunning() else { return nil }
  let element = AXUIElementCreateApplication(app.processIdentifier)
  // Tauri/WKWebView 的辅助树在无人使用 VoiceOver 时会休眠。
  // 显式请求手动可访问性，避免“CUA 能看到输入区、桥接却为 0”。
  _ = AXUIElementSetAttributeValue(element, axManualAccessibility, kCFBooleanTrue)
  return element
}

func windows(_ appElement: AXUIElement) -> [AXUIElement] {
  if let value = axAttr(appElement, kAXWindowsAttribute as CFString),
     let all = value as? [AXUIElement], !all.isEmpty {
    return all
  }

  // 元宝在部分后台恢复状态下 AXWindows 为空，但 focused/main window
  // 仍可读。系统 UI 已显示窗口时，这两个属性能救回后台 AX 路径。
  for name in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
    if let value = axAttr(appElement, name as CFString) {
      return [value as! AXUIElement]
    }
  }
  return []
}

/// 主聊天窗口：标题含「元宝」、且不含查看器标记的最大窗口。
func mainChatWindow(_ appElement: AXUIElement) -> AXUIElement? {
  let all = windows(appElement)
  let candidates = all.filter { !axTitle($0).localizedCaseInsensitiveContains("image-viewer") }
  if let best = candidates.max(by: { a, b in
    let areaA = axFrame(a).map { $0.1.width * $0.1.height } ?? 0
    let areaB = axFrame(b).map { $0.1.width * $0.1.height } ?? 0
    return areaA < areaB
  }) { return best }
  return all.first
}

func focusElement(_ element: AXUIElement, appElement: AXUIElement) {
  _ = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
  _ = AXUIElementSetAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, element)
}

func pressElement(_ element: AXUIElement) -> Bool {
  if AXUIElementPerformAction(element, kAXPressAction as CFString) == .success { return true }
  // 无 press 动作的元素（WebView 里常见）——退化为坐标点击。
  guard let (position, size) = axFrame(element), size.width > 0, size.height > 0 else { return false }
  let point = CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2)
  postClick(point)
  return true
}

func performAXAction(_ element: AXUIElement, _ action: String) -> Bool {
  AXUIElementPerformAction(element, action as CFString) == .success
}

/// AX 菜单是瞬时节点，必须在触发后立刻在所有窗口根里找。
func pressMenuItem(_ appElement: AXUIElement, title: String, timeout: Double) -> Bool {
  let deadline = Date().addingTimeInterval(max(timeout, 0.5))
  while Date() < deadline {
    let roots = windows(appElement)
    let matches = findAllInRoots(roots, maxDepth: 24, maxNodes: 5000) { element in
      guard axRole(element) == "AXMenuItem" || axRoleDescription(element) == "菜单项" else { return false }
      return axTitle(element).localizedCaseInsensitiveContains(title)
    }
    if let item = matches.first?.element {
      if pressElement(item) { return true }
    }
    usleep(120_000)
  }
  return false
}

// MARK: - 元宝生图流程

func textAreaInMainWindow(_ appElement: AXUIElement) -> AXUIElement? {
  let window = mainChatWindow(appElement) ?? appElement
  let areas = axFindAll(root: window) { element in
    let role = axRole(element)
    guard role == "AXTextArea" || role == "AXTextField" else { return false }
    guard axSettable(element, kAXValueAttribute as CFString) else { return false }
    guard let (_, size) = axFrame(element) else { return false }
    return size.width > 120 && size.height > 20
  }
  return areas.max { a, b in
    let areaA = axFrame(a.element).map { $0.1.width * $0.1.height } ?? 0
    let areaB = axFrame(b.element).map { $0.1.width * $0.1.height } ?? 0
    return areaA < areaB
  }?.element
}

func imageSkillEnabled(_ appElement: AXUIElement) -> Bool {
  let window = mainChatWindow(appElement) ?? appElement
  let matches = axFindAll(root: window) { element in
    let haystack = axDescription(element) + "\u{1}" + axTitle(element) + "\u{1}" + axRoleDescription(element)
    return haystack.localizedCaseInsensitiveContains("移除 AI 生图")
      || haystack.localizedCaseInsensitiveContains("移除AI生图")
  }
  return !matches.isEmpty
}

/// 开启 AI 生图技能：直接点附件栏的「AI 生图」按钮。
///
/// 新会话附件栏里「AI 生图」是独立按钮（未激活态标题
/// 「AI 生图」，激活态变为「移除 AI 生图」）——旧实现
/// 走「添加」附件菜单再点菜单项，实测多此一举且菜单
/// 形态随版本变化。
func enableImageSkill(_ appElement: AXUIElement) -> Bool {
  let window = mainChatWindow(appElement) ?? appElement
  let matches = axFindAll(root: window) { element in
    guard axRole(element) == "AXButton" else { return false }
    let title = axTitle(element)
    return title.localizedCaseInsensitiveContains("AI 生图")
      && !title.localizedCaseInsensitiveContains("移除")
  }
  guard let item = matches.first else {
    blog("enableImageSkill: 未找到 AI 生图按钮")
    return false
  }
  _ = pressElement(item.element)
  usleep(500_000)
  return true
}

/// 新建对话（左侧导航「新建对话」按钮）。
///
/// 实测旧会话存在「发送后无响应」的状态（输入区被
/// 清空但聊天区无消息）；生图请求相互独立——每次
/// 从干净会话开始。
func pressNewConversation(appElement: AXUIElement) {
  let matches = axFindAll(root: appElement) { element in
    guard axRole(element) == "AXButton" else { return false }
    return axTitle(element).localizedCaseInsensitiveContains("新建对话")
  }
  guard let first = matches.first else {
    blog("newConversation: 未找到新建对话按钮")
    return
  }
  _ = pressElement(first.element)
}

/// 确保当前输入区位于用户创建的「ai」分组内。
///
/// 分组输入框的占位符会带上分组名（「在 ai 中发送消息」），
/// 这比猜测 DOM 状态或读取私有前端状态可靠。已在该分组时
/// 不点击任何控件；否则只后台 AXPress 左侧分组标题。
func ensureAiGroupConversation(appElement: AXUIElement, freshConversation: Bool = false) -> Bool {
  let window = mainChatWindow(appElement) ?? appElement
  func aiPlaceholderVisible() -> Bool {
    axFindAll(root: window, maxDepth: 34, maxNodes: 7000) { element in
      axRole(element) == "AXStaticText"
        && axValueText(element) == "在 ai 中发送消息"
    }.isEmpty == false
  }

  if aiPlaceholderVisible() { return true }

  // AI 生图开启后占位符会变成「描述你想生成的图片」，此时要靠
  // 侧栏层级确认：ai 分组下的第一条会话就是组内最新会话。
  let sidebarTexts = axFindAll(root: window, maxDepth: 24, maxNodes: 5000) { element in
    axRole(element) == "AXStaticText"
      && (axFrame(element)?.0.x ?? .greatestFiniteMagnitude) < 220
      && !axValueText(element).isEmpty
  }.sorted { left, right in
    (axFrame(left.element)?.0.y ?? 0) < (axFrame(right.element)?.0.y ?? 0)
  }
  guard let aiGroup = sidebarTexts.first(where: { axValueText($0.element) == "ai" }),
        let aiFrame = axFrame(aiGroup.element)
  else {
    blog("generate: 未找到 ai 分组")
    // 分组只是路由约束，不是生图硬依赖。侧栏版本变化或用户
    // 重命名分组时，只要有可用输入区就继续，避免整条请求失败。
    if textAreaInMainWindow(appElement) != nil {
      blog("generate: 未找到 ai 分组，使用当前可用输入区")
      return true
    }
    return false
  }

  // 分组标题右侧的加号是“新建组内对话”。每次生图请求都
  // 从干净会话开始，避免上一轮候选把风格、季节等约束带进
  // 下一轮。加号通常没有标题，只能靠分组行内的几何位置
  // 和小尺寸图标识别。
  if freshConversation {
    let plusCandidates = axFindAll(root: window, maxDepth: 30, maxNodes: 7000) { element in
      guard let frame = axFrame(element) else { return false }
      let role = axRole(element)
      guard role == "AXButton" || role == "AXImage" || role == "AXGroup" else { return false }
      guard (14...38).contains(Int(frame.1.width)),
            (14...38).contains(Int(frame.1.height))
      else { return false }
      return frame.0.x >= aiFrame.0.x + 120
        && frame.0.x <= aiFrame.0.x + 260
        && abs(frame.0.y + frame.1.height / 2 - (aiFrame.0.y + aiFrame.1.height / 2)) <= 14
    }.sorted { left, right in
      (axFrame(left.element)?.0.x ?? 0) > (axFrame(right.element)?.0.x ?? 0)
    }

    if let plus = plusCandidates.first?.element, pressElement(plus) {
      let deadline = Date().addingTimeInterval(5)
      while Date() < deadline {
        usleep(300_000)
        let freshMarkerVisible = !axFindAll(root: window, maxDepth: 34, maxNodes: 7000) { element in
          axRole(element) == "AXStaticText"
            && axValueText(element) == "您已新建组内对话"
        }.isEmpty
        if freshMarkerVisible {
          blog("generate: 已新建 ai 分组内干净会话")
          return true
        }
      }
      blog("generate: 新建 ai 分组会话未确认")
    }
  }

  // 分组和组内会话都在 x=46。展开后下一个分组会整体下移，
  // 所以不能用折叠时缓存的下一个分组 Y 作为固定上界。
  let groupChildren = axFindAll(root: window, maxDepth: 24, maxNodes: 5000) { element in
    guard axRole(element) == "AXStaticText", axValueText(element) != "ai",
          let frame = axFrame(element)
    else { return false }
    return frame.0.x >= aiFrame.0.x - 1 && frame.0.x <= aiFrame.0.x + 8
        && frame.0.y > aiFrame.0.y + 5 && frame.0.y < aiFrame.0.y + 500
  }.sorted { left, right in
    (axFrame(left.element)?.0.y ?? 0) < (axFrame(right.element)?.0.y ?? 0)
  }

  let target: AXUIElement
  func visibleGroupChildren() -> [MatchedElement] {
    axFindAll(root: window, maxDepth: 24, maxNodes: 5000) { element in
      guard axRole(element) == "AXStaticText", axValueText(element) != "ai",
            let frame = axFrame(element)
      else { return false }
      return frame.0.x >= aiFrame.0.x - 1 && frame.0.x <= aiFrame.0.x + 8
        && frame.0.y > aiFrame.0.y + 5 && frame.0.y < aiFrame.0.y + 500
    }.sorted { left, right in
      (axFrame(left.element)?.0.y ?? 0) < (axFrame(right.element)?.0.y ?? 0)
    }
  }
  if let newest = groupChildren.first?.element {
    target = newest
  } else {
    // WebView 只把 AXPress 挂在可点击父行上；不同层级版本可能
    // 是第 1~3 层祖先，逐层尝试直到分组列表展开。
    var expandedChild: AXUIElement?
    var ancestor = aiGroup.element
    for level in 1...4 {
      guard let parent = axParent(ancestor) else { break }
      ancestor = parent
      guard pressElement(parent) else { continue }
      usleep(700_000)
      if let newest = visibleGroupChildren().first?.element {
        expandedChild = newest
        blog("generate: 展开 ai 分组成功 ancestorLevel=\(level)")
        break
      }
    }
    guard let newest = expandedChild else {
      blog("generate: ai 分组下没有会话")
      return false
    }
    target = newest
  }

  guard pressElement(target) else { return false }
  let deadline = Date().addingTimeInterval(4)
  while Date() < deadline {
    usleep(300_000)
    let imageInputVisible = !axFindAll(root: window, maxDepth: 34, maxNodes: 7000) { element in
      axRole(element) == "AXStaticText" && axValueText(element) == "描述你想生成的图片"
    }.isEmpty
    let draftInputVisible = textAreaInMainWindow(appElement) != nil
    if aiPlaceholderVisible() || imageInputVisible || draftInputVisible {
      blog("generate: 已切换到 ai 分组")
      return true
    }
  }
  blog("generate: 点击 ai 分组后未出现组内输入区")
  return false
}

/// 主窗口里 ≥200x200 的图片元素（排除头像等小图）。
func largeImages(root: AXUIElement) -> [MatchedElement] {
  axFindAll(root: root) { element in
    guard axRole(element) == "AXImage" else { return false }
    guard let (_, size) = axFrame(element) else { return false }
    return size.width >= 200 && size.height >= 200
  }
}

/// 当前版本把生成结果暴露为消息容器内的 AXGroup，
/// 而不是 AXImage。以「图片已生成」为锚点找同一条
/// 消息中的大图块，避免把头像和操作按钮误判为结果。
func generatedImageContainers(root: AXUIElement) -> [AXUIElement] {
  let markers = axFindAll(root: root) { element in
    axRole(element) == "AXStaticText"
      && axValueText(element).localizedCaseInsensitiveContains("图片已生成")
  }
  guard let marker = markers.first?.element else { return [] }
  guard let markerFrame = axFrame(marker) else { return [] }

  var current = axParent(marker)
  var messageContainer: AXUIElement?
  while let candidate = current {
    if let frame = axFrame(candidate),
       frame.1.width > 500,
       frame.1.height > markerFrame.1.height + 100 {
      messageContainer = candidate
      break
    }
    current = axParent(candidate)
  }
  guard let container = messageContainer, let containerFrame = axFrame(container) else { return [] }

  // 只取直接子节点：递归会把 960x535 的外层
  // 消息容器也当候选，AXShowMenu 就不会命中下载菜单。
  let images = axChildren(container).compactMap { element -> AXUIElement? in
    guard axRole(element) == "AXGroup" || axRole(element) == "AXImage" else { return nil }
    guard let frame = axFrame(element) else { return nil }
    guard frame.1.width >= 120, frame.1.width <= 500,
          frame.1.height >= 120, frame.1.height <= 300 else { return nil }
    guard frame.0.x >= containerFrame.0.x - 1
      && frame.0.y >= containerFrame.0.y - 1
      && frame.0.x + frame.1.width <= containerFrame.0.x + containerFrame.1.width + 1
      && frame.0.y + frame.1.height <= containerFrame.0.y + containerFrame.1.height + 1
    else { return nil }
    return element
  }
  return images
    .sorted { left, right in
      let leftFrame = axFrame(left)
      let rightFrame = axFrame(right)
      if let leftFrame, let rightFrame, abs(leftFrame.0.y - rightFrame.0.y) > 20 {
        return leftFrame.0.y < rightFrame.0.y
      }
      if let leftFrame, let rightFrame { return leftFrame.0.x < rightFrame.0.x }
      return false
    }
}

/// 大图元素签名（位置+尺寸），用于基线对比识别新图。
func largeImageSignatures(_ appElement: AXUIElement) -> Set<String> {
  let window = mainChatWindow(appElement) ?? appElement
  let imageMatches = largeImages(root: window).compactMap { match -> AXUIElement? in
    match.element
  } + generatedImageContainers(root: window)
  return Set(imageMatches.compactMap { element in
    guard let (position, size) = axFrame(element) else { return nil }
    return "\(Int(position.x)),\(Int(position.y)),\(Int(size.width)),\(Int(size.height))"
  })
}

private func frameSignature(_ element: AXUIElement) -> String? {
  guard let (position, size) = axFrame(element) else { return nil }
  return "\(Int(position.x)),\(Int(position.y)),\(Int(size.width)),\(Int(size.height))"
}

private func allGeneratedElements(_ appElement: AXUIElement) -> [AXUIElement] {
  let window = mainChatWindow(appElement) ?? appElement
  return largeImages(root: window).compactMap { $0.element } + generatedImageContainers(root: window)
}

private func allGeneratedSignatures(_ appElement: AXUIElement) -> Set<String> {
  Set(allGeneratedElements(appElement).compactMap { frameSignature($0) })
}

private func legacyImageSignatures(_ appElement: AXUIElement) -> Set<String> {
  let window = mainChatWindow(appElement) ?? appElement
  return Set(largeImages(root: window).compactMap { match in
    guard let (position, size) = axFrame(match.element) else { return nil }
    return "\(Int(position.x)),\(Int(position.y)),\(Int(size.width)),\(Int(size.height))"
  })
}

/// 轮询等待新生成图出现（基线对比——排除历史图）。
///
/// 「图片已生成」文本标记会匹配历史消息里的同名文本
/// （实测发送后 0.6s 误报），不可作为完成信号；
/// 「基线之外新出现的大图元素」才是可靠信号。
/// 新消息渲染在视口下方时 AX 树不建节点——
/// 先滚到底部，并定期重滚（渲染/布局可能
/// 持续数秒）。
func waitForNewGeneratedImage(_ appElement: AXUIElement, baseline: Set<String>, timeout: Double) -> AXUIElement? {
  let deadline = Date().addingTimeInterval(max(timeout, 1))
  scrollChatToBottom(appElement: appElement)
  var lastScroll = Date()
  while Date() < deadline {
    let window = mainChatWindow(appElement) ?? appElement
    let elements = largeImages(root: window).map { $0.element } + generatedImageContainers(root: window)
    for element in elements {
      guard let signature = frameSignature(element), !baseline.contains(signature) else { continue }
      return element
    }
    if Date().timeIntervalSince(lastScroll) > 5 {
      lastScroll = Date()
      scrollChatToBottom(appElement: appElement)
    }
    usleep(1_000_000)
  }
  return nil
}

func downloadNewestFile(since: Date, timeout: Double) -> URL? {
  let downloads = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads")
  let deadline = Date().addingTimeInterval(timeout)
  while Date() < deadline {
    let contents = (try? FileManager.default.contentsOfDirectory(
      at: downloads,
      includingPropertiesForKeys: [.contentModificationDateKey, .creationDateKey],
      options: [.skipsHiddenFiles]
    )) ?? []
    let fresh = contents.compactMap { url -> (URL, Date)? in
      guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
            let modified = values.contentModificationDate
      else { return nil }
      return (url, modified)
    }
    .filter { $0.1 >= since.addingTimeInterval(-2) }
    .sorted { $0.1 > $1.1 }
    if let best = fresh.first { return best.0 }
    usleep(700_000)
  }
  return nil
}

/// 利用元宝图片右键菜单里的「下载」保存无水印版本。
///
/// 用户开启「无水印保存」后，该链路落盘的是无水印 PNG。
/// 事件仍然 postToPid 到元宝进程；找不到菜单时立即返回，
/// 由调用方继续使用 AgentImageCache 兜底。
func downloadNoWatermarkElement(
  appElement: AXUIElement,
  element: AXUIElement,
  since: Date,
  timeout: Double
) -> URL? {
  guard let (position, size) = axFrame(element), size.width > 40, size.height > 40 else {
    return nil
  }
  let showed = performAXAction(element, kAXShowMenuAction)
  if !showed {
    let center = CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2)
    postClick(center, right: true)
  }

  let deadline = Date().addingTimeInterval(2.5)
  while Date() < deadline {
    let roots = windows(appElement)
    let menuItems = findAllInRoots(roots, maxDepth: 34, maxNodes: 8000) { item in
      let role = axRole(item)
      guard role == "AXMenuItem" || role == "AXButton" || role == "AXGroup" || role == "AXStaticText"
      else { return false }
      return axTitle(item) == "下载"
    }
    if let item = menuItems.first?.element, performAXAction(item, kAXPressAction) {
      blog("download: 上下文菜单命中无水印下载")
      return downloadNewestFile(since: since, timeout: timeout)
    }
    usleep(120_000)
  }
  postKey(keyEscape)
  blog("download: 上下文菜单未命中，保留缓存兜底")
  return nil
}

/// 查看器是除主聊天窗以外的唯一顶层窗。
func viewerWindow(_ appElement: AXUIElement) -> AXUIElement? {
  let main = mainChatWindow(appElement)
  return windows(appElement).first { $0 !== main }
}

/// 等查看器把大图真正挂载完成；刚打开时可能只有空白骨架。
func waitForViewerImage(_ appElement: AXUIElement, timeout: Double) -> Bool {
  let deadline = Date().addingTimeInterval(max(timeout, 1))
  while Date() < deadline {
    if let viewer = viewerWindow(appElement) {
      let loaded = axFindAll(root: viewer, maxDepth: 30, maxNodes: 3000) { element in
        axRole(element) == "AXImage" && axDescription(element) == "image"
      }
      if !loaded.isEmpty { return true }
    }
    usleep(500_000)
  }
  return false
}

/// 优先在聊天候选图上打开 AX 上下文菜单并按「下载」。
/// 全程元素动作，不移动鼠标；若 WebView 菜单未暴露，
/// 才退回查看器几何锚点。
func downloadGeneratedElement(
  appElement: AXUIElement,
  element: AXUIElement,
  timeout: Double
) throws {
  // AXShowMenu 的自绘菜单不进 AX 树；改用目标进程内的
  // 坐标事件打开查看器，不触达全局光标。
  guard let (position, size) = axFrame(element) else {
    throw BridgeError.message("生成图缺少 frame")
  }
  let center = CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2)
  blog("download: 后台打开查看器 center=\(Int(center.x)),\(Int(center.y))")
  postClick(center)
  guard waitForViewerImage(appElement, timeout: 10) else {
    throw BridgeError.message("图片查看器未完成加载")
  }
  try downloadFromViewerAnchored(appElement: appElement, timeout: timeout)
}

/// 元宝会把本轮全部候选原图写入本机缓存。缓存读取完全在桥接进程内完成，
/// 不需要打开图片查看器，也不依赖横向滚动或无水印下载设置。
func freshAgentImageFiles(since: Date, minimum: Int, timeout: Double) -> [URL] {
  let usersRoot = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(
      "Library/Containers/com.tencent.yuanbao/Data/Library/Users",
      isDirectory: true
    )
  let cacheRoots = ((try? FileManager.default.contentsOfDirectory(
    at: usersRoot,
    includingPropertiesForKeys: [.isDirectoryKey],
    options: [.skipsHiddenFiles]
  )) ?? [])
    .filter { $0.appendingPathComponent("AgentImageCache", isDirectory: true).hasDirectoryPath }
    .map { $0.appendingPathComponent("AgentImageCache", isDirectory: true) }

  let deadline = Date().addingTimeInterval(max(timeout, 1))
  var best: [URL] = []
  while Date() < deadline {
    var fresh: [(URL, Date)] = []
    for root in cacheRoots {
      let monthDirs = ((try? FileManager.default.contentsOfDirectory(
        at: root,
        includingPropertiesForKeys: [.isDirectoryKey],
        options: [.skipsHiddenFiles]
      )) ?? []).filter { $0.hasDirectoryPath }
      for monthDir in monthDirs {
        let contents = (try? FileManager.default.contentsOfDirectory(
          at: monthDir,
          includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey],
          options: [.skipsHiddenFiles]
        )) ?? []
        for url in contents {
          guard url.lastPathComponent.lowercased().hasSuffix("_original.jpg") else { continue }
          guard let values = try? url.resourceValues(forKeys: [URLResourceKey.contentModificationDateKey]),
                let modified = values.contentModificationDate,
                modified >= since
          else { continue }
          fresh.append((url, modified))
        }
      }
    }

    // 一轮候选几乎同时落盘。只取最新时间簇，避免把上一轮
    // 刚结束的文件混进来；同簇内保留目录读取顺序。
    let ordered = fresh.sorted { $0.1 > $1.1 }
    if let newestDate = ordered.first?.1 {
      let cluster = ordered.filter { abs($0.1.timeIntervalSince(newestDate)) < 5 }
      best = cluster.map { $0.0 }
      if best.count >= minimum { break }
    }
    usleep(700_000)
  }
  return Array(best.prefix(max(minimum, 1)))
}

/// 全局开启无水印保存。面板元素有可靠 AX 名称；
/// 保存后按钮会关闭，用「面板消失」确认成功。
func ensureNoWatermarkSetting(viewer: AXUIElement) {
  let settings = axFindAll(root: viewer, maxDepth: 24, maxNodes: 3000) { element in
    axRole(element) == "AXButton"
      && (axTitle(element) + "\u{1}" + axDescription(element))
        .localizedCaseInsensitiveContains("无水印保存设置")
  }
  guard let settingsButton = settings.first?.element else { return }
  guard pressElement(settingsButton) else { return }

  let deadline = Date().addingTimeInterval(4)
  var checkbox: AXUIElement?
  var saveButton: AXUIElement?
  while Date() < deadline {
    let panel = axFindAll(root: viewer, maxDepth: 30, maxNodes: 4000) { element in
      let haystack = axTitle(element) + "\u{1}" + axDescription(element)
      if axRole(element) == "AXCheckBox" && haystack.contains("无水印保存") { return true }
      return axRole(element) == "AXButton" && axTitle(element) == "保存设置"
    }
    checkbox = panel.first(where: { axRole($0.element) == "AXCheckBox" })?.element
    saveButton = panel.first(where: { axRole($0.element) == "AXButton" })?.element
    if checkbox != nil || saveButton != nil { break }
    usleep(300_000)
  }
  if let checkbox, axValueText(checkbox) != "1" {
    _ = pressElement(checkbox)
    usleep(300_000)
  }
  if let saveButton {
    _ = pressElement(saveButton)
    usleep(700_000)
  }
}

// MARK: - IndexedDB 无水印原图

/// 元宝把「无水印保存」使用的 originUrl 保存在 WKWebView IndexedDB。
/// 数据库路径里的 WebKit origin 哈希可能随版本变化，这里枚举最近修改的库。
func yuanbaoIndexedDatabases() -> [URL] {
  let home = FileManager.default.homeDirectoryForCurrentUser
  let roots = [
    home.appendingPathComponent("Library/WebKit/com.tencent.yuanbao/WebsiteData/Default", isDirectory: true),
    home.appendingPathComponent(
      "Library/Containers/com.tencent.yuanbao/Data/Library/WebKit/com.tencent.yuanbao/WebsiteData/Default",
      isDirectory: true
    ),
  ]
  var matches: [URL] = []
  for root in roots {
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else { continue }
    for case let url as URL in enumerator {
      guard url.lastPathComponent == "IndexedDB.sqlite3",
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey]),
            values.isRegularFile ?? false
      else { continue }
      matches.append(url)
    }
  }
  return matches
    .compactMap { url -> (URL, Date)? in
      guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
            let modified = values.contentModificationDate
      else { return nil }
      return (url, modified)
    }
    .sorted { $0.1 > $1.1 }
    .map { $0.0 }
}

/// 只读读取每个库里的最近记录。不能 SELECT key：IndexedDB 的 key 使用自定义
/// IDBKEY collation，外部进程没有注册该 collation 时查询会直接失败。
func recentIndexedDBRecords(limit: Int) -> [(recordID: Int, value: Data)] {
  var records: [(Int, Data)] = []
  for database in yuanbaoIndexedDatabases().prefix(16) {
    records.append(contentsOf: recentRecords(in: database, limit: limit))
  }
  return records
}

private func recentRecords(in database: URL, limit: Int) -> [(recordID: Int, value: Data)] {
  var db: OpaquePointer?
  let path = database.path
  guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
    sqlite3_close_v2(db)
    blog("idb: 无法只读打开 \(path)")
    return []
  }
  defer { sqlite3_close_v2(db) }

  let sql = """
    SELECT recordID, value
      FROM Records
     WHERE typeof(value) = 'blob'
     ORDER BY recordID DESC
     LIMIT ?
  """
  var statement: OpaquePointer?
  guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
    blog("idb: prepare 失败 \(String(cString: sqlite3_errmsg(db)))")
    return []
  }
  defer { sqlite3_finalize(statement) }
  sqlite3_bind_int(statement, 1, Int32(clamping: limit))

  var databaseRecords: [(Int, Data)] = []
  var stepResult = SQLITE_ROW
  while true {
    stepResult = sqlite3_step(statement)
    if stepResult != SQLITE_ROW { break }
    let recordID = Int(sqlite3_column_int64(statement, 0))
    guard let bytes = sqlite3_column_blob(statement, 1) else { continue }
    let byteCount = Int(sqlite3_column_bytes(statement, 1))
    guard byteCount > 0 else { continue }
    databaseRecords.append((recordID, Data(bytes: bytes, count: byteCount)))
  }
  if stepResult != SQLITE_DONE {
    blog("idb: step 失败 \(stepResult) \(String(cString: sqlite3_errmsg(db))) path=\(database.path)")
  }
  return databaseRecords
}

/// 从 WebKit 结构化序列化数据中提取 ASCII URL。
///
/// 较新版元宝会把 downloadUrl 与 originUrl 同时写入同一条记录；
/// 两者文件名一致，去重后可以互为编码兜底。
private func asciiImageURLs(in data: Data) -> [String] {
  var results: [String] = []
  var cursor = 0
  let bytes = [UInt8](data)
  let prefix = Array("https://".utf8)

  while cursor < bytes.count {
    guard let start = bytes[cursor...].firstRange(of: prefix)?.lowerBound else { break }
    var position = start
    while position < bytes.count, bytes[position] >= 32, bytes[position] < 127 {
      position += 1
    }
    if position - start >= 20 {
      results.append(String(decoding: bytes[start..<position], as: UTF8.self))
    }
    cursor = max(position, start + 1)
  }
  return results
}

/// 从 WebKit 结构化序列化数据中提取 UTF-16LE 字符串。
///
/// downloadUrl 在记录里多为 ASCII；originUrl 是 UTF-16。
/// 用编码本身区分来源，比解析私有序列化格式更稳定。
private func utf16Strings(in data: Data, minimumLength: Int = 12) -> [String] {
  let bytes = [UInt8](data)
  let prefix = Array("https://".utf8).flatMap { [$0, UInt8(0)] }
  var results: [String] = []
  var cursor = 0

  while cursor + 1 < bytes.count {
    var start: Int?
    var search = cursor
    while search + prefix.count <= bytes.count {
      var matched = true
      for (offset, byte) in prefix.enumerated() where bytes[search + offset] != byte {
        matched = false
        break
      }
      if matched {
        start = search
        break
      }
      search += 1
    }
    guard let matchStart = start else { break }
    var units: [UInt16] = []
    var position = matchStart
    while position + 1 < bytes.count {
      let unit = UInt16(bytes[position]) | (UInt16(bytes[position + 1]) << 8)
      guard unit >= 32, unit < 127 else { break }
      units.append(unit)
      position += 2
    }
    if units.count >= minimumLength {
      let text = String(decoding: units, as: UTF16.self)
      results.append(text)
    }
    cursor = max(position, matchStart + 1)
  }
  return results
}

private func originImageTime(_ url: String, relativeTo now: TimeInterval) -> TimeInterval? {
  guard let parsed = URL(string: url) else { return nil }
  let components = parsed.lastPathComponent.components(separatedBy: "_")
  guard let stamp = components.first(where: { component in
    component.count >= 13 && component.allSatisfy(\.isNumber)
  }), let seconds = Double(stamp.prefix(10)) else { return nil }
  // 防止异常时间戳把历史候选误判成本轮。
  guard abs(seconds - now) < 86_400 * 365 else { return nil }
  return seconds
}

/// 原始扫描 IndexedDB 主库和 WAL。
///
/// 外部进程没有 WebKit 的 IDBKEY collation，而且活跃 WAL 里的提交
/// 对外部 SQLite 连接可能暂不可见；结构化序列化字节本身足够稳定，
/// 直接扫描可以避免“页面已出图、桥接却取到 0”的窗口。
private func rawIndexedDBURLs() -> [String] {
  var files: [URL] = []
  for database in yuanbaoIndexedDatabases() {
    files.append(database)
    let wal = URL(fileURLWithPath: database.path + "-wal")
    if FileManager.default.fileExists(atPath: wal.path) {
      files.append(wal)
    }
  }

  var urls: [String] = []
  for file in files.prefix(32) {
    guard let data = try? Data(contentsOf: file) else { continue }
    for url in utf16Strings(in: data) + asciiImageURLs(in: data) {
      // 百分号编码形态来自响应缓存；originUrl 的签名参数是原始分隔符。
      guard !url.contains("%"), !urls.contains(url) else { continue }
      urls.append(url)
    }
  }
  return urls
}

/// 轮询 IndexedDB，等待本轮候选 originUrl 写入。
func latestOriginImageURLs(since: Date, minimum: Int, timeout: Double) -> [String] {
  let cutoff = since.timeIntervalSince1970 - 2
  let now = Date().timeIntervalSince1970
  let deadline = Date().addingTimeInterval(max(timeout, 1))
  var bestCluster: [String] = []
  var bestClusterChangedAt: Date?

  while Date() < deadline {
    let records = recentIndexedDBRecords(limit: 50)
    var candidates: [String] = []
    let recordURLs = records.flatMap { utf16Strings(in: $0.value) } + rawIndexedDBURLs()
    for url in recordURLs {
      guard url.contains("hunyuan-prod-"),
            url.contains("/text2img/"),
            url.contains("?q-sign-algorithm=sha1&q-ak="),
            !url.contains("thumbnail_"),
            !url.contains("/app/icon/"),
            let generatedAt = originImageTime(url, relativeTo: now),
            generatedAt >= cutoff,
            !candidates.contains(url)
      else { continue }
      candidates.append(url)
    }
    // 同一响应的候选文件名携带纳秒级时间戳，通常只相差几秒；
    // 只取最新簇，避免从同一条会话历史缓存里拿旧图。
    if let newest = candidates.compactMap({ originImageTime($0, relativeTo: now) }).max() {
      let cluster = candidates.filter {
        abs((originImageTime($0, relativeTo: now) ?? 0) - newest) < 20
      }
      if cluster.count > bestCluster.count {
        bestCluster = cluster
        bestClusterChangedAt = Date()
        blog("idb: originUrl 候选 count=\(cluster.count) request=\(minimum)")
      }
      // 元宝同一批候选通常几乎同时写库；短暂稳定后再返回，
      // 避免 n=1 的旧语义在第一张出现时丢掉另外三张。
      if cluster.count >= minimum,
         let changedAt = bestClusterChangedAt,
         Date().timeIntervalSince(changedAt) >= 3 {
        return cluster
      }
    }
    usleep(700_000)
  }

  if bestCluster.count >= minimum {
    return bestCluster
  }
  blog("idb: 等待 originUrl 超时")
  return []
}

private func imageExtension(_ data: Data) -> String {
  if data.starts(with: Data([0x89, 0x50, 0x4e, 0x47])) { return "png" }
  if data.starts(with: Data([0xff, 0xd8, 0xff])) { return "jpg" }
  if data.starts(with: Data("RIFF".utf8)) { return "webp" }
  return "png"
}

func downloadOriginImage(_ urlString: String, timeout: TimeInterval) throws -> (URL, String) {
  guard let url = URL(string: urlString) else {
    throw BridgeError.message("IndexedDB originUrl 无效")
  }
  var request = URLRequest(url: url)
  request.timeoutInterval = timeout
  let semaphore = DispatchSemaphore(value: 0)
  final class Box { var data: Data?; var response: URLResponse?; var error: Error? }
  let box = Box()
  URLSession.shared.dataTask(with: request) { data, response, error in
    box.data = data
    box.response = response
    box.error = error
    semaphore.signal()
  }.resume()
  _ = semaphore.wait(timeout: .now() + timeout + 2)

  if let error = box.error {
    throw BridgeError.message("下载无水印原图失败：\(error.localizedDescription)")
  }
  guard let http = box.response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
    throw BridgeError.message("下载无水印原图失败（HTTP \((box.response as? HTTPURLResponse)?.statusCode ?? -1)）")
  }
  guard let data = box.data, !data.isEmpty else {
    throw BridgeError.message("下载无水印原图返回空内容")
  }
  let temporary = FileManager.default.temporaryDirectory
    .appendingPathComponent("yuanbao-origin-\(UUID().uuidString)")
  try data.write(to: temporary, options: .atomic)
  return (temporary, imageExtension(data))
}

// MARK: - 生图流程编排

struct GenerateResult {
  var fileURL: URL
  var id: String
}

func runGenerate(prompt: String, imageCount: Int, timeout: Double) throws -> [GenerateResult] {
  guard ensureYuanbaoRunning() != nil else {
    throw BridgeError.message("元宝 App 未安装或无法启动")
  }
  guard let appElement = applicationElement() else {
    throw BridgeError.message("无法获取元宝 AX 句柄")
  }
  usleep(600_000)

  let cacheSince = Date()
  blog("generate: 开始 promptLength=\(prompt.count)")

  // 固定在用户创建的 ai 分组内；不再点全局新建对话。
  if ensureAiGroupConversation(appElement: appElement, freshConversation: true) {
    blog("generate: 使用 ai 分组内新建会话")
  } else {
    // 分组加号不可用时退回全局新建。干净上下文比分组路由
    // 更重要；用户说过此时可以不用分组生成。
    pressNewConversation(appElement: appElement)
    usleep(1_500_000)
    guard textAreaInMainWindow(appElement) != nil else {
      throw BridgeError.message("无法创建干净生图会话")
    }
    blog("generate: ai 分组不可用，使用全局新建会话兜底")
  }
  usleep(2_000_000)

  // AI 生图技能（会话级——新会话默认未开启）。
  if !imageSkillEnabled(appElement) {
    blog("generate: AI 生图未开启，尝试开启")
    _ = enableImageSkill(appElement)
    usleep(400_000)
    if !imageSkillEnabled(appElement) {
      blog("generate: 开启 AI 生图失败（继续尝试直接发送）")
    }
  } else {
    blog("generate: AI 生图已开启")
  }

  // 元宝页面模型常会自行生成 4 个候选；API 的 n 只控制
  // 桥接端返回数量，不能约束页面内部候选数。这里保持
  // 提示词原样，后续从原始缓存候选中返回前 n 张。
  let uiPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)

  // 发送前大图基线——完成信号用（文本标记
  // 会匹配历史消息，不可信）。先滚到底部，
  // 让历史图全部进入 AX 树（视口外被虚拟化）。
  scrollChatToBottom(appElement: appElement)
  let baselineImages = largeImageSignatures(appElement)

  guard var input = textAreaInMainWindow(appElement) else {
    throw BridgeError.message("未找到元宝输入区")
  }
  // setValue 是窗口后台路径；粘贴要抢前台焦点，
  // 会在自动化期间抢占用户正在用的输入。
  var inputReady = false
  for attempt in 0..<3 {
    if attempt == 0 {
      let setInputError = AXUIElementSetAttributeValue(
        input,
        kAXValueAttribute as CFString,
        uiPrompt as CFTypeRef
      )
      guard setInputError == .success else {
        throw BridgeError.message("无法后台写入元宝输入区（AX setvalue \(setInputError.rawValue)）")
      }
    } else if !typeIntoInput(input, appElement: appElement, text: uiPrompt) {
      blog("generate: Unicode 键盘输入未稳定 attempt=\(attempt)")
    }
    if axValueText(input).trimmingCharacters(in: .whitespacesAndNewlines) == uiPrompt {
      inputReady = true
      break
    }
    // 切换会话后 WebView 可能替换输入区节点，重取再写。
    if let refreshed = textAreaInMainWindow(appElement) { input = refreshed }
    blog("generate: 输入区内容未保留 attempt=\(attempt)")
  }
  guard inputReady else {
    throw BridgeError.message("元宝输入区未能稳定保存提示词")
  }
  usleep(400_000)
  blog("generate: 提示词已写入（inputLength=\(axValueText(input).count)）")

  var sent = false
  for attempt in 0..<8 {
    let send = axFindAll(root: mainChatWindow(appElement) ?? appElement, maxDepth: 28, maxNodes: 5000) { element in
      (axTitle(element) + "\u{1}" + axDescription(element)).contains("发送")
        && !(axTitle(element) + axDescription(element)).contains("停止")
    }
    if let sendButton = send.first?.element, performAXAction(sendButton, kAXPressAction) {
      usleep(600_000)
      let state = axFindAll(root: mainChatWindow(appElement) ?? appElement, maxDepth: 28, maxNodes: 5000) { element in
        (axTitle(element) + "\u{1}" + axDescription(element)).contains("停止回答")
      }
      if axValueText(input).count <= 1 || !state.isEmpty {
        sent = true
        blog("generate: AXPress 发送成功 attempt=\(attempt)")
        break
      }
    }
    usleep(400_000)
  }
  guard sent else {
    throw BridgeError.message("后台 AXPress 发送失败")
  }
  usleep(2_000_000)
  blog("generate: 发送后输入区长度=\(axValueText(input).count)")

  // 轮询等待新图出现（基线对比，排除历史图）。
  guard waitForNewGeneratedImage(
    appElement,
    baseline: baselineImages,
    timeout: timeout
  ) != nil else {
    throw BridgeError.message("等待生成图超时（\(Int(timeout))s）")
  }
  blog("generate: 检测到新图元素")

  let minimum = max(1, min(imageCount, 8))
  // 生成图元素先渲染，IndexedDB 响应可能再晚几秒提交。
  // 只取 originUrl：这才是用户开启无水印保存后右键下载的同一字节流。
  let originURLs = latestOriginImageURLs(since: cacheSince, minimum: minimum, timeout: 45)
  blog("generate: IndexedDB 候选 count=\(originURLs.count) minimum=\(minimum)")

  try? FileManager.default.createDirectory(at: imageDir, withIntermediateDirectories: true)
  let stamp = Int(Date().timeIntervalSince1970)
  var results: [GenerateResult] = []
  for (offset, urlString) in originURLs.enumerated() {
    do {
      let (temporary, ext) = try downloadOriginImage(urlString, timeout: 30)
      let id = "\(stamp)-\(offset)-\(UUID().uuidString.prefix(8))"
      let destination = imageDir.appendingPathComponent("\(id).\(ext)")
      try FileManager.default.moveItem(at: temporary, to: destination)
      blog("generate: 完成 originUrl [\(offset)] -> \(destination.path)")
      results.append(GenerateResult(fileURL: destination, id: id))
    } catch let BridgeError.message(text) {
      blog("generate: originUrl [\(offset)] 失败 \(text)")
    }
  }

  guard results.count >= minimum else {
    throw BridgeError.message(
      "无水印 IndexedDB 原图不足（至少需要 \(minimum)，得到 \(results.count)）；已避免用水印缓存冒充成功"
    )
  }
  return results
}

/// 可编程原语：流程调优不必重新编译桥接。
func executeStep(_ step: JSONDict) -> JSONDict {
  let op = ((step["op"] as? String) ?? (step["cmd"] as? String)) ?? ""
  switch op {
  case "dump", "query", "act", "key", "click", "activate", "windows", "ping":
    var command = step
    command["cmd"] = op
    return handleCommand(command)
  case "sleep":
    let ms = (step["ms"] as? Double) ?? 500
    usleep(useconds_t(max(0, min(ms, 30_000)) * 1000))
    return ["ok": true, "slept": ms]
  case "waitfile":
    let timeout = ((step["timeoutMs"] as? Double) ?? 20_000) / 1000
    let within = ((step["withinMs"] as? Double) ?? 5_000) / 1000
    if let file = downloadNewestFile(since: Date().addingTimeInterval(-within), timeout: timeout) {
      return ["ok": true, "file": file.path]
    }
    return ["ok": false, "error": "no new file"]
  case "idburls":
    let minimum = (step["minimum"] as? Int) ?? 1
    let within = ((step["withinMs"] as? Double) ?? 60_000) / 1000
    let urls = latestOriginImageURLs(since: Date().addingTimeInterval(-within), minimum: minimum, timeout: 3)
    return ["ok": !urls.isEmpty, "urls": urls]
  default:
    return ["ok": false, "error": "unknown op \(op)"]
  }
}

/// 新版查看器的下载图标没有 AXButton 语义，但布局固定在
/// 「无水印保存设置」左侧 32pt；用有名称的按钮做几何锚点。
func downloadFromViewerAnchored(appElement: AXUIElement, timeout: Double) throws {
  let deadline = Date().addingTimeInterval(min(max(timeout, 1), 60))
  while Date() < deadline {
    guard let viewer = viewerWindow(appElement) else {
      usleep(500_000)
      continue
    }
    ensureNoWatermarkSetting(viewer: viewer)
    let anchors = axFindAll(root: viewer, maxDepth: 24, maxNodes: 3000) { element in
      axRole(element) == "AXButton"
        && (axTitle(element) + "\u{1}" + axDescription(element))
          .localizedCaseInsensitiveContains("无水印保存设置")
    }
    guard let anchor = anchors.first?.element, let (position, size) = axFrame(anchor) else {
      usleep(500_000)
      continue
    }
    let download = CGPoint(x: position.x + size.width / 2 - 32, y: position.y + size.height / 2)
    blog("viewer: 点击顶部下载图标 point=\(Int(download.x)),\(Int(download.y))")
    postClick(download)
    usleep(900_000)
    return
  }
  throw BridgeError.message("未找到查看器下载按钮锚点")
}

/// 图片查看器窗口里的下载。
///
/// 路径一（优先，实测）：查看器顶部一排无标签图标按钮
/// （[关闭][下载][更多]，各约 16x16、同行等距）——WKWebView
/// 图标按钮的 AX 标签恒为空，只能靠形态与位置识别，按 x
/// 排序取中间者即下载键。
/// 路径二（退回）：「无水印保存设置」→ 面板里的保存按钮
/// （须排除 AXCheckBox「无水印保存」——它是勾选项不是下载）。
func downloadFromViewer(appElement: AXUIElement, since: Date, timeout: Double) throws {
  let deadline = Date().addingTimeInterval(min(timeout, 60))
  let chatWindow = mainChatWindow(appElement)
  while Date() < deadline {
    let all = windows(appElement)
    // 查看器 = 非主聊天窗口的顶层窗口（实测无标题）。
    let viewers = all.filter { $0 !== chatWindow }
    let targets = viewers.isEmpty ? all : viewers
    for window in targets {
      // 路径一：同一行（y 差 < 5）的无标签小图标按钮组（≥3 个）。
      let iconButtons = axFindAll(root: window, maxDepth: 30) { element in
        guard axRole(element) == "AXButton" else { return false }
        guard axTitle(element).isEmpty, axDescription(element).isEmpty else { return false }
        guard let (_, size) = axFrame(element) else { return false }
        return size.width <= 20 && size.height <= 20
      }
      var rows: [[MatchedElement]] = []
      for button in iconButtons {
        guard let (position, _) = axFrame(button.element) else { continue }
        if let idx = rows.firstIndex(where: { group in
          guard let first = axFrame(group[0].element) else { return false }
          return abs(first.0.y - position.y) < 5
        }) {
          rows[idx].append(button)
        } else {
          rows.append([button])
        }
      }
      if let row = rows.first(where: { $0.count >= 3 }) {
        let sorted = row.compactMap { button -> (AXUIElement, CGFloat)? in
          guard let (position, _) = axFrame(button.element) else { return nil }
          return (button.element, position.x)
        }.sorted { $0.1 < $1.1 }
        let middle = sorted[sorted.count / 2].0
        blog("viewer: 点击顶部下载图标（无标签按钮组中间者）")
        _ = pressElement(middle)
        return
      }

      // 路径二：无水印保存设置 → 面板保存按钮。
      let controls = axFindAll(root: window, maxDepth: 30) { element in
        guard axRole(element) == "AXButton" else { return false }
        let haystack = axDescription(element) + "\u{1}" + axTitle(element) + "\u{1}" + axHelp(element)
        return haystack.localizedCaseInsensitiveContains("无水印")
          || haystack.localizedCaseInsensitiveContains("保存")
          || haystack.localizedCaseInsensitiveContains("下载")
      }
      if let first = controls.first {
        blog("viewer: 命中控件 role=\(axRole(first.element)) desc=\(axDescription(first.element)) title=\(axTitle(first.element))")
        _ = pressElement(first.element)
        usleep(900_000)
        // 面板里的真正保存按钮——排除复选框（「无水印保存」是勾选项）。
        let again = axFindAll(root: window, maxDepth: 30) { element in
          guard axRole(element) == "AXButton" else { return false }
          let haystack = axDescription(element) + "\u{1}" + axTitle(element)
          return haystack.localizedCaseInsensitiveContains("保存")
            || haystack.localizedCaseInsensitiveContains("下载")
        }
        if let second = again.first(where: { $0.element !== first.element }) {
          _ = pressElement(second.element)
        }
        return
      }
    }
    usleep(800_000)
  }
  blog("viewer: 未找到下载控件")
}

// MARK: - 错误

enum BridgeError: Error {
  case message(String)
}

// MARK: - 命令分发

func handleCommand(_ command: JSONDict) -> JSONDict {
  let cmd = (command["cmd"] as? String) ?? "ping"
  switch cmd {
  case "ping":
    let app = runningYuanbao()
    return [
      "ok": true,
      "trusted": AXIsProcessTrusted(),
      "yuanbaoRunning": app != nil,
      "yuanbaoPid": app.map { Int($0.processIdentifier) } ?? 0,
      "version": 1,
    ]

  case "dump":
    guard let appElement = applicationElement() else {
      return ["ok": false, "error": "元宝未运行"]
    }
    let maxDepth = (command["depth"] as? Int) ?? 12
    let maxNodes = (command["maxNodes"] as? Int) ?? 2500
    let roots = resolveRoots(appElement, command)
    var lines: [String] = []
    var counter = 0
    func walk(_ element: AXUIElement, _ depth: Int) {
      guard counter < maxNodes else { return }
      counter += 1
      let role = axRole(element)
      let roleDescription = axRoleDescription(element)
      var line = "\(String(repeating: "  ", count: depth))[\(counter)] \(role)"
      if !roleDescription.isEmpty { line += " (\(roleDescription))" }
      let title = axTitle(element)
      if !title.isEmpty { line += " title=\"\(title)\"" }
      let description = axDescription(element)
      if !description.isEmpty { line += " desc=\"\(description)\"" }
      let value = axValueText(element)
      if !value.isEmpty { line += " value=\"\(String(value.prefix(120)))\"" }
      let identifier = axIdentifier(element)
      if !identifier.isEmpty { line += " id=\"\(identifier)\"" }
      let actions = axActions(element)
      if !actions.isEmpty { line += " actions=\(actions.joined(separator: ","))" }
      if let (position, size) = axFrame(element) {
        line += " frame=\(Int(position.x)),\(Int(position.y)),\(Int(size.width)),\(Int(size.height))"
      }
      lines.append(line)
      if depth < maxDepth {
        for child in axChildren(element) { walk(child, depth + 1) }
      }
    }
    for root in roots { walk(root, 0) }
    return ["ok": true, "tree": lines.joined(separator: "\n"), "nodes": counter]

  case "query":
    guard let appElement = applicationElement() else {
      return ["ok": false, "error": "元宝未运行"]
    }
    let spec = MatchSpec.parse(command["match"] as? JSONDict)
    let limit = (command["limit"] as? Int) ?? 60
    let matches = findAllInRoots(resolveRoots(appElement, command), maxDepth: 40, maxNodes: 12000) {
      spec.matches($0)
    }
    let described = matches.prefix(limit).enumerated().map { pair in
      describeElement(pair.element.element, index: pair.offset, depth: pair.element.depth)
    }
    return ["ok": true, "count": matches.count, "matches": Array(described)]

  case "act":
    guard let appElement = applicationElement() else {
      return ["ok": false, "error": "元宝未运行"]
    }
    let spec = MatchSpec.parse(command["match"] as? JSONDict)
    let action = (command["action"] as? String) ?? "press"
    let matches = findAllInRoots(resolveRoots(appElement, command), maxDepth: 40, maxNodes: 12000) {
      spec.matches($0)
    }
    guard !matches.isEmpty else { return ["ok": false, "error": "no match"] }
    let chosen = spec.index.map { matches[min(max($0, 0), matches.count - 1)] } ?? matches[matches.count - 1]
    switch action {
    case "press":
      let ok = pressElement(chosen.element)
      return ["ok": ok, "matched": describeElement(chosen.element, index: 0, depth: chosen.depth)]
    case "showmenu":
      let ok = performAXAction(chosen.element, kAXShowMenuAction)
      return ["ok": ok, "matched": describeElement(chosen.element, index: 0, depth: chosen.depth)]
    case "focus":
      focusElement(chosen.element, appElement: appElement)
      return ["ok": true, "matched": describeElement(chosen.element, index: 0, depth: chosen.depth)]
    case "setvalue":
      let text = (command["value"] as? String) ?? ""
      let error = AXUIElementSetAttributeValue(chosen.element, kAXValueAttribute as CFString, text as CFTypeRef)
      return ["ok": error == .success, "code": Int(error.rawValue)]
      case "paste":
        let text = (command["text"] as? String) ?? ""
        focusElement(chosen.element, appElement: appElement)
        usleep(150_000)
        // 全选前置——实测无 Cmd+A 时粘贴会落空
        // （剪贴板内容未进入目标输入区）。
        postKey(keyA, flags: .maskCommand)
        usleep(120_000)
        setClipboard(text)
        usleep(120_000)
        postKey(keyV, flags: .maskCommand)
        return ["ok": true]
    case "click":
      guard let (position, size) = axFrame(chosen.element) else {
        return ["ok": false, "error": "no frame"]
      }
      postClick(CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2))
      return ["ok": true]
    default:
      return ["ok": false, "error": "unknown action \(action)"]
    }

  case "key":
    let name = (command["key"] as? String) ?? "Return"
    var flags: CGEventFlags = []
    if let names = command["flags"] as? [String] {
      for flag in names {
        switch flag.lowercased() {
        case "cmd", "command": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option": flags.insert(.maskAlternate)
        case "ctrl", "control": flags.insert(.maskControl)
        default: break
        }
      }
    }
    let codes: [String: CGKeyCode] = [
      "return": keyReturn, "enter": keyReturn, "escape": keyEscape,
      "tab": 0x30, "space": 0x31, "a": keyA, "v": keyV, "g": keyG,
      "down": 0x7D, "up": 0x7E, "left": 0x7B, "right": 0x7C,
    ]
    guard let code = codes[name.lowercased()] else {
      return ["ok": false, "error": "unknown key \(name)"]
    }
    postKey(code, flags: flags)
    return ["ok": true]

  case "click":
    guard let x = command["x"] as? Double, let y = command["y"] as? Double else {
      return ["ok": false, "error": "x/y required"]
    }
    let right = (command["right"] as? Bool) ?? false
    postClick(CGPoint(x: x, y: y), right: right)
    return ["ok": true]

  case "activate":
    guard let app = ensureYuanbaoRunning() else { return ["ok": false, "error": "未运行"] }
    app.activate(options: [.activateAllWindows])
    return ["ok": true]

  case "windows":
    guard let appElement = applicationElement() else { return ["ok": false, "error": "元宝未运行"] }
    let described = windows(appElement).enumerated().map { pair -> JSONDict in
      var dict: JSONDict = [
        "index": pair.offset,
        "title": axTitle(pair.element),
        "role": axRole(pair.element),
      ]
      if let (position, size) = axFrame(pair.element) {
        dict["x"] = Int(position.x)
        dict["y"] = Int(position.y)
        dict["w"] = Int(size.width)
        dict["h"] = Int(size.height)
      }
      return dict
    }
    return ["ok": true, "windows": described]

  case "script":
    guard let steps = command["steps"] as? [JSONDict] else {
      return ["ok": false, "error": "steps required"]
    }
    let results = steps.map { executeStep($0) }
    return ["ok": true, "results": results]

  case "generate":
    let prompt = (command["prompt"] as? String) ?? ""
    guard !prompt.isEmpty else { return ["ok": false, "error": "prompt required"] }
    let timeout = (command["timeoutMs"] as? Double).map { $0 / 1000 } ?? 240
    let count = (command["count"] as? Int) ?? 1
    do {
      let results = try runGenerate(prompt: prompt, imageCount: count, timeout: timeout)
      return [
        "ok": true,
        "files": results.map { $0.fileURL.path },
        "ids": results.map { $0.id },
      ]
    } catch let BridgeError.message(text) {
      return ["ok": false, "error": text]
    } catch {
      return ["ok": false, "error": "\(error)"]
    }

  default:
    return ["ok": false, "error": "unknown cmd \(cmd)"]
  }
}

// MARK: - 生图结果缓存（同一提示词短时去重）

final class ResultCache {
  static let shared = ResultCache()
  private let lock = NSLock()
  private var entries: [String: (date: Date, payload: JSONDict)] = [:]
  private var inflight: [String: DispatchSemaphore] = [:]

  func lookup(_ key: String, ttl: Double = 600) -> JSONDict? {
    lock.lock()
    defer { lock.unlock() }
    guard let entry = entries[key], Date().timeIntervalSince(entry.date) < ttl else { return nil }
    return entry.payload
  }

  func store(_ key: String, payload: JSONDict) {
    lock.lock()
    defer { lock.unlock() }
    entries[key] = (Date(), payload)
  }

  func begin(_ key: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if inflight[key] != nil { return false }
    inflight[key] = DispatchSemaphore(value: 0)
    return true
  }

  func finish(_ key: String) {
    lock.lock()
    let semaphore = inflight.removeValue(forKey: key)
    lock.unlock()
    semaphore?.signal()
  }

  func wait(_ key: String, timeout: Double) {
    lock.lock()
    let semaphore = inflight[key]
    lock.unlock()
    _ = semaphore?.wait(timeout: .now() + timeout)
  }
}

func imageGenerationResponse(_ body: JSONDict, base: String) -> JSONDict {
  let prompt = (body["prompt"] as? String) ?? ""
  let timeout = (body["timeout_ms"] as? Double).map { $0 / 1000 } ?? 240
  let count = ((body["n"] as? Double).map { Int($0) }) ?? ((body["count"] as? Double).map { Int($0) }) ?? 1
  let key = "\(prompt)#n=\(count)"
  if let cached = ResultCache.shared.lookup(key) { return cached }

  if !ResultCache.shared.begin(key) {
    ResultCache.shared.wait(key, timeout: timeout + 30)
    if let cached = ResultCache.shared.lookup(key) { return cached }
    return ["error": ["message": "同提示词生成仍在进行中"]]
  }
  defer { ResultCache.shared.finish(key) }

  let started = Date()
  do {
    let results = try runGenerate(prompt: prompt, imageCount: count, timeout: timeout)
    blog("images/generations: 生成耗时 \(String(format: "%.1f", Date().timeIntervalSince(started)))s")
    let payload: JSONDict = [
      "created": Int(Date().timeIntervalSince1970),
      "data": results.map { ["url": "\(base)/v1/images/\($0.id)", "revised_prompt": prompt] },
    ]
    ResultCache.shared.store(key, payload: payload)
    return payload
  } catch let BridgeError.message(text) {
    return ["error": ["message": text]]
  } catch {
    return ["error": ["message": "\(error)"]]
  }
}

// MARK: - HTTP 服务

struct HTTPRequest {
  var method: String
  var path: String
  var body: Data
}

func parseRequest(_ data: Data) -> HTTPRequest? {
  guard let separator = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
  let head = String(decoding: data[data.startIndex..<separator.lowerBound], as: UTF8.self)
  var lines = head.components(separatedBy: "\r\n")
  guard let requestLine = lines.first else { return nil }
  let parts = requestLine.split(separator: " ")
  guard parts.count >= 2 else { return nil }
  let method = String(parts[0])
  let path = String(parts[1])
  lines.removeFirst()
  var contentLength = 0
  for line in lines {
    guard let colon = line.firstIndex(of: ":") else { continue }
    let name = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased()
    if name == "content-length" {
      contentLength = Int(line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)) ?? 0
    }
  }
  let bodyStart = separator.upperBound
  let available = data.distance(from: bodyStart, to: data.endIndex)
  if available < contentLength { return nil }
  let body = data.subdata(in: bodyStart..<data.index(bodyStart, offsetBy: contentLength))
  return HTTPRequest(method: method, path: path, body: body)
}

func httpResponse(status: Int, reason: String, contentType: String, body: Data) -> Data {
  var head = "HTTP/1.1 \(status) \(reason)\r\n"
  head += "Content-Type: \(contentType)\r\n"
  head += "Content-Length: \(body.count)\r\n"
  head += "Access-Control-Allow-Origin: *\r\n"
  head += "Connection: close\r\n\r\n"
  var output = Data(head.utf8)
  output.append(body)
  return output
}

func route(_ request: HTTPRequest) -> Data {
  let path = request.path.components(separatedBy: "?").first ?? request.path

  if path == "/health" {
    let app = runningYuanbao()
    var ready = false
    if let app {
      let appElement = AXUIElementCreateApplication(app.processIdentifier)
      _ = AXUIElementSetAttributeValue(appElement, axManualAccessibility, kCFBooleanTrue)
      let deadline = Date().addingTimeInterval(2.5)
      while Date() < deadline {
        if !windows(appElement).isEmpty && textAreaInMainWindow(appElement) != nil {
          ready = true
          break
        }
        usleep(200_000)
      }
    }
    return httpResponse(
      status: 200,
      reason: "OK",
      contentType: "application/json",
      body: jsonData([
        "ok": true,
        "trusted": AXIsProcessTrusted(),
        "yuanbaoRunning": app != nil,
        "yuanbaoPid": app.map { Int($0.processIdentifier) } ?? 0,
        "axReady": ready,
        "inputReady": ready,
        "ready": ready,
      ])
    )
  }

  if path == "/v1/images/generations" && request.method == "POST" {
    guard let body = jsonObject(request.body) else {
      return httpResponse(
        status: 400, reason: "Bad Request", contentType: "application/json",
        body: jsonData(["error": ["message": "invalid json body"]])
      )
    }
    let payload = imageGenerationResponse(body, base: "http://127.0.0.1:\(activePort)")
    if payload["error"] != nil {
      return httpResponse(status: 502, reason: "Bad Gateway", contentType: "application/json", body: jsonData(payload))
    }
    return httpResponse(status: 200, reason: "OK", contentType: "application/json", body: jsonData(payload))
  }

  if path.hasPrefix("/v1/images/") {
    let id = String(path.dropFirst("/v1/images/".count))
    let safe = id.replacingOccurrences(of: "/", with: "")
    let directory = imageDir
    let candidates = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    if let match = candidates.first(where: { $0.deletingPathExtension().lastPathComponent == safe }),
       let data = try? Data(contentsOf: match) {
      let mime = match.pathExtension.lowercased() == "jpg" || match.pathExtension.lowercased() == "jpeg"
        ? "image/jpeg" : "image/png"
      return httpResponse(status: 200, reason: "OK", contentType: mime, body: data)
    }
    return httpResponse(status: 404, reason: "Not Found", contentType: "text/plain", body: Data("not found".utf8))
  }

  if path == "/v1/ax" && request.method == "POST" {
    guard let command = jsonObject(request.body) else {
      return httpResponse(
        status: 400, reason: "Bad Request", contentType: "application/json",
        body: jsonData(["ok": false, "error": "invalid json body"])
      )
    }
    let result = handleCommand(command)
    return httpResponse(status: 200, reason: "OK", contentType: "application/json", body: jsonData(result))
  }

  return httpResponse(status: 404, reason: "Not Found", contentType: "text/plain", body: Data("not found".utf8))
}

final class BridgeServer {
  private let port: UInt16
  private let queue = DispatchQueue(label: "com.local.yuanbao-bridge.http", attributes: .concurrent)
  private var listener: NWListener?

  init(port: UInt16) {
    self.port = port
  }

  func start() throws {
    guard let nwPort = NWEndpoint.Port(rawValue: port) else {
      throw BridgeError.message("非法端口 \(port)")
    }
    let parameters = NWParameters.tcp
    parameters.allowLocalEndpointReuse = true
    parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: nwPort)
    let listener = try NWListener(using: parameters)
    listener.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }
    listener.stateUpdateHandler = { state in
      switch state {
      case .ready:
        blog("http: 监听 127.0.0.1:\(self.port)")
      case .failed(let error):
        blog("http: 监听失败 \(error)")
        exit(1)
      default:
        break
      }
    }
    listener.start(queue: queue)
    self.listener = listener
  }

  private func accept(_ connection: NWConnection) {
    connection.start(queue: queue)
    receive(connection, buffer: Data())
  }

  private func receive(_ connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 262_144) { data, _, isComplete, error in
      var accumulated = buffer
      if let data { accumulated.append(data) }
      if let request = parseRequest(accumulated) {
        let response = route(request)
        connection.send(content: response, completion: .contentProcessed { _ in
          connection.cancel()
        })
        return
      }
      if isComplete || error != nil || accumulated.count > 64 * 1024 * 1024 {
        connection.cancel()
        return
      }
      self.receive(connection, buffer: accumulated)
    }
  }
}

// MARK: - 入口

let activePort: UInt16 = {
  if let raw = ProcessInfo.processInfo.environment["YUANBAO_BRIDGE_PORT"], let value = UInt16(raw) {
    return value
  }
  return 3210
}()

let arguments = CommandLine.arguments
let mode = arguments.count > 1 ? arguments[1] : "serve"

switch mode {
case "serve":
  blog("bridge: 启动 port=\(activePort) trusted=\(AXIsProcessTrusted())")
  let server = BridgeServer(port: activePort)
  do {
    try server.start()
  } catch let BridgeError.message(text) {
    blog("bridge: 启动失败 \(text)")
    exit(1)
  } catch {
    blog("bridge: 启动失败 \(error)")
    exit(1)
  }
  dispatchMain()

case "cmd":
  // 单次调用：YuanbaoBridge cmd '{"cmd":"ping"}'
  let payload = arguments.count > 2 ? arguments[2] : "{\"cmd\":\"ping\"}"
  let command = jsonObject(Data(payload.utf8)) ?? ["cmd": "ping"]
  print(jsonText(handleCommand(command)))

case "trust":
  // 触发系统辅助功能授权提示（把本 App 加入「隐私与安全性 → 辅助功能」）。
  let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
  let trusted = AXIsProcessTrustedWithOptions(options)
  print(jsonText(["trusted": trusted]))

default:
  print("usage: YuanbaoBridge [serve|cmd '<json>'|trust]")
}
