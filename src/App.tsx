import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import {
  Baby,
  CalendarHeart,
  Camera,
  CheckCircle2,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  X,
  Medal,
  Heart,
  Home,
  ListChecks,
  MapPinned,
  MessageCircleHeart,
  Music2,
  Settings,
  Soup,
  Sparkles,
  Trash2
} from "lucide-react";
import {
  Anniversary,
  Achievement,
  AppData,
  BucketItem,
  Comment,
  FoodPlace,
  LocationShare,
  MediaItem,
  Message,
  MusicItem,
  PeriodRecord,
  Person,
  SavingGoal,
  TravelCheckin
} from "./types";
import { daysTogether, daysUntil, prettyDate } from "./lib/date";
import { loadLocalData, makeId, saveLocalData } from "./lib/localStore";
import {
  applyOperations,
  canUseCloudSync,
  CloudStatus,
  cloudErrorMessage,
  compactPendingOperations,
  diffAppData,
  flushPendingOperations,
  getClientId,
  initializeCloudData,
  loadPendingOperations,
  PendingOperation,
  readCloudData,
  removeSharedSubscription,
  savePendingOperations,
  subscribeCloudChanges
} from "./lib/sharedCloud";
import { proxyImageUrl, uploadMomentDataUrl } from "./lib/supabase";
import { deleteMomentDraft, listMomentDrafts, MomentDraft, saveMomentDraft, updateMomentDraft, uploadMomentDraft } from "./lib/momentDrafts";
const navItems = [
  { to: "/", label: "首页", icon: Home },
  { to: "/bucket-list", label: "一百件事", icon: ListChecks },
  { to: "/timeline", label: "时间", icon: CalendarHeart },
  { to: "/period", label: "生理期", icon: Baby },
  { to: "/messages", label: "留言板", icon: MessageCircleHeart },
  { to: "/map", label: "旅行地图", icon: MapPinned },
  { to: "/music", label: "歌单", icon: Music2 },
  { to: "/watchlist", label: "影音", icon: Clapperboard },
  { to: "/food", label: "好吃的", icon: Soup },
  { to: "/savings", label: "目标", icon: Sparkles },
  { to: "/moments", label: "照片墙", icon: Camera },
  { to: "/achievements", label: "成就墙", icon: Medal },
  { to: "/settings", label: "设置", icon: Settings }
];

const cityGeo: Record<string, { province: string; coord: [number, number] }> = {
  北京: { province: "北京", coord: [116.4074, 39.9042] },
  上海: { province: "上海", coord: [121.4737, 31.2304] },
  广州: { province: "广东", coord: [113.2644, 23.1291] },
  深圳: { province: "广东", coord: [114.0579, 22.5431] },
  东莞: { province: "广东", coord: [113.7518, 23.0207] },
  成都: { province: "四川", coord: [104.0668, 30.5728] },
  西安: { province: "陕西", coord: [108.9398, 34.3416] },
  杭州: { province: "浙江", coord: [120.1551, 30.2741] },
  厦门: { province: "福建", coord: [118.0894, 24.4798] },
  长沙: { province: "湖南", coord: [112.9388, 28.2282] },
  重庆: { province: "重庆", coord: [106.5516, 29.563] },
  武汉: { province: "湖北", coord: [114.3055, 30.5928] }
};

function provinceMapName(province: string) {
  const name = province.trim().replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g, "");
  const aliases: Record<string, string> = {
    北京: "北京市",
    天津: "天津市",
    上海: "上海市",
    重庆: "重庆市",
    新疆: "新疆维吾尔自治区",
    西藏: "西藏自治区",
    内蒙古: "内蒙古自治区",
    广西: "广西壮族自治区",
    宁夏: "宁夏回族自治区",
    香港: "香港特别行政区",
    澳门: "澳门特别行政区"
  };
  return aliases[name] ?? `${name}省`;
}

function provinceForCity(city: string, typedProvince = "") {
  return cityGeo[city.trim()]?.province ?? typedProvince.trim().replace(/省$/, "");
}

function App() {
  const initialData = useRef(loadLocalData());
  const [data, rawSetData] = useState<AppData>(initialData.current);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(canUseCloudSync() ? "connecting" : "off");
  const [cloudError, setCloudError] = useState("");
  const pendingOpsRef = useRef<PendingOperation[]>(compactPendingOperations(loadPendingOperations()));
  const [pendingCount, setPendingCount] = useState(pendingOpsRef.current.length);
  const [draftCount, setDraftCount] = useState(0);
  const dataRef = useRef(data);
  const clientIdRef = useRef(getClientId());
  const cloudReadyRef = useRef(false);
  const photoUploadInFlightRef = useRef(false);
  const flushNowRef = useRef<() => void>(() => undefined);

  const setData = useCallback<React.Dispatch<React.SetStateAction<AppData>>>((action) => {
    const current = dataRef.current;
    const next = typeof action === "function"
      ? (action as (previous: AppData) => AppData)(current)
      : action;
    if (next === current) return;

    const operations = canUseCloudSync() ? diffAppData(current, next, clientIdRef.current) : [];
    dataRef.current = next;
    rawSetData(next);
    saveLocalData(next);

    if (operations.length > 0) {
      pendingOpsRef.current = compactPendingOperations([...pendingOpsRef.current, ...operations]);
      savePendingOperations(pendingOpsRef.current);
      setPendingCount(pendingOpsRef.current.length);
      setCloudStatus(cloudReadyRef.current && navigator.onLine ? "saving" : "pending");
      queueMicrotask(() => flushNowRef.current());
    }
  }, []);

  const flushMomentDrafts = useCallback(async () => {
    if (photoUploadInFlightRef.current || !navigator.onLine) return;
    photoUploadInFlightRef.current = true;
    try {
      const drafts = await listMomentDrafts();
      for (const draft of drafts) {
        try {
          const moment = await uploadMomentDraft(draft);
          setData((current) => current.moments.some((item) => item.id === moment.id) ? current : { ...current, moments: [moment, ...current.moments] });
          await deleteMomentDraft(draft.id);
        } catch {
          // The failed draft stays in IndexedDB and will be retried later.
        }
      }
    } finally {
      photoUploadInFlightRef.current = false;
      window.dispatchEvent(new Event("moment-drafts-changed"));
    }
  }, [setData]);

  useEffect(() => {
    const retry = () => void flushMomentDrafts();
    const onVisible = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("online", retry);
    window.addEventListener("retry-moment-drafts", retry);
    document.addEventListener("visibilitychange", onVisible);
    retry();
    return () => { window.removeEventListener("online", retry); window.removeEventListener("retry-moment-drafts", retry); document.removeEventListener("visibilitychange", onVisible); };
  }, [flushMomentDrafts]);

  useEffect(() => {
    saveLocalData(dataRef.current);
    const refreshDraftCount = () => void listMomentDrafts().then((items) => setDraftCount(items.length)).catch(() => undefined);
    refreshDraftCount();
    window.addEventListener("moment-drafts-changed", refreshDraftCount);
    return () => window.removeEventListener("moment-drafts-changed", refreshDraftCount);
  }, []);

  useEffect(() => {
    if (!canUseCloudSync()) {
      saveLocalData(dataRef.current);
      setCloudStatus("off");
      return;
    }

    let disposed = false;
    let channel: ReturnType<typeof subscribeCloudChanges> = null;
    let retryTimer: number | undefined;
    let flushTimer: number | undefined;
    let realtimeRefreshTimer: number | undefined;
    let connecting = false;
    let flushing = false;
    let refreshing = false;
    let retryAttempt = 0;
    let photoMigrationStarted = false;

    const replaceWithCloudData = (cloudData: AppData) => {
      if (disposed) return;
      const merged = applyOperations(cloudData, pendingOpsRef.current);
      dataRef.current = merged;
      rawSetData(merged);
      saveLocalData(merged);
    };

    const scheduleFlush = (delay = 0) => {
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(() => void flush(), delay);
    };

    const scheduleConnect = (delay = 5000) => {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void connect(), delay);
    };

    const refresh = async () => {
      if (disposed || !cloudReadyRef.current || refreshing || !navigator.onLine) return;
      refreshing = true;
      try {
        const cloudData = await readCloudData();
        if (cloudData) replaceWithCloudData(cloudData);
        if (pendingOpsRef.current.length === 0 && !flushing) {
          setCloudStatus("saved");
          setCloudError("");
        }
      } catch (error) {
        if (pendingOpsRef.current.length === 0) {
          setCloudStatus("error");
          setCloudError(cloudErrorMessage(error));
        }
      } finally {
        refreshing = false;
      }
    };

    const flush = async () => {
      if (disposed || !cloudReadyRef.current || flushing || pendingOpsRef.current.length === 0) return;
      if (!navigator.onLine) {
        setCloudStatus("pending");
        setCloudError("当前网络不可用，修改已留在本机，联网后会自动保存");
        return;
      }

      flushing = true;
      const batch = pendingOpsRef.current.slice();
      setCloudStatus("saving");
      setCloudError("");
      try {
        await flushPendingOperations(batch);
        const acknowledged = new Set(batch.map((operation) => operation.opId));
        pendingOpsRef.current = pendingOpsRef.current.filter((operation) => !acknowledged.has(operation.opId));
        savePendingOperations(pendingOpsRef.current);
        setPendingCount(pendingOpsRef.current.length);
        retryAttempt = 0;
        setCloudStatus(pendingOpsRef.current.length === 0 ? "saved" : "saving");
        setCloudError("");
        void refresh();
      } catch (error) {
        retryAttempt += 1;
        setCloudStatus("pending");
        setCloudError(cloudErrorMessage(error));
        scheduleFlush(Math.min(30000, 1500 * 2 ** Math.min(retryAttempt, 4)));
      } finally {
        flushing = false;
        if (pendingOpsRef.current.length > 0 && navigator.onLine && retryAttempt === 0) scheduleFlush(0);
      }
    };

    const migrateBase64Photos = async () => {
      if (photoMigrationStarted || disposed) return;
      photoMigrationStarted = true;
      const moments = dataRef.current.moments.filter((moment) =>
        (moment.images?.length ? moment.images : [moment.imageUrl]).some((image) => image.startsWith("data:image/"))
      );

      for (const moment of moments) {
        if (disposed) return;
        const sourceImages = moment.images?.length ? moment.images : [moment.imageUrl];
        const replacements = new Map<string, string>();
        let failed = false;
        for (const image of sourceImages) {
          if (!image.startsWith("data:image/")) continue;
          try {
            const cloudUrl = await uploadMomentDataUrl(image);
            if (!cloudUrl) throw new Error("照片上传失败");
            replacements.set(image, cloudUrl);
          } catch {
            failed = true;
            break;
          }
        }
        if (failed || replacements.size === 0) continue;
        setData((current) => ({
          ...current,
          moments: current.moments.map((item) => {
            if (item.id !== moment.id) return item;
            const currentImages = item.images?.length ? item.images : [item.imageUrl];
            const images = currentImages.map((image) => replacements.get(image) ?? image);
            return { ...item, imageUrl: images[0] ?? "", images };
          })
        }));
      }
    };

    const connect = async () => {
      if (disposed || connecting || cloudReadyRef.current || !navigator.onLine) return;
      connecting = true;
      setCloudStatus(pendingOpsRef.current.length > 0 ? "pending" : "connecting");
      try {
        const cloudData = await initializeCloudData(initialData.current);
        if (disposed) return;
        cloudReadyRef.current = true;
        replaceWithCloudData(cloudData);
        setCloudError("");
        setCloudStatus(pendingOpsRef.current.length > 0 ? "saving" : "saved");
        if (!channel) {
          channel = subscribeCloudChanges(() => {
            window.clearTimeout(realtimeRefreshTimer);
            realtimeRefreshTimer = window.setTimeout(() => void refresh(), 250);
          });
        }
        scheduleFlush(0);
        void migrateBase64Photos();
      } catch (error) {
        cloudReadyRef.current = false;
        setCloudStatus(pendingOpsRef.current.length > 0 ? "pending" : "error");
        setCloudError(cloudErrorMessage(error));
        scheduleConnect();
      } finally {
        connecting = false;
      }
    };

    flushNowRef.current = () => {
      if (cloudReadyRef.current) scheduleFlush(0);
      else void connect();
    };

    const handleOnline = () => {
      setCloudError("");
      if (cloudReadyRef.current) {
        scheduleFlush(0);
        void refresh();
      } else {
        void connect();
      }
    };
    const handleOffline = () => {
      if (pendingOpsRef.current.length > 0) {
        setCloudStatus("pending");
        setCloudError("当前网络不可用，修改已留在本机，联网后会自动保存");
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleOnline();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    const pollTimer = window.setInterval(() => {
      if (cloudReadyRef.current) {
        void refresh();
        if (pendingOpsRef.current.length > 0) scheduleFlush(0);
      } else {
        void connect();
      }
    }, 15000);
    void connect();

    return () => {
      disposed = true;
      cloudReadyRef.current = false;
      flushNowRef.current = () => undefined;
      window.clearInterval(pollTimer);
      window.clearTimeout(retryTimer);
      window.clearTimeout(flushTimer);
      window.clearTimeout(realtimeRefreshTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      removeSharedSubscription(channel);
    };
  }, [setData]);

  const retryCloud = useCallback(() => { flushNowRef.current(); window.dispatchEvent(new Event("retry-moment-drafts")); }, []);

  return (
    <Routes>
      <Route path="/*" element={<Shell data={data} setData={setData} cloudStatus={cloudStatus} cloudError={cloudError} pendingCount={pendingCount} draftCount={draftCount} onRetry={retryCloud} />} />
    </Routes>
  );
}

function Shell({
  data,
  setData,
  cloudStatus,
  cloudError,
  pendingCount,
  draftCount,
  onRetry
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  cloudStatus: CloudStatus;
  cloudError: string;
  pendingCount: number;
  draftCount: number;
  onRetry: () => void;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <Sparkles />
          <span>和宝宝的时光</span>
        </Link>
        <span className={`sync-pill ${cloudStatus}`} title={cloudError || undefined}>{cloudStatusLabel(cloudStatus, pendingCount, draftCount)}</span>
        {cloudError && <small className="sync-error">{cloudError}</small>}
        {(pendingCount > 0 || draftCount > 0 || cloudStatus === "error") && <button className="sync-retry" type="button" onClick={onRetry}>立即重试</button>}
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard data={data} />} />
          <Route path="/bucket-list" element={<BucketPage data={data} setData={setData} />} />
          <Route path="/timeline" element={<TimelinePage data={data} setData={setData} />} />
          <Route path="/period" element={<PeriodPage data={data} setData={setData} />} />
          <Route path="/messages" element={<MessagesPage data={data} setData={setData} />} />
          <Route path="/map" element={<MapPage data={data} setData={setData} />} />
          <Route path="/music" element={<MusicPage data={data} setData={setData} />} />
          <Route path="/watchlist" element={<WatchPage data={data} setData={setData} />} />
          <Route path="/food" element={<FoodPage data={data} setData={setData} />} />
          <Route path="/savings" element={<SavingsPage data={data} setData={setData} />} />
          <Route path="/moments" element={<MomentsPage data={data} setData={setData} />} />
          <Route path="/achievements" element={<AchievementsPage data={data} setData={setData} />} />
          <Route path="/settings" element={<SettingsPage data={data} setData={setData} />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard({ data }: { data: AppData }) {
  const completed = data.bucketItems.filter((item) => item.completed).length;
  const shortGoals = data.savingGoals.filter((goal) => goal.horizon === "short").length;
  const longGoals = data.savingGoals.filter((goal) => goal.horizon === "long").length;
  const completedGoals = data.savingGoals.filter((goal) => goal.completed).length;
  const nextAnniversary = [...data.anniversaries].sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];

  return (
    <Page title="今天也在一起" subtitle="把平常的小事认真收好，日子就会慢慢发光。">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Together</p>
          <h2>{daysTogether(data.startDate)} 天</h2>
          <p>从 {prettyDate(data.startDate)} 开始，我们已经一起走了这么久。</p>
        </div>
        <div className="hero-photo">
          <img src={data.moments[0]?.imageUrl} alt="我们的照片记录" />
        </div>
      </section>
      <div className="stats-grid">
        <Stat icon={CheckCircle2} label="已完成的一百件事" value={`${completed}/${data.bucketItems.length}`} />
        <Stat icon={MapPinned} label="点亮城市" value={`${data.travelCheckins.length}`} />
        <Stat icon={Sparkles} label="目标数量" value={`${shortGoals} 短期 / ${longGoals} 长期`} />
        <Stat icon={CheckCircle2} label="已完成目标" value={`${completedGoals}/${data.savingGoals.length}`} />
        <Stat icon={CalendarHeart} label={nextAnniversary?.title ?? "纪念日"} value={`${nextAnniversary ? daysUntil(nextAnniversary.date) : 0} 天`} />
      </div>
      <div className="dashboard-grid">
        <Panel title="最近留言">
          {data.messages.slice(0, 3).map((message) => (
            <MiniItem key={message.id} title={message.title} text={`${nameOf(message.from)} · ${message.mood}`} />
          ))}
        </Panel>
        <Panel title="最近照片">
          <div className="photo-strip">
            {data.moments.slice(0, 4).map((moment) => (
              <img key={moment.id} src={moment.imageUrl} alt={moment.text} />
            ))}
          </div>
        </Panel>
        <Panel title="手动位置">
          {data.locations.map((location) => (
            <MiniItem key={location.id} title={`${nameOf(location.person)}在${location.city}`} text={location.note} />
          ))}
        </Panel>
        <Panel title="成就墙预览">
          {data.achievements.slice(0, 3).map((achievement) => (
            <MiniItem key={achievement.id} title={achievement.title} text={achievement.note} />
          ))}
        </Panel>
      </div>
    </Page>
  );
}

function BucketPage({ data, setData }: DataProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const item: BucketItem = { id: makeId("bucket"), title, note, completed: false };
    setData((current) => ({ ...current, bucketItems: [item, ...current.bucketItems] }));
    setTitle("");
    setNote("");
  }

  return (
    <Page title="想和宝宝做的一百件事" subtitle="完成时打勾，也把那天的心情留下。">
      <form className="inline-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="想一起做什么" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" />
        <button type="submit">添加</button>
      </form>
      <div className="list">
        {data.bucketItems.map((item) => (
          <article className={`record ${item.completed ? "done" : ""}`} key={item.id}>
            <button
              className="check-button"
              type="button"
              onClick={() =>
                setData((current) => ({
                  ...current,
                  bucketItems: current.bucketItems.map((row) =>
                    row.id === item.id ? { ...row, completed: !row.completed, completedAt: !row.completed ? todayInput() : undefined } : row
                  )
                }))
              }
              aria-label="切换完成状态"
            >
              <CheckCircle2 />
            </button>
            <div>
              <h3>{item.title}</h3>
              <p>{item.note || "还没有备注"}</p>
              {item.completedAt && <small>完成于 {prettyDate(item.completedAt)}</small>}
            </div>
            <DeleteButton onClick={() => setData((current) => ({ ...current, bucketItems: current.bucketItems.filter((row) => row.id !== item.id) }))} />
          </article>
        ))}
      </div>
    </Page>
  );
}

function TimelinePage({ data, setData }: DataProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const row: Anniversary = { id: makeId("anniversary"), title, date, note };
    setData((current) => ({ ...current, anniversaries: [row, ...current.anniversaries] }));
    setTitle("");
    setNote("");
  }

  return (
    <Page title="在一起的时间" subtitle="自动计算在一起天数，也记录重要纪念日。">
      <section className="time-card">
        <div>
          <span>我们已经在一起</span>
          <strong>{daysTogether(data.startDate)} 天</strong>
        </div>
        <label>
          开始日期
          <input value={data.startDate} type="date" onChange={(e) => setData((current) => ({ ...current, startDate: e.target.value }))} />
        </label>
      </section>
      <form className="inline-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="纪念日名称" />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" />
        <button type="submit">保存</button>
      </form>
      <CardGrid>
        {data.anniversaries.map((item) => (
          <article className="card" key={item.id}>
            <h3>{item.title}</h3>
            <p>{prettyDate(item.date)}</p>
            <strong>还有 {daysUntil(item.date)} 天</strong>
            <span>{item.note}</span>
            <DeleteButton onClick={() => setData((current) => ({ ...current, anniversaries: current.anniversaries.filter((row) => row.id !== item.id) }))} />
          </article>
        ))}
      </CardGrid>
    </Page>
  );
}

function PeriodPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ startDate: string; endDate: string; mood: string; symptoms: string; note: string }>({
    startDate: todayInput(),
    endDate: todayInput(),
    mood: "",
    symptoms: "",
    note: ""
  });
  const averageCycle = 28;
  const next = data.periodRecords[0]?.startDate
    ? new Date(new Date(data.periodRecords[0].startDate).getTime() + averageCycle * 86400000).toISOString().slice(0, 10)
    : "";

  function add(event: FormEvent) {
    event.preventDefault();
    const row: PeriodRecord = { id: makeId("period"), ...form };
    setData((current) => ({ ...current, periodRecords: [row, ...current.periodRecords] }));
  }

  return (
    <Page title="宝宝的生理期记录" subtitle="认真记录，不是提醒她多喝热水，是提醒自己多关心。">
      {next && <div className="notice">按 28 天估算，下次可能在 {prettyDate(next)} 左右。</div>}
      <form className="inline-form" onSubmit={add}>
        <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <input value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} placeholder="心情" />
        <input value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} placeholder="症状" />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="备注" />
        <button type="submit">记录</button>
      </form>
      <RecordList rows={data.periodRecords} render={(row) => `${prettyDate(row.startDate)} - ${prettyDate(row.endDate)} · ${row.mood} · ${row.symptoms} · ${row.note}`} onDelete={(id) => setData((current) => ({ ...current, periodRecords: current.periodRecords.filter((row) => row.id !== id) }))} />
    </Page>
  );
}

function MessagesPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ from: Person; title: string; content: string; mood: string }>({
    from: "me",
    title: "",
    content: "",
    mood: ""
  });

  function add(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const row: Message = { id: makeId("message"), ...form, status: "unread", createdAt: todayInput() };
    setData((current) => ({ ...current, messages: [row, ...current.messages] }));
    setForm({ from: "me", title: "", content: "", mood: "" });
  }

  return (
    <Page title="留言板" subtitle="不好当面说的话，可以先温柔地放在这里。">
      <form className="stack-form" onSubmit={add}>
        <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value as "me" | "baby" })}>
          <option value="me">哈基辉</option>
          <option value="baby">麦小雯</option>
        </select>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="标题" />
        <input value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} placeholder="小情绪" />
        <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="想说的话" />
        <button type="submit">放进留言板</button>
      </form>
      <CardGrid>
        {data.messages.map((message) => (
          <article className="card message-card" key={message.id}>
            <p className="eyebrow">{messageNameOf(message.from)} · {message.mood || "小情绪"}</p>
            <h3>{message.title}</h3>
            <p>{message.content}</p>
            <div className="row-actions">
              {(["unread", "read", "replied"] as const).map((status) => (
                <button key={status} className={message.status === status ? "chip active" : "chip"} onClick={() => setData((current) => ({ ...current, messages: current.messages.map((row) => row.id === message.id ? { ...row, status } : row) }))}>
                  {statusName(status)}
                </button>
              ))}
            </div>
            <ReplyEditor
              replies={message.replies ?? []}
              onAdd={(author, content) => setData((current) => ({
                ...current,
                messages: current.messages.map((row) => row.id === message.id
                  ? {
                    ...row,
                    status: "replied",
                    replies: [...(row.replies ?? []), { id: makeId("reply"), author, content, createdAt: todayInput() }]
                  }
                  : row)
              }))}
              onDelete={(replyId) => setData((current) => ({
                ...current,
                messages: current.messages.map((row) => row.id === message.id
                  ? { ...row, replies: (row.replies ?? []).filter((reply) => reply.id !== replyId) }
                  : row)
              }))}
            />
            <Comments targetType="message" targetId={message.id} data={data} setData={setData} />
            <DeleteButton onClick={() => setData((current) => ({ ...current, messages: current.messages.filter((row) => row.id !== message.id) }))} />
          </article>
        ))}
      </CardGrid>
    </Page>
  );
}

function MapPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ city: string; province: string; date: string; note: string }>({
    city: "",
    province: "",
    date: todayInput(),
    note: ""
  });
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const litCities = new Set(data.travelCheckins.map((row) => row.city));

  useEffect(() => {
    if (!mapRef.current) return;
    let chart: { resize: () => void; dispose: () => void; setOption: (option: unknown) => void } | null = null;
    let disposed = false;

    async function draw() {
      try {
        const [echarts, chinaMap] = await Promise.all([
          import("echarts"),
          import("./data/china.json")
        ]);
        if (disposed || !mapRef.current) return;
        chart = echarts.init(mapRef.current);
        const litProvinces = new Set(data.travelCheckins.map((row) => provinceMapName(provinceForCity(row.city, row.province))));
        echarts.registerMap("china-love", chinaMap.default as Parameters<typeof echarts.registerMap>[1]);
        chart.setOption({
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            formatter: (params: { name?: string; value?: number }) =>
              params.value ? `${params.name}<br/>已经一起点亮啦` : `${params.name}<br/>还没一起去过`
          },
          series: [{
            type: "map",
            map: "china-love",
            roam: false,
            zoom: 1.08,
            data: [...litProvinces].map((name) => ({
              name,
              value: 1,
              itemStyle: {
                areaColor: "#e86f80",
                borderColor: "#d65064",
                borderWidth: 1.2
              },
              emphasis: {
                itemStyle: { areaColor: "#dc5268" }
              }
            })),
            label: { show: false },
            itemStyle: { areaColor: "#eef5f0", borderColor: "#b9cfc4", borderWidth: 1 },
            emphasis: { label: { show: true, color: "#27312f" }, itemStyle: { areaColor: "#f0a0a9" } },
            select: { itemStyle: { areaColor: "#e78b98" } }
          }]
        });
        setMapStatus("ready");
      } catch {
        setMapStatus("fallback");
      }
    }

    void draw();
    const handleResize = () => chart?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      chart?.dispose();
    };
  }, [data.travelCheckins]);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!form.city.trim()) return;
    const row: TravelCheckin = { id: makeId("travel"), ...form, province: provinceForCity(form.city, form.province) };
    setData((current) => ({ ...current, travelCheckins: [row, ...current.travelCheckins] }));
    setForm({ city: "", province: "", date: todayInput(), note: "" });
  }

  return (
    <Page title="一起去过的地方" subtitle="去过一座城，就把它所属的省份点亮。城市故事会留在下面。">
      <section className="map-panel">
        <div className="china-map">
          <div ref={mapRef} className="china-map-chart" aria-label="中国旅行地图" />
          {mapStatus !== "ready" && (
            <div className="map-fallback">
              <strong>地图暂时没有连上</strong>
              <span>下面的旅行记录仍然可以正常添加和查看。</span>
            </div>
          )}
          <div className="map-legend">
            {data.travelCheckins.slice(0, 5).map((row) => (
              <span key={row.id} className={litCities.has(row.city) ? "legend-chip lit" : "legend-chip"}>
                {row.city}
              </span>
            ))}
          </div>
        </div>
        <form className="stack-form" onSubmit={add}>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value, province: provinceForCity(e.target.value, form.province) })} placeholder="去了哪座城市" />
          <input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="所属省份（可不填）" />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="写一点这次旅行的小记" />
          <button type="submit">点亮这里</button>
          <p className="hint">已经点亮 {new Set(data.travelCheckins.map((row) => row.city)).size} 座城市。</p>
        </form>
      </section>
      <RecordList rows={data.travelCheckins} render={(row) => `${row.province}${row.city} · ${prettyDate(row.date)} · ${row.note}`} onDelete={(id) => setData((current) => ({ ...current, travelCheckins: current.travelCheckins.filter((row) => row.id !== id) }))} />
    </Page>
  );
}

function MusicPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ title: string; artist: string; link: string; reason: string; sharedBy: Person }>({
    title: "",
    artist: "",
    link: "",
    reason: "",
    sharedBy: "me"
  });
  function add(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const row: MusicItem = { id: makeId("music"), ...form };
    setData((current) => ({ ...current, musicItems: [row, ...current.musicItems] }));
  }
  return (
    <SimpleAddPage title="分享歌单" subtitle="把好听的歌和想让对方听见的原因一起留下。" button="加入歌单" form={<>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="歌名" />
      <input value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} placeholder="歌手" />
      <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="链接" />
      <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="推荐理由" />
      <select value={form.sharedBy} onChange={(e) => setForm({ ...form, sharedBy: e.target.value as "me" | "baby" })}><option value="me">我分享</option><option value="baby">宝宝分享</option></select>
    </>} onSubmit={add}>
      <RecordList rows={data.musicItems} render={(row) => `${row.title} - ${row.artist} · ${nameOf(row.sharedBy)} · ${row.reason}`} onDelete={(id) => setData((current) => ({ ...current, musicItems: current.musicItems.filter((row) => row.id !== id) }))} />
    </SimpleAddPage>
  );
}

function WatchPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{
    title: string;
    kind: MediaItem["kind"];
    status: MediaItem["status"];
    rating: number;
    note: string;
  }>({ title: "", kind: "电影", status: "想看", rating: 0, note: "" });
  function add(event: FormEvent) {
    event.preventDefault();
    const row: MediaItem = { id: makeId("media"), ...form };
    setData((current) => ({ ...current, mediaItems: [row, ...current.mediaItems] }));
  }
  return (
    <SimpleAddPage title="好歌好电影" subtitle="想看、在看、已看，都不用再散落在聊天记录里。" button="保存" form={<>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="名称" />
      <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MediaItem["kind"] })}><option>电影</option><option>剧集</option><option>综艺</option><option>歌曲</option></select>
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MediaItem["status"] })}><option>想看</option><option>在看</option><option>已看</option></select>
      <input type="number" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} placeholder="评分" />
      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="评论" />
    </>} onSubmit={add}>
      <RecordList rows={data.mediaItems} render={(row) => `${row.kind} · ${row.title} · ${row.status} · ${row.rating || "未评分"}分 · ${row.note}`} onDelete={(id) => setData((current) => ({ ...current, mediaItems: current.mediaItems.filter((row) => row.id !== id) }))} />
    </SimpleAddPage>
  );
}

function FoodPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ name: string; city: string; address: string; dishes: string; rating: number; revisit: boolean; note: string }>({
    name: "",
    city: "",
    address: "",
    dishes: "",
    rating: 5,
    revisit: true,
    note: ""
  });
  function add(event: FormEvent) {
    event.preventDefault();
    const row: FoodPlace = { id: makeId("food"), ...form };
    setData((current) => ({ ...current, foodPlaces: [row, ...current.foodPlaces] }));
  }
  return (
    <SimpleAddPage title="好吃的店" subtitle="因为一起吃饭这件事，本身就很值得记录。" button="记录店面" form={<>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="店名" />
      <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="城市" />
      <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="地址" />
      <input value={form.dishes} onChange={(e) => setForm({ ...form, dishes: e.target.value })} placeholder="好吃的菜" />
      <input type="number" min="1" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} />
      <label className="check-label"><input type="checkbox" checked={form.revisit} onChange={(e) => setForm({ ...form, revisit: e.target.checked })} />想再去</label>
      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="备注" />
    </>} onSubmit={add}>
      <RecordList rows={data.foodPlaces} render={(row) => `${row.city} · ${row.name} · ${row.dishes} · ${row.rating}分 · ${row.revisit ? "想再去" : "尝过就好"}`} onDelete={(id) => setData((current) => ({ ...current, foodPlaces: current.foodPlaces.filter((row) => row.id !== id) }))} />
    </SimpleAddPage>
  );
}

function SavingsPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ title: string; horizon: "short" | "long"; note: string; dueDate: string }>({
    title: "",
    horizon: "short",
    note: "",
    dueDate: todayInput()
  });

  function add(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const row: SavingGoal = { id: makeId("goal"), ...form, completed: false };
    setData((current) => ({ ...current, savingGoals: [row, ...current.savingGoals] }));
    setForm({ title: "", horizon: "short", note: "", dueDate: todayInput() });
  }

  const shortGoals = data.savingGoals.filter((goal) => goal.horizon === "short");
  const longGoals = data.savingGoals.filter((goal) => goal.horizon === "long");

  return (
    <Page title="我们的长期和短期目标" subtitle="把想一起完成的事情写下来，一步一步走到它面前。">
      <form className="inline-form" onSubmit={add}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="目标名称" />
        <select value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value as "short" | "long" })}>
          <option value="short">短期目标</option>
          <option value="long">长期目标</option>
        </select>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="给这个目标写句话" />
        <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <button type="submit">放进目标墙</button>
      </form>
      <div className="goal-columns">
        <section className="goal-column">
          <h2>短期目标</h2>
          <CardGrid>
            {shortGoals.map((goal) => renderGoal(goal, data, setData))}
          </CardGrid>
        </section>
        <section className="goal-column">
          <h2>长期目标</h2>
          <CardGrid>
            {longGoals.map((goal) => renderGoal(goal, data, setData))}
          </CardGrid>
        </section>
      </div>
    </Page>
  );
}

function renderGoal(goal: SavingGoal, data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>) {
  return (
    <article className="card" key={goal.id}>
      <p className="eyebrow">{goal.horizon === "short" ? "短期目标" : "长期目标"}</p>
      <h3>{goal.title}</h3>
      <p>{goal.note}</p>
      {goal.dueDate && <span>计划完成：{prettyDate(goal.dueDate)}</span>}
      <div className="row-actions">
        <button className={goal.completed ? "chip active" : "chip"} type="button" onClick={() => setData((current) => ({ ...current, savingGoals: current.savingGoals.map((row) => row.id === goal.id ? { ...row, completed: !row.completed } : row) }))}>
          {goal.completed ? "已完成" : "标记完成"}
        </button>
      </div>
      <Comments targetType="goal" targetId={goal.id} data={data} setData={setData} />
      <DeleteButton onClick={() => setData((current) => ({ ...current, savingGoals: current.savingGoals.filter((row) => row.id !== goal.id) }))} />
    </article>
  );
}

function AchievementsPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ title: string; note: string; date: string }>({
    title: "",
    note: "",
    date: todayInput()
  });

  function add(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const row: Achievement = { id: makeId("achievement"), ...form };
    setData((current) => ({ ...current, achievements: [row, ...current.achievements] }));
    setForm({ title: "", note: "", date: todayInput() });
  }

  return (
    <Page title="在一起后，我们变得更好了" subtitle="那些一起做到的小事，也值得像奖章一样收起来。">
      <section className="achievement-grid">
        {data.achievements.map((item) => (
          <article className="achievement-card" key={item.id}>
            <p className="eyebrow">{prettyDate(item.date)}</p>
            <h3>{item.title}</h3>
            <p>{item.note}</p>
            <DeleteButton onClick={() => setData((current) => ({ ...current, achievements: current.achievements.filter((row) => row.id !== item.id) }))} />
          </article>
        ))}
      </section>
      <form className="inline-form" onSubmit={add}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="这次完成了什么" />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="写下这份变化" />
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <button type="submit">收下这枚成就</button>
      </form>
    </Page>
  );
}

function MomentsPage({ data, setData }: DataProps) {
  const [form, setForm] = useState<{ text: string; place: string; previewUrls: string[]; author: Person }>({ text: "", place: "", previewUrls: [], author: "me" });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [drafts, setDrafts] = useState<MomentDraft[]>([]);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const refreshDrafts = useCallback(async () => {
    try { const items = await listMomentDrafts(); setDrafts(items); window.dispatchEvent(new Event("moment-drafts-changed")); } catch (error) { setUploadError(error instanceof Error ? error.message : "无法读取照片草稿箱"); }
  }, []);

  useEffect(() => { const refresh = () => void refreshDrafts(); refresh(); window.addEventListener("moment-drafts-changed", refresh); return () => window.removeEventListener("moment-drafts-changed", refresh); }, [refreshDrafts]);

  async function retryDraft(id: string) { await updateMomentDraft(id, { status: "pending", lastError: "" }); window.dispatchEvent(new Event("retry-moment-drafts")); }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!form.text.trim() || files.length === 0) { setUploadError("请先写一点文字并选择至少一张照片"); return; }
    const draft: MomentDraft = { id: makeId("moment-draft"), text: form.text.trim(), place: form.place.trim(), author: form.author, createdAt: todayInput(), images: files.map((file) => file.slice(0, file.size, file.type)), filenames: files.map((file) => file.name), contentTypes: files.map((file) => file.type), status: "pending", attempts: 0, lastError: "" };
    setUploading(true); setUploadError("");
    try { await saveMomentDraft(draft); window.dispatchEvent(new Event("moment-drafts-changed")); setForm({ text: "", place: "", previewUrls: [], author: "me" }); setFiles([]); cleanupPreviewUrls(form.previewUrls); await refreshDrafts(); }
    catch (error) { setUploadError(error instanceof Error ? error.message : "照片草稿保存失败，请检查浏览器存储空间"); }
    finally { setUploading(false); }
  }

  async function pickImages(nextFiles: File[]) {
    cleanupPreviewUrls(form.previewUrls); setUploadError("");
    try { const compressed: File[] = []; for (const file of nextFiles.slice(0, 8)) compressed.push(await compressImageFile(await normalizePhotoFile(file))); setFiles(compressed); setForm((current) => ({ ...current, previewUrls: compressed.map((file) => URL.createObjectURL(file)) })); }
    catch (error) { setFiles([]); setForm((current) => ({ ...current, previewUrls: [] })); setUploadError(error instanceof Error ? error.message : "图片处理失败，请换几张照片重试"); }
  }

  useEffect(() => () => cleanupPreviewUrls(form.previewUrls), [form.previewUrls]);
  useEffect(() => { if (!lightbox) return; function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setLightbox(null); if (event.key === "ArrowLeft") setLightbox((current) => current && { ...current, index: (current.index - 1 + current.images.length) % current.images.length }); if (event.key === "ArrowRight") setLightbox((current) => current && { ...current, index: (current.index + 1) % current.images.length }); } window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [lightbox]);

  return (
    <Page title="照片墙" subtitle="像朋友圈一样，把照片和文字都只留给彼此。">
      <form className="stack-form moment-form" onSubmit={add}>
        <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="这一刻想写些什么" />
        <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="地点" />
        <select value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value as Person })}><option value="me">哈基辉</option><option value="baby">麦小雯</option></select>
        <label className="file-picker"><span>选择照片</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" multiple onChange={(e) => void pickImages(Array.from(e.target.files ?? []))} /></label>
        {files.length > 0 && <p className="file-summary">已选择 {files.length} 张照片</p>}
        {form.previewUrls.length > 0 && <div className="upload-previews">{form.previewUrls.map((url) => <img key={url} className="preview" src={url} alt="预览" />)}</div>}
        {uploadError && <p className="error">{uploadError}</p>}
        <button type="submit" disabled={uploading}>{uploading ? "正在保存草稿..." : "发布"}</button>
      </form>
      {drafts.length > 0 && <section className="draft-list"><h2>待上传照片</h2>{drafts.map((draft) => <article className="draft-item" key={draft.id}><div><strong>{draft.text}</strong><span>{draft.status === "uploading" ? "正在上传" : "等待网络，稍后自动重试"}</span>{draft.lastError && <small>{draft.lastError}</small>}</div><div className="row-actions"><button type="button" onClick={() => void retryDraft(draft.id)}>立即重试</button><DeleteButton onClick={() => void deleteMomentDraft(draft.id).then(refreshDrafts)} /></div></article>)}</section>}
      <div className="moments-grid">{data.moments.map((moment) => { const images = (moment.images?.length ? moment.images : [moment.imageUrl]).map(proxyImageUrl); return <article className="moment" key={moment.id}><div className="moment-images">{images.map((image, index) => <button className="moment-image-button" type="button" key={moment.id + "-" + image} onClick={() => setLightbox({ images, index })}><img src={image} alt={moment.text + " " + (index + 1)} /></button>)}</div><div><p>{moment.text}</p><span>{momentAuthorName(moment.author)} · {moment.place || "没有地点"} · {prettyDate(moment.createdAt)}</span><Comments targetType="moment" targetId={moment.id} data={data} setData={setData} /><DeleteButton onClick={() => setData((current) => ({ ...current, moments: current.moments.filter((row) => row.id !== moment.id) }))} /></div></article>; })}</div>
      {lightbox && <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}><button className="lightbox-close icon-button" type="button" aria-label="关闭预览" onClick={() => setLightbox(null)}><X /></button>{lightbox.images.length > 1 && <button className="lightbox-nav lightbox-prev icon-button" type="button" aria-label="上一张" onClick={(event) => { event.stopPropagation(); setLightbox((current) => current && { ...current, index: (current.index - 1 + current.images.length) % current.images.length }); }}><ChevronLeft /></button>}<img src={lightbox.images[lightbox.index]} alt="照片放大预览" onClick={(event) => event.stopPropagation()} />{lightbox.images.length > 1 && <button className="lightbox-nav lightbox-next icon-button" type="button" aria-label="下一张" onClick={(event) => { event.stopPropagation(); setLightbox((current) => current && { ...current, index: (current.index + 1) % current.images.length }); }}><ChevronRight /></button>}</div>}
    </Page>
  );
}

function ReplyEditor({ replies, onAdd, onDelete }: { replies: { id: string; author: Person; content: string; createdAt: string }[]; onAdd: (author: Person, content: string) => void; onDelete: (id: string) => void; }) {
  const [author, setAuthor] = useState<Person>("me"); const [content, setContent] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!content.trim()) return; onAdd(author, content.trim()); setContent(""); }
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }
  return <div className="thread"><strong>回复</strong>{replies.map((reply) => <div className="thread-item" key={reply.id}><span>{messageNameOf(reply.author)} · {prettyDate(reply.createdAt)}</span><p>{reply.content}</p><DeleteButton onClick={() => onDelete(reply.id)} /></div>)}<form className="comment-form" onSubmit={submit}><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={handleKeyDown} placeholder="写一条回复" rows={3} /><div className="comment-actions"><select value={author} onChange={(event) => setAuthor(event.target.value as Person)}><option value="me">哈基辉</option><option value="baby">麦小雯</option></select><button type="submit">回复</button></div></form></div>;
}

function Comments({ targetType, targetId, data, setData }: { targetType: Comment["targetType"]; targetId: string; data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; }) {
  const [author, setAuthor] = useState<Person>("me"); const [content, setContent] = useState(""); const comments = data.comments.filter((comment) => comment.targetType === targetType && comment.targetId === targetId);
  function submit(event: FormEvent) { event.preventDefault(); if (!content.trim()) return; const comment: Comment = { id: makeId("comment"), targetType, targetId, author, content: content.trim(), createdAt: todayInput() }; setData((current) => ({ ...current, comments: [...current.comments, comment] })); setContent(""); }
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }
  return <div className="thread"><strong>评论</strong>{comments.map((comment) => <div className="thread-item" key={comment.id}><span>{messageNameOf(comment.author)} · {prettyDate(comment.createdAt)}</span><p>{comment.content}</p><DeleteButton onClick={() => setData((current) => ({ ...current, comments: current.comments.filter((row) => row.id !== comment.id) }))} /></div>)}<form className="comment-form" onSubmit={submit}><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={handleKeyDown} placeholder="写一条评论" rows={3} /><div className="comment-actions"><select value={author} onChange={(event) => setAuthor(event.target.value as Person)}><option value="me">哈基辉</option><option value="baby">麦小雯</option></select><button type="submit">评论</button></div></form></div>;
}

async function normalizePhotoFile(file: File) {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return new File([blob], replaceImageExtension(file.name), { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    throw new Error("这张 HEIC 照片转换失败，请在手机相册中转成 JPG 后重试");
  }
}

async function compressImageFile(file: File) {
  if (!file.type.startsWith("image/")) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && file.size <= 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    return new File([blob], replaceImageExtension(file.name), { type: blob.type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张照片。"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败。"));
    }, "image/jpeg", 0.82);
  });
}

function replaceImageExtension(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "moment";
  return `${base}.jpg`;
}

function cleanupPreviewUrls(urls: string[]) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

function SettingsPage({ data, setData }: DataProps) {

  const [location, setLocation] = useState<LocationShare>({ id: makeId("location"), person: "me", city: "", note: "", updatedAt: todayInput() });
  return (
    <Page title="设置和手动位置" subtitle="首版把私密和稳定放前面，实时定位以后再接。">
      <Panel title="Supabase 状态">
        <p>当前版本已关闭登录，打开网站就能直接记录，只使用浏览器本地数据。</p>
      </Panel>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        if (!location.city.trim()) return;
        setData((current) => ({ ...current, locations: [{ ...location, id: makeId("location"), updatedAt: todayInput() }, ...current.locations] }));
      }}>
        <select value={location.person} onChange={(e) => setLocation({ ...location, person: e.target.value as "me" | "baby" })}><option value="me">我</option><option value="baby">宝宝</option></select>
        <input value={location.city} onChange={(e) => setLocation({ ...location, city: e.target.value })} placeholder="城市" />
        <input value={location.note} onChange={(e) => setLocation({ ...location, note: e.target.value })} placeholder="状态备注" />
        <button type="submit">更新位置</button>
      </form>
      <RecordList rows={data.locations} render={(row) => `${nameOf(row.person)} · ${row.city} · ${row.note} · ${prettyDate(row.updatedAt)}`} onDelete={(id) => setData((current) => ({ ...current, locations: current.locations.filter((row) => row.id !== id) }))} />
    </Page>
  );
}

type DataProps = {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
};

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Couple Space</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: string }) {
  return (
    <article className="stat">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function MiniItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="mini-item">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="card-grid">{children}</div>;
}

function RecordList<T extends { id: string }>(
  { rows, render, onDelete }: { rows: T[]; render: (row: T) => string; onDelete: (id: string) => void }
) {
  return (
    <div className="list">
      {rows.map((row) => (
        <article className="record" key={row.id}>
          <p>{render(row)}</p>
          <DeleteButton onClick={() => onDelete(row.id)} />
        </article>
      ))}
    </div>
  );
}

function SimpleAddPage({ title, subtitle, button, form, onSubmit, children }: {
  title: string;
  subtitle: string;
  button: string;
  form: React.ReactNode;
  onSubmit: (event: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Page title={title} subtitle={subtitle}>
      <form className="inline-form" onSubmit={onSubmit}>
        {form}
        <button type="submit">{button}</button>
      </form>
      {children}
    </Page>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button danger" type="button" onClick={onClick} aria-label="删除">
      <Trash2 size={17} />
    </button>
  );
}

function nameOf(person: "me" | "baby") {
  return person === "me" ? "我" : "宝宝";
}

function cloudStatusLabel(status: CloudStatus, pendingCount: number, draftCount: number) {
  if (status === "connecting") return "正在连接云端";
  if (status === "saving") return "正在保存";
  if (status === "saved") return draftCount > 0 ? `记录已保存，${draftCount} 个照片草稿待上传` : "云端已保存";
  if (status === "pending") return `等待网络，${pendingCount} 项记录、${draftCount} 个照片草稿未保存`;
  if (status === "error") return "保存失败，正在重试";
  return "本地记录模式";
}

function messageNameOf(person: "me" | "baby") {
  return person === "me" ? "哈基辉" : "麦小雯";
}

function momentAuthorName(person: "me" | "baby") {
  return person === "me" ? "哈基辉" : "麦小雯";
}

function statusName(status: Message["status"]) {
  return status === "unread" ? "未读" : status === "read" ? "已读" : "已回应";
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default App;
