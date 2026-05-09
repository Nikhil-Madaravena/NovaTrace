import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Activity, AlertTriangle, Bell, Cpu, HardDrive,
  MemoryStick, Server, Settings, Shield, Zap,
  TrendingUp, Circle, ChevronRight, Terminal, Network,
  ListTree, LogOut
} from 'lucide-react';
import { api, alertsApi, metricsApi } from './api';
import type { ProcessInfo, AlertEvent } from './api';

interface Metric {
  node_id: string;
  cpu_usage: number;
  mem_usage: number;
  disk_usage: number;
  timestamp: string;
}


// NavItem extended below near NAV constant

const FAKE_NODES = ['prod-us-east-1', 'prod-eu-west-2', 'staging-ap-1'];

function getStatusColor(val: number) {
  if (val > 90) return 'rose';
  if (val > 75) return 'amber';
  return 'emerald';
}

function StatusDot({ status }: { status: 'healthy' | 'warning' | 'critical' }) {
  const colors = { healthy: '#10b981', warning: '#f59e0b', critical: '#f43f5e' };
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: colors[status] }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: colors[status] }} />
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, unit, color, gradient, progress }: {
  icon: any; label: string; value: string; unit: string;
  color: string; gradient: string; progress: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-all duration-300"
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl`}
        style={{ background: `radial-gradient(circle at 20% 50%, ${color}10 0%, transparent 70%)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl" style={{ background: `${color}15` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
          </div>
          <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
        </div>
        <div className="flex items-end gap-1 mb-4">
          <span className="text-3xl font-bold text-white tabular-nums">{value}</span>
          <span className="text-slate-500 mb-1 text-sm">{unit}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: gradient, boxShadow: `0 0 10px ${color}60` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function NodeCard({ node, metric }: { node: string; metric: Metric | null }) {
  const status: 'healthy' | 'warning' | 'critical' =
    !metric ? 'warning' :
    metric.cpu_usage > 90 || metric.mem_usage > 90 ? 'critical' :
    metric.cpu_usage > 75 || metric.mem_usage > 75 ? 'warning' : 'healthy';

  const statusLabels = { healthy: 'Operational', warning: 'Degraded', critical: 'Critical' };
  const statusBg = { healthy: '#10b98115', warning: '#f59e0b15', critical: '#f43f5e15' };
  const statusColor = { healthy: '#10b981', warning: '#f59e0b', critical: '#f43f5e' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-5 hover:border-white/10 transition-all duration-300 cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white/5">
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white font-mono">{node}</p>
            <p className="text-xs text-slate-500 mt-0.5">aws • us-east-1a</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: statusBg[status], color: statusColor[status] }}>
          <StatusDot status={status} />
          {statusLabels[status]}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'CPU', value: metric?.cpu_usage ?? 0, color: '#06b6d4' },
          { label: 'MEM', value: metric?.mem_usage ?? 0, color: '#8b5cf6' },
          { label: 'DISK', value: metric?.disk_usage ?? 0, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.02] rounded-xl p-3">
            <p className="text-[10px] text-slate-500 mb-1.5 font-mono">{label}</p>
            <p className="text-sm font-bold text-white tabular-nums">{value.toFixed(1)}%</p>
            <div className="mt-2 h-1 rounded-full bg-white/5">
              <motion.div className="h-full rounded-full"
                style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}60` }}
                animate={{ width: `${value}%` }}
                transition={{ type: 'spring', stiffness: 60, damping: 20 }}
              />
            </div>
          </div>
        ))}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors mt-3 ml-auto" />
    </motion.div>
  );
}

const ALERT_COLORS = {
  critical: { bg: '#f43f5e10', border: '#f43f5e30', text: '#f43f5e', icon: '#f43f5e' },
  warning: { bg: '#f59e0b10', border: '#f59e0b30', text: '#f59e0b', icon: '#f59e0b' },
  info: { bg: '#06b6d410', border: '#06b6d430', text: '#94a3b8', icon: '#06b6d4' },
};

function AlertItem({ alert }: { alert: AlertEvent }) {
  const c = ALERT_COLORS[alert.severity];
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl border"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: c.icon }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium" style={{ color: c.text }}>{alert.message}</p>
        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{new Date(alert.created_at).toLocaleTimeString()}</p>
      </div>
    </motion.div>
  );
}

const NAV = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'nodes', label: 'Nodes', icon: Server },
  { id: 'processes', label: 'Processes', icon: ListTree },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'logs', label: 'Logs', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type NavItem = 'overview' | 'nodes' | 'processes' | 'alerts' | 'logs' | 'settings';

export default function App({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [liveMetric, setLiveMetric] = useState<Metric | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>('overview');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toISOString()}] INFO  Agent initialized successfully`,
    `[${new Date().toISOString()}] INFO  WebSocket connection established`,
  ]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Simulated extra nodes (in reality each would be a separate agent)
  const [fakeNodeMetrics] = useState<Record<string, Metric>>({
    [FAKE_NODES[1]]: { node_id: FAKE_NODES[1], cpu_usage: 42, mem_usage: 67, disk_usage: 55, timestamp: new Date().toISOString() },
    [FAKE_NODES[2]]: { node_id: FAKE_NODES[2], cpu_usage: 88, mem_usage: 91, disk_usage: 72, timestamp: new Date().toISOString() },
  });

  useEffect(() => {
    metricsApi.historical().then(res => {
      const data = res.data;
      if (Array.isArray(data)) setMetrics(data.reverse().slice(-50));
      if (data.length > 0) {
        metricsApi.processes(data[data.length-1].node_id)
          .then(r => setProcesses(r.data)).catch(() => {});
      }
    }).catch(() => {});
    alertsApi.list().then(res => setAlerts(res.data)).catch(() => {});

    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onopen = () => setWsStatus('live');
    ws.onerror = () => setWsStatus('offline');
    ws.onclose = () => setWsStatus('offline');
    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'alert') {
          setAlerts(prev => [payload.data, ...prev].slice(0, 20));
          setLogs(prev => [...prev.slice(-99), `[${new Date().toISOString()}] WARN  New alert on ${payload.data.node_id}`]);
        } else if (payload.type === 'processes') {
          if (payload.data.node_id === liveMetric?.node_id || !liveMetric) {
            setProcesses(payload.data.processes);
          }
        } else if (payload.node_id) {
          const m: Metric = payload;
          setLiveMetric(m);
          setMetrics(prev => [...prev.slice(-49), m]);
          setLogs(prev => [...prev.slice(-99),
            `[${new Date().toISOString()}] INFO  Metrics from ${m.node_id} — CPU: ${m.cpu_usage.toFixed(1)}%`
          ]);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const chartData = metrics.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu: +m.cpu_usage.toFixed(2),
    mem: +m.mem_usage.toFixed(2),
    disk: +m.disk_usage.toFixed(2),
  }));

  const cpu = liveMetric?.cpu_usage ?? 0;
  const mem = liveMetric?.mem_usage ?? 0;
  const disk = liveMetric?.disk_usage ?? 0;
  const nodeId = liveMetric?.node_id ?? '—';

  const allNodes = [
    { name: nodeId || FAKE_NODES[0], metric: liveMetric },
    { name: FAKE_NODES[1], metric: fakeNodeMetrics[FAKE_NODES[1]] },
    { name: FAKE_NODES[2], metric: fakeNodeMetrics[FAKE_NODES[2]] },
  ];

  return (
    <div className="flex h-screen bg-[#050816] overflow-hidden relative">
      {/* Background layers */}
      <div className="grid-bg" />
      <div className="spotlight" />

      {/* Sidebar */}
      <aside className="relative z-10 w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.04] bg-white/[0.01]">
        {/* Logo */}
        <div className="p-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">NovaTrace</p>
              <p className="text-[10px] text-slate-600 font-mono">v2.0.0</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveNav(id as NavItem)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeNav === id
                  ? 'bg-white/[0.06] text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
              {id === 'alerts' && alerts.some(a => a.severity === 'critical') && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="p-4 border-t border-white/[0.04] space-y-2">
          <div className="flex items-center gap-2">
            <StatusDot status={wsStatus === 'live' ? 'healthy' : wsStatus === 'connecting' ? 'warning' : 'critical'} />
            <span className="text-xs text-slate-500 font-mono">
              {wsStatus === 'live' ? 'WS Connected' : wsStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3 text-slate-700" />
            <span className="text-[10px] text-slate-700">Encrypted · TLS 1.3</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.04] bg-white/[0.01]">
          <div>
            <h1 className="text-base font-semibold text-white capitalize">{activeNav}</h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs">
              <Network className="w-3 h-3 text-emerald-400" />
              <span className="text-slate-400">{allNodes.length} nodes</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs">
              <Circle className="w-2 h-2 text-rose-400 fill-rose-400" />
              <span className="text-slate-400">{alerts.filter(a => a.severity === 'critical').length} critical</span>
            </div>
            
            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-slate-300">{userEmail}</p>
                <p className="text-[10px] text-slate-500">Admin</p>
              </div>
              <button onClick={onLogout} className="p-2 glass rounded-xl hover:border-white/10 hover:text-rose-400 transition-all text-slate-400">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">

            {/* OVERVIEW */}
            {activeNav === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Metric cards */}
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard icon={Cpu} label="CPU Usage" value={cpu.toFixed(1)} unit="%" color="#06b6d4"
                    gradient="linear-gradient(90deg,#0891b2,#06b6d4)" progress={cpu} />
                  <MetricCard icon={MemoryStick} label="Memory" value={mem.toFixed(1)} unit="%" color="#8b5cf6"
                    gradient="linear-gradient(90deg,#7c3aed,#8b5cf6)" progress={mem} />
                  <MetricCard icon={HardDrive} label="Disk" value={disk.toFixed(1)} unit="%" color="#f59e0b"
                    gradient="linear-gradient(90deg,#d97706,#f59e0b)" progress={disk} />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'cpu', label: 'CPU Utilization', color: '#06b6d4', gradient: 'colorCpu' },
                    { key: 'mem', label: 'Memory Pressure', color: '#8b5cf6', gradient: 'colorMem' },
                  ].map(({ key, label, color, gradient }) => (
                    <div key={key} className="glass rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-300">{label}</h3>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-500">LIVE</span>
                      </div>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 5, right: 0, bottom: 0, left: -20 }}>
                            <defs>
                              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{ background: '#0d1224', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, fontSize: 12 }}
                              labelStyle={{ color: '#64748b' }}
                              itemStyle={{ color: color }}
                            />
                            <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2}
                              fill={`url(#${gradient})`} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Node info footer */}
                <div className="glass rounded-2xl p-4 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5">
                    <Server className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Active Node</p>
                    <p className="text-sm font-mono font-semibold text-white">{nodeId}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <StatusDot status="healthy" />
                    <span className="text-xs text-emerald-400">Streaming</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* NODES */}
            {activeNav === 'nodes' && (
              <motion.div key="nodes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-xs text-slate-500 mb-4 font-mono">{allNodes.length} registered nodes — {allNodes.filter(n => n.metric).length} reporting</p>
                <div className="grid grid-cols-1 gap-4">
                  {allNodes.map(n => <NodeCard key={n.name} node={n.name} metric={n.metric} />)}
                </div>
              </motion.div>
            )}

            {/* PROCESSES */}
            {activeNav === 'processes' && (
              <motion.div key="processes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Top Processes</h3>
                      <p className="text-xs text-slate-500 font-mono mt-1">Node: {nodeId}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/[0.02] border-b border-white/[0.04]">
                        <tr>
                          <th className="px-5 py-3 text-xs font-semibold text-slate-400">PID</th>
                          <th className="px-5 py-3 text-xs font-semibold text-slate-400">Process Name</th>
                          <th className="px-5 py-3 text-xs font-semibold text-slate-400">CPU %</th>
                          <th className="px-5 py-3 text-xs font-semibold text-slate-400">Memory (MB)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {processes.map(p => (
                          <tr key={p.pid} className="hover:bg-white/[0.01] transition-colors">
                            <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.pid}</td>
                            <td className="px-5 py-3 font-medium text-slate-300">{p.name}</td>
                            <td className="px-5 py-3 tabular-nums text-cyan-400">{p.cpu.toFixed(1)}%</td>
                            <td className="px-5 py-3 tabular-nums text-purple-400">{p.memory.toFixed(1)}</td>
                          </tr>
                        ))}
                        {processes.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-slate-500 text-sm">No process data available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ALERTS */}
            {activeNav === 'alerts' && (
              <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-slate-500 font-mono">{alerts.length} events — {alerts.filter(a => a.severity === 'critical').length} critical</p>
                  <button onClick={() => setAlerts([])} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Clear all</button>
                </div>
                <div className="space-y-2">
                  <AnimatePresence>
                    {alerts.map(a => <AlertItem key={a.id} alert={a} />)}
                  </AnimatePresence>
                  {alerts.length === 0 && (
                    <div className="glass rounded-2xl p-12 text-center">
                      <Shield className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">All systems nominal</p>
                      <p className="text-xs text-slate-600 mt-1">No active alerts</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* LOGS */}
            {activeNav === 'logs' && (
              <motion.div key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-500 font-mono">Live agent output</span>
                    <span className="ml-auto text-[10px] font-mono text-emerald-500 animate-pulse">● STREAMING</span>
                  </div>
                  <div className="p-4 h-[60vh] overflow-y-auto bg-[#030712] font-mono text-xs space-y-1">
                    {logs.map((line, i) => (
                      <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-emerald-400 leading-relaxed">
                        {line}
                      </motion.p>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* SETTINGS */}
            {activeNav === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Project Info */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" /> Project Info
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Project', value: 'NovaTrace' },
                      { label: 'Version', value: 'v2.0.0' },
                      { label: 'Backend', value: 'Go + Gin + GORM' },
                      { label: 'Database', value: 'PostgreSQL + Redis' },
                      { label: 'Auth', value: 'JWT · Bcrypt' },
                      { label: 'Transport', value: 'WebSocket · REST' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/[0.02] rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 font-mono mb-1">{label}</p>
                        <p className="text-sm font-medium text-slate-200">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Demo Credentials */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-400" /> Demo Credentials
                  </h3>
                  <div className="space-y-3">
                    {[
                      { role: 'Admin', email: 'admin@novatrace.io', password: 'admin123', color: '#06b6d4' },
                      { role: 'Viewer', email: 'viewer@novatrace.io', password: 'viewer123', color: '#8b5cf6' },
                    ].map(c => (
                      <div key={c.role} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                        <div>
                          <p className="text-xs font-mono text-slate-300">{c.email}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5 font-mono">Password: {c.password}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
                          style={{ background: `${c.color}20`, color: c.color }}>{c.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current Session */}
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">Current Session</h3>
                  <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                    <div>
                      <p className="text-xs text-slate-300 font-medium">{userEmail}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Authenticated via JWT · 72h expiry</p>
                    </div>
                    <button onClick={onLogout}
                      className="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-lg bg-rose-500/10 transition-colors">
                      Sign Out
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
