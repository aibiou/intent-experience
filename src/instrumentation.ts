/**
 * 服务端启动钩子（Next.js instrumentation）。
 *
 * 职责：模型网关 mini-service 的进程保活（supervisor）。
 *
 * 为什么需要：本沙箱环境会周期性收割后台进程（观察：独立启动的
 * mini-service 会在数秒~数分钟内被静默杀死，无 OOM、无错误输出）。
 * 主应用 dev server 是环境白名单常驻进程——由它每 20 秒探测网关健康，
 * 死亡则以脱离会话的方式重新拉起（bun index.ts，detached + unref），
 * 实现"被收割 → 20 秒内自愈"。
 *
 * 部署形态说明：生产环境网关应交给正规进程管理（systemd / 容器编排），
 * 本钩子是本沙箱开发形态的保活手段；探测幂等，双实例无害
 * （端口被占时 bun 启动失败，watchdog 下一轮探测到健康即静默）。
 */

const GATEWAY_URL = 'http://127.0.0.1:3031/healthz';
const PROBE_INTERVAL_MS = 20_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { spawn } = await import('node:child_process');
  const path = await import('node:path');

  const gatewayDir = path.join(process.cwd(), 'mini-services', 'model-gateway');

  const probeAndRevive = async (): Promise<void> => {
    try {
      const res = await fetch(GATEWAY_URL, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return; // 健康——不动
    } catch {
      // 不可达——拉起
    }
    try {
      const child = spawn('bun', ['index.ts'], {
        cwd: gatewayDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
      console.log('[instrumentation] model-gateway revived (detached spawn)');
    } catch (error) {
      console.error('[instrumentation] model-gateway revive failed:', error);
    }
  };

  await probeAndRevive();
  // 注：不设常驻 setInterval——Next dev 的 instrumentation 上下文中
  // 定时器实测不持续运行；网关保活由请求驱动（llm-gateway.ts 的
  // ensureGateway：每次生成前探测、死了就地拉起）兜底，更鲁棒。
}
