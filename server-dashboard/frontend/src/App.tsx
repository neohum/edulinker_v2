import { useState, useEffect, useRef } from 'react';
import { GetStatus, StartServer, StopServer, GetLogs, ClearLogs, CheckDependencies, InstallAndStartWithScoop, GetLocalIP } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { Toaster, toast } from 'sonner';
import logoUrl from './assets/images/logo-universal.png';
import UserManagement from './components/UserManagement';
import DocumentManagement from './components/DocumentManagement';

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [uptime, setUptime] = useState("0s");
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'status' | 'settings' | 'users' | 'documents'>('status');
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [dependencies, setDependencies] = useState({ postgres: false, redis: false, minio: false });
  const [isStartingInfra, setIsStartingInfra] = useState(false);
  const [bootSequenceActive, setBootSequenceActive] = useState(false);
  const [bootStep, setBootStep] = useState<number>(0);
  const [localIP, setLocalIP] = useState('');
  const [autoStart, setAutoStart] = useState(() => localStorage.getItem('autoStart') !== 'false');
  const [autoInfra, setAutoInfra] = useState(() => localStorage.getItem('autoInfra') !== 'false');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem('sidebar_open') !== 'false');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('sidebar_open', isSidebarOpen.toString());
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('autoStart', autoStart.toString());
  }, [autoStart]);

  useEffect(() => {
    localStorage.setItem('autoInfra', autoInfra.toString());
  }, [autoInfra]);

  // Robust queued retry loop for infrastructure
  const waitForInfraQueue = async () => {
    setIsStartingInfra(true);
    let ready = false;
    let attempts = 0;
    let currentDeps = { postgres: false, redis: false, minio: false };

    while (!ready) {
      currentDeps = await CheckDependencies();
      if (currentDeps.postgres && currentDeps.redis && currentDeps.minio) {
        ready = true;
        setDependencies(currentDeps);
        if (attempts > 0) toast.success("대기열 처리 완료: 필수 인프라가 모두 성공적으로 구동되었습니다!");
        setTimeout(() => setBootStep(2), 500);
        break;
      }

      try {
        if (attempts === 0) {
          toast.info("인프라 구동 스크립트를 백그라운드 큐에 등록했습니다...");
        } else {
          toast.warning(`인프라가 아직 실행되지 않았습니다. 백그라운드 확인 및 재명령 중... (${attempts}회)`);
        }
        await InstallAndStartWithScoop();
      } catch (err: any) {
        console.error("Queue iteration error:", err);
      }

      attempts++;
      // Wait 5 seconds before next polling cycle
      await new Promise(res => setTimeout(res, 5000));
    }
    setIsStartingInfra(false);
    return currentDeps;
  };

  // Boot sequence and event subscriptions
  useEffect(() => {
    const bootSequence = async () => {
      try {
        GetLocalIP().then(setLocalIP).catch(console.error);
        const statusResult = await GetStatus();
        setIsRunning(statusResult.isRunning);
        setUptime(statusResult.uptime);

        if (statusResult.isRunning) return; // Already running, no boot sec needed

        if (autoStart || autoInfra) {
          setBootSequenceActive(true);
          setBootStep(1); // Infra check
        }

        // 1. Wait for infrastructure to be ready
        let ready = false;
        let currentDeps = { postgres: false, redis: false, minio: false };

        // Give local infra a chance to boot (up to 60 seconds) if we are auto-starting
        for (let i = 0; i < 60; i++) {
          currentDeps = await CheckDependencies();
          setDependencies(currentDeps);
          if (currentDeps.postgres && currentDeps.redis && currentDeps.minio) {
            ready = true;
            break;
          }

          if (!autoInfra && !autoStart) break; // Don't wait if not auto-starting

          if (autoInfra && i === 2 && !ready) {
            // After 2 seconds of waiting, if autoInfra is true, try to install/start via scoop
            toast.info("인프라 구동 스크립트를 시도합니다... (표시되지 않더라도 백그라운드에서 진행 중입니다)");
            InstallAndStartWithScoop().catch(console.error);
          }

          await new Promise(res => setTimeout(res, 1000));
        }

        if (autoStart || autoInfra) {
          setBootStep(2);
          await new Promise(res => setTimeout(res, 500)); // UI delay
        }

        // 2. Check & start backend server if needed (including DB Auto-setup)
        if (autoStart) {
          if (ready) {
            await handleStartCore();
            setBootStep(3);
            setTimeout(() => setBootSequenceActive(false), 2000);
          } else {
            toast.error("인프라(DB/Redis/MinIO)가 준비되지 않아 서버 자동 구동을 실패했습니다.");
            setBootSequenceActive(false);
          }
        } else {
          setBootSequenceActive(false);
        }
      } catch (err) {
        console.error("Boot sequence error:", err);
        toast.error("시작 중 시스템 수준 오류 발생: " + err);
        setBootSequenceActive(false);
      }
    };

    bootSequence();
    GetLogs().then((res) => {
      if (res) setLogs(res);
    });

    // Subscriptions
    const offLog = EventsOn("server-log", (newLog: string) => {
      setLogs((prev) => {
        const updated = [...prev, newLog];
        // Keep last 1000 items locally
        return updated.length > 1000 ? updated.slice(updated.length - 1000) : updated;
      });
    });

    const offStop = EventsOn("server-stopped", () => {
      setIsRunning(false);
      fetchStatus();
    });

    // Poll status every 2 secs
    const interval = setInterval(fetchStatus, 2000);

    return () => {
      offLog();
      offStop();
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, activeTab]);

  const fetchStatus = async () => {
    // Check dependencies first
    const deps = await CheckDependencies();
    setDependencies(deps);

    const status = await GetStatus();
    setIsRunning(status.isRunning);
    setUptime(status.uptime);
    return status;
  };

  const handleStartInfraCore = async () => {
    setIsStartingInfra(true);
    toast.info("Scoop으로 인프라 설치 및 실행 중... (로그 창을 확인하세요)");
    try {
      await InstallAndStartWithScoop();
      toast.success("필수 인프라가 모두 성공적으로 구동되었습니다!");
    } catch (err: any) {
      console.error(err);
      toast.error("인프라 구동 실패: " + err);
    } finally {
      setIsStartingInfra(false);
    }
  };

  const handleStartInfra = async () => {
    setBootSequenceActive(true);
    setBootStep(1);
    await handleStartInfraCore();
    await fetchStatus();
    setBootStep(2);
    setTimeout(() => { setBootSequenceActive(false); }, 1500);
  };

  const handleStartCore = async () => {
    try {
      await StartServer();
      // Don't set isRunning here — the 2s polling will detect it
      // once the server actually starts (build + launch takes time)
      toast.info("서버를 시작하는 중입니다... 로그를 확인하세요.");
    } catch (err: any) {
      console.error(err);
      toast.error("서버 시작 실패: " + err);
    }
  };

  const handleStart = async () => {
    setBootSequenceActive(true);
    setBootStep(2);
    await handleStartCore();
    await fetchStatus();
    setBootStep(3);
    setTimeout(() => { setBootSequenceActive(false); }, 1500);
  };

  const handleStop = async () => {
    try {
      await StopServer();
      setIsRunning(false);
      fetchStatus();
    } catch (err: any) {
      console.error(err);
      toast.error("서버 중지 실패: " + err);
    }
  };

  const handleClearLogs = async () => {
    await ClearLogs();
    setLogs([]);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <Toaster richColors position="top-center" />

      {/* Boot Sequence Overlay */}
      {bootSequenceActive && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <i className="fi fi-rr-rocket text-indigo-500" />
              자동 초기화 시퀀스
            </h2>
            <div className="space-y-4">
              <div className={`flex items-center gap-4 ${bootStep >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bootStep > 1 ? 'bg-emerald-100 text-emerald-600' : bootStep === 1 ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                  {bootStep > 1 ? <i className="fi fi-rr-check" /> : <span className="font-bold text-sm">1</span>}
                </div>
                <div>
                  <div className="font-bold">인프라 모니터링 및 설치</div>
                  <div className="text-xs text-slate-500">PostgreSQL, Redis, MinIO 상태 확인 및 대기</div>
                </div>
              </div>
              <div className="ml-4 border-l-2 border-slate-100 dark:border-slate-800 h-4"></div>
              <div className={`flex items-center gap-4 ${bootStep >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bootStep > 2 ? 'bg-emerald-100 text-emerald-600' : bootStep === 2 ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                  {bootStep > 2 ? <i className="fi fi-rr-check" /> : <span className="font-bold text-sm">2</span>}
                </div>
                <div>
                  <div className="font-bold">DB 자동 구성 및 마이그레이션</div>
                  <div className="text-xs text-slate-500">데이터베이스 롤/스키마 구성 및 서버 시작</div>
                </div>
              </div>
              <div className="ml-4 border-l-2 border-slate-100 dark:border-slate-800 h-4"></div>
              <div className={`flex items-center gap-4 ${bootStep >= 3 ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bootStep >= 3 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {bootStep >= 3 ? <i className="fi fi-rr-check" /> : <span className="font-bold text-sm">3</span>}
                </div>
                <div>
                  <div className="font-bold">서비스 활성화 완료</div>
                  <div className="text-xs text-slate-500">대시보드 모니터링 시작</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`relative transition-all duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center py-8 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-8 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-500 shadow-sm z-10 transition-transform"
        >
          <i className={`fi fi-rr-angle-small-${isSidebarOpen ? 'left' : 'right'} text-xs`} />
        </button>

        <div className="flex flex-col items-center justify-center mb-4 transition-transform">
          <img src={logoUrl} alt="EduLinker Logo" className={`drop-shadow-xl transition-all ${isSidebarOpen ? 'w-14 h-14' : 'w-10 h-10'}`} />
        </div>

        <div className={`overflow-hidden transition-all flex flex-col items-center ${isSidebarOpen ? 'opacity-100 max-h-20 mb-4' : 'opacity-0 max-h-0 mb-0'}`}>
          <h1 className="text-xl font-bold tracking-tight">edulinker</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">Server Dashboard</p>
        </div>

        <div className={`text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 py-1.5 rounded-md mb-6 whitespace-nowrap overflow-hidden text-ellipsis shadow-sm transition-all ${isSidebarOpen ? 'w-full max-w-[180px] px-3' : 'w-14 px-1 text-[10px] text-center'}`}>
          {isSidebarOpen ? `IP: ${localIP}` : localIP.split('.')[3] || 'IP'}
        </div>

        <nav className={`w-full flex flex-col gap-2 ${isSidebarOpen ? 'px-4' : 'px-2'}`}>
          <button
            onClick={() => setActiveTab('status')}
            title="시스템 상태"
            className={`flex items-center font-medium py-3 rounded-lg text-sm transition-colors ${activeTab === 'status'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${isSidebarOpen ? 'gap-3 px-4 w-full' : 'justify-center w-full px-0'}`}
          >
            <i className="fi fi-rr-chart-line-up shrink-0" style={{ fontSize: 18 }} />
            {isSidebarOpen && <span className="whitespace-nowrap">시스템 상태</span>}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            title="서버 설정"
            className={`flex items-center font-medium py-3 rounded-lg text-sm transition-colors ${activeTab === 'settings'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${isSidebarOpen ? 'gap-3 px-4 w-full' : 'justify-center w-full px-0'}`}
          >
            <i className="fi fi-rr-settings shrink-0" style={{ fontSize: 18 }} />
            {isSidebarOpen && <span className="whitespace-nowrap">서버 설정</span>}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            title="사용자 관리"
            className={`flex items-center font-medium py-3 rounded-lg text-sm transition-colors ${activeTab === 'users'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${isSidebarOpen ? 'gap-3 px-4 w-full' : 'justify-center w-full px-0'}`}
          >
            <i className="fi fi-rr-users shrink-0" style={{ fontSize: 18 }} />
            {isSidebarOpen && <span className="whitespace-nowrap">사용자 관리</span>}
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            title="문서 관리"
            className={`flex items-center font-medium py-3 rounded-lg text-sm transition-colors ${activeTab === 'documents'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${isSidebarOpen ? 'gap-3 px-4 w-full' : 'justify-center w-full px-0'}`}
          >
            <i className="fi fi-rr-book-open-cover shrink-0" style={{ fontSize: 18 }} />
            {isSidebarOpen && <span className="whitespace-nowrap">문서 관리</span>}
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-8 gap-6">
        {activeTab === 'status' && (
          <>
            <header className="flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                API 서비스 관리
              </h2>
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold ${isRunning ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30' :
                  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  {isRunning ? 'RUNNING' : 'STOPPED'}
                </div>
                {isRunning && (
                  <span className="text-sm font-medium text-slate-500 tabular-nums">Uptime: {uptime}</span>
                )}
              </div>
            </header>

            {/* Dependency Status UI */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold mb-1">인프라 모니터링</h3>
                <p className="text-sm text-slate-500">서버 실행에 필요한 필수 데이터베이스 및 서비스의 상태 (포트 체크)</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex gap-2">
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${dependencies.postgres ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    🐘 PG: {dependencies.postgres ? 'ON' : 'OFF'}
                  </span>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${dependencies.redis ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    ⚡ REDIS: {dependencies.redis ? 'ON' : 'OFF'}
                  </span>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${dependencies.minio ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    🪣 MINIO: {dependencies.minio ? 'ON' : 'OFF'}
                  </span>
                </div>
                {(!dependencies.postgres || !dependencies.redis || !dependencies.minio) && (
                  <button
                    onClick={handleStartInfra}
                    disabled={isStartingInfra}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isStartingInfra ? <i className="fi fi-rr-spinner animate-spin" /> : <i className="fi fi-rr-download" />}
                    {isStartingInfra ? '설치 진행 중...' : '인프라 자동 구동 (Scoop)'}
                  </button>
                )}
              </div>
            </div>

            {/* Controls Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between shadow-sm">
              <div>
                <h3 className="text-lg font-bold mb-1">고성능 Fiber 백엔드</h3>
                <p className="text-sm text-slate-500">포트 5200에서 실행되며 WS Hub, 레지스트리를 포함합니다.</p>
              </div>
              <div className="flex gap-3">
                {!isRunning ? (
                  <button
                    onClick={handleStart}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    <i className="fi fi-rr-play" style={{ fontSize: 16 }} />
                    서버 켜기
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    <i className="fi fi-rr-stop" style={{ fontSize: 16 }} />
                    서버 중지
                  </button>
                )}
              </div>
            </div>

            {/* Log Viewer */}
            <div className="flex-1 min-h-0 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-inner">
              <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex justify-between items-center text-slate-400">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <i className="fi fi-rr-terminal" style={{ fontSize: 16 }} />
                    <span className="text-xs font-mono tracking-wider font-semibold">STDOUT / STDERR</span>
                  </div>
                  <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                    <button onClick={() => setLogFilter('all')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${logFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>전체</button>
                    <button onClick={() => setLogFilter('error')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${logFilter === 'error' ? 'bg-rose-500/20 text-rose-400 shadow-sm' : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/50'}`}>에러</button>
                    <button onClick={() => setLogFilter('warn')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${logFilter === 'warn' ? 'bg-orange-500/20 text-orange-400 shadow-sm' : 'text-slate-400 hover:text-orange-400 hover:bg-slate-800/50'}`}>경고</button>
                  </div>
                </div>
                <button
                  onClick={handleClearLogs}
                  className="hover:text-rose-400 transition-colors"
                  title="로그 지우기"
                >
                  <i className="fi fi-rr-trash" style={{ fontSize: 16 }} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
                {logs.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-600 italic">
                    표시할 로그가 없습니다. 서버를 시작해주세요.
                  </div>
                ) : (
                  logs.filter(log => {
                    if (logFilter === 'all') return true;
                    if (logFilter === 'error') return log.includes('ERR');
                    if (logFilter === 'warn') return log.includes('WARN');
                    return true;
                  }).map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words border-b border-slate-800/50 pb-1 mb-1 last:border-0 hover:bg-slate-800/30 px-1 rounded-sm">
                      {log.includes('INFO') && <span className="text-blue-400 font-bold mr-2">[INFO]</span>}
                      {log.includes('ERR') && <span className="text-rose-400 font-bold mr-2">[ERR]</span>}
                      {log.includes('WARN') && <span className="text-orange-400 font-bold mr-2">[WARN]</span>}
                      {log.includes('🚀') && <span className="text-emerald-400 font-bold mr-2">🚀</span>}
                      {log.replace(/\[(INFO|ERR|WARN)\]|🚀/g, '')}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </>
        )}
        {activeTab === 'settings' && (
          /* Settings Content */
          <>
            <header className="flex justify-between items-center mb-2">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                서버 환경 설정
              </h2>
              <button
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                onClick={() => toast.success('설정이 저장되었습니다.')}
              >
                <i className="fi fi-rr-disk" style={{ fontSize: 16 }} />
                설정 저장
              </button>
            </header>

            <div className="flex-1 overflow-y-auto pr-2 pb-8">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Network Config */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                      <i className="fi fi-rr-server" style={{ fontSize: 20 }} />
                    </div>
                    <h3 className="text-lg font-bold">네트워크 설정</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">서버 포트 (Port)</label>
                      <input type="number" defaultValue={5200} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">CORS 허용 도메인</label>
                      <input type="text" defaultValue="*" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://example.com" />
                    </div>
                  </div>
                </div>

                {/* DB Config */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                      <i className="fi fi-rr-database" style={{ fontSize: 20 }} />
                    </div>
                    <h3 className="text-lg font-bold">데이터베이스 연동</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">PostgreSQL 호스트 경로 (DSN)</label>
                      <input type="text" defaultValue="host=localhost user=postgres password=password dbname=edulinker port=5432 sslmode=disable" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                </div>

                {/* Security Config */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm xl:col-span-2 flex flex-col gap-6 items-start">
                  <div className="w-full">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg">
                        <i className="fi fi-rr-shield" style={{ fontSize: 20 }} />
                      </div>
                      <h3 className="text-lg font-bold">보안 및 인증 정책</h3>
                    </div>
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">JWT 비밀 키 (Secret Key)</label>
                        <input type="password" defaultValue="super-secret-key-for-edulinker-system-1234!" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <p className="mt-2 text-xs text-slate-500">이 키를 변경하면 기존에 로그인되어 있던 모든 사용자들의 접속이 강제로 종료됩니다.</p>
                      </div>
                      <label className="flex items-center gap-3 mt-4 cursor-pointer">
                        <input type="checkbox" checked={autoInfra} onChange={(e) => setAutoInfra(e.target.checked)} className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">앱 시작 시 인프라 (DB/Redis/MinIO) 자동 구동/설치 (Auto-Infra)</span>
                      </label>
                      <label className="flex items-center gap-3 mt-4 cursor-pointer">
                        <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">앱 시작 시 백엔드 서버(API) 자동 켜기 (Auto-Start)</span>
                      </label>
                      <label className="flex items-center gap-3 mt-4 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">개발 환경에서 HTTPS 강제 사용 안함 (TLS 비활성화)</span>
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
        {activeTab === 'users' && (
          <UserManagement />
        )}
        {activeTab === 'documents' && (
          <DocumentManagement />
        )}
      </div>
    </div>
  )
}

export default App
